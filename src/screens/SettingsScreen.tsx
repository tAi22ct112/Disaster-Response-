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
      Alert.alert('Sai định dạng', 'Nhập giờ theo định dạng HH:mm. Ví dụ: 20:30.');
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
        Alert.alert('Đã lưu', 'Hệ thống check-in đã được cập nhật.');
      } else {
        Alert.alert(
          'Đã lưu',
          'Đang chạy Expo Go nên thao tác thông báo bị giới hạn. Muốn test đầy đủ, cần dùng Development Build.'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể cập nhật check-in.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsSaving(false);
    }
  };

  const onSendTestNow = async () => {
    try {
      await sendImmediateCheckin();
      Alert.alert('Đã gửi', 'Thông báo check-in test đã được gửi ngay.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể gửi check-in test.';
      Alert.alert('Lỗi', message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Cài đặt</Text>

      <View style={styles.item}>
        <Text style={styles.label}>Bật check-in hằng ngày</Text>
        <Switch value={settings.enabled} onValueChange={enabled => setSettings(prev => ({ ...prev, enabled }))} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Giờ check-in mỗi ngày (HH:mm)</Text>
        <TextInput
          value={timeInput}
          onChangeText={setTimeInput}
          editable={!isSaving}
          keyboardType="numbers-and-punctuation"
          placeholder="20:00"
          style={styles.input}
        />
        <Text style={styles.hint}>
          Đến giờ này, app sẽ gửi thông báo: "Bạn có còn ổn không?" với 2 lựa chọn Có / Không.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Chế độ mặc định khi không phản hồi</Text>
        <Text style={styles.value}>
          Sau 3 ngày không phản hồi, hệ thống sẽ mặc định KHÔNG an toàn và đặt marker SOS bằng vị trí cuối.
        </Text>
      </View>

      {!isNotificationRuntimeSupported() && (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            Bạn đang chạy Expo Go. Thao tác thông báo Có/Không trên Android SDK 53 chưa hỗ trợ đầy đủ.
          </Text>
        </View>
      )}

      <TouchableOpacity style={[styles.saveBtn, isSaving && styles.disabledBtn]} onPress={onSave} disabled={isSaving}>
        <Text style={styles.saveText}>{isSaving ? 'Đang lưu...' : 'Lưu cài đặt check-in'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.testBtn} onPress={onSendTestNow}>
        <Text style={styles.testText}>Gửi check-in ngay (test)</Text>
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
    backgroundColor: COLORS.surface,
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  card: {
    backgroundColor: COLORS.surface,
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border
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
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.inputBackground
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
    backgroundColor: COLORS.surfaceSoft
  },
  testText: { color: COLORS.accent, fontSize: 15, fontWeight: '700' }
});
