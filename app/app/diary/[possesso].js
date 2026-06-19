import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../../src/api';
import { useTheme } from '../../src/context/ThemeContext';

export default function Diary() {
  const { possesso } = useLocalSearchParams();
  const { colors } = useTheme();
  const router = useRouter();
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({});
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null); // note being edited, or null = new

  // form
  const [testo, setTesto] = useState('');
  const [ore, setOre] = useState('');
  const [tag, setTag] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [media, setMedia] = useState(null); // data-URI of the attached photo
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState(null); // full-screen image being viewed

  // Attach a photo from the gallery or straight from the camera.
  const pickPhoto = async (fromCamera) => {
    try {
      const opts = { mediaTypes: ['images'], quality: 0.3, base64: true };
      let res;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert('Fotocamera', 'Permesso fotocamera negato.');
        res = await ImagePicker.launchCameraAsync(opts);
      } else {
        res = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (!res.canceled) setMedia(`data:image/jpeg;base64,${res.assets[0].base64}`);
    } catch (e) { Alert.alert('Errore', e.message); }
  };

  const load = useCallback(async () => {
    try { const d = await api.diary(possesso); setNotes(d.notes); }
    catch (e) { Alert.alert('Errore', e.message); }
    finally { setLoading(false); }
  }, [possesso]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setEditing(null); setTesto(''); setOre(''); setTag(''); setSpoiler(false); setMedia(null); setModal(true);
  };
  const openEdit = (n) => {
    setEditing(n);
    setTesto(n.testo); setOre(n.ore_giocate ? String(n.ore_giocate) : '');
    setTag(n.tag ?? ''); setSpoiler(!!n.is_spoiler); setMedia(n.media_url ?? null); setModal(true);
  };

  const save = async () => {
    if (!testo.trim()) { Alert.alert('Nota vuota', 'Scrivi qualcosa prima di salvare.'); return; }
    setSaving(true);
    const body = {
      testo: testo.trim(), ore_giocate: ore ? Number(ore) : null, tag: tag.trim() || null,
      is_spoiler: spoiler, media_url: media, media_tipo: media ? 'image' : null,
    };
    try {
      if (editing) await api.updateNote(possesso, editing.id_nota, body);
      else await api.addNote(possesso, body);
      setModal(false);
      load();
    } catch (e) { Alert.alert('Errore', e.message); }
    finally { setSaving(false); }
  };

  const deleteNote = (n) => Alert.alert('Nota', 'Eliminare questa nota?', [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: async () => { await api.deleteNote(possesso, n.id_nota); load(); } },
  ]);

  const filtered = notes.filter((n) => n.testo.toLowerCase().includes(query.toLowerCase()) || (n.tag ?? '').toLowerCase().includes(query.toLowerCase()));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>IL TUO VIAGGIO</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput style={{ flex: 1, color: colors.text, padding: 10 }} placeholder="Cerca note..." placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} />
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => String(n.id_nota)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 90 }}
          renderItem={({ item }) => {
            const open = revealed[item.id_nota] || !item.is_spoiler;
            return (
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>📅 {new Date(item.created_at).toLocaleDateString('it-IT')}</Text>
                  {item.ore_giocate ? (
                    <View style={{ backgroundColor: colors.primary + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 10 }}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>⏳ {item.ore_giocate}h</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => openEdit(item)} hitSlop={10} style={{ marginRight: 14 }}><Ionicons name="create-outline" size={18} color={colors.textMuted} /></Pressable>
                  <Pressable onPress={() => deleteNote(item)} hitSlop={10}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable>
                </View>
                {item.tag ? <Text style={{ color: colors.star, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>🏷️ {item.tag}</Text> : null}
                {open ? (
                  <>
                    <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{item.testo}</Text>
                    {item.media_url ? (
                      <Pressable onPress={() => setViewer(item.media_url)} style={{ marginTop: 10 }}>
                        <Image source={{ uri: item.media_url }} style={{ width: '100%', height: 180, borderRadius: 10 }} resizeMode="cover" />
                        <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: '#000A', borderRadius: 999, padding: 5 }}>
                          <Ionicons name="expand" size={14} color="#fff" />
                        </View>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <Pressable onPress={() => setRevealed((r) => ({ ...r, [item.id_nota]: true }))} style={{ backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: 14, alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontWeight: '700', letterSpacing: 1 }}>[ SPOILER – TOCCA PER LEGGERE ]</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>Nessuna nota ancora. Racconta la tua avventura!</Text>}
        />
      )}

      <Pressable onPress={openNew} style={{ position: 'absolute', bottom: 24, right: 20, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 999 }}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800' }}>Nuova Nota</Text>
      </Pressable>

      {/* Bottom-sheet writing overlay */}
      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Pressable onPress={() => setModal(false)}><Text style={{ color: colors.danger, fontWeight: '700' }}>✕ Annulla</Text></Pressable>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{editing ? 'Modifica nota' : 'Nuova nota'}</Text>
              <Pressable onPress={save} disabled={saving}>{saving ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: '700' }}>Salva →</Text>}</Pressable>
            </View>
            <TextInput
              style={{ color: colors.text, fontSize: 16, minHeight: 90, maxHeight: 180, textAlignVertical: 'top',
                backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 12 }}
              placeholder="Cosa è successo in questa sessione?" placeholderTextColor={colors.textMuted}
              multiline autoFocus scrollEnabled value={testo} onChangeText={setTesto}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10 }}>
                <Text style={{ color: colors.textMuted }}>⏳ Ore:</Text>
                <TextInput style={{ color: colors.text, paddingVertical: 8, width: 50 }} keyboardType="numeric" value={ore} onChangeText={setOre} placeholder="0" placeholderTextColor={colors.textMuted} />
              </View>
              <TextInput style={{ flex: 1, color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }} placeholder="🏷️ Tag" placeholderTextColor={colors.textMuted} value={tag} onChangeText={setTag} />
            </View>
            {/* photo attachment */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => pickPhoto(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 }}>
                <Ionicons name="images-outline" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Galleria</Text>
              </Pressable>
              <Pressable onPress={() => pickPhoto(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 }}>
                <Ionicons name="camera-outline" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Scatta</Text>
              </Pressable>
              {media ? (
                <View>
                  <Image source={{ uri: media }} style={{ width: 52, height: 52, borderRadius: 8 }} />
                  <Pressable onPress={() => setMedia(null)} hitSlop={8}
                    style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.danger, borderRadius: 999, padding: 2 }}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <Text style={{ color: colors.text }}>👁️ Spoiler</Text>
              <Switch value={spoiler} onValueChange={setSpoiler} trackColor={{ true: colors.primary }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full-screen image viewer — opens the photo uncropped */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: '#000E', justifyContent: 'center' }}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
          <Pressable onPress={() => setViewer(null)} style={{ position: 'absolute', top: 50, right: 20, backgroundColor: '#0008', borderRadius: 999, padding: 10 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
