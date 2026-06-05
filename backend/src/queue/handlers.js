import queue from './messageQueue.js';
import db from '../db/index.js';
import { igdbService } from '../services/igdbService.js';
import { steamService } from '../services/steamService.js';
import { gameService } from '../services/gameService.js';
import { epicService } from '../services/epicService.js';
import { pushService } from '../services/pushService.js';

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

  // Pair / sync a user's Steam library (owned games) into their shelf.
  queue.register('steam_sync', async ({ userId, steamId }) => {
    const owned = await steamService.getOwnedGames(steamId);
    // Most-played first, so the richest titles get the (capped) IGDB enrichment.
    const sorted = [...owned].sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
    let linked = 0, enriched = 0;

    for (const o of sorted.slice(0, 60)) {
      let game = db.prepare('SELECT * FROM Gioco WHERE steam_appid = ?').get(o.appid);
      if (!game) {
        // Try to pull full IGDB metadata by title (best-effort, capped).
        let igdbData = null;
        if (igdbService.enabled && enriched < 40) {
          try {
            const results = await igdbService.search(o.name, 1);
            const top = results?.[0];
            if (top && top.titolo?.toLowerCase() === o.name.toLowerCase()) { igdbData = top; enriched++; }
          } catch { /* ignore IGDB hiccups */ }
        }
        game = gameService.upsert(igdbData ? { ...igdbData, steam_appid: o.appid } : {
          titolo: o.name, steam_appid: o.appid,
          // proper portrait capsule instead of the tiny pixelated icon
          copertina_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${o.appid}/library_600x900.jpg`,
          store_links: [{ store: 'steam', name: 'Steam', url: `https://store.steampowered.com/app/${o.appid}` }],
          popularity: Math.round((o.playtime_forever ?? 0) / 60),
        });
      }
      const id_gioco = game.id_gioco;
      const existing = db.prepare('SELECT * FROM Libreria_Utente WHERE id_utente=? AND id_gioco=?').get(userId, id_gioco);
      if (!existing) {
        db.prepare(`INSERT INTO Libreria_Utente (id_utente, id_gioco, store_acquisto, stato_avanzamento, owned)
                    VALUES (?, ?, 'steam', ?, 1)`).run(userId, id_gioco, o.playtime_forever > 0 ? 'in_corso' : 'da_iniziare');
        linked++;
      } else {
        // Reconcile: Steam is the source of truth for OWNERSHIP. Re-assert
        // owned=1 and drop any contradictory wishlist flag, but PRESERVE the
        // user's own edits (status, favourite, notes, folders).
        db.prepare(`UPDATE Libreria_Utente SET owned = 1, in_wishlist = 0,
                    store_acquisto = COALESCE(store_acquisto, 'steam') WHERE id_possesso = ?`)
          .run(existing.id_possesso);
      }
    }
    return { owned: owned.length, linked, enriched };
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
    }
    return cache;
  });

  // Aggregate Steam news for a set of app ids (News tab). Keep only Latin-script
  // (Italian/English-ish) items — Steam returns posts in many languages.
  queue.register('steam_news', async ({ appids = [], count = 5 }) => {
    const all = [];
    for (const appid of appids) {
      try {
        const items = await steamService.getNewsForApp(appid, count);
        all.push(...items.map((n) => ({ ...n, appid })));
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
