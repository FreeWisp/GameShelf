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
const migrations = [
  "ALTER TABLE Libreria_Utente ADD COLUMN community_cache TEXT DEFAULT '{}'",
  'ALTER TABLE Utente ADD COLUMN steam_id TEXT',
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) {
    if (!/duplicate column name/i.test(e.message)) throw e;
  }
}

export default db;
