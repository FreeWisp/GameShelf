import express from 'express';
import cors from 'cors';
import { config, igdbEnabled } from './config.js';
import './db/index.js';
import queue from './queue/messageQueue.js';
import { registerHandlers } from './queue/handlers.js';

import authRoutes from './routes/auth.js';
import steamAuthRoutes from './routes/steamAuth.js';
import gamesRoutes from './routes/games.js';
import libraryRoutes from './routes/library.js';
import foldersRoutes from './routes/folders.js';
import newsRoutes from './routes/news.js';
import profileRoutes from './routes/profile.js';
import epicRoutes from './routes/epic.js';
import jobsRoutes from './routes/jobs.js';

registerHandlers();
queue.start();

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' })); // diary photos travel as base64

app.get('/health', (req, res) => res.json({
  ok: true,
  igdb: igdbEnabled ? 'live' : 'offline-seed',
  queue: queue.stats(),
}));

app.use('/auth/steam', steamAuthRoutes);   // OpenID flow (mount before /auth)
app.use('/auth', authRoutes);
app.use('/games', gamesRoutes);
app.use('/library', libraryRoutes);
app.use('/folders', foldersRoutes);
app.use('/news', newsRoutes);
app.use('/profile', profileRoutes);
app.use('/epic', epicRoutes);
app.use('/jobs', jobsRoutes);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Errore interno' });
});

// ---- Scheduler: periodic Epic free-games check (push) + job pruning ----
const EPIC_INTERVAL_MS = 1000 * 60 * 60 * 6; // every 6h
const PRUNE_INTERVAL_MS = 1000 * 60 * 60;     // hourly
function scheduleEpicCheck() {
  try { queue.enqueueOnce('epic_check', { silent: false }); } catch (e) { console.error('[epic] schedule error', e.message); }
}

app.listen(config.port, () => {
  console.log(`[GameShelf] backend in ascolto su http://localhost:${config.port}`);
  console.log(`[GameShelf] IGDB: ${igdbEnabled ? 'configurato (live)' : 'non configurato → uso seed offline'}`);
  // Run once shortly after boot, then on an interval.
  setTimeout(scheduleEpicCheck, 5000);
  setInterval(scheduleEpicCheck, EPIC_INTERVAL_MS);
  // Keep the job table tidy.
  queue.prune();
  setInterval(() => queue.prune(), PRUNE_INTERVAL_MS);
});
