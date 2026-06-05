import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { openLink } from '../../src/lib/links';
import { useTheme } from '../../src/context/ThemeContext';
import { GameCover, Pill, Stars, STATUS_META, STATUS_ORDER } from '../../src/components/common';

const STORE_ICON = {
  steam: 'logo-steam', epic: 'game-controller', gog: 'game-controller',
  microsoft: 'logo-windows', playstation: 'logo-playstation', nintendo: 'game-controller',
  official: 'globe-outline',
};

export default function GameDetail() {
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const router = useRouter();
  const [game, setGame] = useState(null);
  const [entry, setEntry] = useState(null);   // library entry if owned
  const [expanded, setExpanded] = useState(false);
  const [descLines, setDescLines] = useState(0); // true line count of the description
  const [loading, setLoading] = useState(true);
  const triedCommunity = useRef(false);
  const DESC_MAX_LINES = 4;

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

  // Status picker (also lets you remove the game from "posseduti").
  const chooseStatus = () => Alert.alert('Stato del gioco', game?.titolo, [
    ...STATUS_ORDER.map((s) => ({
      text: `${STATUS_META[s].icon} ${STATUS_META[s].label}`,
      onPress: () => mutate({ owned: true, stato_avanzamento: s }),
    })),
    { text: '✕ Non lo possiedo più', style: 'destructive', onPress: removeFromBacklog },
    { text: 'Annulla', style: 'cancel' },
  ]);

  const shareGame = () => Share.share({
    message: `${game.titolo}${game.publisher ? ` (${game.publisher})` : ''} — scoperto con GameShelf`,
    url: game.store_links?.[0]?.url ?? undefined,
  }).catch(() => {});

  const openMetacritic = () => openLink(`https://www.metacritic.com/search/${encodeURIComponent(game.titolo)}/`);

  const addToFolder = async () => {
    try {
      const { folders } = await api.folders();
      if (!folders.length) {
        return Alert.alert('Nessuna mensola', 'Non hai ancora mensole. Vuoi crearne una?', [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Crea mensola', onPress: () => router.push('/(tabs)') },
        ]);
      }
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
  if (entry?.owned) chips.push({ label: meta.label + (entry.store_acquisto ? ` · ${entry.store_acquisto.toUpperCase()}` : ''), color: meta.color });
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
            <Pressable onPress={shareGame} style={iconBtn(colors)}><Ionicons name="share-outline" size={20} color={colors.text} /></Pressable>
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
              <Pressable onPress={openMetacritic} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Stars rating={game.rating} />
                {game.rating ? <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{game.rating} Meta ›</Text>
                  : <Text style={{ color: colors.textMuted, fontSize: 12 }}>Vota su Metacritic ›</Text>}
              </Pressable>
            </View>
          </View>

          {/* Ownership / status: dropdown if owned, otherwise an "add to backlog" button */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' }}>
            {entry?.owned ? (
              <Pressable onPress={chooseStatus} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: meta.color + '22', borderColor: meta.color, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
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

          {/* Wishlist / Preferito — mutually exclusive with each other and with
              ownership, so we only show the toggles that make sense:
              · owned game  -> no wishlist (you can't wish for what you own)
              · wishlist game -> no preferito (a wish isn't a favourite yet) */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            {!entry?.owned && (
              <ToggleButton
                active={!!entry?.in_wishlist} onPress={toggleWishlist} colors={colors}
                icon={entry?.in_wishlist ? 'bookmark' : 'bookmark-outline'} activeColor="#3B82F6"
                label={entry?.in_wishlist ? 'In Wishlist' : 'Wishlist'} />
            )}
            {!entry?.in_wishlist && (
              <ToggleButton
                active={!!entry?.flag_preferito} onPress={toggleFavourite} colors={colors}
                icon={entry?.flag_preferito ? 'heart' : 'heart-outline'} activeColor={colors.danger}
                label={entry?.flag_preferito ? 'Preferito' : 'Aggiungi ai preferiti'} />
            )}
          </View>

          <Pressable onPress={addToFolder} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <Ionicons name="folder-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Aggiungi a una mensola</Text>
          </Pressable>

          {/* Descrizione — "Leggi tutto" appears only when the text is actually truncated */}
          <Section title="Descrizione" colors={colors}>
            <View>
              {/* hidden measurer: reports the real number of lines */}
              <Text
                style={{ position: 'absolute', left: 0, right: 0, opacity: 0, fontSize: 14, lineHeight: 20 }}
                onTextLayout={(e) => setDescLines(e.nativeEvent.lines.length)}>
                {game.descrizione || 'Nessuna descrizione disponibile.'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }} numberOfLines={expanded ? undefined : DESC_MAX_LINES}>
                {game.descrizione || 'Nessuna descrizione disponibile.'}
              </Text>
            </View>
            {descLines > DESC_MAX_LINES && (
              <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontWeight: '700', marginTop: 6 }}>{expanded ? 'Leggi meno ▲' : 'Leggi tutto ▼'}</Text>
              </Pressable>
            )}
          </Section>

          {/* Store */}
          {game.store_links?.length > 0 && (
            <Section title="Dove trovarlo" colors={colors}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {game.store_links.map((s, i) => (
                  <Pressable key={i} onPress={() => openLink(s.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Ionicons name={STORE_ICON[s.store] ?? 'cart-outline'} size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{s.name}</Text>
                  </Pressable>
                ))}
              </View>
            </Section>
          )}

          {/* Obiettivi (Steam) */}
          {community && community.total > 0 && (
            <Section title="Obiettivi (Steam)" colors={colors}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{community.unlocked}/{community.total} Sbloccati</Text>
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{Math.round((community.unlocked / community.total) * 100)}%</Text>
              </View>
              <View style={{ height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4 }}>
                <View style={{ height: 8, width: `${(community.unlocked / community.total) * 100}%`, backgroundColor: colors.primary, borderRadius: 4 }} />
              </View>
              {community.achievements?.some((a) => a.icon) && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>
                  {[...community.achievements].sort((a, b) => (b.achieved ? 1 : 0) - (a.achieved ? 1 : 0)).map((a) => (
                    <Pressable key={a.apiname} onPress={() => Alert.alert(a.name, a.achieved ? 'Sbloccato ✓' : 'Non ancora sbloccato')}>
                      <Image source={{ uri: a.icon }} style={{ width: 44, height: 44, borderRadius: 8, opacity: a.achieved ? 1 : 0.45,
                        borderWidth: a.achieved ? 1.5 : 0, borderColor: colors.accent }} />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </Section>
          )}

          {/* Metadata grid */}
          <Section title="Dettagli" colors={colors}>
            <MetaRow label="Saga" value={game.id_saga ? (game.saga ?? '—') : '—'} colors={colors} />
            <MetaRow label="Tempo per finirlo" value={game.time_to_beat ? `${game.time_to_beat}h` : '—'} colors={colors} />
            <MetaRow label="Piattaforme" value={game.piattaforme?.join(', ') || '—'} colors={colors} />
            <MetaRow label="Lingue" value={game.lingue?.join(', ') || '—'} colors={colors} />
            {game.tags?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {game.tags.map((t) => <Pill key={t} color={colors.surfaceAlt} textColor={colors.textMuted}>{t}</Pill>)}
              </View>
            )}
          </Section>

          {entry && (entry.owned || entry.in_wishlist || entry.flag_preferito) && (
            <Pressable onPress={() => Alert.alert('Rimuovi', 'Rimuovere il gioco dalla tua libreria (posseduto/wishlist/preferiti)?', [
              { text: 'Annulla', style: 'cancel' },
              // Clear all flags; the backend keeps Steam-linked entries so their
              // achievements stay visible. We STAY on the game page.
              { text: 'Rimuovi', style: 'destructive', onPress: () => mutate({ owned: false, in_wishlist: false, flag_preferito: false }) },
            ])} style={{ marginTop: 24, alignItems: 'center' }}>
              <Text style={{ color: colors.danger, fontWeight: '700' }}>Rimuovi dalla libreria</Text>
            </Pressable>
          )}
          {entry && !entry.owned && !entry.in_wishlist && !entry.flag_preferito && entry.community_cache?.achievements?.total > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 20 }}>
              Non lo possiedi più — gli obiettivi Steam restano comunque visibili.
            </Text>
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
