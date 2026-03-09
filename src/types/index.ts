export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  Otp: {
    phone: string;
    purpose: 'SIGNUP' | 'LOGIN' | 'PASSWORD_RESET';
  };
  Main: undefined;
};

export type DrawerParamList = {
  Home: undefined;
  Dashboard: undefined;
  Profile: undefined;
  Settings: undefined;
};

export type TabParamList = {
  Home: undefined;
  SOS: undefined;
  Contacts: undefined;
  News: undefined;
};

export type CheckinSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  graceDays: number;
};

export type LastKnownLocation = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type SosMarker = {
  id: string;
  latitude: number;
  longitude: number;
  createdAt: number;
  source: 'checkin_no' | 'checkin_timeout' | 'manual';
  note: string;
};

export type CheckinState = {
  scheduledNotificationId?: string;
  lastPromptAt?: number;
  lastResponseAt?: number;
  lastResponse?: 'yes' | 'no';
  timeoutAlertForPromptAt?: number;
  lastKnownLocation?: LastKnownLocation;
};
