import db from '../db/index.js';

// Expo Push Service. Each device registers its ExpoPushToken; we fan-out
// notifications through https://exp.host/--/api/v2/push/send.
// (Remote push in Expo Go is limited on SDK 53+; a dev/standalone build
// receives these fully. The app also falls back to local notifications.)

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const pushService = {
  register(userId, token) {
    if (!token?.startsWith('ExponentPushToken') && !token?.startsWith('ExpoPushToken')) {
      throw new Error('Token push non valido');
    }
    db.prepare(
      `INSERT INTO push_tokens (token, id_utente) VALUES (?, ?)
       ON CONFLICT(token) DO UPDATE SET id_utente = excluded.id_utente, updated_at = datetime('now')`,
    ).run(token, userId ?? null);
  },

  allTokens() {
    return db.prepare('SELECT token FROM push_tokens').all().map((r) => r.token);
  },

  async send(messages) {
    if (!messages.length) return { sent: 0 };
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`Expo push error ${res.status}`);
    return res.json();
  },

  async broadcast({ title, body, data }) {
    const tokens = this.allTokens();
    const messages = tokens.map((to) => ({ to, sound: 'default', title, body, data }));
    if (!messages.length) return { sent: 0, skipped: 'no-tokens' };
    const result = await this.send(messages);
    return { sent: messages.length, result };
  },
};
