import db from '../db/index.js';

/**
 * Folder store — design requirement 1.2.
 *
 * Folders ("mensole") are a HashMap: key = folder name (per user), value = the
 * folder data (list of games + emoji + sort order). Lives in memory (a JS Map
 * per user) with write-through to the `folder_map` table.
 */
class FolderStore {
  constructor() {
    this.cache = new Map(); // userId -> Map<name, {giochi, emoji, ordine}>
  }

  _userMap(userId) {
    if (this.cache.has(userId)) return this.cache.get(userId);
    const map = new Map();
    const rows = db
      .prepare('SELECT nome_cartella, giochi_json, emoji, ordine FROM folder_map WHERE id_utente = ? ORDER BY ordine, created_at')
      .all(userId);
    for (const r of rows) {
      let giochi = [];
      try { giochi = JSON.parse(r.giochi_json); } catch { giochi = []; }
      map.set(r.nome_cartella, { giochi, emoji: r.emoji ?? '📚', ordine: r.ordine ?? 0 });
    }
    this.cache.set(userId, map);
    return map;
  }

  _persist(userId, name, folder) {
    db.prepare(
      `INSERT INTO folder_map (id_utente, nome_cartella, giochi_json, emoji, ordine)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id_utente, nome_cartella) DO UPDATE SET
         giochi_json = excluded.giochi_json, emoji = excluded.emoji, ordine = excluded.ordine`,
    ).run(userId, name, JSON.stringify(folder.giochi), folder.emoji, folder.ordine);
  }

  _serialize(name, f) {
    return { nome_cartella: name, emoji: f.emoji, ordine: f.ordine, count: f.giochi.length, giochi: f.giochi };
  }

  list(userId) {
    const map = this._userMap(userId);
    return [...map.entries()]
      .sort((a, b) => a[1].ordine - b[1].ordine)
      .map(([name, f]) => this._serialize(name, f));
  }

  get(userId, name) {
    return this._userMap(userId).get(name) ?? null;
  }

  create(userId, name, emoji = '📚') {
    const map = this._userMap(userId);
    if (map.has(name)) throw new Error('Cartella già esistente');
    const ordine = map.size ? Math.max(...[...map.values()].map((f) => f.ordine)) + 1 : 0;
    const folder = { giochi: [], emoji: emoji || '📚', ordine };
    map.set(name, folder);
    this._persist(userId, name, folder);
    return this._serialize(name, folder);
  }

  rename(userId, oldName, newName) {
    const map = this._userMap(userId);
    if (!map.has(oldName)) throw new Error('Cartella non trovata');
    if (newName !== oldName && map.has(newName)) throw new Error('Nome cartella già in uso');
    const folder = map.get(oldName);
    map.delete(oldName);
    map.set(newName, folder);
    db.prepare('DELETE FROM folder_map WHERE id_utente = ? AND nome_cartella = ?').run(userId, oldName);
    this._persist(userId, newName, folder);
    return this._serialize(newName, folder);
  }

  setEmoji(userId, name, emoji) {
    const map = this._userMap(userId);
    const folder = map.get(name);
    if (!folder) throw new Error('Cartella non trovata');
    folder.emoji = emoji || '📚';
    this._persist(userId, name, folder);
    return this._serialize(name, folder);
  }

  // Persist a new order given the full list of folder names.
  reorder(userId, orderedNames = []) {
    const map = this._userMap(userId);
    orderedNames.forEach((name, idx) => {
      const folder = map.get(name);
      if (folder) { folder.ordine = idx; this._persist(userId, name, folder); }
    });
    return this.list(userId);
  }

  remove(userId, name) {
    const map = this._userMap(userId);
    map.delete(name);
    db.prepare('DELETE FROM folder_map WHERE id_utente = ? AND nome_cartella = ?').run(userId, name);
  }

  addGame(userId, name, game) {
    const map = this._userMap(userId);
    const folder = map.get(name);
    if (!folder) throw new Error('Cartella non trovata');
    if (!folder.giochi.some((g) => g.id_gioco === game.id_gioco)) {
      folder.giochi.push(game);
      this._persist(userId, name, folder);
    }
    return this._serialize(name, folder);
  }

  removeGame(userId, name, gameId) {
    const map = this._userMap(userId);
    const folder = map.get(name);
    if (!folder) throw new Error('Cartella non trovata');
    folder.giochi = folder.giochi.filter((g) => g.id_gioco !== gameId);
    this._persist(userId, name, folder);
    return this._serialize(name, folder);
  }
}

export const folderStore = new FolderStore();
