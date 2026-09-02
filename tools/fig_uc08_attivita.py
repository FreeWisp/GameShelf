#!/usr/bin/env python3
"""Diagramma di attivita' UC-08 - Ricerca e popolamento del catalogo.
Stile allineato ai diagrammi di attivita' prodotti dal gruppo."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, FancyArrowPatch, Polygon

plt.rcParams.update({"font.family": "sans-serif"})
FILL, EDGE, INK = "#E9E9FA", "#A29AE0", "#1F2328"
LBLBG = "#EAEAEA"
FS_B, FS_L, FS_T = 7.0, 6.4, 9.0

fig, ax = plt.subplots(figsize=(5.9, 5.4))
ax.set_xlim(0, 100); ax.set_ylim(-11, 100); ax.axis("off")

def box(cx, cy, w, h, lines):
    ax.add_patch(Rectangle((cx-w/2, cy-h/2), w, h,
        facecolor=FILL, edgecolor=EDGE, linewidth=1.0))
    n = len(lines)
    for i, t in enumerate(lines):
        ax.text(cx, cy + (n-1)*2.0 - i*4.0, t, ha="center", va="center",
                fontsize=FS_B, color=INK)

def diamond(cx, cy, w, h, text):
    ax.add_patch(Polygon([(cx, cy+h/2), (cx+w/2, cy), (cx, cy-h/2), (cx-w/2, cy)],
        closed=True, facecolor=FILL, edgecolor=EDGE, linewidth=1.0))
    ax.text(cx, cy, text, ha="center", va="center", fontsize=FS_B, color=INK)

def node(cx, cy):
    ax.add_patch(Circle((cx, cy), 1.8, facecolor=FILL, edgecolor=EDGE, linewidth=1.2))

def arrow(p1, p2, rad=0.0):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=9,
        linewidth=0.9, color=INK, shrinkA=0, shrinkB=0,
        connectionstyle=f"arc3,rad={rad}"))

def elabel(x, y, t):
    ax.text(x, y, t, ha="center", va="center", fontsize=FS_L, color=INK,
            bbox=dict(facecolor=LBLBG, edgecolor="none", pad=1.6))

ax.text(50, 97.5, "UC-08 · Ricerca e popolamento del catalogo",
        ha="center", va="center", fontsize=FS_T, color="#3A3A3A")

node(50, 92)
box(50, 84, 44, 9, ["Utente digita la stringa di ricerca"])
box(50, 71, 50, 9, ["Il sistema interroga la fonte dei metadati"])
diamond(50, 56, 30, 13, "Esito?")
arrow((50, 90.2), (50, 88.5)); arrow((50, 79.5), (50, 75.5))
arrow((50, 66.5), (50, 62.5))

COLS = (17, 50, 83)
arrow((35.5, 56.5), (COLS[0], 46.5), rad=0.10)
arrow((50, 49.5), (50, 46.5))
arrow((64.5, 56.5), (COLS[2], 46.5), rad=-0.10)
elabel(26, 51.5, "nessun risultato")
elabel(50, 51.0, "risultati presenti")
elabel(75, 51.5, "nessuna corrispondenza")

box(COLS[0], 40, 30, 13, ["Sondaggio a prefissi", "decrescenti"])
box(COLS[1], 40, 30, 13, ["Risultati presentati", "in ordine di pertinenza"])
box(COLS[2], 40, 30, 13, ["Nessuna correzione:", "insieme vuoto"])

arrow((COLS[0], 33.5), (COLS[0], 29.5))
arrow((COLS[1], 33.5), (COLS[1], 29.5))
box(COLS[0], 22, 30, 13, ["Correzione proposta", "e ricerca ripetuta"])
box(COLS[1], 22, 30, 13, ["Titoli memorizzati nel", "catalogo condiviso"])

# La correzione rientra nel flusso principale
arrow((COLS[0] + 15, 22), (COLS[1] - 15, 22))

arrow((COLS[1], 15.5), (COLS[1], 11.0))
box(COLS[1], 6.5, 34, 9, ["Aggiunta alla libreria dell'utente"])
arrow((COLS[1], 2.0), (COLS[1], -3.6))
node(50, -6.0)

# Il ramo senza corrispondenze raggiunge il nodo finale sul lato destro
ax.add_patch(FancyArrowPatch((COLS[2], 33.5), (COLS[2], -6.0), arrowstyle="-",
    linewidth=0.9, color=INK, shrinkA=0, shrinkB=0))
arrow((COLS[2], -6.0), (52.2, -6.0))

out = "C:/Users/39392/Downloads/GameShelf/docs/figure/uc_08_ricerca_catalogo"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.05, dpi=300)
print("ok")
