// Lightweight EN -> IT translation.
// IGDB only provides English summaries, so we translate them ourselves and cache
// the result in the DB. Uses the free (unofficial, no-key) Google translate
// endpoint; on any failure it falls back to the original text.

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

async function translateChunk(text, from = 'en', to = 'it') {
  const params = new URLSearchParams({ client: 'gtx', sl: from, tl: to, dt: 't', q: text });
  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (GameShelf)' },
  });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = await res.json();
  // data[0] = [[translatedSegment, originalSegment, ...], ...]
  return (data?.[0] ?? []).map((seg) => seg[0]).join('');
}

// Split long text on sentence boundaries to keep each request within URL limits.
function chunk(text, max = 1500) {
  if (text.length <= max) return [text];
  const parts = [];
  let buf = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if ((buf + ' ' + sentence).length > max) { if (buf) parts.push(buf); buf = sentence; }
    else buf = buf ? `${buf} ${sentence}` : sentence;
  }
  if (buf) parts.push(buf);
  return parts;
}

export const translateService = {
  async toItalian(text) {
    if (!text || !text.trim()) return text;
    try {
      const parts = chunk(text.slice(0, 5000));
      const out = [];
      for (const p of parts) out.push(await translateChunk(p));
      const joined = out.join(' ').trim();
      return joined || text;
    } catch {
      return text; // graceful fallback to the original English text
    }
  },
};
