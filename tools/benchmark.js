#!/usr/bin/env node
/**
 * GameShelf — network & API latency benchmark
 * ===========================================
 * Measures response times of the GameShelf REST API (target "internal") and of
 * the third-party services it depends on (target "external"), breaking each
 * request down into its phases so that NETWORK cost and SERVER cost can be told
 * apart:
 *
 *   dns      DNS resolution
 *   tcp      TCP handshake            -> pure round-trip time (RTT)
 *   tls      TLS handshake            -> extra round-trips on HTTPS
 *   ttfb     time to first byte       -> RTT + server processing
 *   download transfer of the payload  -> depends on throughput and payload size
 *   total    end-to-end
 *
 * Run the exact same command once per network (Wi-Fi, 4G, 5G) changing --label,
 * then use --compare to put the results side by side.
 *
 * Usage:
 *   node tools/benchmark.js --label wifi
 *   node tools/benchmark.js --label 4g --target external
 *   node tools/benchmark.js --label wifi --url https://abc123.loca.lt --runs 40
 *   node tools/benchmark.js --compare
 *
 * Options:
 *   --label <name>     network being measured (wifi | 4g | 5g | ...). Required.
 *   --signal <s>       measured signal quality, recorded in the CSV
 *                      (e.g. "RSRP -108 dBm" for cellular, "RSSI -72 dBm" for Wi-Fi)
 *   --note <s>         free-text condition (e.g. "cantina", "accanto al router")
 *   --target <t>       internal (default) | external | all
 *   --url <base>       GameShelf backend base URL (default http://localhost:4000)
 *   --runs <n>         samples per endpoint (default 30)
 *   --warmup <n>       discarded samples before measuring (default 3)
 *   --keepalive        reuse the TCP connection (mimics the app); default: new
 *                      connection each time, so handshake cost is measured too
 *   --out <dir>        output directory (default tools/results)
 *   --compare          print and export a comparison of every summary_*.csv found
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- CLI parsing
function parseArgs(argv) {
  const a = { target: 'internal', url: 'http://localhost:4000', runs: 30, warmup: 3, keepalive: false, out: path.join(__dirname, 'results'), compare: false, signal: '', note: '' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--compare') a.compare = true;
    else if (k === '--keepalive') a.keepalive = true;
    else if (k === '--label') a.label = argv[++i];
    else if (k === '--signal') a.signal = argv[++i];
    else if (k === '--note') a.note = argv[++i];
    else if (k === '--target') a.target = argv[++i];
    else if (k === '--url') a.url = argv[++i].replace(/\/$/, '');
    else if (k === '--runs') a.runs = Number(argv[++i]);
    else if (k === '--warmup') a.warmup = Number(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
  }
  return a;
}

// ------------------------------------------------------------- HTTP timing
/**
 * Perform one request and return its phase timings in milliseconds.
 * Phases are captured from socket lifecycle events, so they reflect what
 * actually happens on the wire rather than a single wall-clock delta.
 */
// Keep-alive agents are per-protocol: an http.Agent cannot serve an https URL.
const keepAliveAgents = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 1 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 1 }),
};

