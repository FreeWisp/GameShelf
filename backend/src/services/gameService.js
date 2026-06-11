import db from '../db/index.js';
import { rankByCloseness, similarity } from '../utils/levenshtein.js';
import { translateService } from './translateService.js';

const SELECT_WITH_SAGA =
  'SELECT g.*, s.nome_saga AS saga FROM Gioco g LEFT JOIN Saga s ON s.id_saga = g.id_saga';

// Guarantee a Steam store link when we know the appid (IGDB sometimes omits it),
// and drop duplicate store entries (same store).
function normalizeStoreLinks(links = [], steamAppid) {
  const out = [];
  const seen = new Set();
  for (const l of links) {
    if (!l?.url) continue;
    const key = `${l.store}|${l.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  if (steamAppid && !out.some((l) => l.store === 'steam')) {
    out.unshift({ store: 'steam', name: 'Steam', url: `https://store.steampowered.com/app/${steamAppid}` });
  }
  return out;
}

function getOrCreateSaga(nome) {
  if (!nome) return null;
  const existing = db.prepare('SELECT id_saga FROM Saga WHERE nome_saga = ?').get(nome);
  if (existing) return existing.id_saga;
  const info = db.prepare('INSERT INTO Saga (nome_saga) VALUES (?)').run(nome);
  return info.lastInsertRowid;
}

function rowToGame(row) {
  if (!row) return null;
  const j = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  return {
    ...row,
    store_links: j(row.store_links, []),
    lingue: j(row.lingue, []),
    tags: j(row.tags, []),
    piattaforme: j(row.piattaforme, []),
    community_cache: j(row.community_cache, {}),
  };
}

export const gameService = {
  rowToGame,

  /**
   * Insert or update a game into the shared catalogue.
   * Match order: igdb_id → steam_appid → exact title (case-insensitive).
   * The appid/title fallbacks are essential: games created by the Steam sync
   * have no igdb_id yet, and an IGDB search for the same game must UPDATE that
   * row (keeping every user's library/achievements) instead of duplicating it.
   */
  upsert(g) {
    const id_saga = getOrCreateSaga(g.saga);
    const existing =
      (g.igdb_id ? db.prepare('SELECT id_gioco FROM Gioco WHERE igdb_id = ?').get(g.igdb_id) : null)
      ?? (g.steam_appid ? db.prepare('SELECT id_gioco FROM Gioco WHERE steam_appid = ?').get(g.steam_appid) : null)
      ?? db.prepare('SELECT id_gioco FROM Gioco WHERE titolo = ? COLLATE NOCASE').get(g.titolo);

    const fields = {
      igdb_id: g.igdb_id ?? null,
      titolo: g.titolo,
      publisher: g.publisher ?? null,
      data_pubblicazione: g.data_pubblicazione ?? null,
      genere: g.genere ?? null,
      descrizione: g.descrizione ?? null,
      copertina_url: g.copertina_url ?? null,
      id_saga,
      store_links: JSON.stringify(normalizeStoreLinks(g.store_links ?? [], g.steam_appid)),
      lingue: JSON.stringify(g.lingue ?? []),
      tags: JSON.stringify(g.tags ?? []),
      piattaforme: JSON.stringify(g.piattaforme ?? []),
      time_to_beat: g.time_to_beat ?? null,
      rating: g.rating ?? null,
      steam_appid: g.steam_appid ?? null,
      popularity: g.popularity ?? 0,
    };

    if (existing) {
      db.prepare(`UPDATE Gioco SET
        igdb_id=COALESCE(@igdb_id, igdb_id),
        titolo=@titolo, publisher=@publisher, data_pubblicazione=@data_pubblicazione,
        descrizione_it=CASE WHEN descrizione IS NOT @descrizione THEN NULL ELSE descrizione_it END,
        genere=@genere, descrizione=@descrizione, copertina_url=@copertina_url, id_saga=@id_saga,
        store_links=@store_links, lingue=@lingue, tags=@tags, piattaforme=@piattaforme,
        time_to_beat=@time_to_beat, rating=@rating,
        steam_appid=COALESCE(@steam_appid, steam_appid), popularity=@popularity
        WHERE id_gioco=@id_gioco`).run({ ...fields, id_gioco: existing.id_gioco });
      return this.getById(existing.id_gioco);
    }
    const info = db.prepare(`INSERT INTO Gioco
      (igdb_id, titolo, publisher, data_pubblicazione, genere, descrizione, copertina_url, id_saga,
       store_links, lingue, tags, piattaforme, time_to_beat, rating, steam_appid, popularity)
      VALUES (@igdb_id,@titolo,@publisher,@data_pubblicazione,@genere,@descrizione,@copertina_url,@id_saga,
       @store_links,@lingue,@tags,@piattaforme,@time_to_beat,@rating,@steam_appid,@popularity)`).run(fields);
    return this.getById(info.lastInsertRowid);
  },

  getById(id) {
    return rowToGame(db.prepare(`${SELECT_WITH_SAGA} WHERE g.id_gioco = ?`).get(id));
  },

  // Translate the (English) IGDB description to Italian once and cache it.
  async ensureItalianDescription(id) {
    const row = db.prepare('SELECT descrizione, descrizione_it FROM Gioco WHERE id_gioco = ?').get(id);
    if (!row?.descrizione) return row?.descrizione_it ?? null;
    if (row.descrizione_it) return row.descrizione_it;
    const it = await translateService.toItalian(row.descrizione);
    db.prepare('UPDATE Gioco SET descrizione_it = ? WHERE id_gioco = ?').run(it, id);
    return it;
  },

  popularFromDb(limit = 16) {
    return db.prepare(`${SELECT_WITH_SAGA} ORDER BY g.popularity DESC LIMIT ?`)
      .all(limit).map(rowToGame);
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM Gioco').get().n;
  },

  /**
   * Local catalogue search — used only as the offline fallback (when IGDB is
   * disabled or returns nothing). Returns ONLY real matches: titles that
   * contain the query (ranked exact > prefix > contains > popularity). If there
   * are none, falls back to the closest Levenshtein matches but ONLY when very
   * similar (typo tolerance, req. 4) — never the whole catalogue.
   */
  searchLocal(query, limit = 20) {
    const q = query.toLowerCase().trim();
    const all = db.prepare(SELECT_WITH_SAGA).all().map(rowToGame);
    if (all.length === 0 || !q) return { results: [], bestMatch: null, needsRemote: true };

    const contains = all.filter((g) => g.titolo.toLowerCase().includes(q));
    let results;
    if (contains.length) {
      const rank = (t) => (t === q ? 0 : t.startsWith(q) ? 1 : 2);
      results = contains
        .sort((a, b) => {
          const ra = rank(a.titolo.toLowerCase()); const rb = rank(b.titolo.toLowerCase());
          return ra !== rb ? ra - rb : (b.popularity ?? 0) - (a.popularity ?? 0);
        })
        .slice(0, limit);
    } else {
      // typo tolerance: only keep genuinely close titles
      results = rankByCloseness(query, all, (g) => g.titolo)
        .filter((g) => similarity(query, g.titolo) >= 0.6)
        .slice(0, limit);
    }
    return { results, bestMatch: results[0] ?? null, needsRemote: results.length === 0 };
  },
};
