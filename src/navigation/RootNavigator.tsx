import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import OtpScreen from '../screens/OtpScreen';
import MapScreen from '../screens/MapScreen';
import SOSScreen from '../screens/SOSScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NewsScreen from '../screens/NewsScreen';
import ContactsScreen from '../screens/ContactsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import LogoutScreen from '../screens/LogoutScreen';
import type { DrawerParamList, RootStackParamList, TabParamList } from '../types';
import { COLORS } from '../constants/colors';
import { getSession, prepareApiBaseUrl, type UserRole } from '../services/apiClient';

const Stack = createStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<DrawerParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';

          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'SOS') iconName = focused ? 'alert-circle' : 'alert-circle-outline';
          else if (route.name === 'Contacts') iconName = focused ? 'call' : 'call-outline';
          else if (route.name === 'News') iconName = focused ? 'newspaper' : 'newspaper-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: '#78808A',
        tabBarStyle: { backgroundColor: '#F6FAFD' }
      })}
    >
      <Tab.Screen name="Home" component={MapScreen} options={{ title: 'Trang chủ' }} />
      <Tab.Screen name="SOS" component={SOSScreen} options={{ title: 'Khẩn cấp | SOS' }} />
      <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Liên hệ' }} />
      <Tab.Screen name="News" component={NewsScreen} options={{ title: 'Tin tức' }} />
    </Tab.Navigator>
  );
}

function DrawerNavigator() {
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      setRole(session?.user?.role ?? null);
    })().catch(() => setRole(null));
  }, []);

  return (
    <Drawer.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.primaryDark,
        headerTitleStyle: { fontWeight: '700' },
        drawerActiveTintColor: COLORS.primaryDark,
        drawerInactiveTintColor: COLORS.textLight
      }}
    >
      <Drawer.Screen name="Home" component={MainTabs} options={{ title: 'HOPE' }} />
      {role === 'ADMIN' && <Drawer.Screen name="Dashboard" component={AdminDashboardScreen} options={{ title: 'Quản trị' }} />}
      <Drawer.Screen name="Profile" component={ProfileScreen} options={{ title: 'Hồ sơ' }} />
      <Drawer.Screen name="Settings" component={SettingsScreen} options={{ title: 'Cài đặt' }} />
      <Drawer.Screen
        name="Logout"
        component={LogoutScreen}
        options={{
          title: 'Đăng xuất',
          drawerIcon: ({ color, size }) => <Ionicons name="log-out-outline" color={color} size={size} />
        }}
      />
    </Drawer.Navigator>
  );
}

export default function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        await prepareApiBaseUrl(false).catch(() => undefined);
        const session = await getSession();
        if (active) setInitialRoute(session ? 'Main' : 'Login');
      } catch {
        if (active) setInitialRoute('Login');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!initialRoute) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Otp" component={OtpScreen} />
        <Stack.Screen name="Main" component={DrawerNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background
  }
});
