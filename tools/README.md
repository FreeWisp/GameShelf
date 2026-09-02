# Strumenti di misura

## `benchmark.js` — latenza delle API e confronto tra reti

Misura i tempi di risposta delle API di GameShelf e dei servizi esterni da cui dipendono,
scomponendo ogni richiesta nelle sue fasi (DNS, TCP, TLS, TTFB, download) per distinguere
il costo della **rete** da quello dell'**elaborazione lato server**.

Non richiede dipendenze: usa solo moduli core di Node.

### Esecuzione

```bash
# endpoint interni + esterni, rete Wi-Fi
node tools/benchmark.js --label wifi --target all --runs 40

# solo servizi esterni (nessun tunnel necessario), rete cellulare
node tools/benchmark.js --label 4g --target external --runs 40

# effetto del riuso della connessione TCP/TLS
node tools/benchmark.js --label wifi-keepalive --target external --runs 40 --keepalive

# confronto di tutte le misure raccolte
node tools/benchmark.js --compare
```

### Opzioni

| Opzione | Default | Significato |
|---|---|---|
| `--label` | *(obbligatoria)* | nome della condizione misurata (`wifi-buono`, `cell-debole`, …) |
| `--signal` | — | qualità del segnale rilevata, salvata nel CSV (es. `"RSRP -109 dBm"`) |
| `--note` | — | annotazione libera sulla condizione (es. `"piano interrato"`) |
| `--target` | `internal` | `internal` (API GameShelf), `external` (Steam/Epic/CDN IGDB), `all` |
| `--url` | `http://localhost:4000` | base URL del backend |
| `--runs` | `30` | campioni per endpoint |
| `--warmup` | `3` | campioni iniziali scartati |
| `--keepalive` | off | riusa la connessione (simula il comportamento reale dell'app) |
| `--out` | `tools/results` | cartella di output |

### Output

- `summary_<label>_<target>.csv` — una riga per endpoint: mediana, p95, p99, media,
  deviazione standard, jitter, byte trasferiti, throughput stimato.
- `raw_<label>_<target>.csv` — un campione per riga (per istogrammi e boxplot).
- `comparison.csv` — mediane affiancate per rete, con delta assoluto e percentuale.

### Metriche

| Campo | Cosa misura |
|---|---|
| `tcp_p50` | handshake TCP: stima del round-trip time (RTT) del collegamento |
| `tls_p50` | handshake TLS: round-trip aggiuntivi introdotti da HTTPS |
| `ttfb_p50` | time to first byte: RTT + tempo di elaborazione del server |
| `total_p50` | tempo end-to-end, download del payload incluso |
| `total_jitter` | variazione media tra campioni consecutivi: instabilità del collegamento |
| `kbps` | throughput stimato (byte del payload / tempo totale) |
| `tls_ver` | versione TLS negoziata: serve a leggere `tls_p50` in numero di round-trip (TLS 1.3 = 1 RTT, TLS 1.2 = 2 RTT) |
| `reused` / `reused_n` | quante richieste hanno riusato un socket già aperto: verifica che `--keepalive` abbia davvero avuto effetto |
| `ts_iso` / `ts_epoch_ms` | istante di avvio di ogni singola richiesta (ora locale con offset, e epoch in ms): permette di allineare i campioni a una cattura di livello radio o a un trace di pacchetti |
| `t_start_iso` / `t_end_iso` | finestra temporale della serie di misure su un endpoint: è l'intervallo da ritagliare nel log esterno |

### Note metodologiche

- **Misure verso i servizi esterni**: gli endpoint sono pubblici, quindi il confronto
  Wi-Fi / cellulare è diretto e non introduce intermediari.
- **Misure verso il backend da rete cellulare**: richiedono che il backend sia raggiungibile
  (es. tramite tunnel). Il tunnel aggiunge però latenza propria e instrada il traffico
  attraverso un terzo host: il dato va letto come confronto relativo, non assoluto.
- **In locale (`localhost`) non c'è rete reale**: il traffico passa dall'interfaccia di
  loopback (RTT ≈ 0). I valori interni misurati in locale rappresentano quindi il solo
  costo di elaborazione del backend.
- La rete cellulare varia con copertura, orario e cella servente: ripetere la misura in
  momenti diversi e usare `--runs` elevato (≥ 40) rende p95/p99 più stabili.

---

## `plots.py` — grafici delle misure

Legge i CSV prodotti da `benchmark.js` e genera le figure pronte per l'elaborato, in PDF
(vettoriale, per la stampa) e PNG (anteprima).

```bash
python tools/plots.py                          # legge tools/results
python tools/plots.py --dir altra/cartella --out figure/
```

Richiede `pandas` e `matplotlib`.

### Figure generate (in `tools/results/figure/`)

| File | Contenuto |
|---|---|
| `composizione_tempi` | barre impilate: quota di connessione (DNS+TCP+TLS), attesa del server e trasferimento per ciascun endpoint |
| `boxplot_condizioni` | dispersione dei campioni per condizione di rete: mediana, quartili, valori anomali |
| `confronto_condizioni` | barre affiancate: mediana del tempo totale per endpoint e per rete |

Il boxplot richiede almeno due condizioni misurate (due `--label` differenti) per essere
significativo; il confronto affiancato viene prodotto solo in quel caso.
