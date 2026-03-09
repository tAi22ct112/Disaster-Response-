import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { StackNavigationProp } from '@react-navigation/stack';
import { COLORS } from '../constants/colors';
import { signUp } from '../services/apiClient';
import type { RootStackParamList } from '../types';

type SignUpScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'SignUp'>;
};

export default function SignUpScreen({ navigation }: SignUpScreenProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onPhoneChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '').slice(0, 15);
    setPhone(digitsOnly);
  };

  const onSubmit = async () => {
    if (!fullName.trim() || !phone.trim() || !password) {
      Alert.alert('Thieu thong tin', 'Vui long nhap day du ho ten, so dien thoai va mat khau.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mat khau khong khop', 'Vui long nhap lai mat khau xac nhan.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await signUp({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password
      });

      if (result.otpDebugCode) {
        Alert.alert('OTP (dev mode)', `Ma OTP: ${result.otpDebugCode}`);
      }

      navigation.navigate('Otp', {
        phone: phone.trim(),
        purpose: result.otpPurpose ?? 'SIGNUP'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dang ky that bai';
      Alert.alert('Loi dang ky', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.container}>
      <Text style={styles.title}>Sign-up</Text>
      <Text style={styles.subtitle}>Create account to use disaster rescue features.</Text>

      <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor="#aaa" value={fullName} onChangeText={setFullName} />
      <TextInput
        style={styles.input}
        placeholder="Mobile Number"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={15}
        placeholderTextColor="#aaa"
        value={phone}
        onChangeText={onPhoneChange}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        placeholderTextColor="#aaa"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        placeholderTextColor="#aaa"
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        secureTextEntry
        placeholderTextColor="#aaa"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <View style={styles.termsContainer}>
        <Text style={styles.termsText}>By signing up, you agree to terms and conditions.</Text>
      </View>

      <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={onSubmit} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Dang xu ly...' : 'Submit'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? login</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 30 },
  title: { fontSize: 32, color: 'white', fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#ddd', textAlign: 'center', marginBottom: 40 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 15,
    marginVertical: 10,
    color: 'white'
  },
  termsContainer: { marginVertical: 20 },
  termsText: { color: 'white', fontSize: 14, textAlign: 'center' },
  button: {
    backgroundColor: COLORS.accentLight,
    borderRadius: 30,
    paddingVertical: 18,
    marginVertical: 20
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  link: { color: 'white', textAlign: 'center', marginTop: 20 }
});
