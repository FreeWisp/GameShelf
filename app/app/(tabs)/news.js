import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { openLink } from '../../src/lib/links';
import { useTheme } from '../../src/context/ThemeContext';

function stripHtml(s = '') {
  return s.replace(/<[^>]+>/g, '').replace(/\[\/?[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
}

export default function News() {
  const { colors } = useTheme();
  const router = useRouter();
  const [news, setNews] = useState([]);
  const [epic, setEpic] = useState([]);
  const [personalized, setPersonalized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, e] = await Promise.all([api.news(), api.epicFree().catch(() => ({ free: [] }))]);
      setNews(n.news ?? []);
      setPersonalized(!!n.personalized);
      setEpic(e.free ?? []);
    } catch { setNews([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const EpicSection = epic.length > 0 ? (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Ionicons name="gift" size={16} color={colors.accent} />
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>GRATIS ORA SU EPIC</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {epic.map((g) => (
          <Pressable key={g.id} onPress={() => openLink(g.url)}
            style={{ width: 200, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, overflow: 'hidden' }}>
            {g.image ? <Image source={{ uri: g.image }} style={{ width: '100%', height: 100 }} /> : null}
            <View style={{ padding: 10 }}>
              <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '700' }}>{g.title}</Text>
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', marginTop: 2 }}>GRATIS · riscatta su Epic</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 12 }}>NEWS DI GIOCO</Text>
      <Text style={{ color: personalized ? colors.accent : colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 2, marginBottom: 10 }}>
        {personalized ? '✦ In base ai giochi della tua libreria e wishlist' : 'Dai giochi più popolari'}
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={news}
          keyExtractor={(n, i) => String(n.gid ?? i)}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 30 }}
          ListHeaderComponent={EpicSection}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => item.url && openLink(item.url)}
              style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {item.gioco ? (
                  // game tag — tap to open the game card
                  <Pressable onPress={() => item.id_gioco && router.push(`/game/${item.id_gioco}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '22', borderColor: colors.primary, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, maxWidth: '70%' }}>
                    <Ionicons name="game-controller" size={11} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }} numberOfLines={1}>{item.gioco}</Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="newspaper-outline" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{item.feedlabel ?? 'News'}</Text>
                  </View>
                )}
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{new Date(item.date * 1000).toLocaleDateString('it-IT')}</Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{item.title}</Text>
              <Text numberOfLines={3} style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>{stripHtml(item.contents)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 24 }}>
              <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 12 }}>
                Nessuna news disponibile al momento. Le news arrivano dalle API di Steam (GetNewsForApp) per i giochi più popolari.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