function timedRequest({ url, method = 'GET', headers = {}, body = null, keepAlive = false }) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const agent = keepAlive ? keepAliveAgents[u.protocol] : false;
    const t0 = process.hrtime.bigint();
    const ms = (a, b) => (b === null || a === null ? null : Number(b - a) / 1e6);
    let tDns = null, tConn = null, tTls = null, tFirstByte = null;
    let bytes = 0;
    let reusedSocket = false;

    const req = lib.request(
      url,
      { method, headers, agent, timeout: 30000 },
      (res) => {
        res.on('data', (chunk) => {
          if (tFirstByte === null) tFirstByte = process.hrtime.bigint();
          bytes += chunk.length;
        });
        res.on('end', () => {
          const tEnd = process.hrtime.bigint();
          if (tFirstByte === null) tFirstByte = tEnd; // empty body
          // Negotiated TLS version: needed to read the `tls` phase in RTT terms
          // (TLS 1.3 completes in 1 round-trip, TLS 1.2 in 2).
          const tlsVersion = typeof res.socket?.getProtocol === 'function'
            ? (res.socket.getProtocol() ?? '') : '';
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            reusedSocket,
            tlsVersion,
            bytes,
            dns: ms(t0, tDns),
            tcp: tDns && tConn ? ms(tDns, tConn) : ms(t0, tConn),
            tls: tConn && tTls ? ms(tConn, tTls) : null,
            ttfb: ms(t0, tFirstByte),
            download: ms(tFirstByte, tEnd),
            total: ms(t0, tEnd),
          });
        });
      },
    );

    req.on('socket', (socket) => {
      // With keep-alive an existing socket is handed over already connected: no
      // lookup/connect events will fire, so we must not attach listeners again
      // (they would pile up on the same socket across requests).
      if (socket.connecting === false && socket.remoteAddress) { reusedSocket = true; return; }
      socket.once('lookup', () => { tDns = process.hrtime.bigint(); });
      socket.once('connect', () => { tConn = process.hrtime.bigint(); });
      socket.once('secureConnect', () => { tTls = process.hrtime.bigint(); });
    });

    const fail = (err) => {
      resolve({ ok: false, status: 0, error: err.message, bytes: 0, reusedSocket, tlsVersion: '', dns: null, tcp: null, tls: null, ttfb: null, download: null, total: null });
    };
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', fail);
    if (body) req.write(body);
    req.end();
  });
}

// ------------------------------------------------------------- statistics
const pct = (sorted, p) => {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
};

function stats(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length;
  // Jitter: mean absolute difference between consecutive samples (RFC 3550 idea,
  // simplified) — captures how *unstable* the link is, which is what separates
  // a cellular link from a wired/Wi-Fi one even at similar average latency.
  let jitter = 0;
  for (let i = 1; i < v.length; i++) jitter += Math.abs(v[i] - v[i - 1]);
  jitter = v.length > 1 ? jitter / (v.length - 1) : 0;
  return {
    n: v.length,
    min: sorted[0],
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    max: sorted[sorted.length - 1],
    mean,
    stdev: Math.sqrt(variance),
    jitter,
  };
}

const r2 = (x) => (x === null || x === undefined ? '' : Math.round(x * 100) / 100);

// CSV escaping: free-text fields (signal, note) may contain commas or quotes.
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

// ------------------------------------------------------------- scenarios
function internalScenarios(base, token) {
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  return [
    // Minimal handler: no DB, no external call -> isolates pure network cost.
    { name: 'health', note: 'baseline: nessuna elaborazione', url: `${base}/health` },
    // DB read, medium JSON payload.
    { name: 'games_popular', note: 'lettura DB (catalogo)', url: `${base}/games/popular?limit=16` },
    // Goes through the queue and out to IGDB: dominated by the external service,
    // not by the network between app and backend.
    { name: 'games_search_igdb', note: 'ricerca con round-trip IGDB (via coda)', url: `${base}/games/search?q=hollow%20knight` },
    // Single row + cached Italian description.
    { name: 'game_detail', note: 'scheda gioco (descrizione IT in cache)', url: `${base}/games/1` },
    // Per-user data, requires JWT.
    { name: 'library', note: 'libreria utente (auth)', url: `${base}/library`, headers: auth },
    { name: 'folders', note: 'mensole (auth)', url: `${base}/folders`, headers: auth },
    // CPU-bound: bcrypt verification dominates, network is a small share.
    {
      name: 'auth_login', note: 'login: bcrypt (CPU-bound)', method: 'POST',
      url: `${base}/auth/login`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@gameshelf.app', password: 'demo1234' }),
    },
  ];
}

