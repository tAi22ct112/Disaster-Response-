import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';
import { apiDelete, apiGet, apiPost } from '../services/apiClient';

type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  relation?: string | null;
  priority: number;
};

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      const data = await apiGet<EmergencyContact[]>('/api/contacts', true);
      setContacts(data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không tải được danh bạ.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContacts().catch(() => undefined);
  }, []);

  const onAdd = async () => {
    if (!nameInput.trim() || !phoneInput.trim()) {
      Alert.alert('Thiếu thông tin', 'Nhập tên và số điện thoại.');
      return;
    }

    try {
      setIsSaving(true);
      await apiPost(
        '/api/contacts',
        {
          name: nameInput.trim(),
          phone: phoneInput.trim(),
          relation: 'Emergency',
          priority: 1
        },
        true
      );
      setNameInput('');
      setPhoneInput('');
      await loadContacts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể thêm liên hệ.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = (contact: EmergencyContact) => {
    Alert.alert('Xóa liên hệ?', `Bạn chắc chắn muốn xóa "${contact.name}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDelete(`/api/contacts/${contact.id}`, true);
            await loadContacts();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Không thể xóa liên hệ.';
            Alert.alert('Lỗi', message);
          }
        }
      }
    ]);
  };

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]} style={styles.gradientBackground}>
      <View style={styles.container}>
      <Text style={styles.title}>Liên hệ khẩn cấp</Text>

      <View style={styles.formCard}>
        <TextInput
          value={nameInput}
          onChangeText={setNameInput}
          placeholder="Tên liên hệ"
          style={styles.input}
        />
        <TextInput
          value={phoneInput}
          onChangeText={setPhoneInput}
          placeholder="Số điện thoại"
          keyboardType="phone-pad"
          style={styles.input}
        />
        <TouchableOpacity style={[styles.addButton, isSaving && styles.disabled]} onPress={onAdd} disabled={isSaving}>
          <Text style={styles.addButtonText}>{isSaving ? 'Đang thêm...' : 'Thêm liên hệ'}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <Text style={styles.stateText}>Đang tải danh bạ...</Text>
      ) : contacts.length === 0 ? (
        <Text style={styles.stateText}>Chưa có liên hệ khẩn cấp.</Text>
      ) : (
        contacts.map(item => (
          <View key={item.id} style={styles.contactItem}>
            <Ionicons name="call-outline" style={styles.icon} />
            <View style={styles.contactMeta}>
              <Text style={styles.contactName}>{item.name}</Text>
              <Text style={styles.contactPhone}>{item.phone}</Text>
            </View>
            <TouchableOpacity onPress={() => onDelete(item)}>
              <Ionicons name="trash-outline" size={20} color="#b91c1c" />
            </TouchableOpacity>
          </View>
        ))
      )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBackground: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginBottom: 20, textAlign: 'center' },
  formCard: {
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: COLORS.inputBackground
  },
  addButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  addButtonText: { color: 'white', fontWeight: '700' },
  disabled: { opacity: 0.7 },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  icon: { fontSize: 28, color: COLORS.primary, marginRight: 12, width: 30, textAlign: 'center' },
  contactMeta: { flex: 1 },
  contactName: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  contactPhone: { fontSize: 14, color: COLORS.textLight, marginTop: 2 },
  stateText: { textAlign: 'center', color: COLORS.textLight, marginTop: 20 }
});
