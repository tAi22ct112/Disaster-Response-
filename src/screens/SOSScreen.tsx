import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { COLORS } from '../constants/colors';
import { addSosMarker, flushQueuedCheckins, updateEmergencyLocation } from '../services/checkinService';
import { ApiRequestError, apiGet, apiPatch, apiPost, uploadSosImage } from '../services/apiClient';

const ACTIVE_SOS_KEY = 'drn:sos:active-id';
const OFFLINE_SOS_QUEUE_KEY = 'drn:sos:offline-queue';

type SosCreatePayload = {
  latitude: number;
  longitude: number;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  peopleCount?: number;
  injuryStatus?: string;
  imageUrl?: string;
  captchaId?: string;
  captchaAnswer?: string;
};

type SosCreateResponse = {
  id: string;
  latitude: number;
  longitude: number;
  message?: string | null;
  createdAt: string;
};

type OfflineSosItem = {
  localId: string;
  payload: SosCreatePayload;
  meshCode: string;
  createdAt: number;
};

type SosTrackingResponse = {
  assigned: boolean;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
  etaMinutes?: number;
  distanceToVictimKm?: number;
  rescuer?: {
    fullName?: string | null;
    phone?: string | null;
  } | null;
  message?: string;
};

type CaptchaChallenge = {
  challengeId: string;
  question: string;
  expiresInSeconds: number;
};

function isOfflineSosId(id: string | null) {
  return !!id && id.startsWith('offline-');
}

const buildMeshCode = (payload: SosCreatePayload) => {
  return `SOSMESH|${encodeURIComponent(JSON.stringify(payload))}`;
};

const parseMeshCode = (value: string) => {
  const text = value.trim();
  if (!text.startsWith('SOSMESH|')) {
    throw new Error('Ma Mesh khong hop le');
  }
  const encoded = text.slice('SOSMESH|'.length);
  const decoded = decodeURIComponent(encoded);
  const parsed = JSON.parse(decoded) as SosCreatePayload;
  if (!parsed.latitude || !parsed.longitude || !parsed.severity) {
    throw new Error('Noi dung ma Mesh khong day du');
  }
  return parsed;
};

