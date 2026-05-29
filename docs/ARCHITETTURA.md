# GameShelf — Architettura del sistema

Documento di riferimento per il progetto universitario. Descrive l'architettura
completa (frontend + backend), il modello dati, i flussi principali e il pattern
architetturale adottato.

---

## 1. Visione d'insieme

GameShelf è un sistema **client–server** composto da due applicazioni in un unico
repository (monorepo):

```
GameShelf/
├── backend/   → API REST + database centralizzato + code + proxy verso IGDB/Steam/Epic
└── app/       → applicazione mobile React Native (Expo)
```

- L'**app** non parla mai direttamente con i servizi esterni: chiama solo il
  **backend** via HTTP/REST.
- Il **backend** è l'unico a possedere il **database centralizzato** (condiviso da
  tutti gli utenti e dispositivi), le **chiavi API** segrete e la logica di
  **livellamento del carico** verso i servizi esterni.

```
┌─────────────┐      HTTPS/REST      ┌──────────────────────────┐      ┌──────────────┐
│  App (Expo) │ ───────────────────▶ │  Backend (Express)       │ ───▶ │ IGDB / Steam │
│  React      │ ◀─────────────────── │  SQLite + Job Queue      │ ◀─── │ Epic Games   │
│  Native     │       JSON           │  (Load Leveling)         │      └──────────────┘
└─────────────┘                      └──────────────────────────┘
                                              │
                                       ┌──────────────┐
                                       │  SQLite DB   │ (centralizzato, comune)
                                       └──────────────┘
```

---

## 2. Pattern architetturale: Queue-based Load Leveling

È il cuore del backend. Le richieste “costose” o verso servizi esterni (ricerca
IGDB, sync Steam, refresh popolari, check Epic) **non** vengono eseguite in linea
sulla richiesta HTTP: diventano **messaggi** su una coda durevole (tabella
`job_queue`). Un **pool di worker** (il consumer) svuota la coda a ritmo
controllato — **concorrenza limitata** + **intervallo minimo** tra le chiamate —
così i servizi a valle ricevono un carico sempre livellato anche con tanti utenti
contemporanei. La coda fa da **buffer / ammortizzatore** fra i produttori (livello
HTTP) e il consumer.

```
 HTTP request ──enqueue()──▶ job_queue (buffer) ──worker pool──▶ IGDB / Steam / Epic
 (picchi)                    durevole, SQLite     N worker +
                                                  minIntervalMs
```

File chiave:
- `backend/src/queue/messageQueue.js` — la coda + worker pool (`enqueue`,
  `enqueueAndWait`, `enqueueOnce`, `hasPending`, `prune`, `stats`).
- `backend/src/queue/handlers.js` — i tipi di job: `populate_popular`,
  `igdb_search`, `steam_sync`, `steam_community`, `steam_news`, `epic_check`.

Vantaggi didattici del pattern: disaccoppia i picchi di richieste dal rate-limit
dei servizi esterni; rende il sistema resiliente (i job sono persistiti e
ripresi dopo un crash); osservabile (`GET /jobs/stats`, `GET /jobs/:id`).

---

## 3. Backend (Node.js + Express + SQLite)

### 3.1 Stack
- **Express**: server HTTP / routing REST.
- **better-sqlite3**: driver SQLite **sincrono** (semplice e veloce, ideale per un
  DB locale/centralizzato a file unico).
- **jsonwebtoken + bcryptjs**: autenticazione (JWT) e hashing password.
- **dotenv**: configurazione via `.env`.

