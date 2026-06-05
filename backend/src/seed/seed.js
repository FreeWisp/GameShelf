// Seed only the demo user. The game catalogue is populated live from IGDB on
// first use (most-popular games / searches), so it always has correct covers,
// languages, platforms and store links. The bundled POPULAR_GAMES list is kept
// purely as an offline fallback (used only when IGDB credentials are absent).
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { igdbEnabled } from '../config.js';
import { gameService } from '../services/gameService.js';
import { POPULAR_GAMES } from './popularGames.js';

// Offline fallback: pre-load the bundled list only when IGDB is not configured.
if (!igdbEnabled) {
  for (const g of POPULAR_GAMES) gameService.upsert(g);
  console.log(`IGDB non configurato → seed offline di ${POPULAR_GAMES.length} giochi.`);
} else {
  console.log('IGDB configurato → il catalogo si popolerà da IGDB live al primo avvio.');
}

const demoEmail = 'demo@gameshelf.app';
if (!db.prepare('SELECT 1 FROM Utente WHERE email = ?').get(demoEmail)) {
  db.prepare('INSERT INTO Utente (username, email, password_hash, bio) VALUES (?, ?, ?, ?)')
    .run('demo', demoEmail, bcrypt.hashSync('demo1234', 10), 'Account demo di GameShelf');
  console.log('Utente demo creato → demo@gameshelf.app / demo1234');
}
process.exit(0);