// Public endpoints: reachable directly from any network, so Wi-Fi vs cellular
// can be compared WITHOUT a tunnel in the middle (no measurement bias).
function externalScenarios() {
  return [
    { name: 'steam_news', note: 'Steam Web API (JSON piccolo)', url: 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=440&count=3&maxlength=300&format=json' },
    { name: 'epic_promotions', note: 'Epic Games (JSON grande)', url: 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=it-IT&country=IT&allowCountries=IT' },
    { name: 'igdb_cover_cdn', note: 'CDN immagini IGDB (download)', url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg' },
  ];
}

// ------------------------------------------------------------- runner
async function login(base) {
  const res = await timedRequest({
    url: `${base}/auth/login`, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@gameshelf.app', password: 'demo1234' }),
  });
  if (!res.ok) return null;
  // re-issue with fetch to easily read the body
  try {
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@gameshelf.app', password: 'demo1234' }),
    });
    const j = await r.json();
    return j.token ?? null;
  } catch { return null; }
}

async function runScenario(sc, { runs, warmup, keepAlive }) {
  const samples = [];
  for (let i = 0; i < warmup + runs; i++) {
    const res = await timedRequest({
      url: sc.url, method: sc.method ?? 'GET',
      headers: sc.headers ?? {}, body: sc.body ?? null, keepAlive,
    });
    if (i >= warmup) samples.push(res);
    await new Promise((r) => setTimeout(r, 120)); // spacing: avoid burst effects
  }
  return samples;
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });

  if (args.compare) return compare(args.out);

  if (!args.label) {
    console.error('Errore: specifica la rete misurata, es. --label wifi | 4g | 5g');
    process.exit(1);
  }

  let scenarios = [];
  if (args.target === 'internal' || args.target === 'all') {
    const token = await login(args.url);
    if (!token) console.warn('! login fallito: gli endpoint autenticati verranno saltati (backend avviato?)');
    scenarios.push(...internalScenarios(args.url, token).filter((s) => token || !s.headers?.Authorization));
  }
  if (args.target === 'external' || args.target === 'all') scenarios.push(...externalScenarios());

  console.log(`\nGameShelf benchmark — rete: ${args.label} | target: ${args.target} | ${args.runs} campioni/endpoint | keep-alive: ${args.keepalive ? 'sì' : 'no'}`);
  console.log(`Backend: ${args.url}\n`);

  const rawRows = [['label', 'signal', 'note', 'endpoint', 'run', 'status', 'reused', 'tls_ver', 'bytes', 'dns_ms', 'tcp_ms', 'tls_ms', 'ttfb_ms', 'download_ms', 'total_ms']];
  const sumRows = [['label', 'signal', 'note', 'endpoint', 'scenario', 'n', 'reused_n', 'tls_ver', 'bytes', 'tcp_p50', 'tls_p50', 'ttfb_p50', 'total_min', 'total_p50', 'total_p95', 'total_p99', 'total_max', 'total_mean', 'total_stdev', 'total_jitter', 'kbps']];

  for (const sc of scenarios) {
    process.stdout.write(`  ${sc.name.padEnd(22)} `);
    const samples = await runScenario(sc, { runs: args.runs, warmup: args.warmup, keepAlive: args.keepalive });
    samples.forEach((s, i) => rawRows.push([args.label, args.signal, args.note, sc.name, i + 1, s.status, s.reusedSocket ? 1 : 0, s.tlsVersion ?? '', s.bytes, r2(s.dns), r2(s.tcp), r2(s.tls), r2(s.ttfb), r2(s.download), r2(s.total)]));

    const okS = samples.filter((s) => s.ok);
    const st = stats(okS.map((s) => s.total));
    const ttfb = stats(okS.map((s) => s.ttfb));
    const tcp = stats(okS.map((s) => s.tcp));
    const tls = stats(okS.map((s) => s.tls));
    const bytes = okS.length ? Math.round(okS.reduce((a, s) => a + s.bytes, 0) / okS.length) : 0;
    const reusedN = okS.filter((s) => s.reusedSocket).length;
    const tlsVer = okS.find((s) => s.tlsVersion)?.tlsVersion ?? '';
    if (!st) { console.log('FALLITO (nessuna risposta valida)'); continue; }
    const kbps = st.p50 > 0 ? (bytes * 8) / st.p50 : 0; // bits per ms == kbit/s

    console.log(`p50 ${String(r2(st.p50)).padStart(8)} ms | p95 ${String(r2(st.p95)).padStart(8)} ms | jitter ${String(r2(st.jitter)).padStart(7)} ms | ${String(bytes).padStart(7)} B`);
    sumRows.push([args.label, args.signal, args.note, sc.name, sc.note, st.n, reusedN, tlsVer, bytes, r2(tcp?.p50), r2(tls?.p50), r2(ttfb?.p50), r2(st.min), r2(st.p50), r2(st.p95), r2(st.p99), r2(st.max), r2(st.mean), r2(st.stdev), r2(st.jitter), r2(kbps)]);
  }

  const tag = `${args.label}_${args.target}${args.keepalive ? '_keepalive' : ''}`;
  const rawFile = path.join(args.out, `raw_${tag}.csv`);
  const sumFile = path.join(args.out, `summary_${tag}.csv`);
  fs.writeFileSync(rawFile, toCsv(rawRows), 'utf8');
  fs.writeFileSync(sumFile, toCsv(sumRows), 'utf8');
  console.log(`\nCSV scritti:\n  ${sumFile}   (riepilogo, per le tabelle)\n  ${rawFile}   (campioni singoli, per boxplot/istogrammi)\n`);
}

