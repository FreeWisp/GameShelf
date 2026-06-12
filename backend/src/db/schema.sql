-- ============================================================
-- GameShelf central database schema (SQLite)
-- Modelled on the provided Entity-Relationship diagram.
-- The DB is shared by ALL users / devices (centralized backend).
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------- Utente ----------
CREATE TABLE IF NOT EXISTS Utente (
  id_utente        INTEGER PRIMARY KEY AUTOINCREMENT,
  username         TEXT NOT NULL UNIQUE,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  bio              TEXT,
  immagine_profilo TEXT,
  preferenze_ui    TEXT DEFAULT '{"theme":"dark"}',   -- JSON
  steam_id         TEXT,                                -- set after Steam pairing
  steam_privacy    TEXT,    -- public | profile_private | games_private (set by steam_sync)
  created_at       TEXT DEFAULT (datetime('now'))
);

-- ---------- Saga ----------
CREATE TABLE IF NOT EXISTS Saga (
  id_saga   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_saga TEXT NOT NULL UNIQUE
);

-- ---------- Gioco ----------
-- The ER core fields are kept; the extra columns hold the metadata the
-- specification requires us to persist (store links, languages, tags,
-- platforms, time-to-beat, cached Steam community data ...).
CREATE TABLE IF NOT EXISTS Gioco (
  id_gioco          INTEGER PRIMARY KEY AUTOINCREMENT,
  igdb_id           INTEGER UNIQUE,
  titolo            TEXT NOT NULL,
  publisher         TEXT,            -- sviluppatore / publisher
  data_pubblicazione TEXT,           -- data di rilascio
  genere            TEXT,
  descrizione       TEXT,            -- originale (IGDB, in inglese)
  descrizione_it    TEXT,            -- traduzione italiana (cache, generata una volta)
  copertina_url     TEXT,            -- URL immagine
  id_saga           INTEGER REFERENCES Saga(id_saga),
  -- extra metadata required by the spec (stored as JSON text) --
  store_links       TEXT DEFAULT '[]',   -- [{store,name,url}]
  lingue            TEXT DEFAULT '[]',   -- supported languages
  tags              TEXT DEFAULT '[]',
  piattaforme       TEXT DEFAULT '[]',   -- supported platforms
  time_to_beat      INTEGER,             -- hours
  rating            REAL,                -- aggregate / metacritic-like
  steam_appid       INTEGER,             -- for Steam community calls
  community_cache   TEXT DEFAULT '{}',   -- cached Steam stats/achievements
  popularity        INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gioco_titolo ON Gioco(titolo);

-- ---------- Libreria_Utente (possession / shelf entry) ----------
CREATE TABLE IF NOT EXISTS Libreria_Utente (
  id_possesso       INTEGER PRIMARY KEY AUTOINCREMENT,
  id_utente         INTEGER NOT NULL REFERENCES Utente(id_utente) ON DELETE CASCADE,
  id_gioco          INTEGER NOT NULL REFERENCES Gioco(id_gioco)  ON DELETE CASCADE,
  stato_avanzamento TEXT DEFAULT 'da_iniziare',  -- da_iniziare | in_corso | completato
  store_acquisto    TEXT,                        -- steam | epic | microsoft | ...
  data_aggiunta     TEXT DEFAULT (datetime('now')),
  note_testuali     TEXT,
  owned             INTEGER DEFAULT 0,   -- posseduto / nel backlog
  status_auto       INTEGER DEFAULT 0,   -- 1 = stato impostato automaticamente (Steam), 0 = scelto dall'utente
  flag_preferito    INTEGER DEFAULT 0,   -- preferito (indipendente)
  in_wishlist       INTEGER DEFAULT 0,   -- in wishlist (indipendente)
  community_cache   TEXT DEFAULT '{}',   -- per-user Steam achievements/stats
  UNIQUE(id_utente, id_gioco)
);

-- ---------- Cartella (shelf) ----------
-- Kept for ER fidelity. The runtime folder feature is implemented as a
-- HashMap (see folder_map below) per the explicit design requirement 1.2.
CREATE TABLE IF NOT EXISTS Cartella (
  id_cartella   INTEGER PRIMARY KEY AUTOINCREMENT,
  id_utente     INTEGER NOT NULL REFERENCES Utente(id_utente) ON DELETE CASCADE,
  nome_cartella TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Cartella_Contenuto (
  id_cartella INTEGER NOT NULL REFERENCES Cartella(id_cartella) ON DELETE CASCADE,
  id_possesso INTEGER NOT NULL REFERENCES Libreria_Utente(id_possesso) ON DELETE CASCADE,
  PRIMARY KEY (id_cartella, id_possesso)
);

-- ---------- Allegato (diary attachment) ----------
CREATE TABLE IF NOT EXISTS Allegato (
  id_allegato  INTEGER PRIMARY KEY AUTOINCREMENT,
  id_possesso  INTEGER NOT NULL REFERENCES Libreria_Utente(id_possesso) ON DELETE CASCADE,
  percorso_file TEXT NOT NULL,
  tipo         TEXT          -- image | video | text
);

-- ---------- Diary entries (the "Diario" wireframe) ----------
CREATE TABLE IF NOT EXISTS Diario (
  id_nota     INTEGER PRIMARY KEY AUTOINCREMENT,
  id_possesso INTEGER NOT NULL REFERENCES Libreria_Utente(id_possesso) ON DELETE CASCADE,
  testo       TEXT NOT NULL,
  ore_giocate INTEGER,
  tag         TEXT,
  is_spoiler  INTEGER DEFAULT 0,
  media_url   TEXT,
  media_tipo  TEXT,            -- image | video | null
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- HashMap-backed folder store (design requirement 1.2)
-- key  = (id_utente, nome_cartella)
-- value = JSON list of games belonging to that folder
-- ============================================================
CREATE TABLE IF NOT EXISTS folder_map (
  id_utente     INTEGER NOT NULL REFERENCES Utente(id_utente) ON DELETE CASCADE,
  nome_cartella TEXT NOT NULL,
  giochi_json   TEXT NOT NULL DEFAULT '[]',
  emoji         TEXT DEFAULT '📚',
  ordine        INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (id_utente, nome_cartella)
);

-- ============================================================
-- Queue-based Load Leveling: durable message store for jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS job_queue (
  id          TEXT PRIMARY KEY,        -- uuid
  type        TEXT NOT NULL,           -- igdb_search | steam_sync | populate_popular | ...
  payload     TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'queued', -- queued | processing | done | failed
  result      TEXT,                    -- JSON
  error       TEXT,
  attempts    INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_status ON job_queue(status);

-- ============================================================
-- Push notifications (Epic free games)
-- ============================================================
CREATE TABLE IF NOT EXISTS push_tokens (
  token      TEXT PRIMARY KEY,            -- ExpoPushToken
  id_utente  INTEGER REFERENCES Utente(id_utente) ON DELETE CASCADE,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Remember which Epic free games we already notified about.
CREATE TABLE IF NOT EXISTS epic_seen (
  epic_id    TEXT PRIMARY KEY,
  title      TEXT,
  notified_at TEXT DEFAULT (datetime('now'))
);
