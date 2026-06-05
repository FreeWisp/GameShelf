import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { GameCover, STATUS_META } from '../../src/components/common';

const FILTERS = [
  { key: 'cartelle', label: 'CARTELLE' },
  { key: 'tutti', label: 'TUTTI' },
  { key: 'in_corso', label: 'DA CONTINUARE' },
  { key: 'completato', label: 'COMPLETATI' },
];

const EMOJI_OPTIONS = ['📚', '🎮', '🕹️', '👾', '🏆', '⚔️', '🛡️', '🚀', '🐉', '🧩', '🎯', '🌟', '❤️', '🔥', '💎', '🎲', '🧟', '🏰'];

export default function Home() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [library, setLibrary] = useState([]);
  const [folders, setFolders] = useState([]);
  const [filter, setFilter] = useState('cartelle');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [folderModal, setFolderModal] = useState(null); // { mode:'create'|'rename', target? } | null
  const [folderName, setFolderName] = useState('');
  const [folderEmoji, setFolderEmoji] = useState('📚');
  const [reorderMode, setReorderMode] = useState(false);

  const load = useCallback(async () => {
    try {
      const [lib, fld] = await Promise.all([api.library(), api.folders()]);
      setLibrary(lib.library);
      setFolders(fld.folders);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const owned = library.filter((e) => e.owned);
  const completed = owned.filter((e) => e.stato_avanzamento === 'completato').length;

  const filtered =
    filter === 'in_corso' ? owned.filter((e) => e.stato_avanzamento === 'in_corso')
    : filter === 'completato' ? owned.filter((e) => e.stato_avanzamento === 'completato')
    : owned; // 'tutti'

  // ----- folder create / rename modal -----
  const openCreate = () => { setFolderName(''); setFolderEmoji('📚'); setFolderModal({ mode: 'create' }); };
  const openRename = (folder) => {
    const name = typeof folder === 'string' ? folder : folder.nome_cartella;
    const emoji = typeof folder === 'string' ? (folders.find((f) => f.nome_cartella === name)?.emoji ?? '📚') : (folder.emoji ?? '📚');
    setFolderName(name); setFolderEmoji(emoji); setFolderModal({ mode: 'rename', target: name });
  };
  const submitFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    try {
      if (folderModal?.mode === 'rename') await api.renameFolder(folderModal.target, name, folderEmoji);
      else await api.createFolder(name, folderEmoji);
      setFolderModal(null);
      load();
    } catch (e) { Alert.alert('Errore', e.message); }
  };
  const folderActions = (folder) => Alert.alert(folder.nome_cartella, 'Cosa vuoi fare con questa mensola?', [
    { text: 'Rinomina / cambia emoji', onPress: () => openRename(folder) },
    { text: 'Elimina', style: 'destructive', onPress: async () => { await api.deleteFolder(folder.nome_cartella); load(); } },
    { text: 'Annulla', style: 'cancel' },
  ]);

  // ----- reorder (move up/down, persisted) -----
  const moveFolder = async (index, dir) => {
    const next = index + dir;
    if (next < 0 || next >= folders.length) return;
    const arr = [...folders];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    setFolders(arr); // optimistic
    try { await api.reorderFolders(arr.map((f) => f.nome_cartella)); }
    catch (e) { Alert.alert('Errore', e.message); load(); }
  };

  const FolderModal = (
    <Modal visible={!!folderModal} transparent animationType="fade" onRequestClose={() => setFolderModal(null)}>
      <Pressable onPress={() => setFolderModal(null)} style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 28 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, marginBottom: 14 }}>
            {folderModal?.mode === 'rename' ? 'Rinomina mensola' : 'Nuova mensola'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>Icona</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {EMOJI_OPTIONS.map((e) => (
              <Pressable key={e} onPress={() => setFolderEmoji(e)}
                style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: folderEmoji === e ? colors.primary + '33' : colors.surfaceAlt,
                  borderWidth: 1, borderColor: folderEmoji === e ? colors.primary : 'transparent' }}>
                <Text style={{ fontSize: 20 }}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            style={{ backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: 10, padding: 12, marginBottom: 16 }}
            placeholder="Es. Saga di Final Fantasy" placeholderTextColor={colors.textMuted}
            value={folderName} onChangeText={setFolderName} autoFocus onSubmitEditing={submitFolder}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
            <Pressable onPress={() => setFolderModal(null)}><Text style={{ color: colors.textMuted, fontWeight: '700' }}>Annulla</Text></Pressable>
            <Pressable onPress={submitFolder}><Text style={{ color: colors.primary, fontWeight: '700' }}>{folderModal?.mode === 'rename' ? 'Salva' : 'Crea'}</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const Header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Pressable onPress={() => router.push('/profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {user?.immagine_profilo
            ? <Image source={{ uri: user.immagine_profilo }} style={{ width: 40, height: 40, borderRadius: 20 }} />
            : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{user?.username?.slice(0, 2).toUpperCase()}</Text>
              </View>}
          <View>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{user?.username}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{owned.length} in libreria · {completed} completati</Text>
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Pressable onPress={() => router.push('/collection/wishlist')}><Ionicons name="bookmark-outline" size={22} color={colors.text} /></Pressable>
          <Pressable onPress={() => router.push('/collection/preferiti')}><Ionicons name="heart-outline" size={22} color={colors.text} /></Pressable>
          <Pressable onPress={() => router.push('/settings')}><Ionicons name="settings-outline" size={22} color={colors.text} /></Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingRight: 16 }} style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} onPress={() => setFilter(f.key)}>
            <Text style={{
              color: filter === f.key ? colors.primary : colors.textMuted,
              fontWeight: '700', fontSize: 13,
              borderBottomWidth: filter === f.key ? 2 : 0, borderBottomColor: colors.primary, paddingBottom: 4,
            }}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  // ---- CARTELLE view ----
  if (filter === 'cartelle') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {Header}
        <FlatList
          data={folders}
          keyExtractor={(f) => f.nome_cartella}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 4, gap: 10 }}>
              {!reorderMode && (
                <Pressable onPress={openCreate}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="add-circle" size={24} color={colors.primary} />
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Crea nuova mensola</Text>
                </Pressable>
              )}
              {folders.length > 1 && (
                <Pressable onPress={() => setReorderMode((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' }}>
                  <Ionicons name={reorderMode ? 'checkmark-circle' : 'swap-vertical'} size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{reorderMode ? 'Fine' : 'Riordina'}</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => !reorderMode && router.push(`/folder/${encodeURIComponent(item.nome_cartella)}`)}
              onLongPress={() => !reorderMode && folderActions(item)}
              style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: reorderMode ? colors.primary : colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{item.emoji ?? '📚'} {item.nome_cartella}</Text>
                {reorderMode ? (
                  <View style={{ flexDirection: 'row', gap: 14 }}>
                    <Pressable onPress={() => moveFolder(index, -1)} hitSlop={10} disabled={index === 0}>
                      <Ionicons name="arrow-up-circle" size={26} color={index === 0 ? colors.border : colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => moveFolder(index, 1)} hitSlop={10} disabled={index === folders.length - 1}>
                      <Ionicons name="arrow-down-circle" size={26} color={index === folders.length - 1 ? colors.border : colors.primary} />
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={{ color: colors.textMuted, marginRight: 12 }}>{item.count} giochi</Text>
                    <Pressable onPress={() => openRename(item)} hitSlop={10}><Ionicons name="create-outline" size={18} color={colors.textMuted} /></Pressable>
                  </>
                )}
              </View>
              {!reorderMode && item.giochi?.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  {item.giochi.slice(0, 5).map((g) => <GameCover key={g.id_gioco} url={g.copertina_url} size="sm" />)}
                </View>
              )}
              {!reorderMode && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Apri e gestisci</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                </View>
              )}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>Nessuna mensola. Creane una per organizzare i tuoi giochi.</Text>}
        />
        {FolderModal}
      </SafeAreaView>
    );
  }

  // ---- Empty state for a brand-new user (no games AND no folders) ----
  if (library.length === 0 && folders.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {Header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="library-outline" size={72} color={colors.textMuted} />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>Inizia la tua collezione</Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 8 }}>
            Crea la tua prima mensola, oppure cerca un gioco da aggiungere.
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <Pressable onPress={openCreate} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Crea mensola</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/search')} style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Cerca un gioco</Text>
            </Pressable>
          </View>
        </View>
        {FolderModal}
      </SafeAreaView>
    );
  }

  const emptyMsg = {
    tutti: 'Nessun gioco posseduto. Aggiungine dalla ricerca o segna un gioco come posseduto.',
    in_corso: 'Nessun gioco in corso.',
    completato: 'Nessun gioco completato.',
  }[filter];

  // ---- Game grid ----
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <FlatList
        data={filtered}
        numColumns={3}
        keyExtractor={(e) => String(e.id_possesso)}
        ListHeaderComponent={Header}
        columnWrapperStyle={{ paddingHorizontal: 12, gap: 8 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 30 }}>{emptyMsg}</Text>}
        renderItem={({ item }) => {
          const badge = STATUS_META[item.stato_avanzamento];
          return (
            <Pressable style={{ flex: 1 / 3, maxWidth: '32%' }} onPress={() => router.push(`/game/${item.game.id_gioco}`)}>
              <View>
                <GameCover url={item.game.copertina_url} size="md" style={{ width: '100%', height: 150 }} />
                {item.flag_preferito ? <Ionicons name="heart" size={16} color={colors.danger} style={{ position: 'absolute', top: 6, right: 6 }} /> : null}
                <View style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: '#000A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: badge.color, fontSize: 9, fontWeight: '700' }}>{badge.icon} {badge.label}</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, fontWeight: '600', marginTop: 4 }}>{item.game.titolo}</Text>
            </Pressable>
          );
        }}
      />
      {FolderModal}
    </SafeAreaView>
  );
}
