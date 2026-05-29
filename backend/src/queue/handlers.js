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

  // Pair / sync a user's Steam library (owned + recently played) into their shelf.
  queue.register('steam_sync', async ({ userId, steamId }) => {
    const owned = await steamService.getOwnedGames(steamId);
    let linked = 0;
    for (const o of owned.slice(0, 60)) {
      // Match by steam_appid; if unknown, create a lightweight catalogue entry.
      let game = db.prepare('SELECT * FROM Gioco WHERE steam_appid = ?').get(o.appid);
      if (!game) {
        game = gameService.upsert({
          titolo: o.name, steam_appid: o.appid,
          copertina_url: o.img_icon_url
            ? `https://media.steampowered.com/steamcommunity/public/images/apps/${o.appid}/${o.img_icon_url}.jpg`
            : null,
          store_links: [{ store: 'steam', name: 'Steam', url: `https://store.steampowered.com/app/${o.appid}` }],
          popularity: Math.round((o.playtime_forever ?? 0) / 60),
        });
      }
      const id_gioco = game.id_gioco;
      const exists = db.prepare('SELECT 1 FROM Libreria_Utente WHERE id_utente=? AND id_gioco=?').get(userId, id_gioco);
      if (!exists) {
        db.prepare(`INSERT INTO Libreria_Utente (id_utente, id_gioco, store_acquisto, stato_avanzamento)
                    VALUES (?, ?, 'steam', ?)`).run(userId, id_gioco, o.playtime_forever > 0 ? 'in_corso' : 'da_iniziare');
        linked++;
      }
    }
    return { owned: owned.length, linked };
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

  // Aggregate Steam news for a set of app ids (News tab).
  queue.register('steam_news', async ({ appids = [], count = 3 }) => {
    const all = [];
    for (const appid of appids) {
      try {
        const items = await steamService.getNewsForApp(appid, count);
        all.push(...items.map((n) => ({ ...n, appid })));
      } catch { /* skip failing app */ }
    }
    all.sort((a, b) => b.date - a.date);
    return { news: all };
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
