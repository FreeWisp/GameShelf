import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { useTheme } from '../../src/context/ThemeContext';
import { GameCover } from '../../src/components/common';

const SORTS = [
  { key: 'recenti', label: 'Recenti', icon: 'time-outline' },
  { key: 'titolo', label: 'A-Z', icon: 'text-outline' },
];

export default function FolderDetail() {
  const { name } = useLocalSearchParams();
  const folderName = decodeURIComponent(String(name));
  const { colors } = useTheme();
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('recenti');

  const load = useCallback(async () => {
    try {
      const { folders } = await api.folders();
      const folder = folders.find((f) => f.nome_cartella === folderName);
      setGames(folder?.giochi ?? []);
    } catch (e) { Alert.alert('Errore', e.message); }
    finally { setLoading(false); }
  }, [folderName]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sorted = useMemo(() => {
    const arr = [...games];
    if (sort === 'titolo') arr.sort((a, b) => (a.titolo ?? '').localeCompare(b.titolo ?? ''));
    else arr.reverse(); // insertion order -> most recently added first
    return arr;
  }, [games, sort]);

  const removeGame = (g) => Alert.alert(g.titolo, 'Rimuovere da questa mensola?', [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Rimuovi', style: 'destructive', onPress: async () => {
      try { await api.removeFromFolder(folderName, g.id_gioco); load(); }
      catch (e) { Alert.alert('Errore', e.message); }
    } },
  ]);

  const deleteFolder = () => Alert.alert(folderName, 'Eliminare l\'intera mensola?', [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: async () => { await api.deleteFolder(folderName); router.back(); } },
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, flex: 1 }} numberOfLines={1}>📚 {folderName}</Text>
        <Pressable onPress={deleteFolder} hitSlop={10}><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable>
      </View>

      {/* Sort controls */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
        <Text style={{ color: colors.textMuted, alignSelf: 'center', fontSize: 12 }}>{games.length} giochi · ordina:</Text>
        {SORTS.map((s) => (
          <Pressable key={s.key} onPress={() => setSort(s.key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
              backgroundColor: sort === s.key ? colors.primary + '22' : colors.surface, borderWidth: 1, borderColor: sort === s.key ? colors.primary : colors.border }}>
            <Ionicons name={s.icon} size={13} color={sort === s.key ? colors.primary : colors.textMuted} />
            <Text style={{ color: sort === s.key ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
        <FlatList
          data={sorted}
          numColumns={3}
          keyExtractor={(g) => String(g.id_gioco)}
          columnWrapperStyle={{ paddingHorizontal: 12, gap: 8 }}
          contentContainerStyle={{ gap: 14, paddingVertical: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable style={{ flex: 1 / 3, maxWidth: '32%' }}
              onPress={() => router.push(`/game/${item.id_gioco}`)}
              onLongPress={() => removeGame(item)}>
              <View>
                <GameCover url={item.copertina_url} size="md" style={{ width: '100%', height: 150 }} />
                <Pressable onPress={() => removeGame(item)} hitSlop={8}
                  style={{ position: 'absolute', top: 4, right: 4, backgroundColor: '#000B', borderRadius: 999, padding: 3 }}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, fontWeight: '600', marginTop: 4 }}>{item.titolo}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 44, paddingHorizontal: 32 }}>
              <Ionicons name="albums-outline" size={52} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 12 }}>Mensola vuota. Cerca i giochi da aggiungere qui.</Text>
              <Pressable onPress={() => router.push('/(tabs)/search')} style={{ marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Cerca giochi</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
