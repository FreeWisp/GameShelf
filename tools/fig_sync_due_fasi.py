#!/usr/bin/env python3
"""Figura 22 - Sequenza della sincronizzazione della libreria in due fasi.
Disegnata alla larghezza di stampa (textwidth = 15 cm)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

plt.rcParams.update({"font.family": "sans-serif"})
DARK, GREY = "#2E2E2E", "#6E6E6E"
BAND1, BAND2, ACCENT = "#F1F1F1", "#F9F9F9", "#8C2F2F"
FS_P, FS_M, FS_B = 7.0, 6.0, 6.4

fig, ax = plt.subplots(figsize=(5.9, 4.7))
ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
fig.canvas.draw(); REND = fig.canvas.get_renderer()

def tw(s, size, weight="normal"):
    t = ax.text(0, 0, s, fontsize=size, fontweight=weight)
    bb = t.get_window_extent(renderer=REND)
    p = ax.transData.inverted().transform([(bb.x0, 0), (bb.x1, 0)])
    t.remove(); return p[1][0] - p[0][0]

PARTS = ["App", "Rotta REST", "Coda", "Servizi esterni", "Database"]
X = [7.0, 26.0, 46.0, 69.0, 90.0]
TOP, BOT = 91.0, 4.0

ax.add_patch(Rectangle((0, 41.0), 100, 48.0, facecolor=BAND1, edgecolor="none"))
ax.add_patch(Rectangle((0, 4.0), 100, 34.0, facecolor=BAND2, edgecolor="none"))
ax.text(99.0, 87.8, "Fase 1 — sincronizzazione", ha="right", va="top",
        fontsize=FS_B, fontweight="bold", color="#555555")
ax.text(99.0, 36.8, "Fase 2 — arricchimento differito", ha="right", va="top",
        fontsize=FS_B, fontweight="bold", color="#555555")

for name, x in zip(PARTS, X):
    w = tw(name, FS_P, "bold") + 4.0
    ax.add_patch(FancyBboxPatch((x - w/2, TOP), w, 6.0,
        boxstyle="round,pad=0,rounding_size=0.8",
        facecolor="#FFFFFF", edgecolor=DARK, linewidth=0.9))
    ax.text(x, TOP + 3.0, name, ha="center", va="center",
            fontsize=FS_P, fontweight="bold", color="#111111")
    ax.plot([x, x], [BOT, TOP], color=GREY, linewidth=0.6, linestyle=(0, (2, 2.5)))

def msg(y, a, b, label, ret=False):
    x1, x2 = X[a], X[b]
    ax.add_patch(FancyArrowPatch((x1, y), (x2, y), arrowstyle="-|>",
        mutation_scale=7, linewidth=0.85, color=GREY if ret else DARK,
        linestyle=(0, (3, 2)) if ret else "-", shrinkA=0, shrinkB=0))
    ax.text((x1 + x2) / 2, y + 1.3, label, ha="center", va="bottom",
            fontsize=FS_M, color="#333333")

def selfmsg(y, a, label):
    x = X[a]
    for p1, p2, style in (((x, y), (x + 4.5, y), "-"),
                          ((x + 4.5, y), (x + 4.5, y - 3.0), "-"),
                          ((x + 4.5, y - 3.0), (x, y - 3.0), "-|>")):
        ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle=style, mutation_scale=7,
            linewidth=0.85, color=DARK, shrinkA=0, shrinkB=0))
    ax.text(x + 6.0, y - 1.5, label, ha="left", va="center",
            fontsize=FS_M, color="#333333")

msg(84.0, 0, 1, "POST /profile/steam-pair")
msg(77.0, 1, 2, "accoda la sincronizzazione")
msg(70.0, 1, 0, "202 Accepted + identificativo", ret=True)
msg(62.0, 2, 3, "titoli posseduti")
msg(55.0, 3, 2, "elenco", ret=True)
msg(48.0, 2, 4, "record leggeri e associazioni")
selfmsg(43.0, 2, "accoda l'arricchimento")

msg(30.0, 2, 4, "record privi di metadati")
msg(23.0, 2, 3, "metadati per identificativo")
msg(16.0, 2, 4, "aggiorna in loco")
selfmsg(11.0, 2, "riaccoda se ha progredito")

# Attesa percepita: dalla richiesta al termine della fase 1
ax.plot([3.0, 1.6, 1.6, 3.0], [85.0, 85.0, 40.0, 40.0], color=ACCENT, linewidth=0.9)
ax.text(0.9, 62.5, "attesa percepita", ha="center", va="center", rotation=90,
        fontsize=FS_M, color=ACCENT)

out = "C:/Users/39392/Downloads/GameShelf/docs/figure/sync_due_fasi"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.03, dpi=300)
print("ok")
