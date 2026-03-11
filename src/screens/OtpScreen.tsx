import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { COLORS } from '../constants/colors';
import { requestOtp, verifyOtp } from '../services/apiClient';
import type { RootStackParamList } from '../types';

type OtpScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'Otp'>;
  route: RouteProp<RootStackParamList, 'Otp'>;
};

export default function OtpScreen({ navigation, route }: OtpScreenProps) {
  const { phone, purpose } = route.params;
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const maskedPhone = useMemo(() => {
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
  }, [phone]);

  const onSubmit = async () => {
    const code = otp.replace(/\D/g, '');
    if (code.length !== 6) {
      Alert.alert('OTP không hợp lệ', 'Vui lòng nhập đủ 6 chữ số OTP.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await verifyOtp({
        phone,
        purpose,
        code
      });

      if ('verified' in result && result.verified) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }]
        });
        return;
      }
      Alert.alert('Lỗi', 'Không thể xác minh OTP.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Xác minh OTP thất bại.';
      Alert.alert('Lỗi OTP', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    try {
      setIsResending(true);
      const result = await requestOtp({ phone, purpose });
      if (result.otpDebugCode) {
        Alert.alert('OTP mới (chế độ dev)', `Mã OTP: ${result.otpDebugCode}`);
      } else {
        Alert.alert('Thành công', 'Đã gửi lại mã OTP.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể gửi lại OTP.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]} style={styles.container}>
      <Text style={styles.title}>Nhập OTP</Text>
      <Text style={styles.subtitle}>
        Nhập mã OTP 6 số đã gửi tới {maskedPhone}.
      </Text>

      <View style={styles.otpContainer}>
        <TextInput
          style={styles.otpInput}
          value={otp}
          onChangeText={text => setOtp(text.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          placeholder="------"
          placeholderTextColor="rgba(255,255,255,0.5)"
        />
      </View>

      <TouchableOpacity style={[styles.button, isSubmitting && styles.disabled]} onPress={onSubmit} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Đang xác minh...' : 'Xác nhận'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onResend} disabled={isResending}>
        <Text style={styles.resendText}>{isResending ? 'Đang gửi lại...' : 'Chưa nhận được mã? Gửi lại'}</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  title: { fontSize: 32, color: 'white', fontWeight: 'bold', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#ddd', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
  otpContainer: { width: '100%', marginBottom: 30 },
  otpInput: {
    height: 62,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 12,
    fontSize: 28,
    color: 'white',
    letterSpacing: 10,
    backgroundColor: 'rgba(255,255,255,0.2)'
  },
  button: {
    backgroundColor: COLORS.accentLight,
    borderRadius: 30,
    paddingVertical: 18,
    width: '80%',
    alignItems: 'center',
    marginBottom: 20
  },
  disabled: { opacity: 0.7 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  resendText: { color: 'white', fontSize: 16, marginTop: 20 }
});