### 3.2 Struttura cartelle
```
backend/src/
├── index.js            → bootstrap Express, monta le route, avvia coda+scheduler
├── config.js           → legge .env (porta, chiavi, tuning coda)
├── db/
│   ├── schema.sql      → schema del DB (diagramma ER) + tabelle coda/push/hashmap
│   └── index.js        → apertura DB, esecuzione schema, migrazioni idempotenti
├── queue/
│   ├── messageQueue.js → Queue-based Load Leveling (coda + worker)
│   └── handlers.js     → handler dei job
├── services/
│   ├── gameService.js  → CRUD catalogo + ricerca Levenshtein
│   ├── igdbService.js  → IGDB (Twitch OAuth, mapping, time-to-beat)
│   ├── steamService.js → 5 endpoint Steam Web API
│   ├── steamAuth.js    → login Steam OpenID 2.0
│   ├── epicService.js  → giochi gratis Epic
│   ├── pushService.js  → invio notifiche via Expo Push
│   └── folderStore.js  → cartelle (HashMap)
├── routes/             → auth, steamAuth, games, library, folders, news, profile, epic, jobs
├── middleware/auth.js  → verifica JWT (requireAuth)
└── seed/               → dataset offline + script di seed
```

### 3.3 Autenticazione
Login/registrazione centralizzati: password salvate con **bcrypt**, sessione via
**JWT** (30 giorni) inviato dall'app nell'header `Authorization: Bearer <token>`.

### 3.4 Servizi esterni
- **IGDB** (`igdbService.js`): autenticazione Twitch OAuth client-credentials con
  token in cache; ricerca e “popolari del momento”; mapping dei metadati
  (store per `websites.type`, piattaforme, lingue, tag, saga) e **time-to-beat**
  dall'endpoint `game_time_to_beats`. Se mancano le chiavi → dataset offline.
- **Steam** (`steamService.js`): `GetFriendList`, `GetUserStatsForGame`,
  `GetOwnedGames`, `GetRecentlyPlayedGames`, `GetNewsForApp`, +
  `GetPlayerAchievements`.
- **Steam OpenID** (`steamAuth.js`): login “Sign in through Steam” (OpenID 2.0)
  con verifica dell'asserzione.
- **Epic** (`epicService.js`): endpoint pubblico delle promozioni (giochi gratis).

### 3.5 Ricerca con Edit Distance (Levenshtein)
`gameService.searchLocal` cerca prima nel catalogo locale ordinando per **distanza
di Levenshtein** (`utils/levenshtein.js`). Se non c'è un match forte
(sottostringa o similarità ≥ 0.82) interroga IGDB **tramite la coda**, salva i
risultati nel DB centrale (così crescono per tutti) e li ri-ordina. La route
`/games/search` calcola anche il suggerimento **“forse cercavi…”** (`didYouMean`)
solo quando il termine sembra un errore di battitura.

### 3.6 Cartelle come HashMap
`folderStore.js` implementa le “mensole” con una **HashMap** (chiave = nome
cartella per utente, valore = lista JSON di giochi), in memoria con write-through
sulla tabella `folder_map`.

---

## 4. Database (modello ER)

DB **SQLite** unico e condiviso, definito in `backend/src/db/schema.sql`.

| Tabella | Ruolo |
|---------|-------|
| `Utente` | account (username, email, password_hash, bio, immagine, preferenze_ui, steam_id) |
| `Saga` | saghe videoludiche |
| `Gioco` | catalogo condiviso: titolo, publisher, data, genere, descrizione, copertina, store_links, lingue, tag, piattaforme, time_to_beat, steam_appid, popularity |
| `Libreria_Utente` | possesso per-utente: stato, preferito, wishlist, note, store, **community_cache** (achievement per-utente) |
| `Cartella` / `Cartella_Contenuto` | mensole (modello ER) |
| `Allegato` / `Diario` | note e media del diario |
| `folder_map` | HashMap cartelle (persistenza) |
| `job_queue` | coda durevole (Load Leveling) |
| `push_tokens` / `epic_seen` | token push + giochi Epic già notificati |

Dati **condivisi** (catalogo `Gioco`/`Saga`) vs dati **per-utente**
(`Libreria_Utente`, `Diario`, `folder_map`): gli achievement Steam sono per-utente
(in `Libreria_Utente.community_cache`), non nel gioco condiviso.

---

## 5. Frontend (React Native + Expo)

