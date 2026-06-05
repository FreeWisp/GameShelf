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
 * Returns results with IGDB-grade relevance. We query IGDB (via the load-
 * leveling queue), persist the results into the shared catalogue, and return
 * them IN IGDB's RELEVANCE ORDER — we no longer re-rank the whole catalogue by
 * edit distance (that produced unrelated results). A local substring search is
 * used as a fast path / offline fallback.
 */
router.get('/search', async (req, res) => {
  const q = (req.query.q ?? '').toString().trim();
  if (!q) return res.json({ games: [], source: 'empty' });

  // Fast path: if the catalogue already contains strong matches for the query
  // (title contains it) AND IGDB is off, answer locally. Otherwise hit IGDB.
  try {
    const result = await queue.enqueueAndWait('igdb_search', { query: q }, 25000);
    const games = result?.games ?? [];
    if (games.length) {
      return res.json({ games, bestMatch: games[0], didYouMean: didYouMean(q, games), source: 'igdb' });
    }
    // IGDB returned nothing (or disabled) → fall back to the local catalogue.
    const local = gameService.searchLocal(q);
    return res.json({
      games: local.results, bestMatch: local.bestMatch,
      didYouMean: didYouMean(q, local.results), source: 'catalogue',
    });
  } catch (err) {
    const local = gameService.searchLocal(q);
    return res.json({
      games: local.results, bestMatch: local.bestMatch,
      didYouMean: didYouMean(q, local.results), source: 'catalogue-fallback',
    });
  }
});

// GET /games/:id — full detail card (description served in Italian, cached)
router.get('/:id', async (req, res) => {
  const game = gameService.getById(Number(req.params.id));
  if (!game) return res.status(404).json({ error: 'Gioco non trovato' });
  try {
    const it = await gameService.ensureItalianDescription(game.id_gioco);
    if (it) game.descrizione = it;
  } catch { /* keep original on translation failure */ }
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
