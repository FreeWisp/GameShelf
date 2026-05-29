import { Router } from 'express';
import queue from '../queue/messageQueue.js';

const router = Router();

// GET /epic/free — current & upcoming Epic free games (via the queue).
router.get('/free', async (req, res) => {
  try {
    const result = await queue.enqueueAndWait('epic_check', { silent: true }, 20000);
    res.json({ free: result?.free ?? [], upcoming: result?.upcoming ?? [] });
  } catch (e) {
    res.json({ free: [], upcoming: [], error: e.message });
  }
});

// POST /epic/check — force a check that also fires push notifications.
router.post('/check', (req, res) => {
  const jobId = queue.enqueueOnce('epic_check', { silent: false });
  res.status(202).json({ jobId, deduped: jobId === null });
});

export default router;
