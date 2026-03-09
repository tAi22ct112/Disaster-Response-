import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../constants/colors';
import type { CheckinSettings } from '../types';
import {
  formatHm,
  getCheckinSettings,
  isNotificationRuntimeSupported,
  parseTimeInput,
  saveCheckinSettings,
  sendImmediateCheckin,
  scheduleDailyCheckin
} from '../services/checkinService';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<CheckinSettings>({
    enabled: false,
    hour: 20,
    minute: 0,
    graceDays: 3
  });
  const [timeInput, setTimeInput] = useState('20:00');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const savedCheckin = await getCheckinSettings();
      setSettings(savedCheckin);
      setTimeInput(formatHm(savedCheckin.hour, savedCheckin.minute));
    })();
  }, []);

  const onSave = async () => {
    const hm = parseTimeInput(timeInput);
    if (!hm) {
      Alert.alert('Sai dinh dang', 'Nhap gio theo dinh dang HH:mm. Vi du: 20:30');
      return;
    }

    const nextSettings: CheckinSettings = {
      ...settings,
      hour: hm.hour,
      minute: hm.minute,
      graceDays: 3
    };

    try {
      setIsSaving(true);
      await saveCheckinSettings(nextSettings);
      await scheduleDailyCheckin(nextSettings);
      setSettings(nextSettings);
      if (isNotificationRuntimeSupported()) {
        Alert.alert('Da luu', 'He thong check-in da duoc cap nhat.');
      } else {
        Alert.alert(
          'Da luu',
          'Dang chay Expo Go nen notification action bi gioi han. Muon test day du, can dung Development Build.'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong the cap nhat check-in';
      Alert.alert('Loi', message);
    } finally {
      setIsSaving(false);
    }
  };

  const onSendTestNow = async () => {
    try {
      await sendImmediateCheckin();
      Alert.alert('Da gui', 'Thong bao check-in test da duoc gui ngay.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong the gui check-in test';
      Alert.alert('Loi', message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.item}>
        <Text style={styles.label}>Bat check-in hang ngay</Text>
        <Switch value={settings.enabled} onValueChange={enabled => setSettings(prev => ({ ...prev, enabled }))} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Gio check-in moi ngay (HH:mm)</Text>
        <TextInput
          value={timeInput}
          onChangeText={setTimeInput}
          editable={!isSaving}
          keyboardType="numbers-and-punctuation"
          placeholder="20:00"
          style={styles.input}
        />
        <Text style={styles.hint}>
          Den gio nay app se gui thong bao: "Ban co con on khong?" voi 2 lua chon Co / Khong.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Che do mac dinh khi khong phan hoi</Text>
        <Text style={styles.value}>
          Sau 3 ngay khong phan hoi, he thong se mac dinh KHONG an toan va dat marker SOS bang vi tri cuoi.
        </Text>
      </View>

      {!isNotificationRuntimeSupported() && (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            Ban dang chay Expo Go. Notification action Co/Khong tren Android SDK 53 khong ho tro day du.
          </Text>
        </View>
      )}

      <TouchableOpacity style={[styles.saveBtn, isSaving && styles.disabledBtn]} onPress={onSave} disabled={isSaving}>
        <Text style={styles.saveText}>{isSaving ? 'Dang luu...' : 'Luu Cai Dat Check-in'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.testBtn} onPress={onSendTestNow}>
        <Text style={styles.testText}>Gui Check-in Ngay (Test)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginBottom: 20, textAlign: 'center' },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12
  },
  card: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12
  },
  label: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  value: { fontSize: 15, color: COLORS.textLight, lineHeight: 22 },
  warningCard: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12
  },
  warningText: { color: '#92400e', fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: COLORS.text
  },
  hint: { marginTop: 8, fontSize: 13, color: COLORS.textLight, lineHeight: 18 },
  saveBtn: {
    marginTop: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  disabledBtn: { opacity: 0.6 },
  saveText: { color: 'white', fontSize: 16, fontWeight: '700' },
  testBtn: {
    marginTop: 10,
    borderColor: COLORS.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  testText: { color: COLORS.accent, fontSize: 15, fontWeight: '700' }
});
