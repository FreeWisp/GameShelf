import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import db from '../db/index.js';
import { config } from '../config.js';

/**
 * Queue-based Load Leveling
 * -------------------------
 * Bursty / spiky requests from clients (game searches, Steam syncs, popular
 * game refreshes) are NOT executed inline on the request thread. Instead they
 * are turned into *messages* placed on a durable queue (the `job_queue` table).
 *
 * A small pool of workers (the consumer) drains the queue at a CONTROLLED rate
 * — bounded concurrency + a minimum interval between external calls — so the
 * downstream services (IGDB, Steam) only ever see a smooth, leveled load even
 * when many users hit the system at once. This is the classic Queue-Based
 * Load Leveling pattern: the queue acts as a buffer/shock-absorber between
 * producers (HTTP layer) and the consumer (worker pool).
 */
class MessageQueue extends EventEmitter {
  constructor() {
    super();
    this.handlers = new Map();          // type -> async (payload) => result
    this.concurrency = config.queue.concurrency;
    this.minIntervalMs = config.queue.minIntervalMs;
    this.activeWorkers = 0;
    this.lastDispatch = 0;
    this.started = false;
    this.setMaxListeners(0);
  }

  register(type, handler) {
    this.handlers.set(type, handler);
    return this;
  }

  /** Producer side: place a message on the queue and return its id. */
  enqueue(type, payload = {}) {
    if (!this.handlers.has(type)) {
      throw new Error(`No handler registered for job type "${type}"`);
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO job_queue (id, type, payload, status) VALUES (?, ?, ?, 'queued')`,
    ).run(id, type, JSON.stringify(payload));
    this.emit('enqueued', id);
    log(`+ ${type} accodato (${short(id)})`);
    this._pump();
    return id;
  }

  getJob(id) {
    const row = db.prepare('SELECT * FROM job_queue WHERE id = ?').get(id);
    if (!row) return null;
    return {
      ...row,
      payload: safeParse(row.payload),
      result: row.result ? safeParse(row.result) : null,
    };
  }

  /** Is there already a queued/processing job of this type? (de-dup helper) */
  hasPending(type) {
    return !!db
      .prepare(`SELECT 1 FROM job_queue WHERE type = ? AND status IN ('queued','processing') LIMIT 1`)
      .get(type);
  }

  /** Enqueue only if no equivalent job is already pending; returns id or null. */
  enqueueOnce(type, payload = {}) {
    if (this.hasPending(type)) return null;
    return this.enqueue(type, payload);
  }

  /** Remove old finished jobs so the table doesn't grow unbounded. */
  prune(maxAgeHours = 24) {
    db.prepare(
      `DELETE FROM job_queue WHERE status IN ('done','failed')
       AND created_at < datetime('now', ?)`,
    ).run(`-${maxAgeHours} hours`);
  }

  /**
   * Convenience for endpoints that want request/response semantics on top of
   * the queue: enqueue then resolve once the worker has processed the job.
   */
  enqueueAndWait(type, payload = {}, timeoutMs = 20000) {
    const id = this.enqueue(type, payload);
    return this.waitFor(id, timeoutMs);
  }

  waitFor(id, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const existing = this.getJob(id);
      if (existing && (existing.status === 'done' || existing.status === 'failed')) {
        return finish(existing);
      }
      const timer = setTimeout(() => {
        this.off('completed', onComplete);
        reject(new Error('Job timed out'));
      }, timeoutMs);

      const onComplete = (jobId) => {
        if (jobId !== id) return;
        clearTimeout(timer);
        this.off('completed', onComplete);
        finish(this.getJob(id));
      };
      this.on('completed', onComplete);

      function finish(job) {
        if (job.status === 'failed') reject(new Error(job.error || 'Job failed'));
        else resolve(job.result);
      }
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    // Recover jobs that were mid-flight on a previous crash.
    db.prepare(`UPDATE job_queue SET status='queued' WHERE status='processing'`).run();
    this._pump();
    console.log(
      `[queue] started — concurrency=${this.concurrency}, minInterval=${this.minIntervalMs}ms`,
    );
  }

  /** Dispatch as many jobs as the concurrency budget allows. */
  _pump() {
    if (!this.started) return;
    while (this.activeWorkers < this.concurrency) {
      const job = db
        .prepare(`SELECT * FROM job_queue WHERE status='queued' ORDER BY created_at LIMIT 1`)
        .get();
      if (!job) break;

      // Rate-limit / load-level: never dispatch faster than minIntervalMs.
      const now = Date.now();
      const wait = Math.max(0, this.lastDispatch + this.minIntervalMs - now);
      this.lastDispatch = now + wait;

      db.prepare(`UPDATE job_queue SET status='processing', updated_at=datetime('now') WHERE id=?`).run(
        job.id,
      );
      this.activeWorkers++;
      log(
        `> ${job.type} avviato (${short(job.id)})`
        + `${wait > 0 ? `, differito di ${Math.round(wait)} ms` : ''}`
        + `, attivi ${this.activeWorkers}/${this.concurrency}`,
      );
      setTimeout(() => this._run(job), wait);
    }
  }

  async _run(job) {
    const handler = this.handlers.get(job.type);
    const t0 = process.hrtime.bigint();
    const elapsed = () => Math.round(Number(process.hrtime.bigint() - t0) / 1e6);
    try {
      const payload = safeParse(job.payload);
      const result = await handler(payload, job);
      db.prepare(
        `UPDATE job_queue SET status='done', result=?, attempts=attempts+1, updated_at=datetime('now') WHERE id=?`,
      ).run(JSON.stringify(result ?? null), job.id);
      log(`v ${job.type} completato (${short(job.id)}) in ${elapsed()} ms`);
    } catch (err) {
      log(`x ${job.type} FALLITO (${short(job.id)}) dopo ${elapsed()} ms: ${err?.message ?? err}`);
      db.prepare(
        `UPDATE job_queue SET status='failed', error=?, attempts=attempts+1, updated_at=datetime('now') WHERE id=?`,
      ).run(String(err?.message ?? err), job.id);
    } finally {
      this.activeWorkers--;
      this.emit('completed', job.id);
      this._pump();
    }
  }

  stats() {
    const rows = db
      .prepare(`SELECT status, COUNT(*) AS n FROM job_queue GROUP BY status`)
      .all();
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    return {
      concurrency: this.concurrency,
      minIntervalMs: this.minIntervalMs,
      activeWorkers: this.activeWorkers,
      byStatus,
    };
  }
}

// Compact queue log. Makes load levelling observable: when jobs pile up the
// dispatch line reports the delay imposed by the minimum interval.
const short = (id) => String(id).slice(0, 8);
function log(msg) {
  const clock = new Date().toTimeString().slice(0, 8);
  console.log(`${clock}  [queue] ${msg}`);
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export const queue = new MessageQueue();
export default queue;
