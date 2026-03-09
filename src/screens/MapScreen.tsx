import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import type { SosMarker } from '../types';
import { getSosMarkers, updateLastKnownLocation } from '../services/checkinService';
import { apiGet } from '../services/apiClient';

type ShelterItem = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  status: 'OPEN' | 'FULL' | 'CLOSED';
};

type IncidentItem = {
  id: string;
  title: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'RESOLVED';
};

type SosApiItem = {
  id: string;
  latitude: number;
  longitude: number;
  message?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
  createdAt: string;
};

type NearbyResponderItem = {
  userId: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  user?: {
    fullName?: string | null;
    role?: 'USER' | 'RESCUER' | 'ADMIN';
  } | null;
};

const DEFAULT_REGION: Region = {
  latitude: 37.4219983,
  longitude: -122.084,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04
};

function toQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    query.append(key, String(value));
  });
  return query.toString();
}

function incidentColor(severity: IncidentItem['severity']) {
  if (severity === 'CRITICAL') return '#b91c1c';
  if (severity === 'HIGH') return '#dc2626';
  if (severity === 'MEDIUM') return '#f59e0b';
  return '#2563eb';
}

function responderPinColor(role?: NearbyResponderItem['user'] extends infer T ? T extends { role?: infer R } ? R : never : never) {
  if (role === 'ADMIN') return '#7c3aed';
  return '#1d4ed8';
}

