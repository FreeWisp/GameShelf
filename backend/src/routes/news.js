import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';
import { config } from '../config.js';
import queue from '../queue/messageQueue.js';

// News tab — Steam GetNewsForApp. If the request carries a valid JWT, news are
// PERSONALIZED on the user's own games (library or wishlist); otherwise we fall
// back to the most popular catalogue titles. Auth is optional on purpose.
const router = Router();

function userIdFrom(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, config.jwtSecret).id; } catch { return null; }
}

router.get('/', async (req, res) => {
  const userId = userIdFrom(req);
  let appids = [];
  let personalized = false;

  if (userId) {
    appids = db.prepare(
      `SELECT DISTINCT g.steam_appid FROM Libreria_Utente lu
       JOIN Gioco g ON g.id_gioco = lu.id_gioco
       WHERE lu.id_utente = ? AND g.steam_appid IS NOT NULL
         AND (lu.owned = 1 OR lu.in_wishlist = 1)
       ORDER BY lu.data_aggiunta DESC LIMIT 10`,
    ).all(userId).map((r) => r.steam_appid);
    personalized = appids.length > 0;
  }

  if (!appids.length) {
    appids = db.prepare(
      'SELECT steam_appid FROM Gioco WHERE steam_appid IS NOT NULL ORDER BY popularity DESC LIMIT 8',
    ).all().map((r) => r.steam_appid);
  }
  if (appids.length === 0) return res.json({ news: [], personalized: false });

  try {
    const result = await queue.enqueueAndWait('steam_news', { appids, count: 3 }, 25000);
    res.json({ news: result?.news ?? [], personalized });
  } catch {
    res.json({ news: [], personalized: false, error: 'Servizio news non disponibile' });
  }
});

export default router;
