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

  /** Insert or update a game (by igdb_id) into the shared catalogue. */
  upsert(g) {
    const id_saga = getOrCreateSaga(g.saga);
    const existing = g.igdb_id
      ? db.prepare('SELECT id_gioco FROM Gioco WHERE igdb_id = ?').get(g.igdb_id)
      : db.prepare('SELECT id_gioco FROM Gioco WHERE titolo = ?').get(g.titolo);

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
        titolo=@titolo, publisher=@publisher, data_pubblicazione=@data_pubblicazione,
        genere=@genere, descrizione=@descrizione, copertina_url=@copertina_url, id_saga=@id_saga,
        store_links=@store_links, lingue=@lingue, tags=@tags, piattaforme=@piattaforme,
        time_to_beat=@time_to_beat, rating=@rating, steam_appid=@steam_appid, popularity=@popularity
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
   * Search the shared catalogue first. Uses Levenshtein edit-distance so that
   * mistyped titles still resolve to the closest stored game (req. 4).
   * Returns { results, bestMatch, needsRemote } — needsRemote tells the caller
   * (route) whether to enqueue an IGDB fetch to enrich the catalogue.
   */
  searchLocal(query, limit = 20) {
    const q = query.toLowerCase().trim();
    const all = db.prepare(SELECT_WITH_SAGA).all().map(rowToGame);
    if (all.length === 0) return { results: [], bestMatch: null, needsRemote: true };

    const ranked = rankByCloseness(query, all, (g) => g.titolo).slice(0, limit);
    const best = ranked[0];
    const bestSim = best ? similarity(query, best.titolo) : 0;

    // A "strong" catalogue hit means we can answer without touching IGDB:
    //   - a title equals the query, or contains it (e.g. "elden" -> "Elden Ring"), or
    //   - the query is essentially a whole title (a long title is a substring of
    //     the query, guarding against short titles like "Fort" matching "fortnite"), or
    //   - the closest title is almost identical (likely just a typo).
    // Otherwise the wanted game probably isn't stored yet, so we enrich from IGDB.
    const hasStrong = all.some((g) => {
      const t = g.titolo.toLowerCase();
      if (t === q) return true;
      if (q.length >= 3 && t.includes(q)) return true;
      if (t.length >= 4 && t.length >= q.length * 0.8 && q.includes(t)) return true;
      return false;
    });
    const needsRemote = !(hasStrong || bestSim >= 0.82);

    return { results: ranked, bestMatch: best ?? null, needsRemote };
  },
};
