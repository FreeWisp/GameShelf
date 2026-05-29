import db from '../db/index.js';

/**
 * Folder store — design requirement 1.2.
 *
 * Folders ("mensole") are modelled as a HashMap:
 *   key   = folder name (per user)
 *   value = JSON list of games belonging to that folder
 *
 * The map lives in memory (a JS Map per user) for O(1) access and is
 * write-through persisted to the `folder_map` table so it survives restarts
 * and is shared across the user's devices via the central backend.
 */
class FolderStore {
  constructor() {
    // userId -> Map<folderName, gamesArray>
    this.cache = new Map();
  }

  _userMap(userId) {
    if (this.cache.has(userId)) return this.cache.get(userId);
    const map = new Map();
    const rows = db
      .prepare('SELECT nome_cartella, giochi_json FROM folder_map WHERE id_utente = ?')
      .all(userId);
    for (const r of rows) {
      try { map.set(r.nome_cartella, JSON.parse(r.giochi_json)); }
      catch { map.set(r.nome_cartella, []); }
    }
    this.cache.set(userId, map);
    return map;
  }

  _persist(userId, name, games) {
    db.prepare(
      `INSERT INTO folder_map (id_utente, nome_cartella, giochi_json) VALUES (?, ?, ?)
       ON CONFLICT(id_utente, nome_cartella) DO UPDATE SET giochi_json = excluded.giochi_json`,
    ).run(userId, name, JSON.stringify(games));
  }

  list(userId) {
    const map = this._userMap(userId);
    return [...map.entries()].map(([nome_cartella, giochi]) => ({
      nome_cartella,
      count: giochi.length,
      giochi,
    }));
  }

  get(userId, name) {
    return this._userMap(userId).get(name) ?? null;
  }

  create(userId, name) {
    const map = this._userMap(userId);
    if (map.has(name)) throw new Error('Cartella già esistente');
    map.set(name, []);
    this._persist(userId, name, []);
    return { nome_cartella: name, count: 0, giochi: [] };
  }

  rename(userId, oldName, newName) {
    const map = this._userMap(userId);
    if (!map.has(oldName)) throw new Error('Cartella non trovata');
    if (map.has(newName)) throw new Error('Nome cartella già in uso');
    const games = map.get(oldName);
    map.delete(oldName);
    map.set(newName, games);
    db.prepare('DELETE FROM folder_map WHERE id_utente = ? AND nome_cartella = ?').run(userId, oldName);
    this._persist(userId, newName, games);
    return { nome_cartella: newName, count: games.length, giochi: games };
  }

  remove(userId, name) {
    const map = this._userMap(userId);
    map.delete(name);
    db.prepare('DELETE FROM folder_map WHERE id_utente = ? AND nome_cartella = ?').run(userId, name);
  }

  addGame(userId, name, game) {
    const map = this._userMap(userId);
    if (!map.has(name)) throw new Error('Cartella non trovata');
    const games = map.get(name);
    if (!games.some((g) => g.id_gioco === game.id_gioco)) {
      games.push(game);
      this._persist(userId, name, games);
    }
    return { nome_cartella: name, count: games.length, giochi: games };
  }

  removeGame(userId, name, gameId) {
    const map = this._userMap(userId);
    if (!map.has(name)) throw new Error('Cartella non trovata');
    const games = map.get(name).filter((g) => g.id_gioco !== gameId);
    map.set(name, games);
    this._persist(userId, name, games);
    return { nome_cartella: name, count: games.length, giochi: games };
  }
}

export const folderStore = new FolderStore();
