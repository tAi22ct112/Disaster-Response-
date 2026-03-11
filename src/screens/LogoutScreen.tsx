import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { logout } from '../services/apiClient';
import { COLORS } from '../constants/colors';

export default function LogoutScreen() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    let active = true;

    const runLogout = async () => {
      try {
        await logout();
      } finally {
        if (!active) return;

        const rootNavigation = navigation.getParent?.()?.getParent?.() ?? navigation;
        rootNavigation.reset({
          index: 0,
          routes: [{ name: 'Login' }]
        });
      }
    };

    runLogout().catch(() => undefined);

    return () => {
      active = false;
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.accent} />
      <Text style={styles.text}>Đang đăng xuất...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.text
  }
});
