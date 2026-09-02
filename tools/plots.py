#!/usr/bin/env python3
"""
GameShelf — generazione dei grafici per la valutazione sperimentale
==================================================================

Legge i CSV prodotti da `tools/benchmark.js` e produce le figure pronte per la
tesi, in PDF (vettoriale, qualita' di stampa) e PNG (anteprima).

    python tools/plots.py                      # usa tools/results
    python tools/plots.py --dir altra/cartella --out figure/

Grafici generati:
  1. composizione_tempi   barre impilate: dove va il tempo di ogni endpoint
                          (connessione TCP+TLS / attesa del server / trasferimento)
  2. boxplot_condizioni   dispersione dei campioni per condizione di rete
  3. confronto_condizioni barre affiancate: mediana per endpoint e per rete

Richiede: pandas, matplotlib (gia' installati).
"""

import argparse
import glob
import os
import sys

import pandas as pd
import matplotlib
matplotlib.use("Agg")           # nessuna finestra: salva solo su file
import matplotlib.pyplot as plt

# Stile coerente con la tesi: sans-serif, griglia leggera, niente cornici inutili
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.size": 9,
    "axes.titlesize": 10,
    "axes.labelsize": 9,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.alpha": 0.3,
    "grid.linestyle": "--",
    "figure.dpi": 150,
})

# Palette distinguibile anche in stampa in scala di grigi
COLORS = ["#4C72B0", "#DD8452", "#55A868", "#C44E52", "#8172B3"]


def load(pattern, folder):
    """Carica e concatena tutti i CSV che corrispondono al pattern."""
    files = sorted(glob.glob(os.path.join(folder, pattern)))
    if not files:
        return None
    frames = []
    for f in files:
        try:
            frames.append(pd.read_csv(f))
        except Exception as e:                      # file vuoto o corrotto
            print(f"  ! ignorato {os.path.basename(f)}: {e}")
    return pd.concat(frames, ignore_index=True) if frames else None


def save(fig, out_dir, name):
    os.makedirs(out_dir, exist_ok=True)
    for ext in ("pdf", "png"):
        path = os.path.join(out_dir, f"{name}.{ext}")
        fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    print(f"  -> {name}.pdf / .png")


def plot_composizione(raw, out_dir):
    """Barre impilate: quale fase consuma il tempo di risposta di ogni endpoint."""
    if raw is None:
        return
    df = raw[raw["status"].between(200, 399)].copy()
    if df.empty:
        return

    # una sola condizione per volta: se ce ne sono piu', usa la prima
    label = df["label"].iloc[0]
    df = df[df["label"] == label]

    g = df.groupby("endpoint").median(numeric_only=True)
    # scomposizione: connessione = dns+tcp+tls; server = ttfb - connessione; download
    conn = (g.get("dns_ms", 0).fillna(0) + g.get("tcp_ms", 0).fillna(0)
            + g.get("tls_ms", 0).fillna(0))
    server = (g["ttfb_ms"] - conn).clip(lower=0)
    download = g["download_ms"].fillna(0)
    order = (conn + server + download).sort_values().index
    conn, server, download = conn[order], server[order], download[order]

    fig, ax = plt.subplots(figsize=(7.0, 3.4))
    x = range(len(order))
    ax.bar(x, conn, label="Connessione (DNS+TCP+TLS)", color=COLORS[0])
    ax.bar(x, server, bottom=conn, label="Attesa del server", color=COLORS[1])
    ax.bar(x, download, bottom=conn + server, label="Trasferimento", color=COLORS[2])
    ax.set_xticks(list(x))
    ax.set_xticklabels(order, rotation=30, ha="right")
    ax.set_ylabel("Tempo [ms]")
    ax.set_title(f"Composizione del tempo di risposta — {label}")
    # legenda sotto il grafico: non copre mai le barre
    ax.legend(frameon=False, ncol=3, fontsize=8,
              loc="upper center", bbox_to_anchor=(0.5, -0.32))
    save(fig, out_dir, "composizione_tempi")


def plot_boxplot(raw, out_dir):
    """Dispersione dei campioni: e' qui che si vede la differenza fra le reti."""
    if raw is None or raw["label"].nunique() < 1:
        return
    df = raw[raw["status"].between(200, 399)].copy()
    if df.empty:
        return

    endpoints = df["endpoint"].unique()
    labels = sorted(df["label"].unique())
    fig, axes = plt.subplots(1, len(endpoints), figsize=(2.6 * len(endpoints), 3.4),
                             sharey=False)
    if len(endpoints) == 1:
        axes = [axes]

    for ax, ep in zip(axes, endpoints):
        data = [df[(df["endpoint"] == ep) & (df["label"] == l)]["total_ms"].dropna()
                for l in labels]
        bp = ax.boxplot(data, patch_artist=True, widths=0.6,
                        medianprops=dict(color="black", linewidth=1.4))
        for patch, c in zip(bp["boxes"], COLORS):
            patch.set_facecolor(c)
            patch.set_alpha(0.75)
        ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=8)
        ax.set_title(ep, fontsize=9)
        ax.set_ylabel("Tempo totale [ms]" if ep == endpoints[0] else "")
    fig.suptitle("Dispersione dei tempi di risposta per condizione di rete", y=1.02)
    save(fig, out_dir, "boxplot_condizioni")


def plot_confronto(summary, out_dir):
    """Barre affiancate: mediana per endpoint, una serie per condizione."""
    if summary is None or summary["label"].nunique() < 2:
        return
    piv = summary.pivot_table(index="endpoint", columns="label",
                              values="total_p50", aggfunc="first")
    fig, ax = plt.subplots(figsize=(7.0, 3.4))
    piv.plot(kind="bar", ax=ax, color=COLORS[:len(piv.columns)], width=0.75,
             edgecolor="none")
    ax.set_ylabel("Mediana del tempo totale [ms]")
    ax.set_xlabel("")
    ax.set_title("Confronto fra condizioni di rete")
    ax.legend(frameon=False, fontsize=8, title=None)
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right")
    save(fig, out_dir, "confronto_condizioni")


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Genera i grafici delle misure GameShelf")
    ap.add_argument("--dir", default=os.path.join(here, "results"),
                    help="cartella dei CSV (default: tools/results)")
    ap.add_argument("--out", default=os.path.join(here, "results", "figure"),
                    help="cartella di destinazione delle figure")
    args = ap.parse_args()

    print(f"CSV letti da: {args.dir}")
    raw = load("raw_*.csv", args.dir)
    summary = load("summary_*.csv", args.dir)

    if raw is None and summary is None:
        print("Nessun CSV trovato. Esegui prima una misura:")
        print("  node tools/benchmark.js --label wifi --target external --runs 40")
        sys.exit(1)

    if raw is not None:
        print(f"campioni: {len(raw)} | condizioni: {', '.join(sorted(raw['label'].unique()))}")
    print("Genero le figure:")
    plot_composizione(raw, args.out)
    plot_boxplot(raw, args.out)
    plot_confronto(summary, args.out)
    print(f"\nFigure salvate in: {args.out}")
    print("Inseriscile in tesi con \\includegraphics{...pdf} (versione vettoriale).")


if __name__ == "__main__":
    main()
