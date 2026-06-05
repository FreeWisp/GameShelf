// Delete the local SQLite database so it can be regenerated cleanly.
// Cross-platform (works on Windows/Mac/Linux). Run via `npm run reset`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', '..', 'data');

let removed = 0;
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) {
    if (f.startsWith('gameshelf.db')) { fs.rmSync(path.join(dataDir, f)); removed++; }
  }
}
console.log(removed ? `Database azzerato (${removed} file rimossi).` : 'Nessun database da rimuovere.');
