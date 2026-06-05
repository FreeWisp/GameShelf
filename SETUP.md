# GameShelf 🎮📚

Applicazione mobile **React Native (Expo)** per catalogare, organizzare e monitorare la
propria collezione di videogiochi cross-platform — una "libreria digitale personale".
Progetto realizzato secondo il pattern architetturale **Queue-based Load Leveling**.

Il sistema è composto da due parti:

| Componente | Stack | Cartella |
|------------|-------|----------|
| **App mobile** | Expo SDK 54, expo-router, React Native 0.81 | [`/app`](./app) |
| **Backend centralizzato** | Node.js + Express + SQLite (better-sqlite3) | [`/backend`](./backend) |

---

## 0. Requisiti (importante per lavorare in team)

- **Node.js 20 / 22 (LTS) / 24** — il file [`.nvmrc`](./.nvmrc) indica **22 (LTS)** come versione consigliata.
  `better-sqlite3` (modulo nativo) ha i **binari già pronti** per queste versioni: nessun
  compilatore C++ richiesto. Con `nvm`: `nvm install 22 && nvm use 22`.
- **npm** (incluso con Node) e **Expo Go** sul telefono (o un emulatore).

> 💡 Le **chiavi API sono già incluse** in `backend/.env` (progetto accademico), quindi
> non serve configurare nulla: clona e avvia.

---

## 1. Avvio rapido

### Backend (DB centralizzato + coda + proxy API)

```bash
cd backend
npm install                 # scarica i binari pronti (niente compilatori)
npm run seed                # crea l'utente demo (il catalogo si popola da IGDB)
npm start                   # http://localhost:4000
```

Utente demo: **demo@gameshelf.app / demo1234**

> **IGDB/Steam**: le chiavi sono già in `backend/.env`. Senza chiavi IGDB il backend usa un
> dataset offline, ma essendo incluse il catalogo si popola da **IGDB live**.

### App mobile

```bash
cd app
npm install --legacy-peer-deps
npx expo start
```

Apri con **Expo Go** (QR), un emulatore Android, o `w` per il web.

- **Emulatore Android**: il backend è raggiunto automaticamente via `10.0.2.2:4000`.
- **Dispositivo fisico**: l'app auto-rileva l'IP del PC dev. In alternativa imposta
  `EXPO_PUBLIC_API_URL=http://<IP-DEL-PC>:4000` prima di `expo start`.

### Risoluzione problemi

- **`gyp ERR! ... Could not find any Visual Studio installation` / errore di compilazione
  C++ su `better-sqlite3`**: stai usando una versione di Node per cui non esiste un binario
  pronto, quindi npm prova a compilarlo. **Soluzione**: usa una versione di Node supportata
  (20, **22 LTS** o 24) — vedi [`.nvmrc`](./.nvmrc) — poi:
  ```bash
  cd backend
  # con nvm:
  nvm install 22 && nvm use 22
  rm -rf node_modules package-lock.json   # (Windows PowerShell: Remove-Item -Recurse -Force node_modules, package-lock.json)
  npm install
  ```
  Il progetto usa `better-sqlite3@^12`, che pubblica i binari pre-compilati per Node 20–26:
  con una di queste versioni **non serve alcun compilatore**.
- **Errore di peer-deps su `npm install` nell'app**: usa `npm install --legacy-peer-deps`.
- **Expo Go dice "incompatible version"**: aggiorna Expo Go dallo store (il progetto è su SDK 54).

---

## 2. Architettura — Queue-based Load Leveling

Il pattern è il cuore del backend. I client **non** chiamano mai direttamente IGDB/Steam:
ogni operazione costosa o verso servizi esterni diventa un **messaggio** posto su una coda
durevole (tabella `job_queue`). Un pool di **worker** la svuota a ritmo controllato
(concorrenza + intervallo minimo tra chiamate), così i servizi a valle ricevono un carico
sempre livellato anche con molti utenti contemporanei.

```
                       enqueue()                    worker pool (consumer)
  HTTP request  ─────────────────▶  job_queue  ──────────────────────────▶  IGDB / Steam
 (producer / picchi)              (buffer/shock              concorrenza N +
                                   absorber)                 minIntervalMs (rate limit)
```

