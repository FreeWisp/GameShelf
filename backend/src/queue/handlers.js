import queue from './messageQueue.js';
import db from '../db/index.js';
import { igdbService } from '../services/igdbService.js';
import { steamService } from '../services/steamService.js';
import { gameService } from '../services/gameService.js';
import { epicService } from '../services/epicService.js';
import { pushService } from '../services/pushService.js';
import { similarity } from '../utils/levenshtein.js';

/**
 * Register every long-running / external-facing task as a queue handler.
 * Routes never call IGDB/Steam directly — they enqueue one of these messages,
 * which lets the worker pool level the load on the downstream services.
 */
export function registerHandlers() {
  // Populate the catalogue with the most popular games (first user / refresh).
  queue.register('populate_popular', async ({ limit = 16 }) => {
    const games = await igdbService.popular(limit);
    const saved = games.map((g) => gameService.upsert(g));
    return { inserted: saved.length };
  });

  // Search IGDB for a query and persist the results into the shared catalogue.
  queue.register('igdb_search', async ({ query, limit = 20 }) => {
    const games = await igdbService.search(query, limit);
    const saved = games.map((g) => gameService.upsert(g));
    return { games: saved };
  });

  // Typo-recovery probe ("forse cercavi…"): prefix-based IGDB lookup, results
  // persisted so the catalogue keeps growing.
  queue.register('igdb_suggest', async ({ query, limit = 10 }) => {
    const games = await igdbService.suggest(query, limit);
    const saved = games.map((g) => gameService.upsert(g));
    return { games: saved };
  });

  // Pair / sync a user's Steam library (owned games) into their shelf.
  queue.register('steam_sync', async ({ userId, steamId }) => {
    // Privacy detection: a private profile (or private "game details") makes
    // games, stats and achievements inaccessible — the app surfaces a warning.
    let privacy = 'public';
    try {
      const summary = await steamService.getPlayerSummary(steamId);
      if (summary && summary.communityvisibilitystate !== 3) privacy = 'profile_private';
    } catch { /* keep optimistic default */ }

    const { games: owned, accessible } = await steamService.getOwnedGames(steamId);
    if (privacy === 'public' && !accessible) privacy = 'games_private';
    db.prepare('UPDATE Utente SET steam_privacy = ? WHERE id_utente = ?').run(privacy, userId);

    // PHASE 1 (fast): link EVERY owned game right away using lightweight
    // catalogue entries (Steam capsule cover). No IGDB calls here, so even an
    // 85-game library syncs in seconds instead of a minute.
    let linked = 0;
    for (const o of owned) {
      let game = db.prepare('SELECT id_gioco FROM Gioco WHERE steam_appid = ?').get(o.appid);
      if (!game) {
        game = gameService.upsert({
          titolo: o.name, steam_appid: o.appid,
          // proper portrait capsule instead of the tiny pixelated icon
          copertina_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${o.appid}/library_600x900.jpg`,
          store_links: [{ store: 'steam', name: 'Steam', url: `https://store.steampowered.com/app/${o.appid}` }],
          popularity: Math.round((o.playtime_forever ?? 0) / 60),
        });
      }
      const existing = db.prepare('SELECT 1 FROM Libreria_Utente WHERE id_utente=? AND id_gioco=?').get(userId, game.id_gioco);
      // NON-DESTRUCTIVE sync: only add genuinely new games. Existing entries are
      // left untouched — the user's choices always win over the Steam default
      // (status, "non lo possiedo più", favourite, wishlist, notes are kept).
      if (!existing) {
        db.prepare(`INSERT INTO Libreria_Utente (id_utente, id_gioco, store_acquisto, stato_avanzamento, owned, status_auto)
                    VALUES (?, ?, 'steam', ?, 1, 1)`).run(userId, game.id_gioco, o.playtime_forever > 0 ? 'in_corso' : 'da_iniziare');
        linked++;
      }
    }

    // PHASE 2 (background): IGDB metadata enrichment runs as a separate job so
    // the sync the user is waiting on stays fast.
    queue.enqueueOnce('steam_enrich', { limit: 40 });

    return { owned: owned.length, linked, privacy };
  });

  // Fill IGDB metadata for catalogue rows created by Steam syncs (igdb_id still
  // NULL). Newest first; upsert matches by steam_appid so rows update in place.
  queue.register('steam_enrich', async ({ limit = 40 }) => {
    if (!igdbService.enabled) return { enriched: 0 };
    const rows = db.prepare(
      `SELECT id_gioco, titolo, steam_appid FROM Gioco
       WHERE steam_appid IS NOT NULL AND igdb_id IS NULL
       ORDER BY id_gioco DESC LIMIT ?`,
    ).all(limit);

    const norm = (s = '') => s.replace(/[™®©]/g, '').trim().toLowerCase();
    let enriched = 0;
    for (const row of rows) {
      try {
        const results = await igdbService.search(row.titolo, 1);
        const top = results?.[0];
        if (top && (norm(top.titolo) === norm(row.titolo) || similarity(norm(top.titolo), norm(row.titolo)) >= 0.85)) {
          gameService.upsert({ ...top, steam_appid: row.steam_appid });
          enriched++;
        }
      } catch { /* best effort, keep going */ }
    }
    return { candidates: rows.length, enriched };
  });

  // Fetch & cache per-user Steam community data (stats + achievements) for a game.
  queue.register('steam_community', async ({ steamId, appid, id_gioco, userId }) => {
    const [ach, stats] = await Promise.all([
      steamService.getPlayerAchievements(steamId, appid),
      steamService.getUserStatsForGame(steamId, appid).catch(() => null),
    ]);
    const cache = { achievements: ach, stats, fetchedAt: new Date().toISOString() };
    if (userId && id_gioco) {
      db.prepare('UPDATE Libreria_Utente SET community_cache = ? WHERE id_utente = ? AND id_gioco = ?')
        .run(JSON.stringify(cache), userId, id_gioco);

      // 100% achievements -> mark as "Completato", but ONLY if the status is
      // still the automatic one (never overwrite the user's manual choice).
      if (ach.total > 0 && ach.unlocked === ach.total) {
        db.prepare(`UPDATE Libreria_Utente SET stato_avanzamento = 'completato'
                    WHERE id_utente = ? AND id_gioco = ? AND owned = 1 AND status_auto = 1`)
          .run(userId, id_gioco);
      }
    }
    return cache;
  });

  // Aggregate Steam news for a set of app ids (News tab). Keep only Latin-script
  // (Italian/English-ish) items — Steam returns posts in many languages. Each
  // item carries the catalogue game it belongs to (tag shown in the app).
  queue.register('steam_news', async ({ appids = [], count = 5 }) => {
    const gameByAppid = {};
    for (const appid of appids) {
      const g = db.prepare('SELECT id_gioco, titolo FROM Gioco WHERE steam_appid = ?').get(appid);
      if (g) gameByAppid[appid] = g;
    }

    const all = [];
    for (const appid of appids) {
      try {
        const items = await steamService.getNewsForApp(appid, count);
        all.push(...items.map((n) => ({
          ...n,
          appid,
          gioco: gameByAppid[appid]?.titolo ?? null,
          id_gioco: gameByAppid[appid]?.id_gioco ?? null,
        })));
      } catch { /* skip failing app */ }
    }
    const isLatin = (s = '') => {
      const text = s.replace(/<[^>]+>/g, '');
      // drop posts containing Cyrillic / CJK / Greek / Arabic etc.
      return !/[Ѐ-ӿ一-鿿぀-ヿͰ-Ͽ؀-ۿ가-힯]/.test(text);
    };
    const filtered = all.filter((n) => isLatin(`${n.title} ${n.contents}`));
    filtered.sort((a, b) => b.date - a.date);
    return { news: filtered };
  });

  // Check Epic free games; push-notify about titles we haven't announced yet.
  queue.register('epic_check', async ({ silent = false } = {}) => {
    const { free, upcoming } = await epicService.fetchPromotions();
    const fresh = free.filter(
      (g) => !db.prepare('SELECT 1 FROM epic_seen WHERE epic_id = ?').get(g.id),
    );

    let push = { sent: 0 };
    if (!silent && fresh.length) {
      const titles = fresh.map((g) => g.title).join(', ');
      push = await pushService.broadcast({
        title: '🎁 Nuovi giochi gratis su Epic!',
        body: fresh.length === 1 ? `${titles} è gratis ora su Epic Games.` : `Gratis ora: ${titles}`,
        data: { type: 'epic_free', games: fresh },
      }).catch((e) => ({ sent: 0, error: e.message }));
    }

    for (const g of fresh) {
      db.prepare('INSERT OR IGNORE INTO epic_seen (epic_id, title) VALUES (?, ?)').run(g.id, g.title);
    }
    return { free, upcoming, newCount: fresh.length, push };
  });
}
