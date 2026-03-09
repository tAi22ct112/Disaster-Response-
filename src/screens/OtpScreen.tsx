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
      Alert.alert('OTP khong hop le', 'Vui long nhap du 6 chu so OTP.');
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
      Alert.alert('Loi', 'Khong the xac minh OTP.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Xac minh OTP that bai';
      Alert.alert('Loi OTP', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    try {
      setIsResending(true);
      const result = await requestOtp({ phone, purpose });
      if (result.otpDebugCode) {
        Alert.alert('OTP moi (dev mode)', `Ma OTP: ${result.otpDebugCode}`);
      } else {
        Alert.alert('Thanh cong', 'Da gui lai ma OTP.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong the gui lai OTP';
      Alert.alert('Loi', message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.container}>
      <Text style={styles.title}>Enter OTP</Text>
      <Text style={styles.subtitle}>
        Enter 6-digit OTP sent to {maskedPhone}
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
        <Text style={styles.buttonText}>{isSubmitting ? 'Dang xac minh...' : 'Submit'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onResend} disabled={isResending}>
        <Text style={styles.resendText}>{isResending ? 'Dang gui lai...' : 'Not received the code? Resend'}</Text>
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
