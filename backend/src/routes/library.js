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
    owned: !!row.owned,
    flag_preferito: !!row.flag_preferito,
    in_wishlist: !!row.in_wishlist,
    note_testuali: row.note_testuali,
    data_aggiunta: row.data_aggiunta,
    community_cache: community,
    game,
  };
}

const toBool = (v) => (v === undefined ? null : (v ? 1 : 0));

// Business rule:
//  - a POSSEDUTO game CAN be PREFERITO;
//  - a WISHLIST game is neither posseduto nor preferito.
// So: putting a game in wishlist clears owned+preferito; owning or favouriting
// a game removes it from the wishlist.
function applyExclusivity(cur, req) {
  let owned = (req.owned ?? cur.owned) ? true : false;
  let wish = (req.in_wishlist ?? cur.in_wishlist) ? true : false;
  let fav = (req.flag_preferito ?? cur.flag_preferito) ? true : false;
  if (req.in_wishlist === true) { owned = false; fav = false; }
  if (req.owned === true || req.flag_preferito === true) wish = false;
  if (wish && (owned || fav)) wish = false; // safety net when several change at once
  return { owned: owned ? 1 : 0, in_wishlist: wish ? 1 : 0, flag_preferito: fav ? 1 : 0 };
}

// Delete an entry that no longer represents any relationship (owned/wishlist/fav).
function cleanupIfEmpty(id) {
  const r = db.prepare('SELECT owned, in_wishlist, flag_preferito FROM Libreria_Utente WHERE id_possesso = ?').get(id);
  if (r && !r.owned && !r.in_wishlist && !r.flag_preferito) {
    db.prepare('DELETE FROM Libreria_Utente WHERE id_possesso = ?').run(id);
    return true;
  }
  return false;
}

// GET /library — the user's whole shelf (Home tab)
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM Libreria_Utente WHERE id_utente = ? ORDER BY data_aggiunta DESC')
    .all(req.user.id);
  res.json({ library: rows.map(libraryEntry) });
});

// POST /library  { id_gioco, owned?, in_wishlist?, flag_preferito?, stato_avanzamento?, store_acquisto? }
// Ensures an entry exists and applies the given flags. With no flags → owned.
router.post('/', (req, res) => {
  const { id_gioco, owned, in_wishlist, flag_preferito, stato_avanzamento = 'da_iniziare', store_acquisto } = req.body ?? {};
  if (!gameService.getById(id_gioco)) return res.status(404).json({ error: 'Gioco non trovato' });

  const existing = db.prepare('SELECT * FROM Libreria_Utente WHERE id_utente=? AND id_gioco=?')
    .get(req.user.id, id_gioco);

  const noFlags = owned === undefined && in_wishlist === undefined && flag_preferito === undefined;
  const cur = existing ?? { owned: 0, in_wishlist: 0, flag_preferito: 0 };
  const want = { owned, in_wishlist, flag_preferito };
  if (!existing && noFlags) want.owned = true; // default: add to backlog
  const f = applyExclusivity(cur, want);

  if (!existing) {
    db.prepare(`INSERT INTO Libreria_Utente
      (id_utente, id_gioco, store_acquisto, stato_avanzamento, owned, in_wishlist, flag_preferito)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, id_gioco, store_acquisto ?? null, stato_avanzamento,
      f.owned, f.in_wishlist, f.flag_preferito,
    );
  } else {
    db.prepare(`UPDATE Libreria_Utente SET owned=?, in_wishlist=?, flag_preferito=?, store_acquisto=COALESCE(?, store_acquisto)
      WHERE id_possesso = ?`).run(f.owned, f.in_wishlist, f.flag_preferito, store_acquisto ?? null, existing.id_possesso);
  }
  const row = db.prepare('SELECT * FROM Libreria_Utente WHERE id_utente=? AND id_gioco=?').get(req.user.id, id_gioco);
  if (cleanupIfEmpty(row.id_possesso)) return res.json({ entry: null, deleted: true });
  res.status(existing ? 200 : 201).json({ entry: libraryEntry(db.prepare('SELECT * FROM Libreria_Utente WHERE id_possesso=?').get(row.id_possesso)) });
});

// PATCH /library/:id  — update owned / status / favourite / wishlist / notes / store
router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM Libreria_Utente WHERE id_possesso=? AND id_utente=?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Voce non trovata' });

  const { stato_avanzamento, owned, flag_preferito, in_wishlist, note_testuali, store_acquisto } = req.body ?? {};
  if (stato_avanzamento && !VALID_STATES.includes(stato_avanzamento)) {
    return res.status(400).json({ error: 'Stato non valido' });
  }
  const f = applyExclusivity(row, { owned, in_wishlist, flag_preferito });
  db.prepare(`UPDATE Libreria_Utente SET
    stato_avanzamento = COALESCE(?, stato_avanzamento),
    owned = ?, flag_preferito = ?, in_wishlist = ?,
    note_testuali  = COALESCE(?, note_testuali),
    store_acquisto = COALESCE(?, store_acquisto)
    WHERE id_possesso = ?`).run(
    stato_avanzamento ?? null, f.owned, f.flag_preferito, f.in_wishlist,
    note_testuali ?? null, store_acquisto ?? null, req.params.id,
  );

  if (cleanupIfEmpty(req.params.id)) return res.json({ entry: null, deleted: true });
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

// PATCH /library/:id/diary/:noteId — edit an existing note
router.patch('/:id/diary/:noteId', (req, res) => {
  const own = db.prepare('SELECT 1 FROM Libreria_Utente WHERE id_possesso=? AND id_utente=?')
    .get(req.params.id, req.user.id);
  if (!own) return res.status(404).json({ error: 'Voce non trovata' });
  const { testo, ore_giocate, tag, is_spoiler } = req.body ?? {};
  if (testo !== undefined && !testo.trim()) return res.status(400).json({ error: 'Il testo non può essere vuoto' });
  db.prepare(`UPDATE Diario SET
    testo = COALESCE(?, testo), ore_giocate = ?, tag = ?, is_spoiler = COALESCE(?, is_spoiler),
    updated_at = datetime('now')
    WHERE id_nota = ? AND id_possesso = ?`).run(
    testo ?? null, ore_giocate ?? null, tag ?? null,
    is_spoiler === undefined ? null : (is_spoiler ? 1 : 0), req.params.noteId, req.params.id,
  );
  res.json({ note: db.prepare('SELECT * FROM Diario WHERE id_nota = ?').get(req.params.noteId) });
});

// DELETE /library/:id/diary/:noteId
router.delete('/:id/diary/:noteId', (req, res) => {
  db.prepare('DELETE FROM Diario WHERE id_nota = ?').run(req.params.noteId);
  res.json({ ok: true });
});

export default router;