async function getOfflineSosQueue() {
  const raw = await AsyncStorage.getItem(OFFLINE_SOS_QUEUE_KEY);
  if (!raw) return [] as OfflineSosItem[];
  try {
    const parsed = JSON.parse(raw) as OfflineSosItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveOfflineSosQueue(queue: OfflineSosItem[]) {
  await AsyncStorage.setItem(OFFLINE_SOS_QUEUE_KEY, JSON.stringify(queue.slice(-100)));
}

const extractCaptchaChallenge = (error: ApiRequestError): CaptchaChallenge | null => {
  if (error.message !== 'CAPTCHA_REQUIRED') return null;
  const details = error.details as { challenge?: CaptchaChallenge } | undefined;
  if (!details?.challenge?.challengeId || !details.challenge.question) return null;
  return details.challenge;
};

export default function SOSScreen() {
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [trackingText, setTrackingText] = useState<string>('');
  const [peopleCountInput, setPeopleCountInput] = useState('1');
  const [injuryStatusInput, setInjuryStatusInput] = useState('');
  const [relayCodeInput, setRelayCodeInput] = useState('');
  const [meshCodeToShare, setMeshCodeToShare] = useState<string>('');

  const [selectedImageUri, setSelectedImageUri] = useState<string>('');
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [captchaId, setCaptchaId] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const hasOfflinePending = useMemo(() => isOfflineSosId(activeSosId), [activeSosId]);

  const resetCaptcha = () => {
    setCaptchaId('');
    setCaptchaQuestion('');
    setCaptchaAnswer('');
  };

  const fetchCaptcha = async () => {
    const challenge = await apiGet<CaptchaChallenge>('/api/security/captcha', true);
    setCaptchaId(challenge.challengeId);
    setCaptchaQuestion(challenge.question);
    return challenge;
  };

  const hydrateActiveSos = async () => {
    const saved = await AsyncStorage.getItem(ACTIVE_SOS_KEY);
    if (saved) {
      setActiveSosId(saved);
      setIsSending(true);
    }
  };

  const setActiveSos = async (id: string | null) => {
    setActiveSosId(id);
    setIsSending(!!id);
    if (id) {
      await AsyncStorage.setItem(ACTIVE_SOS_KEY, id);
    } else {
      await AsyncStorage.removeItem(ACTIVE_SOS_KEY);
    }
  };

  const flushOfflineSosQueue = async () => {
    const queue = await getOfflineSosQueue();
    if (queue.length === 0) return;

    const remaining: OfflineSosItem[] = [];
    for (const item of queue) {
      try {
        const created = await apiPost<SosCreateResponse>('/api/sos', item.payload, true);

        await addSosMarker({
          id: created.id,
          latitude: created.latitude,
          longitude: created.longitude,
          createdAt: new Date(created.createdAt).getTime(),
          source: 'manual',
          note: created.message ?? 'SOS da duoc gui'
        });

        if (activeSosId === item.localId) {
          await setActiveSos(created.id);
        }
      } catch (error) {
        if (error instanceof ApiRequestError && error.message === 'CAPTCHA_REQUIRED') {
          setTrackingText('SOS offline dang cho CAPTCHA, vui long mo app de xac thuc.');
        }
        remaining.push(item);
      }
    }

    await saveOfflineSosQueue(remaining);
  };

  useEffect(() => {
    hydrateActiveSos().catch(() => undefined);

    (async () => {
      await flushOfflineSosQueue().catch(() => undefined);
      await flushQueuedCheckins().catch(() => undefined);
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isSending) return;

    const timer = setInterval(() => {
      flushOfflineSosQueue().catch(() => undefined);
      flushQueuedCheckins().catch(() => undefined);
    }, 15000);

    return () => clearInterval(timer);
  }, [isSending, activeSosId]);

  useEffect(() => {
    if (!isSending) return;

    let locationSub: Location.LocationSubscription | null = null;
    let active = true;

    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') return;

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 10
          },
          pos => {
            if (!active) return;
            updateEmergencyLocation(
              {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                timestamp: Date.now()
              },
              'SOS active tracking'
            ).catch(() => undefined);
          }
        );
      } catch {
        // ignore tracking errors
      }
    })().catch(() => undefined);

    return () => {
      active = false;
      locationSub?.remove();
    };
  }, [isSending]);

  useEffect(() => {
    if (!activeSosId || isOfflineSosId(activeSosId)) {
      setTrackingText(hasOfflinePending ? 'Dang cho co mang de gui SOS...' : '');
      return;
    }

    let active = true;
    const tick = async () => {
      try {
        const tracking = await apiGet<SosTrackingResponse>(`/api/sos/${activeSosId}/tracking`, true);
        if (!active) return;

        if (!tracking.assigned) {
          setTrackingText(tracking.message ?? 'Dang tim doi cuu ho gan ban...');
          return;
        }

        const rescuerName = tracking.rescuer?.fullName ? ` (${tracking.rescuer.fullName})` : '';
        const eta = tracking.etaMinutes ? `ETA: ${tracking.etaMinutes} phut` : 'Dang tinh ETA';
        const distance =
          tracking.distanceToVictimKm !== undefined ? ` | Cach ban: ${tracking.distanceToVictimKm.toFixed(2)} km` : '';
        setTrackingText(`Doi cuu ho dang toi${rescuerName}. ${eta}${distance}`);
      } catch {
        if (active) {
          setTrackingText('Tam mat ket noi tracking, app se tu dong thu lai...');
        }
      }
    };

    tick().catch(() => undefined);
    const timer = setInterval(() => {
      tick().catch(() => undefined);
    }, 20000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [activeSosId, hasOfflinePending]);

  const enqueueOfflineSos = async (payload: SosCreatePayload) => {
    const queue = await getOfflineSosQueue();
    const localId = `offline-${Date.now()}`;
    const meshCode = buildMeshCode(payload);
    const next: OfflineSosItem[] = [
      ...queue,
      {
        localId,
        payload,
        meshCode,
        createdAt: Date.now()
      }
    ];
    await saveOfflineSosQueue(next);
    await setActiveSos(localId);
    setMeshCodeToShare(meshCode);
    return localId;
  };

  const parsePeopleCount = () => {
    const normalized = peopleCountInput.trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
      throw new Error('So nguoi di cung phai trong khoang 1-500');
    }
    return Math.floor(parsed);
  };

  const uploadSelectedImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Can cap quyen thu vien anh de dinh kem hinh.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsMultipleSelection: false
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    const asset = result.assets[0];
    setSelectedImageUri(asset.uri);
    setIsUploadingImage(true);
    try {
      const uploaded = await uploadSosImage({
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined
      });
      setUploadedImageUrl(uploaded.imageUrl);
      Alert.alert('Thanh cong', 'Da upload anh hien truong.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const buildSosPayload = (coords: Location.LocationObjectCoords): SosCreatePayload => {
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      message: 'Nguoi dung dang can cuu ho ngay lap tuc',
      severity: 'CRITICAL',
      peopleCount: parsePeopleCount(),
      injuryStatus: injuryStatusInput.trim() || undefined,
      imageUrl: uploadedImageUrl || undefined,
      captchaId: captchaId || undefined,
      captchaAnswer: captchaAnswer.trim() || undefined
    };
  };

  const sendSos = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Can cap quyen vi tri de gui SOS.');
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High
    });
    const payload = buildSosPayload(current.coords);

    try {
      const created = await apiPost<SosCreateResponse>('/api/sos', payload, true);
      await setActiveSos(created.id);
      await addSosMarker({
        id: created.id,
        latitude: created.latitude,
        longitude: created.longitude,
        createdAt: new Date(created.createdAt).getTime(),
        source: 'manual',
        note: created.message ?? 'SOS da duoc gui'
      });
      resetCaptcha();
      setTrackingText('SOS da gui. Dang tim doi cuu ho...');
      return;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const challenge = extractCaptchaChallenge(error);
        if (challenge) {
          setCaptchaId(challenge.challengeId);
          setCaptchaQuestion(challenge.question);
          setTrackingText('He thong yeu cau CAPTCHA de xac minh SOS.');
          throw new Error(`Can nhap CAPTCHA: ${challenge.question}`);
        }
        throw error;
      }
    }

    const localId = await enqueueOfflineSos(payload);
    setTrackingText('Khong co mang. SOS da luu offline, se tu gui khi co ket noi.');
    await updateEmergencyLocation(
      {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        timestamp: Date.now()
      },
      `Offline SOS queued: ${localId}`
    ).catch(() => undefined);
  };

  const cancelSos = async () => {
    if (!activeSosId) return;

    if (isOfflineSosId(activeSosId)) {
      const queue = await getOfflineSosQueue();
      const remaining = queue.filter(item => item.localId !== activeSosId);
      await saveOfflineSosQueue(remaining);
      await setActiveSos(null);
      setTrackingText('');
      setMeshCodeToShare('');
      return;
    }

    await apiPatch(
      `/api/sos/${activeSosId}/status`,
      {
        status: 'CANCELLED',
        note: 'User canceled from mobile app'
      },
      true
    );

    await setActiveSos(null);
    setTrackingText('');
    setMeshCodeToShare('');
  };

  const relayMeshCode = async () => {
    const payload = parseMeshCode(relayCodeInput);
    await apiPost('/api/sos', payload, true);
    Alert.alert('Da relay', 'Da relay SOS tu ma Mesh len server.');
    setRelayCodeInput('');
  };

  const shareMeshCode = async () => {
    if (!meshCodeToShare) {
      Alert.alert('Chua co ma', 'Chua co SOS offline de chia se.');
      return;
    }
    await Share.share({
      message: `Ma SOS Mesh:\n${meshCodeToShare}`
    });
  };

  const toggleSOS = () => {
    if (isBusy) return;

    if (isSending) {
      Alert.alert('Dung SOS?', 'Ban muon dung tin hieu SOS hien tai?', [
        { text: 'Khong', style: 'cancel' },
        {
          text: 'Dung',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsBusy(true);
              await cancelSos();
              Alert.alert('Da dung', 'Tin hieu SOS da duoc huy.');
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Khong the huy SOS';
              Alert.alert('Loi', message);
            } finally {
              setIsBusy(false);
            }
          }
        }
      ]);
      return;
    }

    Alert.alert('Gui SOS khan cap?', 'Ban chac chan can cuu ho ngay lap tuc?', [
      { text: 'Huy', style: 'cancel' },
      {
        text: 'GUI NGAY',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsBusy(true);
            await sendSos();
            Alert.alert('Thanh cong', 'Yeu cau SOS da duoc tiep nhan.');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Khong the gui SOS';
            Alert.alert('Loi', message);
          } finally {
            setIsBusy(false);
          }
        }
      }
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>SOS KHAN CAP</Text>
      <Text style={styles.subtitle}>Nhan nut do de gui tin hieu cuu ho den server</Text>

      <View style={styles.formCard}>
        <Text style={styles.label}>So nguoi di cung (tuy chon)</Text>
        <TextInput
          style={styles.input}
          placeholder="Vi du: 3"
          keyboardType="number-pad"
          value={peopleCountInput}
          onChangeText={text => setPeopleCountInput(text.replace(/\D/g, '').slice(0, 3))}
        />

        <Text style={styles.label}>Tinh trang bi thuong (tuy chon)</Text>
        <TextInput
          style={styles.input}
          placeholder="Vi du: Gay chan, chay mau..."
          value={injuryStatusInput}
          onChangeText={setInjuryStatusInput}
          maxLength={200}
        />

        <Text style={styles.label}>Anh hien truong that (multipart upload)</Text>
        <TouchableOpacity
          style={[styles.secondaryBtn, isUploadingImage && styles.disabled]}
          onPress={() => {
            uploadSelectedImage().catch(error => {
              const message = error instanceof Error ? error.message : 'Khong the upload anh';
              Alert.alert('Loi', message);
            });
          }}
          disabled={isUploadingImage}
        >
          <Text style={styles.secondaryBtnText}>{isUploadingImage ? 'Dang upload...' : 'Chon & Upload Anh'}</Text>
        </TouchableOpacity>
        {!!selectedImageUri && <Text style={styles.helperText}>Da chon anh: {selectedImageUri.split('/').pop()}</Text>}
        {!!uploadedImageUrl && <Text style={styles.helperText}>Image URL: {uploadedImageUrl}</Text>}

        <View style={styles.captchaBox}>
          <View style={styles.captchaHeader}>
            <Text style={styles.label}>CAPTCHA (chi can khi he thong yeu cau)</Text>
            <TouchableOpacity
              onPress={() => {
                fetchCaptcha().catch(error => {
                  const message = error instanceof Error ? error.message : 'Khong the lay CAPTCHA';
                  Alert.alert('Loi', message);
                });
              }}
            >
              <Text style={styles.linkBtn}>Lay CAPTCHA</Text>
            </TouchableOpacity>
          </View>
          {!!captchaQuestion && <Text style={styles.helperText}>Cau hoi: {captchaQuestion}</Text>}
          <TextInput
            style={styles.input}
            placeholder="Nhap dap an CAPTCHA"
            value={captchaAnswer}
            onChangeText={setCaptchaAnswer}
            keyboardType="number-pad"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.sosButton, isSending && styles.active, (isBusy || isUploadingImage) && styles.disabled]}
        onPress={toggleSOS}
        disabled={isBusy || isUploadingImage}
      >
        <Text style={styles.sosText}>{isSending ? 'DANG GUI...\n(Nhan de dung)' : 'SOS'}</Text>
      </TouchableOpacity>

      {isSending && <Text style={styles.status}>Dang phat tin hieu khan cap...</Text>}
      {!!trackingText && <Text style={styles.tracking}>{trackingText}</Text>}
      {hasOfflinePending && <Text style={styles.offlineHint}>Mode offline: du lieu se tu dong gui lai khi co mang.</Text>}

      <View style={styles.meshCard}>
        <Text style={styles.meshTitle}>Mesh Relay (fallback)</Text>
        <Text style={styles.helperText}>
          Khi mat internet hoan toan, chia se ma Mesh cho may khac co mang de relay SOS.
        </Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => shareMeshCode().catch(() => undefined)}>
          <Text style={styles.secondaryBtnText}>Chia Se Ma Mesh SOS</Text>
        </TouchableOpacity>
        {!!meshCodeToShare && <Text style={styles.meshCode}>{meshCodeToShare}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Dan ma SOSMESH|..."
          value={relayCodeInput}
          onChangeText={setRelayCodeInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => {
            relayMeshCode().catch(error => {
              const message = error instanceof Error ? error.message : 'Khong relay duoc ma Mesh';
              Alert.alert('Loi', message);
            });
          }}
        >
          <Text style={styles.secondaryBtnText}>Relay Ma Mesh Len Server</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
    paddingVertical: 24
  },
  title: { fontSize: 34, fontWeight: 'bold', color: '#c62828', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#555', marginBottom: 18 },
  formCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 8
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#111827',
    backgroundColor: '#fff'
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280'
  },
  secondaryBtn: {
    marginTop: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center'
  },
  secondaryBtnText: {
    color: '#111827',
    fontWeight: '700'
  },
  captchaBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8
  },
  captchaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  linkBtn: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 12
  },
  sosButton: {
    backgroundColor: '#c62828',
    width: 240,
    height: 240,
    borderRadius: 120,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 12
  },
  active: { backgroundColor: '#b71c1c', transform: [{ scale: 1.05 }] },
  disabled: { opacity: 0.8 },
  sosText: { color: 'white', fontSize: 48, fontWeight: 'bold', textAlign: 'center' },
  status: { marginTop: 20, fontSize: 17, color: '#c62828', fontWeight: 'bold', textAlign: 'center' },
  tracking: {
    marginTop: 10,
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
    paddingHorizontal: 10
  },
  offlineHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#92400e',
    textAlign: 'center',
    paddingHorizontal: 10
  },
  meshCard: {
    marginTop: 16,
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14
  },
  meshTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827'
  },
  meshCode: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    color: '#111827',
    fontSize: 11
  }
});
