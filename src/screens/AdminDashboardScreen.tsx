import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiGet } from '../services/apiClient';
import { COLORS } from '../constants/colors';

type DashboardResponse = {
  generatedAt: string;
  summary: {
    usersTotal: number;
    sosTotal: number;
    sosInLast24h: number;
    incidentsActive: number;
    sheltersOpen: number;
    rescuersActive15m: number;
  };
  sosByStatus: {
    OPEN: number;
    IN_PROGRESS: number;
    RESOLVED: number;
    CANCELLED: number;
  };
  highPrioritySos: Array<{
    id: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
    priorityScore: number;
    peopleCount?: number | null;
    createdAt: string;
    user: {
      fullName?: string | null;
      phone?: string | null;
    };
  }>;
  heatmap: Array<{
    latitude: number;
    longitude: number;
    count: number;
  }>;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function AdminDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const dashboard = await apiGet<DashboardResponse>('/api/admin/dashboard', true);
      setData(dashboard);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không tải được bảng điều khiển.';
      setErrorText(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
    const timer = setInterval(() => {
      load(true).catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load(true).catch(() => undefined);
          }}
        />
      }
    >
      <Text style={styles.title}>Bảng điều khiển quản trị</Text>
      {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

      {data && (
        <>
          <View style={styles.statGrid}>
            <StatCard label="Người dùng" value={data.summary.usersTotal} />
            <StatCard label="Tổng SOS" value={data.summary.sosTotal} />
            <StatCard label="SOS 24h" value={data.summary.sosInLast24h} />
            <StatCard label="Cứu hộ hoạt động 15p" value={data.summary.rescuersActive15m} />
            <StatCard label="Sự cố đang hoạt động" value={data.summary.incidentsActive} />
            <StatCard label="Nơi trú ẩn đang mở" value={data.summary.sheltersOpen} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trạng thái SOS</Text>
            <Text style={styles.sectionText}>MỞ: {data.sosByStatus.OPEN}</Text>
            <Text style={styles.sectionText}>ĐANG XỬ LÝ: {data.sosByStatus.IN_PROGRESS}</Text>
            <Text style={styles.sectionText}>ĐÃ XỬ LÝ: {data.sosByStatus.RESOLVED}</Text>
            <Text style={styles.sectionText}>ĐÃ HỦY: {data.sosByStatus.CANCELLED}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top ưu tiên cứu hộ</Text>
            {data.highPrioritySos.map(item => (
              <View key={item.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>
                  {item.severity} | Điểm {item.priorityScore.toFixed(1)} | {item.status}
                </Text>
                <Text style={styles.rowSub}>
                  {item.user?.fullName || item.user?.phone || 'Không rõ'} | Người: {item.peopleCount ?? 1}
                </Text>
                <Text style={styles.rowSub}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Các cụm heatmap</Text>
            {data.heatmap.slice(0, 20).map((cell, index) => (
              <Text key={`${cell.latitude}-${cell.longitude}-${index}`} style={styles.sectionText}>
                {cell.latitude}, {cell.longitude}: {cell.count} SOS
              </Text>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.primaryDark, marginBottom: 10 },
  errorText: { color: '#b91c1c', marginBottom: 10 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  statLabel: { color: COLORS.textLight, fontSize: 12, marginBottom: 4 },
  statValue: { color: COLORS.primaryDark, fontSize: 22, fontWeight: '800' },
  section: {
    marginTop: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primaryDark, marginBottom: 8 },
  sectionText: { color: COLORS.text, marginBottom: 4 },
  rowCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: COLORS.surfaceSoft
  },
  rowTitle: { color: COLORS.primaryDark, fontWeight: '700', marginBottom: 4 },
  rowSub: { color: COLORS.textLight, fontSize: 12 }
});
