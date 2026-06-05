import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { useTheme } from '../../src/context/ThemeContext';
import { GameCover } from '../../src/components/common';

const CONFIG = {
  wishlist: { title: 'Wishlist', icon: 'bookmark', empty: 'La tua wishlist è vuota. Aggiungi i giochi che desideri dalle loro schede.', filter: (e) => e.in_wishlist },
  preferiti: { title: 'Preferiti', icon: 'heart', empty: 'Nessun preferito. Tocca il cuore su una scheda gioco.', filter: (e) => e.flag_preferito },
};

export default function Collection() {
  const { type } = useLocalSearchParams();
  const cfg = CONFIG[String(type)] ?? CONFIG.wishlist;
  const { colors } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const { library } = await api.library(); setItems(library.filter(cfg.filter)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [type]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Ionicons name={cfg.icon} size={20} color={colors.primary} />
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{cfg.title}</Text>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
        <FlatList
          data={items}
          numColumns={3}
          keyExtractor={(e) => String(e.id_possesso)}
          columnWrapperStyle={{ paddingHorizontal: 12, gap: 8 }}
          contentContainerStyle={{ gap: 14, paddingVertical: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable style={{ flex: 1 / 3, maxWidth: '32%' }} onPress={() => router.push(`/game/${item.game.id_gioco}`)}>
              <GameCover url={item.game.copertina_url} size="md" style={{ width: '100%', height: 150 }} />
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, fontWeight: '600', marginTop: 4 }}>{item.game.titolo}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 50, paddingHorizontal: 32 }}>
              <Ionicons name={`${cfg.icon}-outline`} size={56} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 14 }}>{cfg.empty}</Text>
              <Pressable onPress={() => router.push('/(tabs)/search')} style={{ marginTop: 18, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Cerca giochi</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
