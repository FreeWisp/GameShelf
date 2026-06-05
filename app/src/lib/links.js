import { Alert, Linking } from 'react-native';

// Normalise URLs coming from IGDB/Steam (protocol-relative "//site", missing
// scheme, stray leading slashes) so the OS can actually open them.
export function normalizeUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (u.startsWith('//')) u = `https:${u}`;
  else if (!/^[a-z]+:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, '')}`;
  return u;
}

// Open a link safely: never throws an uncaught "Unable to open URL" console
// error — on failure it shows a friendly alert instead.
export async function openLink(url) {
  const u = normalizeUrl(url);
  if (!u) return;
  try {
    await Linking.openURL(u);
  } catch {
    Alert.alert('Impossibile aprire il link', u);
  }
}
