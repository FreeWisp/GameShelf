import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

function publicUser(u) {
  return {
    id_utente: u.id_utente, username: u.username, email: u.email,
    bio: u.bio, immagine_profilo: u.immagine_profilo,
    preferenze_ui: safeJson(u.preferenze_ui),
    steam_id: u.steam_id, steam_privacy: u.steam_privacy,
  };
}
const safeJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };

// POST /auth/register
router.post('/register', (req, res) => {
  const { username, email, password } = req.body ?? {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email e password sono obbligatori' });
  }
  if (username.trim().length < 3) return res.status(400).json({ error: 'Username troppo corto (minimo 3 caratteri)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email non valida' });
  if (password.length < 6) return res.status(400).json({ error: 'Password troppo corta (minimo 6 caratteri)' });
  const exists = db.prepare('SELECT 1 FROM Utente WHERE email = ? OR username = ?').get(email, username);
  if (exists) return res.status(409).json({ error: 'Email o username già registrati' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO Utente (username, email, password_hash) VALUES (?, ?, ?)',
  ).run(username, email, hash);
  const user = db.prepare('SELECT * FROM Utente WHERE id_utente = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// POST /auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const user = db.prepare('SELECT * FROM Utente WHERE email = ? OR username = ?').get(email, email);
  if (!user || !bcrypt.compareSync(password ?? '', user.password_hash)) {
    return res.status(401).json({ error: 'Credenziali non valide' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

export default router;
export { publicUser };
