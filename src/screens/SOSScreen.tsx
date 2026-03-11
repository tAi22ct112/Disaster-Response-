import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
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
          note: created.message ?? 'SOS đã được gửi.'
        });

        if (activeSosId === item.localId) {
          await setActiveSos(created.id);
        }
      } catch (error) {
        if (error instanceof ApiRequestError && error.message === 'CAPTCHA_REQUIRED') {
          setTrackingText('SOS offline đang chờ CAPTCHA, vui lòng mở app để xác thực.');
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
      setTrackingText(hasOfflinePending ? 'Đang chờ có mạng để gửi SOS...' : '');
      return;
    }

    let active = true;
    const tick = async () => {
      try {
        const tracking = await apiGet<SosTrackingResponse>(`/api/sos/${activeSosId}/tracking`, true);
        if (!active) return;

        if (!tracking.assigned) {
          setTrackingText(tracking.message ?? 'Đang tìm đội cứu hộ gần bạn...');
          return;
        }

        const rescuerName = tracking.rescuer?.fullName ? ` (${tracking.rescuer.fullName})` : '';
        const eta = tracking.etaMinutes ? `ETA: ${tracking.etaMinutes} phút` : 'Đang tính ETA';
        const distance =
          tracking.distanceToVictimKm !== undefined ? ` | Cách bạn: ${tracking.distanceToVictimKm.toFixed(2)} km` : '';
        setTrackingText(`Đội cứu hộ đang tới${rescuerName}. ${eta}${distance}`);
      } catch {
        if (active) {
          setTrackingText('Tạm mất kết nối theo dõi, app sẽ tự động thử lại...');
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
    const next: OfflineSosItem[] = [
      ...queue,
      {
        localId,
        payload,
        createdAt: Date.now()
      }
    ];
    await saveOfflineSosQueue(next);
    await setActiveSos(localId);
    return localId;
  };

  const parsePeopleCount = () => {
    const normalized = peopleCountInput.trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
      throw new Error('Số người đi cùng phải trong khoảng 1-500.');
    }
    return Math.floor(parsed);
  };

  const uploadSelectedImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Cần cấp quyền thư viện ảnh để đính kèm hình.');
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
      Alert.alert('Thành công', 'Đã upload ảnh hiện trường.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const buildSosPayload = (coords: Location.LocationObjectCoords): SosCreatePayload => {
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      message: 'Người dùng đang cần cứu hộ ngay lập tức.',
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
      throw new Error('Cần cấp quyền vị trí để gửi SOS.');
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
        note: created.message ?? 'SOS đã được gửi.'
      });
      resetCaptcha();
      setTrackingText('SOS đã gửi. Đang tìm đội cứu hộ...');
      return;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const challenge = extractCaptchaChallenge(error);
        if (challenge) {
          setCaptchaId(challenge.challengeId);
          setCaptchaQuestion(challenge.question);
          setTrackingText('Hệ thống yêu cầu CAPTCHA để xác minh SOS.');
          throw new Error(`Cần nhập CAPTCHA: ${challenge.question}`);
        }
        throw error;
      }
    }

    const localId = await enqueueOfflineSos(payload);
    setTrackingText('Không có mạng. SOS đã lưu offline, sẽ tự gửi khi có kết nối.');
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
  };

  const toggleSOS = () => {
    if (isBusy) return;

    if (isSending) {
      Alert.alert('Dừng SOS?', 'Bạn muốn dừng tín hiệu SOS hiện tại?', [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Dừng',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsBusy(true);
              await cancelSos();
              Alert.alert('Đã dừng', 'Tín hiệu SOS đã được hủy.');
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Không thể hủy SOS.';
              Alert.alert('Lỗi', message);
            } finally {
              setIsBusy(false);
            }
          }
        }
      ]);
      return;
    }

    Alert.alert('Gửi SOS khẩn cấp?', 'Bạn chắc chắn cần cứu hộ ngay lập tức?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'GỬI NGAY',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsBusy(true);
            await sendSos();
            Alert.alert('Thành công', 'Yêu cầu SOS đã được tiếp nhận.');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Không thể gửi SOS.';
            Alert.alert('Lỗi', message);
          } finally {
            setIsBusy(false);
          }
        }
      }
    ]);
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]} style={styles.gradientBackground}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <Text style={styles.title}>SOS KHẨN CẤP</Text>
      <Text style={styles.subtitle}>Nhấn nút đỏ để gửi tín hiệu cứu hộ đến server.</Text>

      <View style={styles.formCard}>
        <Text style={styles.label}>Số người đi cùng (tùy chọn)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ví dụ: 3"
          keyboardType="number-pad"
          value={peopleCountInput}
          onChangeText={text => setPeopleCountInput(text.replace(/\D/g, '').slice(0, 3))}
        />

        <Text style={styles.label}>Tình trạng bị thương (tùy chọn)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ví dụ: Gãy chân, chảy máu..."
          value={injuryStatusInput}
          onChangeText={setInjuryStatusInput}
          maxLength={200}
        />

        <Text style={styles.label}>Ảnh hiện trường thật (multipart upload)</Text>
        <TouchableOpacity
          style={[styles.secondaryBtn, isUploadingImage && styles.disabled]}
          onPress={() => {
            uploadSelectedImage().catch(error => {
              const message = error instanceof Error ? error.message : 'Không thể upload ảnh.';
              Alert.alert('Lỗi', message);
            });
          }}
          disabled={isUploadingImage}
        >
          <Text style={styles.secondaryBtnText}>{isUploadingImage ? 'Đang upload...' : 'Chọn & upload ảnh'}</Text>
        </TouchableOpacity>
        {!!selectedImageUri && <Text style={styles.helperText}>Đã chọn ảnh: {selectedImageUri.split('/').pop()}</Text>}
        {!!uploadedImageUrl && <Text style={styles.helperText}>Đường dẫn ảnh: {uploadedImageUrl}</Text>}

        <View style={styles.captchaBox}>
          <View style={styles.captchaHeader}>
            <Text style={styles.label}>CAPTCHA (chỉ cần khi hệ thống yêu cầu)</Text>
            <TouchableOpacity
              onPress={() => {
                fetchCaptcha().catch(error => {
                  const message = error instanceof Error ? error.message : 'Không thể lấy CAPTCHA.';
                  Alert.alert('Lỗi', message);
                });
              }}
            >
              <Text style={styles.linkBtn}>Lấy CAPTCHA</Text>
            </TouchableOpacity>
          </View>
          {!!captchaQuestion && <Text style={styles.helperText}>Câu hỏi: {captchaQuestion}</Text>}
          <TextInput
            style={styles.input}
            placeholder="Nhập đáp án CAPTCHA"
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
        <Text style={styles.sosText}>{isSending ? 'ĐANG GỬI...\n(Nhấn để dừng)' : 'SOS'}</Text>
      </TouchableOpacity>

      {isSending && <Text style={styles.status}>Đang phát tín hiệu khẩn cấp...</Text>}
      {!!trackingText && <Text style={styles.tracking}>{trackingText}</Text>}
      {hasOfflinePending && <Text style={styles.offlineHint}>Chế độ offline: dữ liệu sẽ tự động gửi lại khi có mạng.</Text>}

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 24
  },
  title: { fontSize: 34, fontWeight: 'bold', color: '#c62828', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', color: COLORS.textLight, marginBottom: 18 },
  formCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border
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
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: COLORS.text,
    backgroundColor: COLORS.inputBackground
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280'
  },
  secondaryBtn: {
    marginTop: 8,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border
  },
  secondaryBtnText: {
    color: COLORS.primaryDark,
    fontWeight: '700'
  },
  captchaBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
  }
});
