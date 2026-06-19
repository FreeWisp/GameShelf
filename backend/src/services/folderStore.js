import db from '../db/index.js';

/**
 * Folder store — design requirement 1.2.
 *
 * Folders ("mensole") are a HashMap: key = folder name (per user), value = the
 * folder data (games list + emoji + sort order). Lives in memory (a JS Map per
 * user) with write-through to `folder_map`.
 *
 * Externally every folder is addressed by a STABLE numeric id (the SQLite
 * rowid), never by name — so any character in the name (".", "/", "\", emoji…)
 * is safe and never ends up in a URL path. The name remains a plain display
 * field and the HashMap key.
 */
class FolderStore {
  constructor() {
    this.cache = new Map(); // userId -> Map<name, {id, giochi, emoji, ordine}>
  }

  _userMap(userId) {
    if (this.cache.has(userId)) return this.cache.get(userId);
    const map = new Map();
    const rows = db
      .prepare('SELECT rowid AS id, nome_cartella, giochi_json, emoji, ordine FROM folder_map WHERE id_utente = ? ORDER BY ordine, created_at')
      .all(userId);
    for (const r of rows) {
      let giochi = [];
      try { giochi = JSON.parse(r.giochi_json); } catch { giochi = []; }
      map.set(r.nome_cartella, { id: r.id, giochi, emoji: r.emoji ?? '📚', ordine: r.ordine ?? 0 });
    }
    this.cache.set(userId, map);
    return map;
  }

  // Write the folder back to its row (rowid stays stable, even on rename).
  _save(userId, name, folder) {
    db.prepare('UPDATE folder_map SET nome_cartella=?, giochi_json=?, emoji=?, ordine=? WHERE rowid=? AND id_utente=?')
      .run(name, JSON.stringify(folder.giochi), folder.emoji, folder.ordine, folder.id, userId);
  }

  _serialize(name, f) {
    return { id_cartella: f.id, nome_cartella: name, emoji: f.emoji, ordine: f.ordine, count: f.giochi.length, giochi: f.giochi };
  }

  _entryById(userId, id) {
    const map = this._userMap(userId);
    for (const [name, f] of map) if (f.id === Number(id)) return [name, f];
    return null;
  }

  list(userId) {
    const map = this._userMap(userId);
    return [...map.entries()]
      .sort((a, b) => a[1].ordine - b[1].ordine)
      .map(([name, f]) => this._serialize(name, f));
  }

  getById(userId, id) {
    const e = this._entryById(userId, id);
    return e ? this._serialize(e[0], e[1]) : null;
  }

  create(userId, name, emoji = '📚') {
    const map = this._userMap(userId);
    if (map.has(name)) throw new Error('Cartella già esistente');
    const ordine = map.size ? Math.max(...[...map.values()].map((f) => f.ordine)) + 1 : 0;
    const info = db.prepare(
      'INSERT INTO folder_map (id_utente, nome_cartella, giochi_json, emoji, ordine) VALUES (?, ?, ?, ?, ?)',
    ).run(userId, name, '[]', emoji || '📚', ordine);
    const folder = { id: info.lastInsertRowid, giochi: [], emoji: emoji || '📚', ordine };
    map.set(name, folder);
    return this._serialize(name, folder);
  }

  renameById(userId, id, newName) {
    const e = this._entryById(userId, id);
    if (!e) throw new Error('Cartella non trovata');
    const [oldName, folder] = e;
    if (newName !== oldName && this._userMap(userId).has(newName)) throw new Error('Nome cartella già in uso');
    const map = this._userMap(userId);
    map.delete(oldName);
    map.set(newName, folder);
    this._save(userId, newName, folder); // in-place UPDATE → rowid (id) unchanged
    return this._serialize(newName, folder);
  }

  setEmojiById(userId, id, emoji) {
    const e = this._entryById(userId, id);
    if (!e) throw new Error('Cartella non trovata');
    const [name, folder] = e;
    folder.emoji = emoji || '📚';
    this._save(userId, name, folder);
    return this._serialize(name, folder);
  }

  // Persist a new order given folder ids in the desired sequence.
  reorder(userId, orderedIds = []) {
    orderedIds.forEach((id, idx) => {
      const e = this._entryById(userId, id);
      if (e) { e[1].ordine = idx; this._save(userId, e[0], e[1]); }
    });
    return this.list(userId);
  }

  removeById(userId, id) {
    const e = this._entryById(userId, id);
    if (!e) return;
    this._userMap(userId).delete(e[0]);
    db.prepare('DELETE FROM folder_map WHERE rowid = ? AND id_utente = ?').run(Number(id), userId);
  }

  addGameById(userId, id, game) {
    const e = this._entryById(userId, id);
    if (!e) throw new Error('Cartella non trovata');
    const [name, folder] = e;
    if (!folder.giochi.some((g) => g.id_gioco === game.id_gioco)) {
      folder.giochi.push(game);
      this._save(userId, name, folder);
    }
    return this._serialize(name, folder);
  }

  removeGameById(userId, id, gameId) {
    const e = this._entryById(userId, id);
    if (!e) throw new Error('Cartella non trovata');
    const [name, folder] = e;
    folder.giochi = folder.giochi.filter((g) => g.id_gioco !== gameId);
    this._save(userId, name, folder);
    return this._serialize(name, folder);
  }
}

export const folderStore = new FolderStore();