### 5.1 Stack
- **Expo SDK 54** + **expo-router** (routing file-based, come Next.js).
- **AsyncStorage** (token/persistenza), **react-native-qrcode-svg** (QR),
  **expo-camera** (scanner QR), **expo-image-picker** (immagini),
  **expo-web-browser** (login Steam), **expo-notifications** (push/locali),
  **@expo/vector-icons** (icone).

### 5.2 Struttura cartelle
```
app/
├── app/                       → ROTTE (file-based routing)
│   ├── _layout.js             → provider globali (Auth, Theme) + guard di navigazione
│   ├── index.js               → redirect iniziale (login o tabs)
│   ├── login.js / register.js → autenticazione
│   ├── (tabs)/                → barra tab
│   │   ├── _layout.js         → Home / Cerca / News + registrazione push
│   │   ├── index.js           → HOME: mensole, filtri, stato vuoto
│   │   ├── search.js          → CERCA: popolari + ricerca fuzzy + “forse cercavi”
│   │   └── news.js            → NEWS: Steam news + giochi gratis Epic
│   ├── game/[id].js           → DETTAGLIO gioco (metadati, stato, achievement…)
│   ├── diary/[possesso].js    → DIARIO del gioco
│   ├── profile.js             → PROFILO: dati, QR, scanner, login Steam
│   └── settings.js            → tema, versione, contatto sviluppatori
└── src/
    ├── api.js                 → client REST (auto-rileva l'host del backend)
    ├── context/AuthContext.js → stato utente + JWT
    ├── context/ThemeContext.js→ tema chiaro/scuro
    ├── components/common.js   → componenti riusabili (copertine, stelle, badge)
    └── lib/notifications.js   → push token + notifica locale Epic
```

### 5.3 Navigazione e stato
- `app/_layout.js` avvolge tutto in `AuthProvider` e `ThemeProvider` e fa da
  **guard**: se non sei loggato ti porta a `/login`, altrimenti alle tab.
- **AuthContext**: al primo avvio carica il JWT da AsyncStorage e recupera il
  profilo; espone `login/register/logout/refresh`.
- **ThemeContext**: palette dark/light persistita.

### 5.4 Client API e host del backend
`src/api.js` costruisce la base URL in automatico:
1. `EXPO_PUBLIC_API_URL` se impostata (override esplicito);
2. l'IP del PC di sviluppo ricavato da Expo (per dispositivi fisici);
3. `10.0.2.2:4000` su emulatore Android, `localhost:4000` altrimenti.

---

## 6. Flussi principali (end-to-end)

**Ricerca di un gioco**
1. App → `GET /games/search?q=…`
2. Backend cerca nel catalogo (Levenshtein). Se manca un match forte →
3. `enqueue('igdb_search')` → worker chiama IGDB → salva nel DB centrale →
4. Backend ri-ordina e risponde con risultati + `didYouMean`.

**Primo accesso / popolari**
- Catalogo vuoto → `enqueueAndWait('populate_popular')` scarica i popolari da IGDB.
- Catalogo pieno → refresh asincrono `enqueueOnce('populate_popular')`.

**Login Steam (OpenID) + sync**
- App apre `WebBrowser` su `/auth/steam/login` → Steam → `/auth/steam/return`
  (verifica asserzione, estrae SteamID64, `enqueue('steam_sync')`).

**Notifiche Epic**
- Scheduler ogni 6h → `enqueue('epic_check')` → rileva nuovi gratis →
  `pushService.broadcast` (Expo Push). In Expo Go: fallback a notifica locale.

---

## 7. Esecuzione in locale (localhost)

Due processi sullo stesso PC:
```
# Terminale 1 — backend
cd backend && npm install && npm run seed && npm start   # http://localhost:4000

# Terminale 2 — app
cd app && npm install --legacy-peer-deps && npx expo start
```
- **Web/emulatore**: funziona con localhost / 10.0.2.2 automaticamente.
- **Telefono fisico**: imposta `EXPO_PUBLIC_API_URL=http://<IP-DEL-PC>:4000` prima di
  `expo start`, oppure affidati all'auto-detect (stessa rete Wi-Fi).
