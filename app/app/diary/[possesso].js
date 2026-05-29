import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

  // new note form
  const [testo, setTesto] = useState('');
  const [ore, setOre] = useState('');
  const [tag, setTag] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.diary(possesso); setNotes(d.notes); }
    catch (e) { Alert.alert('Errore', e.message); }
    finally { setLoading(false); }
  }, [possesso]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!testo.trim()) return;
    setSaving(true);
    try {
      await api.addNote(possesso, { testo: testo.trim(), ore_giocate: ore ? Number(ore) : null, tag: tag.trim() || null, is_spoiler: spoiler });
      setTesto(''); setOre(''); setTag(''); setSpoiler(false); setModal(false);
      load();
    } catch (e) { Alert.alert('Errore', e.message); }
    finally { setSaving(false); }
  };

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
              <Pressable
                onLongPress={() => Alert.alert('Nota', 'Eliminare questa nota?', [
                  { text: 'Annulla' }, { text: 'Elimina', style: 'destructive', onPress: async () => { await api.deleteNote(possesso, item.id_nota); load(); } },
                ])}
                style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>📅 {new Date(item.created_at).toLocaleDateString('it-IT')}</Text>
                  {item.ore_giocate ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>⏳ {item.ore_giocate}h giocate</Text> : null}
                </View>
                {item.tag ? <Text style={{ color: colors.star, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>🏷️ {item.tag}</Text> : null}
                {open ? (
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{item.testo}</Text>
                ) : (
                  <Pressable onPress={() => setRevealed((r) => ({ ...r, [item.id_nota]: true }))} style={{ backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: 14, alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontWeight: '700', letterSpacing: 1 }}>[ SPOILER – TOCCA PER LEGGERE ]</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>Nessuna nota ancora. Racconta la tua avventura!</Text>}
        />
      )}

      <Pressable onPress={() => setModal(true)} style={{ position: 'absolute', bottom: 24, right: 20, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 999 }}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800' }}>Nuova Nota</Text>
      </Pressable>

      {/* Bottom-sheet writing overlay */}
      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Pressable onPress={() => setModal(false)}><Text style={{ color: colors.danger, fontWeight: '700' }}>✕ Annulla</Text></Pressable>
                <Pressable onPress={save} disabled={saving}>{saving ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: '700' }}>Salva →</Text>}</Pressable>
              </View>
              <TextInput
                style={{ color: colors.text, fontSize: 16, minHeight: 90, textAlignVertical: 'top' }}
                placeholder="Cosa è successo in questa sessione?" placeholderTextColor={colors.textMuted}
                multiline autoFocus value={testo} onChangeText={setTesto}
              />
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: colors.textMuted }}>⏳ Ore:</Text>
                  <TextInput style={{ color: colors.text, paddingVertical: 8, width: 50 }} keyboardType="numeric" value={ore} onChangeText={setOre} placeholder="0" placeholderTextColor={colors.textMuted} />
                </View>
                <TextInput style={{ flex: 1, color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }} placeholder="🏷️ Tag" placeholderTextColor={colors.textMuted} value={tag} onChangeText={setTag} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <Text style={{ color: colors.text }}>👁️ Spoiler</Text>
                <Switch value={spoiler} onValueChange={setSpoiler} trackColor={{ true: colors.primary }} />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
