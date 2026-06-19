import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { folderStore } from '../services/folderStore.js';

// Folder ("mensole") CRUD — backed by the HashMap store (req. 1.2).
// Folders are addressed by numeric id, so any name (".", "/", "\", emoji…) is safe.
const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json({ folders: folderStore.list(req.user.id) }));

router.post('/', (req, res) => {
  const { nome_cartella, emoji } = req.body ?? {};
  if (!nome_cartella?.trim()) return res.status(400).json({ error: 'Nome cartella obbligatorio' });
  try { res.status(201).json({ folder: folderStore.create(req.user.id, nome_cartella.trim(), emoji) }); }
  catch (e) { res.status(409).json({ error: e.message }); }
});

// Reorder — declared before "/:id" so "reorder" isn't captured as an id.
router.patch('/reorder', (req, res) => {
  const { order } = req.body ?? {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order deve essere un array di id' });
  res.json({ folders: folderStore.reorder(req.user.id, order) });
});

router.get('/:id', (req, res) => {
  const folder = folderStore.getById(req.user.id, req.params.id);
  if (!folder) return res.status(404).json({ error: 'Cartella non trovata' });
  res.json({ folder });
});

router.patch('/:id', (req, res) => {
  const { nuovo_nome, emoji } = req.body ?? {};
  try {
    let folder;
    if (nuovo_nome?.trim()) folder = folderStore.renameById(req.user.id, req.params.id, nuovo_nome.trim());
    if (emoji !== undefined) folder = folderStore.setEmojiById(req.user.id, req.params.id, emoji);
    if (!folder) return res.status(400).json({ error: 'Niente da aggiornare' });
    res.json({ folder });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  folderStore.removeById(req.user.id, req.params.id);
  res.json({ ok: true });
});

router.post('/:id/games', (req, res) => {
  const { game } = req.body ?? {};
  if (!game?.id_gioco) return res.status(400).json({ error: 'Gioco non valido' });
  try { res.json({ folder: folderStore.addGameById(req.user.id, req.params.id, game) }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.delete('/:id/games/:gameId', (req, res) => {
  try { res.json({ folder: folderStore.removeGameById(req.user.id, req.params.id, Number(req.params.gameId)) }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

export default router;
