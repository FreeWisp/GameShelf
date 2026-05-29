// Edit distance (Levenshtein) used for fuzzy game-title search (req. 4):
// when the user mistypes a title we pick the stored game whose name is the
// closest string to the (possibly wrong) query.

export function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // single-row dynamic programming
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Normalised similarity in [0,1] (1 = identical).
export function similarity(a, b) {
  const dist = levenshtein(a, b);
  const max = Math.max(a.length, b.length) || 1;
  return 1 - dist / max;
}

// Rank candidates by closeness to query. Substring matches are boosted so an
// exact prefix always wins over a same-distance unrelated title.
export function rankByCloseness(query, items, getName) {
  const q = query.toLowerCase().trim();
  return items
    .map((item) => {
      const name = getName(item).toLowerCase();
      const contains = name.includes(q);
      const dist = levenshtein(q, name);
      return { item, dist, contains, score: (contains ? -1000 : 0) + dist };
    })
    .sort((a, b) => a.score - b.score)
    .map((r) => ({ ...r.item, _distance: r.dist }));
}