- Implementazione: [`backend/src/queue/messageQueue.js`](./backend/src/queue/messageQueue.js)
- Job registrati: [`backend/src/queue/handlers.js`](./backend/src/queue/handlers.js)
  (`populate_popular`, `igdb_search`, `steam_sync`, `steam_community`, `steam_news`)
- Stato/coda ispezionabili: `GET /jobs/stats`, `GET /jobs/:id`
- Tuning: `QUEUE_CONCURRENCY`, `QUEUE_MIN_INTERVAL_MS` nel `.env`

**Comportamento dei dati (come da specifica):**
- Al **primo utente** che apre l'app, il catalogo viene popolato con i giochi più popolari
  (job `populate_popular`).
- Quando un utente **cerca** un gioco non presente, il backend interroga IGDB e **scarica**
  i dati nel DB centrale → a vantaggio di tutti gli utenti.
- Se l'utente ha fatto il **pairing con Steam**, per i giochi vengono scaricate anche le
  informazioni di community (achievement, statistiche) tramite le Steam Web API.

---

## 3. Database (SQLite, schema ER)

Schema in [`backend/src/db/schema.sql`](./backend/src/db/schema.sql), modellato sul diagramma
Entity-Relationship fornito: `Utente`, `Saga`, `Gioco`, `Libreria_Utente`, `Cartella`,
`Cartella_Contenuto`, `Allegato` (+ `Diario` per le note). Il DB è **centralizzato e comune**
a tutti gli utenti e dispositivi. Il login è gestito centralmente con password hashate
(bcrypt) e token **JWT**.

Per i giochi vengono salvati esattamente i campi richiesti: nome, descrizione, URL immagine,
genere, sviluppatore, data di rilascio, link agli store, lingue, tag, saga, piattaforme,
time-to-beat (+ cache community Steam).

### Cartelle = HashMap (requisito 1.2)

Le "mensole" sono realizzate con una **HashMap** (chiave = nome cartella per utente,
valore = lista JSON di giochi), in memoria con write-through sulla tabella `folder_map`:
[`backend/src/services/folderStore.js`](./backend/src/services/folderStore.js).

### Ricerca con Edit Distance (requisito 4)

La ricerca è tollerante agli errori di battitura tramite **distanza di Levenshtein**: a
parità di assenza di match esatto viene proposto il gioco con il nome più vicino
("forse cercavi…"). Implementazione in
[`backend/src/utils/levenshtein.js`](./backend/src/utils/levenshtein.js).

---

## 4. API di Steam (requisito 3.1)

Wrapper in [`backend/src/services/steamService.js`](./backend/src/services/steamService.js):
`GetFriendList`, `GetUserStatsForGame`, `GetOwnedGames`, `GetRecentlyPlayedGames`,
`GetNewsForApp` (+ `GetPlayerAchievements` per il widget achievement).

### 4a. Integrazione IGDB reale

[`backend/src/services/igdbService.js`](./backend/src/services/igdbService.js) implementa:
auth Twitch OAuth client-credentials con **token cache** e de-dupe delle richieste
concorrenti; mappatura delle **categorie store** IGDB (Steam/Epic/GOG/itch/Microsoft/
ufficiale); estrazione automatica dello **steam_appid** dai siti; recupero del
**time-to-beat** dall'endpoint `game_time_to_beats`; query "popolari del momento"
(ultimi 2 anni, ordinati per follower). Senza credenziali Twitch usa il dataset offline.

Setup live: crea un'app su [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps),
copia `Client ID`/`Client Secret` nel `.env` → al riavvio `/health` mostra `"igdb":"live"`.

### 4b. Login Steam via OpenID 2.0

"Sign in through Steam" usa **OpenID 2.0** (non OAuth2). Flusso (sequence diagram UC-03):
- App → `WebBrowser.openAuthSessionAsync` apre `GET /auth/steam/login` ([route](./backend/src/routes/steamAuth.js)).
- Il backend redirige a Steam con i parametri OpenID e un `return_to` che porta con sé il
  JWT dell'utente e la deep-link di ritorno dell'app.
- Steam autentica e richiama `GET /auth/steam/return`; il backend **verifica l'asserzione**
  (`check_authentication` → `is_valid:true`, [helper](./backend/src/services/steamAuth.js)),
  estrae lo **SteamID64**, fa il pairing sull'utente, **accoda** `steam_sync` e rimanda
  l'app alla deep-link con esito.
