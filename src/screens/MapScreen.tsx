import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { getSosMarkers, updateLastKnownLocation } from '../services/checkinService';
import { ApiRequestError, apiGet, apiPatch, getSession, type UserRole } from '../services/apiClient';
import type { SosMarker } from '../types';

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
  peopleCount?: number | null;
  injuryStatus?: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
  createdAt: string;
  distanceToEventKm?: number;
  priorityScore?: number;
  etaMinutes?: number;
  user?: {
    fullName?: string | null;
    phone?: string | null;
  } | null;
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

const RESCUE_RADIUS_OPTIONS = [50, 100, 150] as const;
type RescueRadiusKm = (typeof RESCUE_RADIUS_OPTIONS)[number];

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

function responderPinColor(role?: 'USER' | 'RESCUER' | 'ADMIN') {
  if (role === 'ADMIN') return '#7c3aed';
  return '#1d4ed8';
}

function severityBadgeColor(severity: SosApiItem['severity']) {
  if (severity === 'CRITICAL') return '#b91c1c';
  if (severity === 'HIGH') return '#dc2626';
  if (severity === 'MEDIUM') return '#d97706';
  return '#1d4ed8';
}

function severityLabel(severity: SosApiItem['severity']) {
  if (severity === 'CRITICAL') return 'RẤT CAO';
  if (severity === 'HIGH') return 'CAO';
  if (severity === 'MEDIUM') return 'TRUNG BÌNH';
  return 'THẤP';
}

function shelterStatusLabel(status: ShelterItem['status']) {
  if (status === 'OPEN') return 'Còn chỗ';
  if (status === 'FULL') return 'Đã đầy';
  return 'Đóng';
}

function incidentSeverityLabel(severity: IncidentItem['severity']) {
  if (severity === 'CRITICAL') return 'Rất cao';
  if (severity === 'HIGH') return 'Cao';
  if (severity === 'MEDIUM') return 'Trung bình';
  return 'Thấp';
}

function sosStatusLabel(status: SosApiItem['status']) {
  if (status === 'OPEN') return 'Mở';
  if (status === 'IN_PROGRESS') return 'Đang xử lý';
  if (status === 'RESOLVED') return 'Đã xử lý';
  return 'Đã hủy';
}

