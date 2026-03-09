import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
      const message = error instanceof Error ? error.message : 'Khong tai duoc danh ba';
      Alert.alert('Loi', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContacts().catch(() => undefined);
  }, []);

  const onAdd = async () => {
    if (!nameInput.trim() || !phoneInput.trim()) {
      Alert.alert('Thieu thong tin', 'Nhap ten va so dien thoai.');
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
      const message = error instanceof Error ? error.message : 'Khong the them lien he';
      Alert.alert('Loi', message);
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = (contact: EmergencyContact) => {
    Alert.alert('Xoa lien he?', `Ban chac chan xoa "${contact.name}"?`, [
      { text: 'Huy', style: 'cancel' },
      {
        text: 'Xoa',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDelete(`/api/contacts/${contact.id}`, true);
            await loadContacts();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Khong the xoa lien he';
            Alert.alert('Loi', message);
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Contacts</Text>

      <View style={styles.formCard}>
        <TextInput
          value={nameInput}
          onChangeText={setNameInput}
          placeholder="Ten lien he"
          style={styles.input}
        />
        <TextInput
          value={phoneInput}
          onChangeText={setPhoneInput}
          placeholder="So dien thoai"
          keyboardType="phone-pad"
          style={styles.input}
        />
        <TouchableOpacity style={[styles.addButton, isSaving && styles.disabled]} onPress={onAdd} disabled={isSaving}>
          <Text style={styles.addButtonText}>{isSaving ? 'Dang them...' : 'Them contact'}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <Text style={styles.stateText}>Dang tai danh ba...</Text>
      ) : contacts.length === 0 ? (
        <Text style={styles.stateText}>Chua co contact khan cap.</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginBottom: 20, textAlign: 'center' },
  formCard: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10
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
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2
  },
  icon: { fontSize: 28, color: COLORS.primary, marginRight: 12, width: 30, textAlign: 'center' },
  contactMeta: { flex: 1 },
  contactName: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  contactPhone: { fontSize: 14, color: COLORS.textLight, marginTop: 2 },
  stateText: { textAlign: 'center', color: COLORS.textLight, marginTop: 20 }
});
