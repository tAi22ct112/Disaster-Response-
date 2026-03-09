import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import type { CheckinSettings, CheckinState, LastKnownLocation, SosMarker } from '../types';
import { apiPost } from './apiClient';

type NotificationsModule = typeof import('expo-notifications');

const SETTINGS_KEY = 'drn:checkin:settings';
const STATE_KEY = 'drn:checkin:state';
const SOS_MARKERS_KEY = 'drn:sos:markers';
const CHECKIN_QUEUE_KEY = 'drn:checkin:offline-queue';
const CATEGORY_ID = 'CHECKIN_CATEGORY';
const ACTION_YES = 'CHECKIN_YES';
const ACTION_NO = 'CHECKIN_NO';
const isExpoGo = Constants.executionEnvironment === 'storeClient';
const CHECKIN_SYNC_INTERVAL_MS = 30000;
const MAX_CHECKIN_QUEUE = 300;
let lastCheckinSyncAt = 0;
let isFlushingCheckinQueue = false;

type CheckinPayload = {
  latitude: number;
  longitude: number;
  status: 'SAFE' | 'NEED_HELP' | 'OFFLINE';
  note?: string;
  syncedFromDevice: string;
};

type QueuedCheckinPayload = CheckinPayload & {
  queuedAt: number;
};

const DEFAULT_SETTINGS: CheckinSettings = {
  enabled: false,
  hour: 20,
  minute: 0,
  graceDays: 3,
};

let notificationsModule: NotificationsModule | null = null;

async function loadNotificationsModule() {
  if (isExpoGo) return null;
  if (!notificationsModule) {
    notificationsModule = await import('expo-notifications');
  }
  return notificationsModule;
}

export function isNotificationRuntimeSupported() {
  return !isExpoGo;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseHm(value: string) {
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
}

export function formatHm(hour: number, minute: number) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function parseTimeInput(value: string) {
  return parseHm(value.trim());
}

export async function getCheckinSettings() {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return safeParse<CheckinSettings>(raw, DEFAULT_SETTINGS);
}

export async function saveCheckinSettings(next: CheckinSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

export async function getCheckinState() {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  return safeParse<CheckinState>(raw, {});
}

async function saveCheckinState(next: CheckinState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next));
}

export async function getSosMarkers() {
  const raw = await AsyncStorage.getItem(SOS_MARKERS_KEY);
  return safeParse<SosMarker[]>(raw, []);
}

export async function addSosMarker(marker: SosMarker) {
  const markers = await getSosMarkers();
  const next = [marker, ...markers].slice(0, 200);
  await AsyncStorage.setItem(SOS_MARKERS_KEY, JSON.stringify(next));
}

async function getQueuedCheckins() {
  const raw = await AsyncStorage.getItem(CHECKIN_QUEUE_KEY);
  return safeParse<QueuedCheckinPayload[]>(raw, []);
}

async function saveQueuedCheckins(queue: QueuedCheckinPayload[]) {
  await AsyncStorage.setItem(CHECKIN_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_CHECKIN_QUEUE)));
}

async function enqueueCheckin(payload: CheckinPayload) {
  const queue = await getQueuedCheckins();
  const next: QueuedCheckinPayload[] = [
    ...queue,
    {
      ...payload,
      queuedAt: Date.now()
    }
  ];
  await saveQueuedCheckins(next);
}

async function postCheckin(payload: CheckinPayload) {
  await apiPost('/api/checkins', payload, true);
}

export async function flushQueuedCheckins() {
  if (isFlushingCheckinQueue) return;
  isFlushingCheckinQueue = true;

  try {
    const queue = await getQueuedCheckins();
    if (queue.length === 0) return;

    const remaining: QueuedCheckinPayload[] = [];
    for (const item of queue) {
      try {
        await postCheckin({
          latitude: item.latitude,
          longitude: item.longitude,
          status: item.status,
          note: item.note,
          syncedFromDevice: item.syncedFromDevice
        });
      } catch {
        remaining.push(item);
      }
    }
    await saveQueuedCheckins(remaining);
  } finally {
    isFlushingCheckinQueue = false;
  }
}

async function syncCheckinWithQueue(payload: CheckinPayload) {
  await flushQueuedCheckins();
  try {
    await postCheckin(payload);
  } catch {
    await enqueueCheckin(payload);
  }
}

export async function updateLastKnownLocation(coords: LastKnownLocation) {
  const state = await getCheckinState();
  await saveCheckinState({ ...state, lastKnownLocation: coords });

  const now = Date.now();
  if (now - lastCheckinSyncAt < CHECKIN_SYNC_INTERVAL_MS) return;

  lastCheckinSyncAt = now;
  await syncCheckinWithQueue({
    latitude: coords.latitude,
    longitude: coords.longitude,
    status: 'SAFE',
    syncedFromDevice: 'mobile-app'
  });
}

export async function updateEmergencyLocation(coords: LastKnownLocation, note?: string) {
  const state = await getCheckinState();
  await saveCheckinState({ ...state, lastKnownLocation: coords });

  await syncCheckinWithQueue({
    latitude: coords.latitude,
    longitude: coords.longitude,
    status: 'NEED_HELP',
    note,
    syncedFromDevice: 'sos-emergency'
  });
}

