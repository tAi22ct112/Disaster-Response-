import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants/colors';
import { ApiRequestError, apiGet, apiPatch, uploadAvatarImage } from '../services/apiClient';

type Profile = {
  id: string;
  fullName?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
};

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleUnauthorizedError = (error: unknown) => {
    if (!(error instanceof ApiRequestError) || error.status !== 401) {
      return false;
    }

    Alert.alert('Phiên đăng nhập hết hạn', 'Vui lòng đăng nhập lại để tiếp tục.', [
      {
        text: 'OK',
        onPress: () => {
          const rootNavigation = navigation.getParent?.()?.getParent?.() ?? navigation;
          rootNavigation.reset({
            index: 0,
            routes: [{ name: 'Login' }]
          });
        }
      }
    ]);

    return true;
  };

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const data = await apiGet<Profile>('/api/users/me', true);
      setProfile(data);
      setFullName(data.fullName ?? '');
      setPhone(data.phone ?? '');
      setEmail(data.email ?? '');
      setAddress(data.address ?? '');
      setAvatarUrl(data.avatarUrl ?? '');
      setAvatarPreview(data.avatarUrl ?? '');
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Không tải được hồ sơ.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, []);

  const pickAvatarFromLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Cần cấp quyền', 'Vui lòng cho phép truy cập thư viện ảnh và video.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        allowsMultipleSelection: false
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const asset = result.assets[0];
      setIsUploadingAvatar(true);
      const uploaded = await uploadAvatarImage({
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined
      });

      setAvatarUrl(uploaded.imageUrl);
      setAvatarPreview(uploaded.imageUrl);
      Alert.alert('Thành công', 'Đã tải ảnh đại diện lên.');
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Không thể chọn ảnh đại diện.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const onSave = async () => {
    const normalizedPhone = phone.replace(/\D/g, '');
    if (!normalizedPhone || normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      Alert.alert('Số điện thoại không hợp lệ', 'Vui lòng nhập số điện thoại từ 8 đến 15 chữ số.');
      return;
    }

    try {
      setIsSaving(true);
      const updated = await apiPatch<Profile>(
        '/api/users/me',
        {
          phone: normalizedPhone,
          fullName: fullName.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined
        },
        true
      );

      setProfile(updated);
      setPhone(updated.phone ?? normalizedPhone);
      setAvatarUrl(updated.avatarUrl ?? avatarUrl);
      setAvatarPreview(updated.avatarUrl ?? avatarPreview);
      Alert.alert('Thành công', 'Đã cập nhật hồ sơ.');
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Không thể cập nhật hồ sơ.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsSaving(false);
    }
  };

  const onPhoneChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '').slice(0, 15);
    setPhone(digitsOnly);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hồ sơ</Text>

      {isLoading ? (
        <Text style={styles.stateText}>Đang tải hồ sơ...</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Ảnh đại diện</Text>
          <View style={styles.avatarRow}>
            <View style={styles.avatarFrame}>
              {avatarPreview ? (
                <Image source={{ uri: avatarPreview }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarFallback}>Chưa có ảnh</Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.pickButton, isUploadingAvatar && styles.disabled]}
              onPress={pickAvatarFromLibrary}
              disabled={isUploadingAvatar}
            >
              <Text style={styles.pickButtonText}>{isUploadingAvatar ? 'Đang tải ảnh...' : 'Chọn ảnh từ thư viện'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Số điện thoại</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={onPhoneChange}
            placeholder="Nhập số điện thoại"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={15}
          />

          <Text style={styles.label}>Họ và tên</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Nhập họ và tên" />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Nhập email"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Địa chỉ</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Nhập địa chỉ" />

          <TouchableOpacity
            style={[styles.saveBtn, (isSaving || isUploadingAvatar) && styles.disabled]}
            onPress={onSave}
            disabled={isSaving || isUploadingAvatar}
          >
            <Text style={styles.saveText}>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 30 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginBottom: 20, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  label: { fontSize: 14, color: COLORS.text, marginBottom: 6, marginTop: 10, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12
  },
  avatarRow: {
    marginTop: 4,
    marginBottom: 8
  },
  avatarFrame: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarFallback: {
    color: '#6b7280',
    fontSize: 12
  },
  pickButton: {
    marginTop: 10,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center'
  },
  pickButtonText: {
    color: COLORS.primaryDark,
    fontWeight: '700'
  },
  saveBtn: {
    marginTop: 18,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  saveText: { color: 'white', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.7 },
  stateText: { textAlign: 'center', color: COLORS.textLight }
});
