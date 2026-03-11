import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const AUTH_SESSION_KEY = 'drn:auth:session';
const API_BASE_URL_KEY = 'drn:api:base-url';

export type OtpPurpose = 'SIGNUP' | 'LOGIN' | 'PASSWORD_RESET';
export type UserRole = 'USER' | 'RESCUER' | 'ADMIN';

export type AuthUser = {
  id: string;
  phone: string;
  email?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  address?: string | null;
  bloodType?: string | null;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

type ApiErrorPayload = {
  message?: string;
  details?: unknown;
};

type ValidationErrorDetails = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

const SESSION_EXPIRED_MESSAGE = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

export class ApiRequestError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

function readUnknownErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unknown network error';
}

function parseValidationMessage(details: unknown) {
  if (!details || typeof details !== 'object') return null;
  const parsed = details as ValidationErrorDetails;

  const formError = parsed.formErrors?.find(Boolean);
  if (formError) return formError;

  const entries = Object.entries(parsed.fieldErrors ?? {});
  for (const [field, messages] of entries) {
    const firstMessage = messages?.find(Boolean);
    if (!firstMessage) continue;

    if (field === 'phone') return 'Số điện thoại không hợp lệ.';
    if (field === 'email') return 'Email không hợp lệ.';
    if (field === 'fullName') return 'Họ và tên phải có ít nhất 2 ký tự.';
    if (field === 'password') return 'Mật khẩu phải có ít nhất 8 ký tự.';

    return firstMessage;
  }

  return null;
}

function resolveApiErrorMessage(payload: ApiErrorPayload | null, fallbackMessage: string) {
  if (!payload) return fallbackMessage;
  if (payload.message === 'Validation failed') {
    return parseValidationMessage(payload.details) ?? 'Dữ liệu nhập chưa hợp lệ.';
  }
  return payload.message ?? fallbackMessage;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  isFormData?: boolean;
};

let memorySession: AuthSession | null = null;
let memoryCustomApiBaseUrl: string | null = null;
let apiBootstrapPromise: Promise<string> | null = null;

type ApiDiscoveryPayload = {
  apiBaseUrl?: string;
};

function isValidAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<AuthSession>;

  if (!session.accessToken || typeof session.accessToken !== 'string') return false;
  if (!session.refreshToken || typeof session.refreshToken !== 'string') return false;
  if (!session.user || typeof session.user !== 'object') return false;

  const user = session.user as Partial<AuthUser>;
  if (!user.id || typeof user.id !== 'string') return false;
  if (!user.phone || typeof user.phone !== 'string') return false;
  if (!user.role || typeof user.role !== 'string') return false;

  return true;
}

function readHostFromExpo() {
  const expoConfig = Constants.expoConfig as { hostUri?: string; extra?: { apiBaseUrl?: string } } | null;
  const hostUri = expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0]?.trim();
  return host || null;
}

