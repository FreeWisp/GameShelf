// Steam "Sign in through Steam" uses OpenID 2.0 (NOT OAuth2).
// Flow (see sequence diagram UC-03):
//   1. We redirect the user to Steam's OpenID endpoint (checkid_setup).
//   2. Steam authenticates the user and redirects back to our return_to URL
//      with a set of openid.* parameters, including the claimed_id that
//      contains the SteamID64.
//   3. We verify the assertion by POSTing the same params back to Steam with
//      openid.mode=check_authentication and checking for `is_valid:true`.

const OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

export function buildLoginUrl({ realm, returnTo }) {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${OPENID_ENDPOINT}?${params}`;
}

/**
 * Verify the OpenID response coming back from Steam.
 * @param {object} query - the req.query of the return_to request
 * @returns {Promise<string|null>} the verified SteamID64, or null if invalid
 */
export async function verifyAssertion(query) {
  if (query['openid.mode'] !== 'id_res') return null;

  // Re-send every openid.* param but switch mode to check_authentication.
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('openid.')) body.append(k, v);
  }
  body.set('openid.mode', 'check_authentication');

  const res = await fetch(OPENID_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!/is_valid\s*:\s*true/i.test(text)) return null;

  // claimed_id looks like https://steamcommunity.com/openid/id/7656119....
  const claimed = query['openid.claimed_id'] || '';
  const match = claimed.match(/\/id\/(\d{17})$/);
  return match ? match[1] : null;
}
