import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '../types';

type HomeScreenProps = {
  navigation: BottomTabNavigationProp<TabParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const newsItems = [
    {
      title: 'Lũ lớn tại thành phố Ratnapura (2019)',
      desc: 'Mưa lớn kéo dài đã gây ngập nặng nhiều khu vực...',
      image: 'https://example.com/flood.jpg',
    },
    {
      title: 'Cảnh báo lũ quét',
      desc: 'Dự báo mưa rất to trong 24 giờ tới...',
      image: 'https://example.com/flood-warning.jpg',
    },
  ];

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>SLDDA</Text>
        <Text style={styles.subtitle}>Hỗ trợ cứu hộ thiên tai</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {newsItems.map((item, index) => (
          <View key={index} style={styles.newsCard}>
            <Image source={{ uri: item.image }} style={styles.newsImage} />
            <Text style={styles.newsTitle}>{item.title}</Text>
            <Text style={styles.newsDesc}>{item.desc}</Text>
          </View>
        ))}

        <TouchableOpacity style={styles.sosButton} onPress={() => navigation.navigate('SOS')}>
          <Text style={styles.sosText}>Khẩn cấp | SOS</Text>
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
  newsCard: {
    backgroundColor: 'rgba(234,242,255,0.96)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  newsImage: { height: 200, width: '100%' },
  newsTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, padding: 12 },
  newsDesc: { fontSize: 16, color: COLORS.textLight, paddingHorizontal: 12, paddingBottom: 12 },
  sosButton: { backgroundColor: COLORS.accent, borderRadius: 16, paddingVertical: 25, alignItems: 'center', marginTop: 20 },
  sosText: { color: 'white', fontSize: 28, fontWeight: 'bold' },
});