export function resolveApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');

  const extraUrl = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl?.trim();
  if (extraUrl) return extraUrl.replace(/\/+$/, '');

  const expoHost = readHostFromExpo();
  if (expoHost && expoHost !== 'localhost' && expoHost !== '127.0.0.1') {
    return `http://${expoHost}:4000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }
  return 'http://localhost:4000';
}

export const API_BASE_URL = resolveApiBaseUrl();

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

function tryNormalizeHttpUrl(url?: string | null) {
  if (!url || typeof url !== 'string') return null;
  const normalized = normalizeBaseUrl(url);
  if (!/^https?:\/\//i.test(normalized)) return null;
  return normalized;
}

function getDiscoveryUrls() {
  const envDiscovery = process.env.EXPO_PUBLIC_API_DISCOVERY_URL?.trim();
  const extraDiscovery = (Constants.expoConfig?.extra as { apiDiscoveryUrl?: string } | undefined)?.apiDiscoveryUrl?.trim();

  return [envDiscovery, extraDiscovery].map(value => tryNormalizeHttpUrl(value)).filter((value): value is string => !!value);
}

async function fetchWithTimeout(url: string, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function isApiHealthy(baseUrl: string) {
  try {
    const healthUrl = `${baseUrl}/health`;
    const res = await fetchWithTimeout(healthUrl, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

async function readDiscoveryApiBaseUrl(discoveryUrl: string) {
  try {
    const res = await fetchWithTimeout(discoveryUrl, 3500);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const data = (await res.json()) as ApiDiscoveryPayload;
      return tryNormalizeHttpUrl(data.apiBaseUrl);
    }

    const raw = (await res.text()).trim();
    if (!raw) return null;
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as ApiDiscoveryPayload;
        return tryNormalizeHttpUrl(parsed.apiBaseUrl);
      } catch {
        return null;
      }
    }
    return tryNormalizeHttpUrl(raw);
  } catch {
    return null;
  }
}

async function getActiveApiBaseUrl() {
  if (memoryCustomApiBaseUrl !== null) {
    return memoryCustomApiBaseUrl || API_BASE_URL;
  }

  const stored = await AsyncStorage.getItem(API_BASE_URL_KEY);
  if (stored && stored.trim()) {
    memoryCustomApiBaseUrl = normalizeBaseUrl(stored);
  } else {
    memoryCustomApiBaseUrl = '';
  }
  return memoryCustomApiBaseUrl || API_BASE_URL;
}

export async function getConfiguredApiBaseUrl() {
  return getActiveApiBaseUrl();
}

export async function setCustomApiBaseUrl(url: string) {
  const normalized = normalizeBaseUrl(url);
  memoryCustomApiBaseUrl = normalized;
  await AsyncStorage.setItem(API_BASE_URL_KEY, normalized);
  return normalized;
}

export async function clearCustomApiBaseUrl() {
  memoryCustomApiBaseUrl = '';
  await AsyncStorage.removeItem(API_BASE_URL_KEY);
}

export async function prepareApiBaseUrl(force = false) {
  if (!force && apiBootstrapPromise) {
    return apiBootstrapPromise;
  }

  apiBootstrapPromise = (async () => {
    const active = await getActiveApiBaseUrl();
    if (await isApiHealthy(active)) {
      return active;
    }

    const fallbackCandidates = [API_BASE_URL];
    for (const candidate of fallbackCandidates) {
      const normalized = tryNormalizeHttpUrl(candidate);
      if (!normalized || normalized === active) continue;
      if (await isApiHealthy(normalized)) {
        await setCustomApiBaseUrl(normalized);
        return normalized;
      }
    }

    const discoveryUrls = getDiscoveryUrls();
    for (const discoveryUrl of discoveryUrls) {
      const discovered = await readDiscoveryApiBaseUrl(discoveryUrl);
      if (!discovered) continue;
      if (await isApiHealthy(discovered)) {
        await setCustomApiBaseUrl(discovered);
        return discovered;
      }
    }

    return active;
  })();

  try {
    return await apiBootstrapPromise;
  } finally {
    apiBootstrapPromise = null;
  }
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function buildUrl(path: string) {
  const activeBaseUrl = await getActiveApiBaseUrl();
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith('/')) return `${activeBaseUrl}/${path}`;
  return `${activeBaseUrl}${path}`;
}

async function saveSession(session: AuthSession) {
  memorySession = session;
  await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function getSession() {
  if (memorySession) return memorySession;
  const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidAuthSession(parsed)) {
      await AsyncStorage.removeItem(AUTH_SESSION_KEY);
      memorySession = null;
      return null;
    }
    memorySession = parsed;
    return parsed;
  } catch {
    await AsyncStorage.removeItem(AUTH_SESSION_KEY);
    memorySession = null;
    return null;
  }
}

export async function clearSession() {
  memorySession = null;
  await AsyncStorage.removeItem(AUTH_SESSION_KEY);
}

async function refreshSessionIfPossible() {
  const session = await getSession();
  if (!session?.refreshToken) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const refreshUrl = await buildUrl('/api/auth/refresh');
  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      refreshToken: session.refreshToken
    })
  });

  const payload = await readJsonSafe<{ message?: string } & Partial<AuthSession>>(response);

  if (!response.ok || !payload?.accessToken || !payload?.refreshToken || !payload?.user) {
    await clearSession();
    throw new Error(payload?.message ?? 'Session expired');
  }

  const nextSession: AuthSession = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user
  };
  await saveSession(nextSession);
  return nextSession;
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  await prepareApiBaseUrl(false);

  const method = options?.method ?? 'GET';
  const auth = options?.auth ?? false;
  const retryOnUnauthorized = options?.retryOnUnauthorized ?? true;
  const isFormData = options?.isFormData ?? false;
  let session = auth ? await getSession() : null;

  if (auth && !session) {
    throw new ApiRequestError(SESSION_EXPIRED_MESSAGE, 401);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  if (options?.body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth && session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const url = await buildUrl(path);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body:
        options?.body !== undefined
          ? isFormData
            ? (options.body as BodyInit)
            : JSON.stringify(options.body)
          : undefined
    });
  } catch (error) {
    await prepareApiBaseUrl(true);
    const retryUrl = await buildUrl(path);
    try {
      response = await fetch(retryUrl, {
        method,
        headers,
        body:
          options?.body !== undefined
            ? isFormData
              ? (options.body as BodyInit)
              : JSON.stringify(options.body)
            : undefined
      });
    } catch (retryError) {
      const activeBaseUrl = await getActiveApiBaseUrl();
      const fallbackBaseUrl = tryNormalizeHttpUrl(API_BASE_URL) ?? API_BASE_URL;
      const activeHealthy = await isApiHealthy(activeBaseUrl);
      const fallbackHealthy = activeBaseUrl === fallbackBaseUrl ? activeHealthy : await isApiHealthy(fallbackBaseUrl);

      const message = activeHealthy || fallbackHealthy
        ? `Khong the goi API (${path}). Vui long thu lai.`
        : `Khong ket noi duoc server. API URL hien tai: ${activeBaseUrl}. Kiem tra backend va Cloudflared tunnel.`;

      throw new ApiRequestError(message, 0, {
        path,
        reason: readUnknownErrorMessage(retryError ?? error),
        attemptedUrls: [url, retryUrl],
        activeBaseUrl,
        fallbackBaseUrl,
        activeHealthy,
        fallbackHealthy
      });
    }
  }

  if (response.status === 401 && auth && retryOnUnauthorized) {
    let refreshed: AuthSession;
    try {
      refreshed = await refreshSessionIfPossible();
    } catch {
      await clearSession();
      throw new ApiRequestError(SESSION_EXPIRED_MESSAGE, 401);
    }

    const retryHeaders = {
      ...headers,
      Authorization: `Bearer ${refreshed.accessToken}`
    };
    const retryResponse = await fetch(url, {
      method,
      headers: retryHeaders,
      body:
        options?.body !== undefined
          ? isFormData
            ? (options.body as BodyInit)
            : JSON.stringify(options.body)
          : undefined
    });

    if (!retryResponse.ok) {
      const retryErrorPayload = await readJsonSafe<ApiErrorPayload>(retryResponse);
      if (retryResponse.status === 401 && auth) {
        await clearSession();
        throw new ApiRequestError(SESSION_EXPIRED_MESSAGE, 401, retryErrorPayload?.details);
      }
      throw new ApiRequestError(
        resolveApiErrorMessage(retryErrorPayload, `Request failed (${retryResponse.status})`),
        retryResponse.status,
        retryErrorPayload?.details
      );
    }
    if (retryResponse.status === 204) {
      return undefined as T;
    }
    const retryData = await readJsonSafe<T>(retryResponse);
    return retryData as T;
  }

  if (!response.ok) {
    const errorPayload = await readJsonSafe<ApiErrorPayload>(response);
    if (response.status === 401 && auth) {
      await clearSession();
      throw new ApiRequestError(SESSION_EXPIRED_MESSAGE, 401, errorPayload?.details);
    }
    throw new ApiRequestError(
      resolveApiErrorMessage(errorPayload, `Request failed (${response.status})`),
      response.status,
      errorPayload?.details
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await readJsonSafe<T>(response);
  return data as T;
}

export async function apiGet<T>(path: string, auth = false) {
  return request<T>(path, { method: 'GET', auth });
}

export async function apiPost<T>(path: string, body: unknown, auth = false) {
  return request<T>(path, { method: 'POST', body, auth });
}

export async function apiPostFormData<T>(path: string, formData: FormData, auth = false) {
  return request<T>(path, { method: 'POST', body: formData, auth, isFormData: true });
}

export async function apiPatch<T>(path: string, body: unknown, auth = false) {
  return request<T>(path, { method: 'PATCH', body, auth });
}

export async function apiDelete(path: string, auth = false) {
  return request<void>(path, { method: 'DELETE', auth });
}

export async function signUp(input: {
  phone: string;
  password: string;
  fullName?: string;
  email?: string;
}) {
  return apiPost<{
    otpRequired: boolean;
    otpPurpose?: OtpPurpose;
    otpDebugCode?: string;
  }>('/api/auth/signup', input, false);
}

export async function loginWithPassword(input: { phone: string; password: string; useOtp?: boolean }) {
  return apiPost<
    | {
        otpRequired: true;
        otpPurpose: OtpPurpose;
        otpDebugCode?: string;
      }
    | (AuthSession & { otpRequired?: false })
  >('/api/auth/login', { ...input, useOtp: input.useOtp ?? false }, false);
}

export async function requestOtp(input: { phone: string; purpose: OtpPurpose }) {
  return apiPost<{ message: string; otpDebugCode?: string }>('/api/auth/otp/request', input, false);
}

export async function verifyOtp(input: { phone: string; purpose: OtpPurpose; code: string }) {
  const result = await apiPost<
    | ({
        verified: true;
        purpose: OtpPurpose;
      } & Partial<AuthSession>)
    | { verified: true; purpose: OtpPurpose }
  >('/api/auth/otp/verify', input, false);

  if ('accessToken' in result && result.accessToken && result.refreshToken && result.user) {
    await saveSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user
    });
  }

  return result;
}

export async function logout() {
  const session = await getSession();
  if (!session?.refreshToken) {
    await clearSession();
    return;
  }
  try {
    await apiPost('/api/auth/logout', { refreshToken: session.refreshToken }, false);
  } catch {
    // ignore logout network errors
  } finally {
    await clearSession();
  }
}

function inferImageMimeType(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

export async function uploadSosImage(input: { uri: string; fileName?: string; mimeType?: string }) {
  const formData = new FormData();
  formData.append('image', {
    uri: input.uri,
    name: input.fileName ?? `sos-${Date.now()}.jpg`,
    type: input.mimeType ?? inferImageMimeType(input.uri)
  } as unknown as Blob);

  return apiPostFormData<{
    imageUrl: string;
    relativePath: string;
    mimeType: string;
    size: number;
    originalName: string;
  }>('/api/uploads/sos-image', formData, true);
}

export async function uploadAvatarImage(input: { uri: string; fileName?: string; mimeType?: string }) {
  const formData = new FormData();
  formData.append('image', {
    uri: input.uri,
    name: input.fileName ?? `avatar-${Date.now()}.jpg`,
    type: input.mimeType ?? inferImageMimeType(input.uri)
  } as unknown as Blob);

  return apiPostFormData<{
    imageUrl: string;
    relativePath: string;
    mimeType: string;
    size: number;
    originalName: string;
  }>('/api/uploads/avatar-image', formData, true);
}
