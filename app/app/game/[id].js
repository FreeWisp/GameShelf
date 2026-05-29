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

  // Single mutation helper: PATCH if the entry exists (can also turn flags off and
  // auto-delete server-side), otherwise POST to create it with the given flags.
  const mutate = async (flags) => {
    if (entry) {
      const { entry: updated } = await api.updateEntry(entry.id_possesso, flags);
      setEntry(updated ?? null);
    } else {
      const { entry: created } = await api.addToLibrary({ id_gioco: Number(id), ...flags });
      setEntry(created);
    }
  };

  const toggleFavourite = () => mutate({ flag_preferito: !entry?.flag_preferito });
  const toggleWishlist = () => mutate({ in_wishlist: !entry?.in_wishlist });
  const addToBacklog = () => mutate({ owned: true, stato_avanzamento: entry?.stato_avanzamento ?? 'da_iniziare' });
  const removeFromBacklog = () => mutate({ owned: false });

  const cycleStatus = () => {
    const cur = entry?.stato_avanzamento ?? 'da_iniziare';
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(cur) + 1) % STATUS_ORDER.length];
    mutate({ owned: true, stato_avanzamento: next });
  };

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

  // Relationship chips shown at the top (a game can be several of these at once).
  const chips = [];
  if (entry?.owned) chips.push({ label: meta.label, color: meta.color });
  if (entry?.in_wishlist) chips.push({ label: 'IN WISHLIST', color: '#3B82F6' });
  if (entry?.flag_preferito) chips.push({ label: 'PREFERITO', color: colors.danger });
  if (!chips.length) chips.push({ label: 'DA CERCA', color: colors.textMuted });

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
          <View style={{ position: 'absolute', top: 52, alignSelf: 'center', flexDirection: 'row', gap: 6 }}>
            {chips.map((c) => (
              <View key={c.label} style={{ backgroundColor: c.color + '33', borderColor: c.color, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: c.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>{c.label}</Text>
              </View>
            ))}
          </View>
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

          {/* Ownership / status: dropdown if owned, otherwise an "add to backlog" button */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' }}>
            {entry?.owned ? (
              <Pressable onPress={cycleStatus} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: meta.color + '22', borderColor: meta.color, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ color: meta.color, fontWeight: '800', fontSize: 13 }}>{meta.icon} {meta.label}</Text>
                <Ionicons name="chevron-down" size={14} color={meta.color} />
              </Pressable>
            ) : (
              <Pressable onPress={addToBacklog} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>POSSEDUTO</Text>
              </Pressable>
            )}
            {entry?.owned && (
              <Pressable onPress={() => router.push(`/diary/${entry.id_possesso}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="book-outline" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>DIARIO</Text>
              </Pressable>
            )}
          </View>

          {/* Wishlist + Preferito toggles — independent, always visible */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <ToggleButton
              active={!!entry?.in_wishlist} onPress={toggleWishlist} colors={colors}
              icon={entry?.in_wishlist ? 'bookmark' : 'bookmark-outline'} activeColor="#3B82F6"
              label={entry?.in_wishlist ? 'In Wishlist' : 'Wishlist'} />
            <ToggleButton
              active={!!entry?.flag_preferito} onPress={toggleFavourite} colors={colors}
              icon={entry?.flag_preferito ? 'heart' : 'heart-outline'} activeColor={colors.danger}
              label={entry?.flag_preferito ? 'Preferito' : 'Aggiungi ai preferiti'} />
          </View>

          <Pressable onPress={addToFolder} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <Ionicons name="folder-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Aggiungi a una mensola</Text>
          </Pressable>
          {entry?.owned && (
            <Pressable onPress={removeFromBacklog} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Non lo possiedo più</Text>
            </Pressable>
          )}

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

function ToggleButton({ active, onPress, icon, label, activeColor, colors }) {
  return (
    <Pressable onPress={onPress}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 10, paddingVertical: 11, paddingHorizontal: 8, borderWidth: 1,
        backgroundColor: active ? activeColor + '22' : colors.surface,
        borderColor: active ? activeColor : colors.border,
      }}>
      <Ionicons name={icon} size={16} color={active ? activeColor : colors.text} />
      <Text numberOfLines={1} style={{ color: active ? activeColor : colors.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>
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
