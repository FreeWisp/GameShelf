import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { folderStore } from '../services/folderStore.js';

// Folder ("mensole") CRUD — backed by the HashMap store (req. 1.2).
const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json({ folders: folderStore.list(req.user.id) }));

router.post('/', (req, res) => {
  const { nome_cartella, emoji } = req.body ?? {};
  if (!nome_cartella) return res.status(400).json({ error: 'Nome cartella obbligatorio' });
  try { res.status(201).json({ folder: folderStore.create(req.user.id, nome_cartella, emoji) }); }
  catch (e) { res.status(409).json({ error: e.message }); }
});

// Reorder — must be declared before "/:name" so it isn't captured as a name.
router.patch('/reorder', (req, res) => {
  const { order } = req.body ?? {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order deve essere un array' });
  res.json({ folders: folderStore.reorder(req.user.id, order) });
});

router.patch('/:name', (req, res) => {
  const { nuovo_nome, emoji } = req.body ?? {};
  try {
    let folder;
    if (nuovo_nome) folder = folderStore.rename(req.user.id, req.params.name, nuovo_nome);
    if (emoji !== undefined) folder = folderStore.setEmoji(req.user.id, nuovo_nome || req.params.name, emoji);
    if (!folder) return res.status(400).json({ error: 'Niente da aggiornare' });
    res.json({ folder });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:name', (req, res) => {
  folderStore.remove(req.user.id, req.params.name);
  res.json({ ok: true });
});

router.post('/:name/games', (req, res) => {
  const { game } = req.body ?? {};
  if (!game?.id_gioco) return res.status(400).json({ error: 'Gioco non valido' });
  try { res.json({ folder: folderStore.addGame(req.user.id, req.params.name, game) }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.delete('/:name/games/:gameId', (req, res) => {
  try { res.json({ folder: folderStore.removeGame(req.user.id, req.params.name, Number(req.params.gameId)) }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

export default router;
