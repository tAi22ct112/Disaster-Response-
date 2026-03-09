import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
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
        const message = e instanceof Error ? e.message : 'Khong tai duoc tin tuc';
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Latest News</Text>

      {isLoading && <ActivityIndicator size="large" color={COLORS.primary} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {!isLoading && !error && news.length === 0 && (
        <Text style={styles.emptyText}>Chua co tin tuc moi.</Text>
      )}

      {news.map(item => (
        <View key={item.id} style={styles.newsCard}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.newsImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>No image</Text>
            </View>
          )}
          <Text style={styles.newsTitle}>{item.title}</Text>
          <Text style={styles.newsDesc}>{item.summary ?? item.content}</Text>
          <Text style={styles.timeText}>{new Date(item.publishedAt).toLocaleString()}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 10 },
  content: { paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary, marginBottom: 20, textAlign: 'center' },
  newsCard: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', marginBottom: 20, elevation: 3 },
  newsImage: { height: 200, width: '100%' },
  imagePlaceholder: {
    height: 200,
    width: '100%',
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center'
  },
  imagePlaceholderText: { color: '#6b7280', fontWeight: '600' },
  newsTitle: { fontSize: 20, fontWeight: 'bold', padding: 10, color: COLORS.text },
  newsDesc: { paddingHorizontal: 10, color: COLORS.textLight, lineHeight: 20 },
  timeText: { padding: 10, fontSize: 12, color: '#6b7280' },
  errorText: { textAlign: 'center', color: '#b91c1c', marginBottom: 12 },
  emptyText: { textAlign: 'center', color: COLORS.textLight }
});
