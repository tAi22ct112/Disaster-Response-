import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '../types';

type HomeScreenProps = {
  navigation: BottomTabNavigationProp<TabParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  // Mock news data (sau này thay bằng API hoặc Firebase)
  const newsItems = [
    {
      title: '2019 Flood Rathnapura City',
      desc: 'Heavy rainfall caused severe flooding...',
      image: 'https://example.com/flood.jpg', // thay bằng ảnh thật
    },
    {
      title: 'Flash flood warning',
      desc: 'Heavy rainfall is expected in the next 24 hours...',
      image: 'https://example.com/flood-warning.jpg',
    },
  ];

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>SLDDA</Text>
        <Text style={styles.subtitle}>Sri Lankan Disaster Aids</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* News feed */}
        {newsItems.map((item, index) => (
          <View key={index} style={styles.newsCard}>
            <Image source={{ uri: item.image }} style={styles.newsImage} />
            <Text style={styles.newsTitle}>{item.title}</Text>
            <Text style={styles.newsDesc}>{item.desc}</Text>
          </View>
        ))}

        {/* Nút Emergency SOS lớn */}
        <TouchableOpacity 
          style={styles.sosButton} 
          onPress={() => navigation.navigate('SOS')}
        >
          <Text style={styles.sosText}>Emergency | SOS</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', paddingVertical: 30 },
  logo: { fontSize: 48, color: 'white', fontWeight: 'bold' },
  subtitle: { fontSize: 18, color: 'white', marginTop: 5 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  newsCard: { backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', marginBottom: 20, elevation: 4 },
  newsImage: { height: 200, width: '100%' },
  newsTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, padding: 12 },
  newsDesc: { fontSize: 16, color: COLORS.textLight, paddingHorizontal: 12, paddingBottom: 12 },
  sosButton: { backgroundColor: COLORS.accent, borderRadius: 16, paddingVertical: 25, alignItems: 'center', marginTop: 20 },
  sosText: { color: 'white', fontSize: 28, fontWeight: 'bold' },
});
