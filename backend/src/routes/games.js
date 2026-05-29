import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { gameService } from '../services/gameService.js';
import { similarity } from '../utils/levenshtein.js';
import db from '../db/index.js';
import queue from '../queue/messageQueue.js';

const router = Router();

// Suggest a correction ("forse cercavi…") only when the query looks like a typo:
// no result actually contains the query, but the closest title is similar enough.
function didYouMean(query, results) {
  const q = query.toLowerCase().trim();
  if (!results.length) return null;
  const found = results.some((g) => {
    const t = g.titolo.toLowerCase();
    return t === q || t.includes(q);
  });
  if (found) return null;
  const top = results[0];
  return similarity(q, top.titolo) >= 0.5 ? top.titolo : null;
}

// GET /games/popular — most popular games (populated via the queue on first use)
router.get('/popular', async (req, res) => {
  const limit = Number(req.query.limit ?? 16);
  if (gameService.count() === 0) {
    // First user of the system: populate the catalogue through the queue.
    try { await queue.enqueueAndWait('populate_popular', { limit }); } catch { /* fall through */ }
  } else {
    // Refresh asynchronously (fire-and-forget); skip if one is already pending.
    queue.enqueueOnce('populate_popular', { limit });
  }
  res.json({ games: gameService.popularFromDb(limit) });
});

/**
 * GET /games/search?q=...
 * 1. Search the shared catalogue with Levenshtein fuzzy matching (req. 4).
 * 2. If nothing is close enough, enqueue an IGDB fetch (queue-based load
 *    leveling) to enrich the DB, then return the freshly stored results.
 */
router.get('/search', async (req, res) => {
  const q = (req.query.q ?? '').toString().trim();
  if (!q) return res.json({ games: [], source: 'empty' });

  const local = gameService.searchLocal(q);
  if (!local.needsRemote && local.results.length) {
    return res.json({
      games: local.results, bestMatch: local.bestMatch,
      didYouMean: didYouMean(q, local.results), source: 'catalogue',
    });
  }

  try {
    const result = await queue.enqueueAndWait('igdb_search', { query: q });
    const games = (result?.games ?? []);
    // Re-run local search so the response is ranked by edit distance too.
    const ranked = gameService.searchLocal(q);
    const finalGames = ranked.results.length ? ranked.results : games;
    return res.json({
      games: finalGames,
      bestMatch: ranked.bestMatch ?? finalGames[0] ?? null,
      didYouMean: didYouMean(q, finalGames),
      source: 'igdb',
    });
  } catch (err) {
    // Queue/IGDB failed — degrade gracefully to whatever the catalogue has.
    return res.json({
      games: local.results, bestMatch: local.bestMatch,
      didYouMean: didYouMean(q, local.results), source: 'catalogue-fallback',
    });
  }
});

// GET /games/:id — full detail card
router.get('/:id', (req, res) => {
  const game = gameService.getById(Number(req.params.id));
  if (!game) return res.status(404).json({ error: 'Gioco non trovato' });
  res.json({ game });
});

// POST /games/:id/community — fetch & cache Steam community data (requires pairing)
router.post('/:id/community', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT steam_id FROM Utente WHERE id_utente = ?').get(req.user.id);
  const game = gameService.getById(Number(req.params.id));
  if (!game?.steam_appid) return res.status(400).json({ error: 'Gioco senza appid Steam' });
  if (!user?.steam_id) return res.status(400).json({ error: 'Steam non collegato' });

  const jobId = queue.enqueue('steam_community', {
    steamId: user.steam_id, appid: game.steam_appid, id_gioco: game.id_gioco, userId: req.user.id,
  });
  res.status(202).json({ jobId });
});

export default router;
