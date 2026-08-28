# Misure di prestazione delle API — strumento e metodologia

Documento di riferimento per la valutazione sperimentale di GameShelf: descrive come è
implementato lo strumento di misura (`tools/benchmark.js`), quali grandezze rileva, come
impostare un esperimento valido e quali sono i limiti dei dati ottenuti.

---

## 1. Domande a cui le misure rispondono

1. **Quanto pesa la rete rispetto all'elaborazione?** Per ciascun endpoint, quale parte del
   tempo di risposta è dovuta al trasporto e quale al lavoro svolto dal server.
2. **Quanto cambia il comportamento passando da Wi-Fi a rete cellulare?** In particolare su
   latenza, stabilità (jitter) e costo di apertura della connessione.
3. **Le scelte architetturali hanno un effetto misurabile?** Nello specifico: cache
   applicativa, mediazione del backend verso i servizi esterni, riuso della connessione,
   sincronizzazione a due fasi.

---

## 2. Come è implementato lo strumento

`tools/benchmark.js` è uno script Node.js autonomo (solo moduli core: `http`, `https`, `fs`).
Non usa `fetch` perché quest'ultimo non espone gli eventi del socket, e senza quelli non è
possibile separare le fasi di una richiesta.

### 2.1 Rilevazione dei tempi