// ------------------------------------------------------------- comparison
function compare(dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('summary_')) : [];
  if (!files.length) return console.log(`Nessun summary_*.csv in ${dir}. Esegui prima almeno una misura.`);

  // Minimal CSV line parser: handles quoted fields containing commas.
  const parseLine = (line) => {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };

  const rows = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n');
    const head = parseLine(lines[0]);
    for (const line of lines.slice(1)) {
      const cells = parseLine(line);
      rows.push(Object.fromEntries(head.map((h, i) => [h, cells[i]])));
    }
  }
  const labels = [...new Set(rows.map((r) => r.label))];
  const endpoints = [...new Set(rows.map((r) => r.endpoint))];

  // Recap of the conditions each label was measured under.
  const conds = labels
    .map((l) => { const r = rows.find((x) => x.label === l); return [l, [r?.signal, r?.note].filter(Boolean).join(' — ')]; })
    .filter(([, c]) => c);
  if (conds.length) {
    console.log('\nCondizioni di misura');
    conds.forEach(([l, c]) => console.log(`  ${l.padEnd(18)} ${c}`));
  }

  console.log('\nConfronto mediane (total_p50, ms)\n');
  console.log('endpoint'.padEnd(24) + labels.map((l) => l.padStart(12)).join('') + '   delta');
  const out = [['endpoint', ...labels.map((l) => `p50_${l}`), 'delta_ms', 'delta_pct']];
  for (const ep of endpoints) {
    const vals = labels.map((l) => {
      const r = rows.find((x) => x.endpoint === ep && x.label === l);
      return r ? Number(r.total_p50) : null;
    });
    const known = vals.filter((v) => v !== null);
    const delta = known.length >= 2 ? Math.max(...known) - Math.min(...known) : null;
    const pctDelta = known.length >= 2 && Math.min(...known) > 0 ? (delta / Math.min(...known)) * 100 : null;
    console.log(
      ep.padEnd(24) + vals.map((v) => String(v === null ? '-' : r2(v)).padStart(12)).join('') +
      (delta !== null ? `   +${r2(delta)} ms (${r2(pctDelta)}%)` : ''),
    );
    out.push([ep, ...vals.map((v) => (v === null ? '' : r2(v))), r2(delta), r2(pctDelta)]);
  }
  const file = path.join(dir, 'comparison.csv');
  fs.writeFileSync(file, toCsv(out), 'utf8');
  console.log(`\nCSV di confronto: ${file}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
