import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import db from '../db/index.js';
import queue from '../queue/messageQueue.js';
import { pushService } from '../services/pushService.js';
import { publicUser } from './auth.js';

const router = Router();
router.use(requireAuth);

// GET /profile/me
router.get('/me', (req, res) => {
  const u = db.prepare('SELECT * FROM Utente WHERE id_utente = ?').get(req.user.id);
  res.json({ user: publicUser(u) });
});

// PATCH /profile/me  — username, password, profile image, bio, ui prefs
router.patch('/me', (req, res) => {
  const { username, password, immagine_profilo, bio, preferenze_ui } = req.body ?? {};
  const updates = {};
  if (username) updates.username = username;
  if (immagine_profilo !== undefined) updates.immagine_profilo = immagine_profilo;
  if (bio !== undefined) updates.bio = bio;
  if (preferenze_ui) updates.preferenze_ui = JSON.stringify(preferenze_ui);
  if (password) updates.password_hash = bcrypt.hashSync(password, 10);

  const keys = Object.keys(updates);
  if (keys.length) {
    const set = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE Utente SET ${set} WHERE id_utente = @id`).run({ ...updates, id: req.user.id });
  }
  const u = db.prepare('SELECT * FROM Utente WHERE id_utente = ?').get(req.user.id);
  res.json({ user: publicUser(u) });
});

// POST /profile/steam-pair  { steamId } — pair the account with Steam and sync
router.post('/steam-pair', (req, res) => {
  const { steamId } = req.body ?? {};
  if (!steamId) return res.status(400).json({ error: 'steamId obbligatorio' });
  db.prepare('UPDATE Utente SET steam_id = ? WHERE id_utente = ?').run(steamId, req.user.id);
  const jobId = queue.enqueue('steam_sync', { userId: req.user.id, steamId });
  res.status(202).json({ ok: true, jobId });
});

// POST /profile/steam-unlink — remove the Steam pairing and the games it imported.
// (User-added games are untouched: only entries with store_acquisto = 'steam' go.)
router.post('/steam-unlink', (req, res) => {
  db.prepare('UPDATE Utente SET steam_id = NULL WHERE id_utente = ?').run(req.user.id);
  const info = db.prepare(
    "DELETE FROM Libreria_Utente WHERE id_utente = ? AND store_acquisto = 'steam'",
  ).run(req.user.id);
  res.json({ ok: true, removed: info.changes });
});

// POST /profile/push-token { token } — register this device for push
router.post('/push-token', (req, res) => {
  const { token } = req.body ?? {};
  try {
    pushService.register(req.user.id, token);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /profile/qr — synthetic data encoded into the profile QR code
router.get('/qr', (req, res) => {
  const u = db.prepare('SELECT * FROM Utente WHERE id_utente = ?').get(req.user.id);
  const stats = db.prepare(`SELECT
      SUM(CASE WHEN owned = 1 THEN 1 ELSE 0 END) AS posseduti,
      SUM(CASE WHEN owned = 1 AND stato_avanzamento='completato' THEN 1 ELSE 0 END) AS completati
    FROM Libreria_Utente WHERE id_utente = ?`).get(req.user.id);

  // A few representative titles (kept short so the QR stays easy to scan).
  const titles = (where) => db.prepare(
    `SELECT g.titolo FROM Libreria_Utente lu JOIN Gioco g ON g.id_gioco = lu.id_gioco
     WHERE lu.id_utente = ? AND ${where} ORDER BY lu.data_aggiunta DESC LIMIT 5`,
  ).all(req.user.id).map((r) => r.titolo);

  const payload = {
    type: 'gameshelf-profile',
    username: u.username,
    posseduti: stats.posseduti ?? 0,
    completati: stats.completati ?? 0,
    top_posseduti: titles('lu.owned = 1'),
    top_completati: titles("lu.owned = 1 AND lu.stato_avanzamento='completato'"),
  };
  res.json({ payload, encoded: JSON.stringify(payload) });
});

export default router;