Ogni richiesta è emessa con `http.request` / `https.request`. I marcatori temporali sono
presi con `process.hrtime.bigint()` (orologio monotono, risoluzione al nanosecondo: non è
soggetto ad aggiustamenti dell'ora di sistema come `Date.now()`), agganciandosi agli eventi
del ciclo di vita del socket:

| Evento | Marcatore | Fase ricavata |
|---|---|---|
| inizio richiesta | `t0` | — |
| `socket` → `lookup` | `tDns` | **dns** = `tDns − t0` |
| `socket` → `connect` | `tConn` | **tcp** = `tConn − tDns` (handshake TCP ≈ 1 RTT) |
| `socket` → `secureConnect` | `tTls` | **tls** = `tTls − tConn` (handshake TLS) |
| primo `data` sulla risposta | `tFirstByte` | **ttfb** = `tFirstByte − t0` |
| `end` della risposta | `tEnd` | **download** = `tEnd − tFirstByte`, **total** = `tEnd − t0` |

Con il riuso della connessione (`--keepalive`) il socket viene consegnato già connesso: gli
eventi `lookup`/`connect`/`secureConnect` non vengono emessi, la richiesta è marcata come
`reusedSocket` e le fasi di handshake risultano assenti. È esattamente ciò che permette di
quantificare il costo dell'apertura di una connessione (§6.3).

### 2.2 Statistiche calcolate

Per ogni endpoint, sui campioni validi:

- **mediana (p50)**, **p95**, **p99**, minimo, massimo, media, deviazione standard;
- **jitter**: media delle differenze assolute tra campioni consecutivi,
  `jitter = (1/(n−1)) · Σ |xᵢ − xᵢ₋₁|`. È una versione semplificata dell'idea di jitter di
  RFC 3550 e misura l'*instabilità* del collegamento, non la sua lentezza media: è la
  grandezza che distingue meglio un collegamento radio da uno cablato;
- **byte trasferiti** (payload) e **throughput stimato** = `byte × 8 / total_p50` (kbit/s).

Si usa la mediana e non la media come indicatore principale perché la distribuzione dei
tempi di rete è asimmetrica: pochi campioni molto lenti (ritrasmissioni, cambio di cella)
spostano la media ma non la mediana.

### 2.3 Disciplina di esecuzione

- **warmup**: i primi campioni (default 3) sono scartati, per escludere l'inizializzazione
  di cache, connessioni DNS e JIT.
- **spaziatura**: 120 ms tra una richiesta e la successiva, per non misurare gli effetti di
  una raffica (coda TCP, rate limiting) invece della latenza.
- **connessione nuova per default**: così il costo di handshake è incluso e visibile;
  con `--keepalive` si misura invece il comportamento di un client che riusa la connessione,
  come fa l'app reale in una sessione d'uso.

---

## 3. Scenari misurati

### 3.1 Endpoint interni (`--target internal`)

Scelti per coprire regimi di costo diversi, non per completezza:

| Scenario | Endpoint | Perché è incluso |
|---|---|---|
| `health` | `GET /health` | nessun accesso al DB: è la linea di base, isola il costo di trasporto |
| `games_popular` | `GET /games/popular` | lettura dal catalogo, payload medio (~28 KB) |
| `game_detail` | `GET /games/:id` | singola riga + descrizione italiana già in cache |
| `folders` | `GET /folders` | struttura HashMap delle mensole, payload piccolo |
| `library` | `GET /library` | dati per-utente, payload grande (~68 KB) |
| `auth_login` | `POST /auth/login` | **CPU-bound**: dominato dalla verifica bcrypt |
| `games_search_igdb` | `GET /games/search` | **dipendente da servizio esterno**: passa dalla coda e chiama IGDB |

### 3.2 Servizi esterni (`--target external`)

Endpoint **pubblici**, raggiungibili da qualsiasi rete senza autenticazione né tunnel:

| Scenario | Servizio | Perché è incluso |
|---|---|---|
| `steam_news` | Steam Web API | payload piccolo → misura la **latenza** |
| `epic_promotions` | Epic Games Store | payload medio-grande (~33 KB) |
| `igdb_cover_cdn` | CDN immagini IGDB | download di una copertina → misura il **throughput** |

---

## 4. Dove eseguire le misure: il problema del deployment

Il backend, in sviluppo, gira sulla stessa macchina che esegue le misure. Su `localhost` il
traffico passa dall'interfaccia di **loopback**: l'RTT è praticamente nullo e non esiste
alcun segmento radio. Le misure interne fatte in locale rappresentano quindi **solo il costo
di elaborazione del backend**, non il tempo che l'utente sperimenta.

Per confrontare Wi-Fi e rete cellulare *sul percorso app ↔ backend* il backend deve trovarsi
fuori dalla rete locale. Le opzioni, con i rispettivi compromessi:

| Opzione | Cosa serve | Validità della misura | Costo |
|---|---|---|---|
| **A. Solo servizi esterni** | niente | **Alta**: endpoint pubblici, nessun intermediario aggiunto | nullo |
| **B. Tunnel** (`ngrok`, `localtunnel`, `cloudflared`) | un comando | Media: il traffico attraversa un host terzo che aggiunge latenza propria e un percorso non rappresentativo | nullo |
| **C. Deploy su PaaS/VPS** (Render, Fly.io, Railway, VPS) | deploy + configurazione | Alta, ma misura *quella* infrastruttura, non il prototipo locale | tempo; attenzione al filesystem effimero, che azzera il DB SQLite a ogni redeploy (rieseguire `npm run seed`) |
| **D. Composizione analitica** | nessuna infrastruttura | Alta se dichiarata come stima, non come misura diretta | nullo |

**Indicazione operativa.** Per l'obiettivo dell'elaborato **non è necessario mettere l'app
su un server**: la combinazione **A + D** produce risultati validi e difendibili senza alcun
deployment. L'opzione B si può aggiungere come verifica end-to-end, purché il contributo del
tunnel sia dichiarato. L'opzione C ha senso solo se il deployment è già un obiettivo del
progetto per altre ragioni.

### 4.1 Composizione analitica (opzione D)

Le due componenti si misurano separatamente e si compongono:

```
T_utente ≈ (n_roundtrip × RTT_rete) + T_handshake + T_elaborazione_backend + T_trasferimento
```

dove:

- `T_elaborazione_backend` si misura in locale (`--target internal`): è il tempo del server
  al netto della rete;
- `RTT_rete`, `T_handshake` e il throughput si misurano su Wi-Fi e su cellulare
  (`--target external`), perché sono proprietà del **collegamento**, non del servizio;
- `n_roundtrip` dipende dal protocollo: una richiesta HTTP su connessione già aperta ne
  richiede uno; aprire una connessione TCP+TLS ne aggiunge tipicamente 2–3.

Il risultato è una **stima del tempo percepito dall'utente su rete cellulare**, ottenuta da
misure reali di entrambe le componenti. Se si esegue anche l'opzione B, il valore misurato
end-to-end può essere confrontato con la stima per verificarne la coerenza.

---

## 5. Protocollo sperimentale suggerito

1. Avviare il backend (`cd backend && npm start`) e verificare che il catalogo sia popolato.
2. **Misura A — Wi-Fi, servizi esterni** (PC sulla Wi-Fi domestica):
   `node tools/benchmark.js --label wifi --target external --runs 40`
3. **Misura B — cellulare, servizi esterni** (PC collegato all'hotspot 4G/5G dello
   smartphone; disattivare la Wi-Fi domestica):
   `node tools/benchmark.js --label 4g --target external --runs 40`
4. **Misura C — costo di elaborazione** (in locale, rete ininfluente):
   `node tools/benchmark.js --label locale --target internal --runs 40`
5. **Misura D — effetto del riuso della connessione**, su entrambe le reti:
   `node tools/benchmark.js --label wifi-ka --target external --runs 40 --keepalive`
6. Confronto: `node tools/benchmark.js --compare`
7. Ripetere le misure 2 e 3 in **due momenti diversi della giornata**: la variabilità della
   rete cellulare è essa stessa un risultato da riportare.

---

## 5.1 Esperimento aggiuntivo: effetto della qualità del collegamento radio

Le prestazioni non dipendono solo dal *tipo* di rete (Wi-Fi o cellulare) ma dalla **qualità
del collegamento**. Introdurla come variabile indipendente permette di spiegare la varianza
dei tempi di risposta invece di limitarsi a constatarla.

### 5.1.1 Grandezze da rilevare

| Rete | Grandezza | Significato | Ordini di grandezza indicativi |
|---|---|---|---|
| Wi-Fi | **RSSI** (dBm) | potenza del segnale ricevuto | ≈ −40 ottimo · ≈ −67 buono · ≈ −80 scarso |
| LTE / 5G | **RSRP** (dBm) | potenza del segnale di riferimento | ≈ −80 ottimo · ≈ −100 medio · ≈ −110 e oltre scarso |
| LTE / 5G | **RSRQ** (dB), **SINR** (dB) | qualità e rapporto segnale/interferenza | SINR > 20 ottimo · < 5 scarso |

Sono valori **negativi**: più vicini a zero, migliore è il segnale. La scala è logaritmica,
quindi una differenza di 10 dB corrisponde a un fattore 10 di potenza.

### 5.1.2 Come rilevarle

- **Android**: *Impostazioni → Info sul telefono → Stato SIM* riporta potenza del segnale e
  tecnologia; app come *Network Cell Info Lite* o *Cellular-Z* mostrano RSRP, RSRQ, SINR,
  banda e identificativo della cella in tempo reale.
- **iOS**: il *Field Test Mode* (`*3001#12345#*`) espone dati limitati e variabili secondo la
  versione; su iPhone è più affidabile rilevare il segnale dal terminale Android usato come
  hotspot.
- **Windows (Wi-Fi)**: `netsh wlan show interfaces` riporta il campo *Segnale* in percentuale;
  la conversione approssimata in dBm è `RSSI ≈ (percentuale / 2) − 100`.

Registra il valore **all'inizio e alla fine** di ogni sessione di misura e riporta l'intervallo:
il segnale non è costante.

### 5.1.3 Condizioni suggerite (quattro sessioni)

| Etichetta | Rete | Come ottenerla |
|---|---|---|
| `wifi-buono` | Wi-Fi | in prossimità dell'access point, banda 5 GHz |
| `wifi-debole` | Wi-Fi | a distanza, con ostacoli (muri), banda 2,4 GHz |
| `cell-buono` | 4G/5G | all'aperto o in prossimità di una finestra, RSRP alto |
| `cell-debole` | 4G/5G | in ambiente schermato (interrato, locale interno), RSRP basso |

Le condizioni si annotano direttamente nel CSV:

```bash
node tools/benchmark.js --label cell-debole --target external --runs 40 \
  --signal "RSRP -109 dBm, SINR 2 dB" --note "piano interrato, 4G"
```

### 5.1.4 Accorgimenti per non invalidare il confronto

- **Collega il PC allo smartphone via USB tethering**, non tramite hotspot Wi-Fi: altrimenti
  il percorso contiene due tratte radio (PC↔telefono in Wi-Fi e telefono↔rete cellulare) e
  non è chiaro quale delle due determini il risultato.
- **Cambia una variabile alla volta.** Se passi contemporaneamente da 5 GHz a 2,4 GHz *e*
  aumenti la distanza, l'effetto osservato non è attribuibile a nessuna delle due cause.
- **Esegui le sessioni ravvicinate nel tempo**, per ridurre l'effetto della congestione
  variabile dei servizi remoti e della rete dell'operatore.
- **Riporta la tecnologia effettivamente agganciata** (LTE, LTE-A, NR NSA/SA): il terminale
  può cambiarla durante la misura, ed è un fattore rilevante quanto il livello di segnale.
- Ricorda che la potenza del segnale **non determina da sola** le prestazioni: congestione
  della cella, numero di utenti serviti e backhaul dell'operatore incidono e non sono
  osservabili dal terminale. Questo va dichiarato tra i limiti.

### 5.1.5 Come mantenere l'analisi proporzionata

L'obiettivo non è caratterizzare la rete radio, ma **spiegare il comportamento
dell'applicazione**. È sufficiente: il sottoinsieme di endpoint esterni (tre scenari), una
tabella con le quattro condizioni, un grafico di confronto e una discussione che colleghi il
degrado osservato alle scelte architetturali (cache, riduzione dei round-trip, riuso della
connessione). Circa una pagina e mezza in tutto.

---

## 6. Dati di riferimento già raccolti (Wi-Fi)

Utili come termine di paragone. `runs = 15`, connessione nuova per ogni richiesta salvo dove
indicato.

### 6.1 Elaborazione del backend (localhost, RTT ≈ 0)

| Endpoint | TTFB p50 | Totale p50 | Payload |
|---|---|---|---|
| `health` | 3,35 ms | 3,40 ms | 112 B |
| `folders` | 3,52 ms | 3,56 ms | 1,6 KB |
| `game_detail` | 3,73 ms | 3,78 ms | 2,0 KB |
| `games_popular` | 5,24 ms | 5,29 ms | 28,3 KB |
| `library` | 6,50 ms | 6,70 ms | 68,6 KB |
| `auth_login` | 102,88 ms | 102,96 ms | — |
| `games_search_igdb` | 1156,83 ms | 1156,88 ms | 15,2 KB |

Tre regimi distinti: accesso locale al DB (3–7 ms), operazione **CPU-bound** (login, ~103 ms,
dominato da bcrypt), dipendenza da **servizio esterno** (ricerca, ~1157 ms).

### 6.2 Servizi esterni (Wi-Fi, connessione nuova)

| Servizio | TCP (≈RTT) | TLS | TTFB | Totale | Payload |
|---|---|---|---|---|---|
| Steam Web API | 23,54 ms | 45,02 ms | 105,85 ms | 106,00 ms | 2,1 KB |
| Epic promotions | 22,70 ms | 25,93 ms | 76,43 ms | 99,57 ms | 33,0 KB |
| CDN IGDB | 17,45 ms | 19,64 ms | 61,74 ms | 61,95 ms | 16,2 KB |

L'handshake TLS costa quanto **uno o due RTT aggiuntivi** oltre a quello TCP.

### 6.3 Effetto del riuso della connessione (Wi-Fi)

| Servizio | Connessione nuova | Keep-alive | Riduzione |
|---|---|---|---|
| Steam Web API | 106,00 ms | 33,64 ms | −68 % |
| Epic promotions | 99,57 ms | 31,92 ms | −68 % |
| CDN IGDB | 61,95 ms | 19,48 ms | −69 % |

Poiché il risparmio corrisponde ai round-trip di apertura della connessione, e l'RTT su rete
cellulare è tipicamente più alto che su Wi-Fi, ci si attende che lo stesso accorgimento
produca un risparmio **assoluto maggiore** su 4G/5G: è un'ipotesi verificabile ripetendo la
misura 6.3 sulla rete cellulare.

---

## 7. Limiti e minacce alla validità

- **Loopback ≠ rete**: i valori di §6.1 non includono alcun costo di trasporto.
- **Tunnel**: se usato, introduce un intermediario e una latenza non attribuibile né al
  client né al backend.
- **Percentili su pochi campioni**: con 15 campioni il p95 coincide di fatto con il secondo
  valore più alto. Per p95/p99 stabili servono almeno 40 campioni per endpoint.
- **Variabilità della rete cellulare**: dipende da copertura, cella servente, congestione e
  orario. Una singola sessione di misura non è rappresentativa: ripetere e riportare il jitter.
- **Servizi di terze parti**: Steam, Epic e IGDB hanno carichi, cache e CDN fuori dal nostro
  controllo; i loro tempi non sono riproducibili in modo esatto.
- **Cache applicativa**: i tempi di `game_detail` presuppongono la descrizione italiana già
  tradotta e memorizzata; la prima richiesta per un gioco mai aperto è più lenta di alcuni
  ordini di grandezza (traduzione remota).
