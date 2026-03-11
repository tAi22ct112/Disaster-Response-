import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { StackNavigationProp } from '@react-navigation/stack';
import { COLORS } from '../constants/colors';
import { getConfiguredApiBaseUrl, loginWithPassword, prepareApiBaseUrl, setCustomApiBaseUrl } from '../services/apiClient';
import type { RootStackParamList } from '../types';

type LoginScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState('');

  useEffect(() => {
    getConfiguredApiBaseUrl()
      .then(url => setApiUrlInput(url))
      .catch(() => undefined);

    prepareApiBaseUrl(false)
      .then(url => setApiUrlInput(url))
      .catch(() => undefined);
  }, []);

  const onPhoneChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '').slice(0, 15);
    setPhone(digitsOnly);
  };

  const onLogin = async () => {
    if (!phone.trim() || !password) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập số điện thoại và mật khẩu.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await loginWithPassword({
        phone: phone.trim(),
        password,
        useOtp: false
      });

      if ('otpRequired' in result && result.otpRequired) {
        if (result.otpDebugCode) {
          Alert.alert('OTP (chế độ dev)', `Mã OTP: ${result.otpDebugCode}`);
        }
        navigation.navigate('Otp', {
          phone: phone.trim(),
          purpose: result.otpPurpose ?? 'LOGIN'
        });
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Đăng nhập thất bại.';
      Alert.alert('Lỗi đăng nhập', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSaveApiUrl = async () => {
    const normalized = apiUrlInput.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      Alert.alert('API URL sai', 'URL phải bắt đầu bằng http:// hoặc https://.');
      return;
    }

    try {
      const saved = await setCustomApiBaseUrl(normalized);
      setApiUrlInput(saved);
      Alert.alert('Thành công', 'Đã lưu API URL mới.');
    } catch {
      Alert.alert('Lỗi', 'Không thể lưu API URL.');
    }
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]} style={styles.container}>
      <View style={styles.logoWrap}>
        <Image source={require('../../assets/hope-app-icon.png')} style={styles.logo} resizeMode="contain" />
      </View>
      <Text style={styles.appName}>HOPE</Text>

      <Text style={styles.title}>Đăng nhập</Text>
      <Text style={styles.subtitle}>Vui lòng đăng nhập để tiếp tục.</Text>

      <TouchableOpacity onPress={() => setShowApiConfig(value => !value)}>
        <Text style={styles.apiToggle}>{showApiConfig ? 'Ẩn cấu hình API URL' : 'Hiện cấu hình API URL'}</Text>
      </TouchableOpacity>

      {showApiConfig && (
        <>
          <TextInput
            style={styles.input}
            placeholder="https://api.example.com"
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={apiUrlInput}
            onChangeText={setApiUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={[styles.apiButton, isSubmitting && styles.buttonDisabled]} onPress={onSaveApiUrl} disabled={isSubmitting}>
            <Text style={styles.buttonText}>Lưu API URL</Text>
          </TouchableOpacity>
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="Số điện thoại"
        placeholderTextColor="rgba(255,255,255,0.7)"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={15}
        value={phone}
        onChangeText={onPhoneChange}
      />
      <TextInput
        style={styles.input}
        placeholder="Mật khẩu"
        secureTextEntry
        placeholderTextColor="rgba(255,255,255,0.7)"
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={onLogin} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Đang xử lý...' : 'Đăng nhập'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
        <Text style={styles.link}>Chưa có tài khoản? Đăng ký.</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 30 },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 8
  },
  logo: {
    width: 170,
    height: 170
  },
  appName: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1.2,
    marginBottom: 16
  },
  title: { fontSize: 34, color: 'white', fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#E4EFFA', textAlign: 'center', marginBottom: 30 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 15,
    marginVertical: 8,
    color: 'white'
  },
  button: { backgroundColor: COLORS.accent, borderRadius: 30, padding: 18, marginVertical: 18 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: 'white', fontSize: 18, textAlign: 'center', fontWeight: 'bold' },
  link: { color: 'white', textAlign: 'center', marginTop: 12 },
  apiToggle: {
    color: '#E6F2FF',
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginBottom: 10
  },
  apiButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 8
  }
});
