import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../constants/colors';
import { apiGet, apiPatch } from '../services/apiClient';

type Profile = {
  id: string;
  fullName?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  bloodType?: string | null;
  avatarUrl?: string | null;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const data = await apiGet<Profile>('/api/users/me', true);
      setProfile(data);
      setFullName(data.fullName ?? '');
      setEmail(data.email ?? '');
      setAddress(data.address ?? '');
      setBloodType(data.bloodType ?? '');
      setAvatarUrl(data.avatarUrl ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong tai duoc profile';
      Alert.alert('Loi', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      const updated = await apiPatch<Profile>(
        '/api/users/me',
        {
          fullName: fullName.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          bloodType: bloodType.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined
        },
        true
      );
      setProfile(updated);
      Alert.alert('Thanh cong', 'Da cap nhat profile.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong the cap nhat profile';
      Alert.alert('Loi', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      {isLoading ? (
        <Text style={styles.stateText}>Dang tai profile...</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Phone (read-only)</Text>
          <TextInput style={[styles.input, styles.readOnlyInput]} editable={false} value={profile?.phone ?? ''} />

          <Text style={styles.label}>Full name</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Nhap ho ten" />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Nhap email"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Address</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Nhap dia chi" />

          <Text style={styles.label}>Blood type</Text>
          <TextInput style={styles.input} value={bloodType} onChangeText={setBloodType} placeholder="VD: O+" />

          <Text style={styles.label}>Avatar URL</Text>
          <TextInput
            style={styles.input}
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://..."
            autoCapitalize="none"
          />

          <TouchableOpacity style={[styles.saveBtn, isSaving && styles.disabled]} onPress={onSave} disabled={isSaving}>
            <Text style={styles.saveText}>{isSaving ? 'Dang luu...' : 'Luu thay doi'}</Text>
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
  card: { backgroundColor: 'white', borderRadius: 14, padding: 16 },
  label: { fontSize: 14, color: COLORS.text, marginBottom: 6, marginTop: 10, fontWeight: '600' },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12
  },
  readOnlyInput: { backgroundColor: '#f3f4f6', color: '#6b7280' },
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
