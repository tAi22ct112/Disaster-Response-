import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
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
      Alert.alert('Thieu thong tin', 'Vui long nhap so dien thoai va mat khau.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await loginWithPassword({
        phone: phone.trim(),
        password
      });

      if ('otpRequired' in result && result.otpRequired) {
        if (result.otpDebugCode) {
          Alert.alert('OTP (dev mode)', `Ma OTP: ${result.otpDebugCode}`);
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
      const message = error instanceof Error ? error.message : 'Dang nhap that bai';
      Alert.alert('Loi dang nhap', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSaveApiUrl = async () => {
    const normalized = apiUrlInput.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      Alert.alert('API URL sai', 'URL phai bat dau bang http:// hoac https://');
      return;
    }

    try {
      const saved = await setCustomApiBaseUrl(normalized);
      setApiUrlInput(saved);
      Alert.alert('Thanh cong', 'Da luu API URL moi.');
    } catch {
      Alert.alert('Loi', 'Khong the luu API URL');
    }
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.container}>
      <Text style={styles.title}>Login</Text>
      <Text style={styles.subtitle}>Please sign in to continue</Text>

      <TouchableOpacity onPress={() => setShowApiConfig(value => !value)}>
        <Text style={styles.apiToggle}>{showApiConfig ? 'Hide API URL config' : 'Show API URL config'}</Text>
      </TouchableOpacity>

      {showApiConfig && (
        <>
          <TextInput
            style={styles.input}
            placeholder="https://...trycloudflare.com"
            placeholderTextColor="#aaa"
            value={apiUrlInput}
            onChangeText={setApiUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={[styles.apiButton, isSubmitting && styles.buttonDisabled]} onPress={onSaveApiUrl} disabled={isSubmitting}>
            <Text style={styles.buttonText}>Save API URL</Text>
          </TouchableOpacity>
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="Phone number"
        placeholderTextColor="#aaa"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={15}
        value={phone}
        onChangeText={onPhoneChange}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        placeholderTextColor="#aaa"
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={onLogin} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Dang xu ly...' : 'Login'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
        <Text style={styles.link}>Don't have an account? Sign-up</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 30 },
  title: { fontSize: 32, color: 'white', fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#ddd', textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: 15, marginVertical: 10, color: 'white' },
  button: { backgroundColor: '#FFB74D', borderRadius: 30, padding: 18, marginVertical: 20 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: 'white', fontSize: 18, textAlign: 'center', fontWeight: 'bold' },
  link: { color: 'white', textAlign: 'center', marginTop: 20 }
  ,
  apiToggle: {
    color: '#d7eef4',
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginBottom: 12
  },
  apiButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 10
  }
});
