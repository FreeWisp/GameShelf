import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { useTheme } from '../../src/context/ThemeContext';
import { GameCover, Stars } from '../../src/components/common';

export default function Search() {
  const { colors } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [popular, setPopular] = useState([]);
  const [results, setResults] = useState(null);
  const [didYouMean, setDidYouMean] = useState(null);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  useEffect(() => { api.popular(18).then((d) => setPopular(d.games)).catch(() => {}); }, []);

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults(null); setDidYouMean(null); setSource(null); return; }
    setLoading(true);
    try {
      const d = await api.search(q);
      setResults(d.games);
      setDidYouMean(d.didYouMean ?? null);
      setSource(d.source);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const onChange = (text) => {
    setQuery(text);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(text), 450);
  };

  const acceptSuggestion = () => { setQuery(didYouMean); setDidYouMean(null); runSearch(didYouMean); };
  const data = results ?? popular;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginVertical: 12 }}>CERCA GIOCHI</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={{ flex: 1, color: colors.text, padding: 12, fontSize: 15 }}
          placeholder="Nome del gioco, sviluppatore..." placeholderTextColor={colors.textMuted}
          value={query} onChangeText={onChange} autoCapitalize="none" returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
        />
        {query ? <Pressable onPress={() => onChange('')}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
      </View>

      {/* Levenshtein "forse cercavi" suggestion (computed server-side) */}
      {didYouMean && (
        <Pressable onPress={acceptSuggestion}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10 }}>
          <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
          <Text style={{ color: colors.textMuted, flex: 1 }}>Forse cercavi: <Text style={{ color: colors.primary, fontWeight: '700' }}>{didYouMean}</Text></Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </Pressable>
      )}
      {source && results && (
        <Text style={{ color: colors.textMuted, fontSize: 11, paddingHorizontal: 16, marginTop: 6 }}>
          {results.length} risultati · fonte: {source === 'igdb' ? 'IGDB (scaricati nel DB)' : 'catalogo'}
        </Text>
      )}

      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

      <FlatList
        data={data}
        numColumns={2}
        keyExtractor={(g) => String(g.id_gioco ?? g.igdb_id ?? g.titolo)}
        ListHeaderComponent={!results ? <Text style={{ color: colors.textMuted, fontWeight: '700', paddingHorizontal: 16, marginTop: 14 }}>PIÙ GIOCATI</Text> : null}
        columnWrapperStyle={{ paddingHorizontal: 12, gap: 10 }}
        contentContainerStyle={{ gap: 14, paddingVertical: 14, paddingBottom: 30 }}
        renderItem={({ item }) => (
          <Pressable style={{ flex: 1, flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border }}
            onPress={() => item.id_gioco && router.push(`/game/${item.id_gioco}`)}>
            <GameCover url={item.copertina_url} size="sm" />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{item.titolo}</Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{item.publisher} {item.data_pubblicazione ? `· ${item.data_pubblicazione.slice(0, 4)}` : ''}</Text>
              <View style={{ marginTop: 4 }}><Stars rating={item.rating} /></View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={!loading && results ? <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 30 }}>Nessun risultato.</Text> : null}
      />
    </SafeAreaView>
  );
}
