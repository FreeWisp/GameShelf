import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';
import { config } from '../config.js';
import queue from '../queue/messageQueue.js';
import { buildLoginUrl, verifyAssertion } from '../services/steamAuth.js';

const router = Router();

function baseUrl(req) {
  // Honour proxies but fall back to the request host.
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

/**
 * GET /auth/steam/login?link=<jwt>&return=<app-redirect-url>
 * Opened inside the app's WebBrowser auth session. `link` is the logged-in
 * user's JWT so we know whom to pair; `return` is the app deep-link to bounce
 * back to once done. Both are carried through Steam via the return_to URL.
 */
router.get('/login', (req, res) => {
  const { link = '', return: appReturn = '' } = req.query;
  const realm = baseUrl(req);
  const returnTo = `${realm}/auth/steam/return?link=${encodeURIComponent(link)}&app=${encodeURIComponent(appReturn)}`;
  res.redirect(buildLoginUrl({ realm, returnTo }));
});

/** GET /auth/steam/return — Steam redirects here with the OpenID assertion. */
router.get('/return', async (req, res) => {
  const appReturn = req.query.app || '';
  const fail = (reason) => {
    if (appReturn) return res.redirect(`${appReturn}?status=error&reason=${encodeURIComponent(reason)}`);
    return res.status(400).send(`Steam login fallito: ${reason}`);
  };

  try {
    const steamId = await verifyAssertion(req.query);
    if (!steamId) return fail('assertion-non-valida');

    // Identify the user from the linking JWT we passed through.
    let userId = null;
    try { userId = jwt.verify(req.query.link, config.jwtSecret).id; } catch { /* no/!valid token */ }
    if (!userId) return fail('utente-non-autenticato');

    db.prepare('UPDATE Utente SET steam_id = ? WHERE id_utente = ?').run(steamId, userId);
    const jobId = queue.enqueue('steam_sync', { userId, steamId });

    if (appReturn) {
      return res.redirect(`${appReturn}?status=ok&steamid=${steamId}&job=${jobId}`);
    }
    return res.send(`Steam collegato (SteamID ${steamId}). Puoi tornare all'app.`);
  } catch (err) {
    return fail(err.message);
  }
});

export default router;
