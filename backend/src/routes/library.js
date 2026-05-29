import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import db from '../db/index.js';
import { gameService } from '../services/gameService.js';

const router = Router();
router.use(requireAuth);

const VALID_STATES = ['da_iniziare', 'in_corso', 'completato'];

function libraryEntry(row) {
  const game = gameService.getById(row.id_gioco);
  let community = {};
  try { community = JSON.parse(row.community_cache ?? '{}'); } catch { community = {}; }
  return {
    id_possesso: row.id_possesso,
    stato_avanzamento: row.stato_avanzamento,
    store_acquisto: row.store_acquisto,
    flag_preferito: !!row.flag_preferito,
    in_wishlist: !!row.in_wishlist,
    note_testuali: row.note_testuali,
    data_aggiunta: row.data_aggiunta,
    community_cache: community,
    game,
  };
}

// GET /library — the user's whole shelf (Home tab)
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM Libreria_Utente WHERE id_utente = ? ORDER BY data_aggiunta DESC')
    .all(req.user.id);
  res.json({ library: rows.map(libraryEntry) });
});

// POST /library  { id_gioco, store_acquisto?, stato_avanzamento?, in_wishlist? }
router.post('/', (req, res) => {
  const { id_gioco, store_acquisto, stato_avanzamento = 'da_iniziare', in_wishlist = 0 } = req.body ?? {};
  if (!gameService.getById(id_gioco)) return res.status(404).json({ error: 'Gioco non trovato' });
  const existing = db.prepare('SELECT * FROM Libreria_Utente WHERE id_utente=? AND id_gioco=?')
    .get(req.user.id, id_gioco);
  if (existing) return res.json({ entry: libraryEntry(existing) });

  const info = db.prepare(`INSERT INTO Libreria_Utente
    (id_utente, id_gioco, store_acquisto, stato_avanzamento, in_wishlist)
    VALUES (?, ?, ?, ?, ?)`).run(req.user.id, id_gioco, store_acquisto ?? null, stato_avanzamento, in_wishlist ? 1 : 0);
  const row = db.prepare('SELECT * FROM Libreria_Utente WHERE id_possesso = ?').get(info.lastInsertRowid);
  res.status(201).json({ entry: libraryEntry(row) });
});

// PATCH /library/:id  — update status / favourite / wishlist / notes / store
router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM Libreria_Utente WHERE id_possesso=? AND id_utente=?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Voce non trovata' });

  const { stato_avanzamento, flag_preferito, in_wishlist, note_testuali, store_acquisto } = req.body ?? {};
  if (stato_avanzamento && !VALID_STATES.includes(stato_avanzamento)) {
    return res.status(400).json({ error: 'Stato non valido' });
  }
  db.prepare(`UPDATE Libreria_Utente SET
    stato_avanzamento = COALESCE(?, stato_avanzamento),
    flag_preferito    = COALESCE(?, flag_preferito),
    in_wishlist       = COALESCE(?, in_wishlist),
    note_testuali     = COALESCE(?, note_testuali),
    store_acquisto    = COALESCE(?, store_acquisto)
    WHERE id_possesso = ?`).run(
    stato_avanzamento ?? null,
    flag_preferito === undefined ? null : (flag_preferito ? 1 : 0),
    in_wishlist === undefined ? null : (in_wishlist ? 1 : 0),
    note_testuali ?? null,
    store_acquisto ?? null,
    req.params.id,
  );
  const updated = db.prepare('SELECT * FROM Libreria_Utente WHERE id_possesso = ?').get(req.params.id);
  res.json({ entry: libraryEntry(updated) });
});

// DELETE /library/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM Libreria_Utente WHERE id_possesso=? AND id_utente=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------------- Diary (the "Diario" wireframe) ----------------

// GET /library/:id/diary
router.get('/:id/diary', (req, res) => {
  const own = db.prepare('SELECT 1 FROM Libreria_Utente WHERE id_possesso=? AND id_utente=?')
    .get(req.params.id, req.user.id);
  if (!own) return res.status(404).json({ error: 'Voce non trovata' });
  const notes = db.prepare('SELECT * FROM Diario WHERE id_possesso=? ORDER BY created_at DESC').all(req.params.id);
  res.json({ notes });
});

// POST /library/:id/diary  { testo, ore_giocate?, tag?, is_spoiler?, media_url?, media_tipo? }
router.post('/:id/diary', (req, res) => {
  const own = db.prepare('SELECT 1 FROM Libreria_Utente WHERE id_possesso=? AND id_utente=?')
    .get(req.params.id, req.user.id);
  if (!own) return res.status(404).json({ error: 'Voce non trovata' });
  const { testo, ore_giocate, tag, is_spoiler = 0, media_url, media_tipo } = req.body ?? {};
  if (!testo) return res.status(400).json({ error: 'Testo nota obbligatorio' });
  const info = db.prepare(`INSERT INTO Diario (id_possesso, testo, ore_giocate, tag, is_spoiler, media_url, media_tipo)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.params.id, testo, ore_giocate ?? null, tag ?? null, is_spoiler ? 1 : 0, media_url ?? null, media_tipo ?? null);
  res.status(201).json({ note: db.prepare('SELECT * FROM Diario WHERE id_nota = ?').get(info.lastInsertRowid) });
});

// DELETE /library/:id/diary/:noteId
router.delete('/:id/diary/:noteId', (req, res) => {
  db.prepare('DELETE FROM Diario WHERE id_nota = ?').run(req.params.noteId);
  res.json({ ok: true });
});

export default router;
