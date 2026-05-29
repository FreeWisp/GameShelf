import { Router } from 'express';
import db from '../db/index.js';
import queue from '../queue/messageQueue.js';

// News tab — Steam GetNewsForApp aggregated across popular / owned titles.
const router = Router();

router.get('/', async (req, res) => {
  // Use the steam_appids of the most popular catalogue games as news sources.
  const rows = db.prepare(
    'SELECT steam_appid FROM Gioco WHERE steam_appid IS NOT NULL ORDER BY popularity DESC LIMIT 8',
  ).all();
  const appids = rows.map((r) => r.steam_appid);
  if (appids.length === 0) return res.json({ news: [] });

  try {
    const result = await queue.enqueueAndWait('steam_news', { appids, count: 2 }, 25000);
    res.json({ news: result?.news ?? [] });
  } catch {
    res.json({ news: [], error: 'Servizio news non disponibile' });
  }
});

export default router;
