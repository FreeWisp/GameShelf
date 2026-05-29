import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { useTheme } from '../../src/context/ThemeContext';
import { GameCover, Pill, Stars, STATUS_META, STATUS_ORDER } from '../../src/components/common';

const STORE_ICON = {
  steam: 'logo-steam', epic: 'game-controller', gog: 'game-controller',
  microsoft: 'logo-windows', playstation: 'logo-playstation', nintendo: 'game-controller',
};

export default function GameDetail() {
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const router = useRouter();
  const [game, setGame] = useState(null);
  const [entry, setEntry] = useState(null);   // library entry if owned
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const triedCommunity = useRef(false);

  const load = useCallback(async () => {
    try {
      const [{ game }, { library }] = await Promise.all([api.game(id), api.library()]);
      setGame(game);
      setEntry(library.find((e) => e.game.id_gioco === Number(id)) ?? null);

      // Auto-load per-user Steam achievements/stats once if the game has a Steam
      // appid and the user has paired Steam (backend silently rejects otherwise).
      const ownedEntry = library.find((e) => e.game.id_gioco === Number(id));
      if (game.steam_appid && !ownedEntry?.community_cache?.achievements?.total && !triedCommunity.current) {
        triedCommunity.current = true;
        api.fetchCommunity(id)
          .then(() => setTimeout(async () => {
            try {
              const { library: lib } = await api.library();
              setEntry(lib.find((e) => e.game.id_gioco === Number(id)) ?? null);
            } catch { /* ignore */ }
          }, 2500))
          .catch(() => {});
      }
    } catch (e) { Alert.alert('Errore', e.message); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addToLibrary = async (extra = {}) => {
    const { entry } = await api.addToLibrary({ id_gioco: Number(id), ...extra });
    setEntry(entry);
    return entry;
  };

  const patch = async (body) => {
    const target = entry ?? (await addToLibrary());
    const { entry: updated } = await api.updateEntry(target.id_possesso, body);
    setEntry(updated);
  };

  const cycleStatus = () => {
    const cur = entry?.stato_avanzamento ?? 'da_iniziare';
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(cur) + 1) % STATUS_ORDER.length];
    patch({ stato_avanzamento: next });
  };

  const toggleFavourite = () => patch({ flag_preferito: !entry?.flag_preferito });

  const addToFolder = async () => {
    try {
      const { folders } = await api.folders();
      if (!folders.length) return Alert.alert('Nessuna mensola', 'Crea prima una mensola dalla Home (tab Cartelle).');
      Alert.alert('Aggiungi a mensola', 'Scegli una mensola', [
        ...folders.map((f) => ({
          text: `${f.nome_cartella} (${f.count})`,
          onPress: async () => {
            await api.addToFolder(f.nome_cartella, { id_gioco: game.id_gioco, titolo: game.titolo, copertina_url: game.copertina_url });
            Alert.alert('Fatto', `Aggiunto a "${f.nome_cartella}"`);
          },
        })),
        { text: 'Annulla', style: 'cancel' },
      ]);
    } catch (e) { Alert.alert('Errore', e.message); }
  };

  if (loading || !game) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  const meta = STATUS_META[entry?.stato_avanzamento ?? 'da_iniziare'];
  const community = entry?.community_cache?.achievements;
  const subtitle = [game.publisher, game.data_pubblicazione?.slice(0, 4), game.genere].filter(Boolean).join(' · ');
  const stateLabel = !entry ? 'VISUALIZZAZIONE DA CERCA' : entry.in_wishlist ? 'IN WISHLIST' : `POSSEDUTO${entry.store_acquisto ? ` (${entry.store_acquisto})` : ''}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero */}
        <View style={{ height: 240 }}>
          <Image source={{ uri: game.copertina_url }} style={{ width: '100%', height: 240, opacity: 0.5 }} blurRadius={2} />
          <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
            <Pressable onPress={() => router.back()} style={iconBtn(colors)}><Ionicons name="arrow-back" size={20} color={colors.text} /></Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => Linking.openURL(game.store_links?.[0]?.url ?? 'https://gameshelf.app')} style={iconBtn(colors)}><Ionicons name="share-outline" size={20} color={colors.text} /></Pressable>
              <Pressable onPress={toggleFavourite} style={iconBtn(colors)}><Ionicons name={entry?.flag_preferito ? 'heart' : 'heart-outline'} size={20} color={entry?.flag_preferito ? colors.danger : colors.text} /></Pressable>
            </View>
          </SafeAreaView>
          <Text style={{ position: 'absolute', top: 56, alignSelf: 'center', color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{stateLabel}</Text>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: -60 }}>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <GameCover url={game.copertina_url} size="lg" style={{ borderWidth: 2, borderColor: colors.bg }} />
            <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 6 }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '900' }}>{game.titolo}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{subtitle}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Stars rating={game.rating} />
                {game.rating ? <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{game.rating} Meta</Text> : null}
              </View>
            </View>
          </View>

          {/* Status + diary row */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <Pressable onPress={cycleStatus} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: meta.color + '22', borderColor: meta.color, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: meta.color, fontWeight: '800', fontSize: 13 }}>{meta.icon} {meta.label}</Text>
              <Ionicons name="chevron-down" size={14} color={meta.color} />
            </Pressable>
            <Pressable onPress={toggleFavourite} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
              <Stars rating={entry?.flag_preferito ? 100 : 0} />
            </Pressable>
            {entry && (
              <Pressable onPress={() => router.push(`/diary/${entry.id_possesso}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="book-outline" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>DIARIO</Text>
              </Pressable>
            )}
          </View>

          {/* Add buttons when not owned */}
          {!entry && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => addToLibrary({ in_wishlist: 1 })} style={{ flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>♡ Wishlist</Text>
              </Pressable>
              <Pressable onPress={() => addToLibrary({ stato_avanzamento: 'da_iniziare' })} style={{ flex: 1, alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, padding: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>+ Aggiungi al Backlog</Text>
              </Pressable>
            </View>
          )}
          <Pressable onPress={addToFolder} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <Ionicons name="folder-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Aggiungi a una mensola</Text>
          </Pressable>

          {/* Description */}
          <Section title="Description" colors={colors}>
            <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }} numberOfLines={expanded ? undefined : 3}>
              {game.descrizione || 'Nessuna descrizione disponibile.'}
            </Text>
            {game.descrizione?.length > 120 && (
              <Pressable onPress={() => setExpanded((v) => !v)}><Text style={{ color: colors.primary, fontWeight: '700', marginTop: 4 }}>{expanded ? 'Leggi -' : 'Leggi +'}</Text></Pressable>
            )}
          </Section>

          {/* Store info */}
          {game.store_links?.length > 0 && (
            <Section title="Store info" colors={colors}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {game.store_links.map((s, i) => (
                  <Pressable key={i} onPress={() => Linking.openURL(s.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Ionicons name={STORE_ICON[s.store] ?? 'cart-outline'} size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{s.name}</Text>
                  </Pressable>
                ))}
              </View>
            </Section>
          )}

          {/* Achievements (Steam API) */}
          {community && community.total > 0 && (
            <Section title="Achievement (Steam API)" colors={colors}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{community.unlocked}/{community.total} Sbloccati</Text>
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{Math.round((community.unlocked / community.total) * 100)}%</Text>
              </View>
              <View style={{ height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4 }}>
                <View style={{ height: 8, width: `${(community.unlocked / community.total) * 100}%`, backgroundColor: colors.primary, borderRadius: 4 }} />
              </View>
            </Section>
          )}

          {/* Metadata grid */}
          <Section title="Dettagli" colors={colors}>
            <MetaRow label="Saga" value={game.id_saga ? (game.saga ?? '—') : '—'} colors={colors} />
            <MetaRow label="Time to beat" value={game.time_to_beat ? `${game.time_to_beat}h` : '—'} colors={colors} />
            <MetaRow label="Piattaforme" value={game.piattaforme?.join(', ') || '—'} colors={colors} />
            <MetaRow label="Lingue" value={game.lingue?.join(', ') || '—'} colors={colors} />
            {game.tags?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {game.tags.map((t) => <Pill key={t} color={colors.surfaceAlt} textColor={colors.textMuted}>{t}</Pill>)}
              </View>
            )}
          </Section>

          {entry && (
            <Pressable onPress={() => Alert.alert('Rimuovi', 'Rimuovere dalla libreria?', [
              { text: 'Annulla' },
              { text: 'Rimuovi', style: 'destructive', onPress: async () => { await api.removeEntry(entry.id_possesso); router.back(); } },
            ])} style={{ marginTop: 24, alignItems: 'center' }}>
              <Text style={{ color: colors.danger, fontWeight: '700' }}>Rimuovi dalla libreria</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, colors, children }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}

function MetaRow({ label, value, colors }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const iconBtn = (colors) => ({ backgroundColor: colors.surface + 'CC', borderRadius: 999, padding: 8 });