async function ensureNotificationPermission() {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return false;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function ensureCategory() {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: ACTION_YES,
      buttonTitle: 'Co',
    },
    {
      identifier: ACTION_NO,
      buttonTitle: 'Khong',
      options: { isDestructive: true },
    },
  ]);
}

export async function scheduleDailyCheckin(settings: CheckinSettings) {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;

  const state = await getCheckinState();
  if (state.scheduledNotificationId) {
    await Notifications.cancelScheduledNotificationAsync(state.scheduledNotificationId).catch(() => undefined);
  }

  if (!settings.enabled) {
    await saveCheckinState({ ...state, scheduledNotificationId: undefined });
    return;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) throw new Error('Notification permission denied');

  await ensureCategory();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Ban co con on khong?',
      body: 'Vui long chon Co hoac Khong de cap nhat tinh trang an toan.',
      categoryIdentifier: CATEGORY_ID,
      data: { kind: 'daily_checkin' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.hour,
      minute: settings.minute,
    },
  });

  await saveCheckinState({ ...state, scheduledNotificationId: id });
}

export async function sendImmediateCheckin() {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    throw new Error('Expo Go khong ho tro day du notification action tren Android SDK 53. Can Development Build.');
  }

  const granted = await ensureNotificationPermission();
  if (!granted) throw new Error('Notification permission denied');

  await ensureCategory();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Ban co con on khong?',
      body: 'Vui long chon Co hoac Khong de cap nhat tinh trang an toan.',
      categoryIdentifier: CATEGORY_ID,
      data: { kind: 'daily_checkin' },
    },
    trigger: null,
  });
}

async function recordPrompt() {
  const state = await getCheckinState();
  await saveCheckinState({ ...state, lastPromptAt: Date.now() });
}

async function recordPromptAt(timestamp: number) {
  const state = await getCheckinState();
  await saveCheckinState({ ...state, lastPromptAt: timestamp });
}

async function recordResponse(response: 'yes' | 'no') {
  const state = await getCheckinState();
  await saveCheckinState({
    ...state,
    lastResponse: response,
    lastResponseAt: Date.now(),
    timeoutAlertForPromptAt: undefined,
  });
}

async function tryGetCurrentOrLastLocation() {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      await Location.requestForegroundPermissionsAsync();
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      timestamp: Date.now(),
    };
  } catch {
    const state = await getCheckinState();
    return state.lastKnownLocation ?? null;
  }
}

async function createEmergencyFromNoResponse(source: 'checkin_no' | 'checkin_timeout', note: string) {
  const location = await tryGetCurrentOrLastLocation();
  if (!location) return;

  await addSosMarker({
    id: `${source}-${Date.now()}`,
    latitude: location.latitude,
    longitude: location.longitude,
    createdAt: Date.now(),
    source,
    note,
  });

  await apiPost(
    '/api/sos',
    {
      latitude: location.latitude,
      longitude: location.longitude,
      message: note,
      severity: 'HIGH'
    },
    true
  ).catch(() => undefined);
}

export async function processNotificationResponse(response: any) {
  const promptAt = response?.notification?.date ?? Date.now();
  await recordPromptAt(promptAt);

  const actionId = response?.actionIdentifier;
  if (actionId !== ACTION_YES && actionId !== ACTION_NO) return;

  await recordResponse(actionId === ACTION_YES ? 'yes' : 'no');
  if (actionId === ACTION_NO) {
    await createEmergencyFromNoResponse('checkin_no', 'Nguoi dung xac nhan KHONG an toan');
  }
}

export async function evaluateCheckinTimeout() {
  const [settings, state] = await Promise.all([getCheckinSettings(), getCheckinState()]);
  if (!settings.enabled || !state.lastPromptAt) return;

  const graceMs = settings.graceDays * 24 * 60 * 60 * 1000;
  const hasRespondedAfterPrompt = !!state.lastResponseAt && state.lastResponseAt >= state.lastPromptAt;
  const timeoutReached = Date.now() - state.lastPromptAt >= graceMs;
  const alreadyRaisedForThisPrompt = state.timeoutAlertForPromptAt === state.lastPromptAt;

  if (!hasRespondedAfterPrompt && timeoutReached && !alreadyRaisedForThisPrompt) {
    await createEmergencyFromNoResponse('checkin_timeout', 'Khong phan hoi check-in sau 3 ngay');
    await saveCheckinState({
      ...state,
      timeoutAlertForPromptAt: state.lastPromptAt,
    });
  }
}

export async function bootstrapCheckin() {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const settings = await getCheckinSettings();
  await ensureCategory();
  await scheduleDailyCheckin(settings);
}

export async function registerCheckinListeners() {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return () => undefined;

  const receivedSub = Notifications.addNotificationReceivedListener(async notification => {
    if (notification.request.content.data?.kind === 'daily_checkin') {
      await recordPrompt();
    }
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(async response => {
    await processNotificationResponse(response);
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