- Gli **achievement/statistiche** sono **per-utente** (salvati in `Libreria_Utente.community_cache`,
  non nel gioco condiviso) e caricati automaticamente nella scheda gioco.

### 4c. Notifiche push — giochi gratis Epic

- [`epicService.js`](./backend/src/services/epicService.js) legge l'endpoint pubblico delle
  promozioni Epic (giochi gratis ora + in arrivo).
- Lo **scheduler** (in `index.js`, ogni 6h) accoda `epic_check`: rileva i titoli nuovi
  (tabella `epic_seen`, niente doppioni) e invia push via **Expo Push**
  ([`pushService.js`](./backend/src/services/pushService.js)) a tutti i device registrati
  (`POST /profile/push-token`).
- Lato app ([`src/lib/notifications.js`](./app/src/lib/notifications.js)): registrazione del
  token push + **fallback a notifica locale** (`notifyEpicFreeLocally`) che funziona anche in
  **Expo Go** (dove le push remote Android sono limitate dall'SDK 53+). I giochi gratis sono
  anche mostrati in cima alla tab **News**.

> Le push **remote** complete richiedono un **dev build / standalone** con `projectId` EAS;
> in Expo Go viene usato il fallback locale.

---

## 5. Struttura dell'app (tab e schermate)

- **Home** (`app/app/(tabs)/index.js`): mensole/cartelle, filtri *Tutti / Da continuare /
  Completati / Cartelle*, stato vuoto per il nuovo utente, header con profilo+stats e
  accesso a ricerca/impostazioni.
- **Cerca** (`search.js`): giochi più popolari + barra di ricerca con suggerimento Levenshtein.
- **News** (`news.js`): notizie dalle Steam API.
- **Dettaglio gioco** (`game/[id].js`): tutti i metadati, stato (da iniziare/in corso/
  completato), preferito, wishlist/backlog, store, achievement Steam, lingue/piattaforme/tag,
  accesso al **Diario**, aggiunta a una mensola.
- **Diario** (`diary/[possesso].js`): note con ore giocate, tag, spoiler nascosti, modale di
  scrittura (come da wireframe).
- **Profilo** (`profile.js`): modifica username/password/immagine/bio, **QR code** profilo,
  **scanner QR**, pairing **Steam**.
- **Impostazioni** (`settings.js`): tema chiaro/scuro, versione, contatto sviluppatori
  (`gameshelfunisa@gmail.com`).

---

## 6. Endpoint principali del backend

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/auth/register`, `/auth/login` | Registrazione / login (JWT) |
| GET | `/auth/steam/login` · `/auth/steam/return` | Login Steam OpenID 2.0 + pairing |
| GET | `/games/popular` | Giochi popolari (popola il DB via coda) |
| GET | `/games/search?q=` | Ricerca DB-first + Levenshtein + fallback IGDB via coda |
| GET | `/games/:id` | Dettaglio gioco |
| POST | `/games/:id/community` | Scarica dati community Steam (coda) |
| GET/POST/PATCH/DELETE | `/library` | Libreria utente (stato, preferito, wishlist, note) |
| GET/POST/DELETE | `/library/:id/diary` | Diario del gioco |
| GET/POST/PATCH/DELETE | `/folders` | Mensole (HashMap) |
| GET | `/news` | News Steam aggregate (coda) |
| GET/PATCH | `/profile/me` | Profilo utente |
| POST | `/profile/steam-pair` | Pairing Steam manuale + sync (coda) |
| POST | `/profile/push-token` | Registra il token push del device |
| GET | `/profile/qr` | Payload del QR profilo |
| GET | `/epic/free` | Giochi gratis Epic (ora + in arrivo) |
| POST | `/epic/check` | Forza check Epic + invio push (coda) |
| GET | `/jobs/stats`, `/jobs/:id` | Stato della coda / job |

---

## 7. Note

- I link alle copertine puntano alla CDN IGDB; alcune potrebbero non risolvere offline.
- Per IGDB reale: crea un'app su [dev.twitch.tv](https://dev.twitch.tv/console/apps) e inserisci
  `Client ID` e `Client Secret` nel `.env` del backend.