function roleLabel(role?: 'USER' | 'RESCUER' | 'ADMIN') {
  if (role === 'ADMIN') return 'Quản trị viên';
  if (role === 'RESCUER') return 'Đội cứu hộ';
  return 'Người dùng';
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

export default function MapScreen() {
  const mapRef = useRef<MapView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region>(DEFAULT_REGION);
  const [myLocation, setMyLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [rescueQueue, setRescueQueue] = useState<SosApiItem[]>([]);
  const [claimingSosId, setClaimingSosId] = useState<string | null>(null);
  const [rescueRadiusKm, setRescueRadiusKm] = useState<RescueRadiusKm>(100);
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);
  const [isQueueLarge, setIsQueueLarge] = useState(false);

  const [sosMarkers, setSosMarkers] = useState<SosMarker[]>([]);
  const [shelters, setShelters] = useState<ShelterItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [nearbyResponders, setNearbyResponders] = useState<NearbyResponderItem[]>([]);

  const canClaimRescue = useMemo(() => currentRole === 'RESCUER' || currentRole === 'ADMIN', [currentRole]);

  const formatVictimName = useCallback((item: SosApiItem) => {
    return item.user?.fullName?.trim() || item.user?.phone || `SOS #${item.id.slice(-4)}`;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await getSession();
        if (active) {
          setCurrentRole(session?.user?.role ?? null);
        }
      } catch {
        if (active) setCurrentRole(null);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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

  const loadRescueQueue = useCallback(
    async (latitude: number, longitude: number) => {
      if (!canClaimRescue) {
        setRescueQueue([]);
        return;
      }

      const query = toQuery({
        latitude,
        longitude,
        radiusKm: rescueRadiusKm,
        status: 'OPEN',
        page: 1,
        limit: 30
      });

      try {
        const response = await apiGet<{ items: SosApiItem[] }>(`/api/sos/nearby?${query}`, true);
        setRescueQueue(response.items ?? []);
        return;
      } catch {
        // fallback for older backend without /nearby
      }

      try {
        const fallback = await apiGet<{ items: SosApiItem[] }>(`/api/sos?status=OPEN&page=1&limit=50`, true);
        const items = (fallback.items ?? [])
          .map(item => ({
            ...item,
            distanceToEventKm: distanceKm(latitude, longitude, item.latitude, item.longitude)
          }))
          .filter(item => (item.distanceToEventKm ?? Number.MAX_VALUE) <= rescueRadiusKm)
          .sort((a, b) => (a.distanceToEventKm ?? 999) - (b.distanceToEventKm ?? 999))
          .slice(0, 30);

        setRescueQueue(items);
      } catch {
        setRescueQueue([]);
      }
    },
    [canClaimRescue, rescueRadiusKm]
  );

  const loadMapData = useCallback(
    async (latitude: number, longitude: number) => {
      const query = toQuery({
        latitude,
        longitude,
        radiusKm: 35
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
        note: item.message ?? `Trạng thái SOS: ${sosStatusLabel(item.status)}`,
        source: 'manual',
        createdAt: new Date(item.createdAt).getTime()
      }));

      const existingServerIds = new Set(serverSos.map(item => item.id));
      const merged = [...serverSos, ...localSos.filter(item => !existingServerIds.has(item.id))];
      setSosMarkers(merged);

      await Promise.all([loadNearbyResponders(query), loadRescueQueue(latitude, longitude)]);
    },
    [loadNearbyResponders, loadRescueQueue]
  );

  const claimRescueMission = useCallback(
    (item: SosApiItem) => {
      if (!canClaimRescue) return;

      const victimName = formatVictimName(item);
      const distanceText =
        item.distanceToEventKm !== undefined ? `Cách bạn ${item.distanceToEventKm.toFixed(2)} km.` : '';

      Alert.alert('Nhận nhiệm vụ cứu hộ?', `${victimName}\n${distanceText}`, [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Nhận cứu',
          onPress: () => {
            (async () => {
              try {
                setClaimingSosId(item.id);
                await apiPatch(
                  `/api/sos/${item.id}/status`,
                  {
                    status: 'IN_PROGRESS',
                    note: 'Rescuer accepted mission from map queue'
                  },
                  true
                );

                mapRef.current?.animateToRegion(
                  {
                    latitude: item.latitude,
                    longitude: item.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02
                  },
                  700
                );

                const latitude = myLocation?.latitude ?? currentRegion.latitude;
                const longitude = myLocation?.longitude ?? currentRegion.longitude;
                await loadMapData(latitude, longitude);
                setSyncWarning(null);
                Alert.alert('Đã nhận cứu', `Bạn đã nhận nhiệm vụ của ${victimName}.`);
              } catch (error) {
                if (error instanceof ApiRequestError && error.status === 409) {
                  Alert.alert('Không thể nhận cứu', 'SOS này đã có đội cứu hộ khác nhận trước bạn.');
                  return;
                }
                const message = error instanceof Error ? error.message : 'Không thể nhận cứu lúc này.';
                Alert.alert('Không thể nhận cứu', message);
              } finally {
                setClaimingSosId(null);
              }
            })().catch(() => undefined);
          }
        }
      ]);
    },
    [canClaimRescue, currentRegion.latitude, currentRegion.longitude, formatVictimName, loadMapData, myLocation]
  );

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
          setErrorMsg('Bạn chưa cấp quyền vị trí. Hãy bật quyền Location rồi thử lại.');
          setIsLoading(false);
          return;
        }

        const coords = await refreshCurrentPosition(true);
        if (!active) return;

        try {
          await loadMapData(coords.latitude, coords.longitude);
          if (active) setSyncWarning(null);
        } catch {
          if (active) setSyncWarning('Không thể đồng bộ dữ liệu bản đồ từ server.');
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
        const message = error instanceof Error ? error.message : 'Không thể tải dữ liệu bản đồ.';
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
        if (active) setSyncWarning('Không thể đồng bộ dữ liệu bản đồ từ server.');
      }
    };

    tick().catch(() => undefined);
    const timer = setInterval(tick, 12000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [myLocation, loadMapData]);

  useEffect(() => {
    if (!myLocation || !canClaimRescue) return;
    loadRescueQueue(myLocation.latitude, myLocation.longitude).catch(() => undefined);
  }, [myLocation, canClaimRescue, loadRescueQueue, rescueRadiusKm]);

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
            setSyncWarning('Không thể đồng bộ dữ liệu bản đồ từ server.');
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
      <MapView ref={mapRef} style={styles.map} initialRegion={currentRegion} mapType="standard" showsUserLocation showsMyLocationButton>
        {nearbyResponders.map(item => (
          <Marker
            key={`rescuer-${item.userId}`}
            coordinate={{ latitude: item.latitude, longitude: item.longitude }}
            title={item.user?.fullName ?? `Đội cứu hộ ${item.userId.slice(-4)}`}
            description={`Vai trò: ${roleLabel(item.user?.role)} | ${item.distanceKm.toFixed(2)} km`}
            pinColor={responderPinColor(item.user?.role)}
          />
        ))}

        {shelters.map(shelter => (
          <Marker
            key={`shelter-${shelter.id}`}
            coordinate={{ latitude: shelter.latitude, longitude: shelter.longitude }}
            title={shelter.name}
            description={`${shelter.address} | ${shelterStatusLabel(shelter.status)}`}
            pinColor={shelter.status === 'OPEN' ? '#16a34a' : '#65a30d'}
          />
        ))}

        {incidents.map(incident => (
          <Marker
            key={`incident-${incident.id}`}
            coordinate={{ latitude: incident.latitude, longitude: incident.longitude }}
            title={incident.title}
            description={incident.description ?? `Mức độ: ${incidentSeverityLabel(incident.severity)}`}
            pinColor={incidentColor(incident.severity)}
          />
        ))}

        {sosMarkers.map(marker => (
          <Marker
            key={`sos-${marker.id}`}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title="SOS khẩn cấp"
            description={marker.note}
            pinColor="#b91c1c"
          />
        ))}
      </MapView>

      {canClaimRescue && (
        <>
          <TouchableOpacity
            style={styles.queueFab}
            onPress={() => setIsQueueExpanded(prev => !prev)}
            activeOpacity={0.85}
          >
            <Ionicons name={isQueueExpanded ? 'chevron-up' : 'list'} size={20} color="#fff" />
            <Text style={styles.queueFabText}>SOS</Text>
            <View style={styles.queueFabBadge}>
              <Text style={styles.queueFabBadgeText}>{rescueQueue.length}</Text>
            </View>
          </TouchableOpacity>

          {isQueueExpanded && (
            <View style={[styles.queuePanel, isQueueLarge ? styles.queuePanelLarge : styles.queuePanelCompact]}>
              <View style={styles.queueHeader}>
                <Text style={styles.queueTitle}>Danh sách người cần cứu ({rescueQueue.length})</Text>
                <View style={styles.queueHeaderActions}>
                  <TouchableOpacity style={styles.queueHeaderBtn} onPress={() => setIsQueueLarge(prev => !prev)}>
                    <Ionicons name={isQueueLarge ? 'contract-outline' : 'expand-outline'} size={15} color="#fff" />
                    <Text style={styles.queueHeaderBtnText}>{isQueueLarge ? 'Thu gọn' : 'Phóng to'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.queueHeaderBtn} onPress={() => setIsQueueExpanded(false)}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.radiusRow}>
                <Text style={styles.radiusLabel}>Bán kính lọc:</Text>
                {RESCUE_RADIUS_OPTIONS.map(radius => (
                  <TouchableOpacity
                    key={`radius-${radius}`}
                    style={[styles.radiusChip, rescueRadiusKm === radius && styles.radiusChipActive]}
                    onPress={() => setRescueRadiusKm(radius)}
                  >
                    <Text style={[styles.radiusChipText, rescueRadiusKm === radius && styles.radiusChipTextActive]}>
                      {radius} km
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {rescueQueue.length === 0 ? (
                <Text style={styles.queueEmpty}>Chưa có SOS mở trong bán kính đã chọn.</Text>
              ) : (
                <ScrollView style={styles.queueList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {rescueQueue.map(item => (
                    <View key={`queue-${item.id}`} style={styles.queueItem}>
                      <View style={styles.queueItemTop}>
                        <Text style={styles.queueVictim}>{formatVictimName(item)}</Text>
                        <View style={[styles.severityBadge, { backgroundColor: severityBadgeColor(item.severity) }]}>
                          <Text style={styles.severityText}>{severityLabel(item.severity)}</Text>
                        </View>
                      </View>

                      <Text style={styles.queueMeta}>
                        {(item.distanceToEventKm ?? 0).toFixed(2)} km
                        {item.etaMinutes ? ` | ETA ${item.etaMinutes} phút` : ''}
                        {item.peopleCount ? ` | ${item.peopleCount} người` : ''}
                      </Text>
                      <Text style={styles.queueMeta}>Trạng thái: {sosStatusLabel(item.status)}</Text>
                      {!!item.injuryStatus && <Text style={styles.queueMeta}>Bị thương: {item.injuryStatus}</Text>}
                      {!!item.message && <Text style={styles.queueMeta}>Ghi chú: {item.message}</Text>}

                      <View style={styles.queueActions}>
                        <TouchableOpacity
                          style={styles.focusBtn}
                          onPress={() =>
                            mapRef.current?.animateToRegion(
                              {
                                latitude: item.latitude,
                                longitude: item.longitude,
                                latitudeDelta: 0.02,
                                longitudeDelta: 0.02
                              },
                              600
                            )
                          }
                        >
                          <Text style={styles.focusBtnText}>Xem trên map</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.claimBtn, claimingSosId === item.id && styles.claimBtnDisabled]}
                          onPress={() => claimRescueMission(item)}
                          disabled={claimingSosId === item.id}
                        >
                          <Text style={styles.claimBtnText}>
                            {claimingSosId === item.id ? 'Đang nhận...' : 'Nhận cứu'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </>
      )}

      <View style={styles.locationInfo}>
        <Text style={styles.locationText}>
          {errorMsg
            ? errorMsg
            : `Vị trí hiện tại: ${currentRegion.latitude.toFixed(6)}, ${currentRegion.longitude.toFixed(6)}`}
        </Text>
        {!errorMsg && syncWarning ? <Text style={styles.warningText}>{syncWarning}</Text> : null}
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Đang tải bản đồ và vị trí...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  queueFab: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(2,6,23,0.88)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 10,
    zIndex: 30
  },
  queueFabText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },
  queueFabBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  queueFabBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12
  },
  queuePanel: {
    position: 'absolute',
    top: 58,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(17,24,39,0.92)',
    borderRadius: 12,
    padding: 10,
    zIndex: 25
  },
  queuePanelCompact: {
    maxHeight: 260
  },
  queuePanelLarge: {
    maxHeight: 430
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  queueTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    flex: 1
  },
  queueHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  queueHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  queueHeaderBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 11
  },
  radiusRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6
  },
  radiusLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600'
  },
  radiusChip: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  radiusChipActive: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.2)'
  },
  radiusChipText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600'
  },
  radiusChipTextActive: {
    color: '#dcfce7'
  },
  queueEmpty: {
    marginTop: 10,
    color: '#cbd5e1',
    fontSize: 12
  },
  queueList: {
    marginTop: 8
  },
  queueItem: {
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8
  },
  queueItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  queueVictim: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 13,
    flex: 1
  },
  severityBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  severityText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 10
  },
  queueMeta: {
    marginTop: 4,
    color: '#cbd5e1',
    fontSize: 11
  },
  queueActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8
  },
  focusBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    paddingVertical: 8,
    alignItems: 'center'
  },
  focusBtnText: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 12
  },
  claimBtn: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 8,
    alignItems: 'center'
  },
  claimBtnDisabled: {
    opacity: 0.75
  },
  claimBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12
  },
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
