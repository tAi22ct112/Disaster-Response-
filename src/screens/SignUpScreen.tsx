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
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const onPhoneChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '').slice(0, 15);
    setPhone(digitsOnly);
  };

  const onSubmit = async () => {
    const normalizedFullName = fullName.trim();
    const normalizedPhone = phone.trim();
    const normalizedEmail = email.trim();

    if (!normalizedFullName || !normalizedPhone || !password) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập đầy đủ họ tên, số điện thoại và mật khẩu.');
      return;
    }
    if (normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      Alert.alert('Số điện thoại không hợp lệ', 'Số điện thoại phải từ 8 đến 15 chữ số.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Mật khẩu quá ngắn', 'Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    if (normalizedEmail && !emailRegex.test(normalizedEmail)) {
      Alert.alert('Email không hợp lệ', 'Vui lòng nhập đúng định dạng email.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mật khẩu không khớp', 'Vui lòng nhập lại mật khẩu xác nhận.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await signUp({
        fullName: normalizedFullName,
        phone: normalizedPhone,
        email: normalizedEmail || undefined,
        password
      });

      if (result.otpDebugCode) {
        Alert.alert('OTP (chế độ dev)', `Mã OTP: ${result.otpDebugCode}`);
      }

      navigation.navigate('Otp', {
        phone: normalizedPhone,
        purpose: result.otpPurpose ?? 'SIGNUP'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Đăng ký thất bại.';
      Alert.alert('Lỗi đăng ký', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]} style={styles.container}>
      <Text style={styles.title}>Đăng ký</Text>
      <Text style={styles.subtitle}>Tạo tài khoản để sử dụng các tính năng cứu hộ thiên tai.</Text>

      <TextInput style={styles.input} placeholder="Họ và tên" placeholderTextColor="#aaa" value={fullName} onChangeText={setFullName} />
      <TextInput
        style={styles.input}
        placeholder="Số điện thoại"
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
        placeholder="Mật khẩu"
        secureTextEntry
        placeholderTextColor="#aaa"
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Xác nhận mật khẩu"
        secureTextEntry
        placeholderTextColor="#aaa"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <View style={styles.termsContainer}>
        <Text style={styles.termsText}>Khi đăng ký, bạn đồng ý với điều khoản và điều kiện sử dụng.</Text>
      </View>

      <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={onSubmit} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Đang xử lý...' : 'Đăng ký'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Đã có tài khoản? Đăng nhập.</Text>
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
