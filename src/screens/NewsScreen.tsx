import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';
import { apiGet } from '../services/apiClient';

type NewsItem = {
  id: string;
  title: string;
  summary?: string | null;
  content: string;
  imageUrl?: string | null;
  publishedAt: string;
};

export default function NewsScreen() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setIsLoading(true);
        const response = await apiGet<{ items: NewsItem[] }>('/api/news', true);
        if (!active) return;
        setNews(response.items ?? []);
        setError(null);
      } catch (e) {
        if (!active) return;
        const message = e instanceof Error ? e.message : 'Không tải được tin tức.';
        setError(message);
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]} style={styles.gradientBackground}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Tin mới nhất</Text>

      {isLoading && <ActivityIndicator size="large" color={COLORS.primary} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {!isLoading && !error && news.length === 0 && (
        <Text style={styles.emptyText}>Chưa có tin tức mới.</Text>
      )}

        {news.map(item => (
        <View key={item.id} style={styles.newsCard}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.newsImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>Không có ảnh</Text>
            </View>
          )}
          <Text style={styles.newsTitle}>{item.title}</Text>
          <Text style={styles.newsDesc}>{item.summary ?? item.content}</Text>
          <Text style={styles.timeText}>{new Date(item.publishedAt).toLocaleString()}</Text>
        </View>
        ))}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBackground: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginBottom: 20, textAlign: 'center' },
  newsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  newsImage: { height: 200, width: '100%' },
  imagePlaceholder: {
    height: 200,
    width: '100%',
    backgroundColor: COLORS.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center'
  },
  imagePlaceholderText: { color: COLORS.textLight, fontWeight: '600' },
  newsTitle: { fontSize: 20, fontWeight: 'bold', padding: 10, color: COLORS.text },
  newsDesc: { paddingHorizontal: 10, color: COLORS.textLight, lineHeight: 20 },
  timeText: { padding: 10, fontSize: 12, color: COLORS.textLight },
  errorText: { textAlign: 'center', color: '#b91c1c', marginBottom: 12 },
  emptyText: { textAlign: 'center', color: COLORS.textLight }
});