export default function MapScreen() {
  const mapRef = useRef<MapView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region>(DEFAULT_REGION);
  const [myLocation, setMyLocation] = useState<Location.LocationObjectCoords | null>(null);

  const [sosMarkers, setSosMarkers] = useState<SosMarker[]>([]);
  const [shelters, setShelters] = useState<ShelterItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [nearbyResponders, setNearbyResponders] = useState<NearbyResponderItem[]>([]);

  const loadNearbyResponders = useCallback(async (query: string) => {
    try {
      const nearby = await apiGet<{ items: NearbyResponderItem[] }>(`/api/map/nearby-rescuers?${query}`, true);
      setNearbyResponders(nearby.items ?? []);
      return;
    } catch {
      // fallback for old backend without nearby-rescuers
    }

    try {
      const nearby = await apiGet<{ items: NearbyResponderItem[] }>(`/api/map/nearby-users?${query}`, true);
      const onlyResponders = (nearby.items ?? []).filter(item => {
        const role = item.user?.role;
        return role === 'RESCUER' || role === 'ADMIN';
      });
      setNearbyResponders(onlyResponders);
    } catch {
      setNearbyResponders([]);
    }
  }, []);

  const loadMapData = useCallback(async (latitude: number, longitude: number) => {
    const query = toQuery({
      latitude,
      longitude,
      radiusKm: 25
    });

    const [shelterResponse, incidentResponse, sosResponse, localSos] = await Promise.all([
      apiGet<{ items: ShelterItem[] }>(`/api/map/shelters?${query}`, true),
      apiGet<{ items: IncidentItem[] }>(`/api/map/incidents?${query}`, true),
      apiGet<{ items: SosApiItem[] }>(`/api/sos?limit=50&page=1`, true),
      getSosMarkers()
    ]);

    setShelters(shelterResponse.items ?? []);
    setIncidents(incidentResponse.items ?? []);

    const serverSos: SosMarker[] = (sosResponse.items ?? []).map(item => ({
      id: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      note: item.message ?? `SOS status: ${item.status}`,
      source: 'manual',
      createdAt: new Date(item.createdAt).getTime()
    }));

    const existingServerIds = new Set(serverSos.map(item => item.id));
    const merged = [...serverSos, ...localSos.filter(item => !existingServerIds.has(item.id))];
    setSosMarkers(merged);

    await loadNearbyResponders(query);
  }, [loadNearbyResponders]);

  const refreshCurrentPosition = useCallback(async (animate = false) => {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High
    });

    const nextRegion: Region = {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02
    };

    setMyLocation(current.coords);
    setCurrentRegion(nextRegion);
    await updateLastKnownLocation({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      timestamp: Date.now()
    });

    if (animate) {
      mapRef.current?.animateToRegion(nextRegion, 600);
    }

    return current.coords;
  }, []);

  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let active = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Ban chua cap quyen vi tri. Hay bat Location permission.');
          setIsLoading(false);
          return;
        }

        const coords = await refreshCurrentPosition(true);
        if (!active) return;

        try {
          await loadMapData(coords.latitude, coords.longitude);
          if (active) setSyncWarning(null);
        } catch {
          if (active) setSyncWarning('Khong the dong bo du lieu map tu server.');
        }

        setIsLoading(false);

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15,
            timeInterval: 8000
          },
          pos => {
            const liveRegion: Region = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02
            };
            setMyLocation(pos.coords);
            setCurrentRegion(liveRegion);
            updateLastKnownLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              timestamp: Date.now()
            }).catch(() => undefined);
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Khong the tai du lieu ban do.';
        setErrorMsg(message);
        setIsLoading(false);
      }
    })();

    return () => {
      active = false;
      locationSub?.remove();
    };
  }, [loadMapData, refreshCurrentPosition]);

  useEffect(() => {
    if (!myLocation) return;
    let active = true;

    const tick = async () => {
      try {
        await loadMapData(myLocation.latitude, myLocation.longitude);
        if (active) setSyncWarning(null);
      } catch {
        if (active) setSyncWarning('Khong the dong bo du lieu map tu server.');
      }
    };

    tick();
    const timer = setInterval(tick, 12000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [myLocation, loadMapData]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;

      (async () => {
        try {
          const coords = await refreshCurrentPosition(true);
          try {
            await loadMapData(coords.latitude, coords.longitude);
            setSyncWarning(null);
          } catch {
            setSyncWarning('Khong the dong bo du lieu map tu server.');
          }
        } catch {
          // keep previous position if foreground refresh fails
        }
      })().catch(() => undefined);
    });

    return () => {
      sub.remove();
    };
  }, [loadMapData, refreshCurrentPosition]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={currentRegion}
        mapType="standard"
        showsUserLocation
        showsMyLocationButton
      >
        {nearbyResponders.map(item => (
          <Marker
            key={`rescuer-${item.userId}`}
            coordinate={{ latitude: item.latitude, longitude: item.longitude }}
            title={item.user?.fullName ?? `Doi cuu ho ${item.userId.slice(-4)}`}
            description={`Vai tro: ${item.user?.role ?? 'RESCUER'} | ${item.distanceKm.toFixed(2)} km`}
            pinColor={responderPinColor(item.user?.role)}
          />
        ))}

        {shelters.map(shelter => (
          <Marker
            key={`shelter-${shelter.id}`}
            coordinate={{ latitude: shelter.latitude, longitude: shelter.longitude }}
            title={shelter.name}
            description={`${shelter.address} | ${shelter.status}`}
            pinColor={shelter.status === 'OPEN' ? '#16a34a' : '#65a30d'}
          />
        ))}

        {incidents.map(incident => (
          <Marker
            key={`incident-${incident.id}`}
            coordinate={{ latitude: incident.latitude, longitude: incident.longitude }}
            title={incident.title}
            description={incident.description ?? `Severity: ${incident.severity}`}
            pinColor={incidentColor(incident.severity)}
          />
        ))}

        {sosMarkers.map(marker => (
          <Marker
            key={`sos-${marker.id}`}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title="SOS khan cap"
            description={marker.note}
            pinColor="#b91c1c"
          />
        ))}
      </MapView>

      <View style={styles.locationInfo}>
        <Text style={styles.locationText}>
          {errorMsg
            ? errorMsg
            : `Vi tri hien tai: ${currentRegion.latitude.toFixed(6)}, ${currentRegion.longitude.toFixed(6)}`}
        </Text>
        {!errorMsg && syncWarning ? <Text style={styles.warningText}>{syncWarning}</Text> : null}
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Dang tai ban do va vi tri...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  locationInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(17,24,39,0.78)',
    padding: 12,
    borderRadius: 12
  },
  locationText: { color: '#ffffff', fontSize: 14, textAlign: 'center' },
  warningText: {
    marginTop: 6,
    color: '#fbbf24',
    fontSize: 12,
    textAlign: 'center'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    color: '#ffffff',
    fontSize: 14
  }
});
