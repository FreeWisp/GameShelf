// Manually seed the catalogue with the bundled popular games and a demo user.
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { gameService } from '../services/gameService.js';
import { POPULAR_GAMES } from './popularGames.js';

for (const g of POPULAR_GAMES) gameService.upsert(g);
console.log(`Seeded ${POPULAR_GAMES.length} games. Catalogue size: ${gameService.count()}`);

const demoEmail = 'demo@gameshelf.app';
if (!db.prepare('SELECT 1 FROM Utente WHERE email = ?').get(demoEmail)) {
  db.prepare('INSERT INTO Utente (username, email, password_hash, bio) VALUES (?, ?, ?, ?)')
    .run('demo', demoEmail, bcrypt.hashSync('demo1234', 10), 'Account demo di GameShelf');
  console.log('Created demo user → demo@gameshelf.app / demo1234');
}
process.exit(0);
