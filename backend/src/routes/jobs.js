import { Router } from 'express';
import queue from '../queue/messageQueue.js';

// Inspect the Queue-based Load Leveling system: job status + live stats.
const router = Router();

router.get('/stats', (req, res) => res.json(queue.stats()));

router.get('/:id', (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job non trovato' });
  res.json({ job });
});

export default router;
