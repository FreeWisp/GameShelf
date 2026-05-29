import { config, igdbEnabled } from '../config.js';
import { POPULAR_GAMES } from '../seed/popularGames.js';
import { rankByCloseness } from '../utils/levenshtein.js';

// ============================================================================
// IGDB integration (https://api-docs.igdb.com)
// Auth: Twitch OAuth client-credentials -> bearer token (cached).
// When credentials are missing the whole module degrades to the offline seed
// catalogue so the app keeps working.
// ============================================================================

let tokenCache = { token: null, expiresAt: 0 };
let inFlightToken = null;

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  if (inFlightToken) return inFlightToken;          // de-dupe concurrent refreshes

  inFlightToken = (async () => {
    const params = new URLSearchParams({
      client_id: config.igdb.clientId,
      client_secret: config.igdb.clientSecret,
      grant_type: 'client_credentials',
    });
    const res = await fetch(`${config.igdb.tokenUrl}?${params}`, { method: 'POST' });
    if (!res.ok) throw new Error(`IGDB token error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return tokenCache.token;
  })();

  try { return await inFlightToken; }
  finally { inFlightToken = null; }
}

async function igdbQuery(endpoint, body) {
  const token = await getToken();
  const res = await fetch(`${config.igdb.base}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': config.igdb.clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error(`IGDB ${endpoint} error ${res.status}: ${await res.text()}`);
  return res.json();
}

// IGDB website "type" enum -> our store identifiers.
// (IGDB deprecated the old `category` field; the enum now lives in `type`.)
const WEBSITE_TYPE = {
  1: { store: 'official', name: 'Sito ufficiale' },
  13: { store: 'steam', name: 'Steam' },
  15: { store: 'itch', name: 'itch.io' },
  16: { store: 'epic', name: 'Epic Games' },
  17: { store: 'gog', name: 'GOG' },
  22: { store: 'microsoft', name: 'Microsoft Store' },
  23: { store: 'playstation', name: 'PlayStation Store' },
  24: { store: 'nintendo', name: 'Nintendo eShop' },
};

function mapStores(websites = []) {
  return websites
    .map((w) => ({ meta: WEBSITE_TYPE[w.type ?? w.category], url: w.url }))
    .filter((w) => w.meta)
    .map((w) => ({ ...w.meta, url: w.url }));
}

function steamAppIdFrom(websites = []) {
  const steam = websites.find((w) => /store\.steampowered\.com\/app\/(\d+)/.test(w.url || ''));
  return steam ? Number(steam.url.match(/app\/(\d+)/)[1]) : null;
}

function mapIgdbGame(g, ttbHours) {
  const cover = g.cover?.image_id
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
    : null;
  return {
    igdb_id: g.id,
    titolo: g.name,
    publisher:
      g.involved_companies?.find((c) => c.publisher)?.company?.name ??
      g.involved_companies?.find((c) => c.developer)?.company?.name ??
      g.involved_companies?.[0]?.company?.name ?? null,
    data_pubblicazione: g.first_release_date
      ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : null,
    genere: g.genres?.map((x) => x.name).join(', ') ?? null,
    descrizione: g.summary ?? g.storyline ?? null,
    copertina_url: cover,
    saga: g.collection?.name ?? g.franchise?.name ?? null,
    store_links: mapStores(g.websites),
    lingue: [...new Set((g.language_supports ?? []).map((l) => l.language?.name).filter(Boolean))],
    tags: g.themes?.map((t) => t.name) ?? [],
    piattaforme: g.platforms?.map((p) => p.abbreviation || p.name).filter(Boolean) ?? [],
    time_to_beat: ttbHours ?? null,
    rating: g.total_rating ? Math.round(g.total_rating) : (g.rating ? Math.round(g.rating) : null),
    steam_appid: steamAppIdFrom(g.websites),
    popularity: Math.round(g.total_rating_count ?? g.follows ?? g.hypes ?? 0),
  };
}

const FIELDS =
  'fields name,summary,storyline,first_release_date,rating,total_rating,total_rating_count,follows,hypes,' +
  'cover.image_id,genres.name,themes.name,platforms.name,platforms.abbreviation,' +
  'collection.name,franchise.name,websites.url,websites.type,' +
  'language_supports.language.name,involved_companies.publisher,involved_companies.developer,involved_companies.company.name;';

// Fetch "time to beat" (seconds -> hours) for a set of IGDB game ids in one call.
async function fetchTimeToBeat(ids = []) {
  if (!ids.length) return {};
  try {
    const rows = await igdbQuery(
      'game_time_to_beats',
      `fields game_id,normally,hastily,completely; where game_id = (${ids.join(',')});`,
    );
    const map = {};
    for (const r of rows) {
      const secs = r.normally ?? r.completely ?? r.hastily;
      if (secs) map[r.game_id] = Math.round(secs / 3600);
    }
    return map;
  } catch {
    return {};   // endpoint optional; never fail the search because of it
  }
}

async function enrich(rows) {
  const ttb = await fetchTimeToBeat(rows.map((r) => r.id));
  return rows.map((r) => mapIgdbGame(r, ttb[r.id]));
}

export const igdbService = {
  enabled: igdbEnabled,

  /** Fuzzy search; falls back to Levenshtein over the seed catalogue offline. */
  async search(query, limit = 20) {
    if (!igdbEnabled) {
      return rankByCloseness(query, POPULAR_GAMES, (g) => g.titolo).slice(0, limit);
    }
    const safe = query.replace(/["\\]/g, '');
    // Note: IGDB deprecated the game `category` field, so we don't filter on it.
    // Results are ranked client-side by Levenshtein distance, so the exact title
    // surfaces on top even amongst editions/packs.
    const rows = await igdbQuery('games', `${FIELDS} search "${safe}"; limit ${limit};`);
    return enrich(rows);
  },

  /** Most popular games of the moment (recent + highly followed). */
  async popular(limit = 16) {
    if (!igdbEnabled) {
      return [...POPULAR_GAMES].sort((a, b) => b.popularity - a.popularity).slice(0, limit);
    }
    const sinceTwoYears = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 365 * 2;
    const rows = await igdbQuery(
      'games',
      `${FIELDS} sort total_rating_count desc;
       where total_rating_count != null & cover != null & first_release_date > ${sinceTwoYears};
       limit ${limit};`,
    );
    return enrich(rows);
  },

  async getById(igdbId) {
    if (!igdbEnabled) return POPULAR_GAMES.find((g) => g.igdb_id === igdbId) ?? null;
    const rows = await igdbQuery('games', `${FIELDS} where id = ${igdbId};`);
    if (!rows[0]) return null;
    return (await enrich(rows))[0];
  },
};
