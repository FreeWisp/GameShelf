import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'gameshelf-dev-secret',
  dbFile: path.resolve(__dirname, '..', 'data', 'gameshelf.db'),

  steam: {
    apiKey: process.env.STEAM_API_KEY ?? '0627880C8E24EAD513C13AF45DA1E048',
    base: 'https://api.steampowered.com',
  },

  igdb: {
    clientId: process.env.IGDB_CLIENT_ID ?? '',
    clientSecret: process.env.IGDB_CLIENT_SECRET ?? '',
    base: 'https://api.igdb.com/v4',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
  },

  queue: {
    concurrency: Number(process.env.QUEUE_CONCURRENCY ?? 2),
    minIntervalMs: Number(process.env.QUEUE_MIN_INTERVAL_MS ?? 250),
  },
};

export const igdbEnabled = Boolean(config.igdb.clientId && config.igdb.clientSecret);
