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
import type { DrawerParamList, RootStackParamList, TabParamList } from '../types';
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
        tabBarActiveTintColor: '#D82858',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: { backgroundColor: '#FBF2E8' },
      })}
    >
      <Tab.Screen name="Home" component={MapScreen} />
      <Tab.Screen name="SOS" component={SOSScreen} options={{ title: 'Emergency | SOS' }} />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen name="News" component={NewsScreen} />
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
    <Drawer.Navigator initialRouteName="Home">
      <Drawer.Screen name="Home" component={MainTabs} options={{ title: 'SLDDA' }} />
      {role === 'ADMIN' && <Drawer.Screen name="Dashboard" component={AdminDashboardScreen} />}
      <Drawer.Screen name="Profile" component={ProfileScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
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
        <ActivityIndicator size="large" color="#D82858" />
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
    backgroundColor: '#fff'
  }
});
