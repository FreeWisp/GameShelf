import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// --- lightweight idempotent migrations (for DBs created before a column existed) ---
// `after` runs only the first time the column is added (one-time backfill).
const migrations = [
  { sql: "ALTER TABLE Libreria_Utente ADD COLUMN community_cache TEXT DEFAULT '{}'" },
  { sql: 'ALTER TABLE Utente ADD COLUMN steam_id TEXT' },
  {
    sql: 'ALTER TABLE Libreria_Utente ADD COLUMN owned INTEGER DEFAULT 0',
    // Pre-existing entries that aren't wishlist were "owned" in the old model.
    after: 'UPDATE Libreria_Utente SET owned = 1 WHERE in_wishlist = 0',
  },
];
for (const m of migrations) {
  try {
    db.exec(m.sql);
    if (m.after) db.exec(m.after);
  } catch (e) {
    if (!/duplicate column name/i.test(e.message)) throw e;
  }
}

export default db;
