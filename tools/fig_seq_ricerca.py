#!/usr/bin/env python3
"""Figura 14 - Sequenza della ricerca con popolamento del catalogo."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

plt.rcParams.update({"font.family": "sans-serif"})
DARK, GREY, ACCENT, BAND = "#2E2E2E", "#6E6E6E", "#8C2F2F", "#F2F2F2"
FS_P, FS_M = 7.0, 6.0

fig, ax = plt.subplots(figsize=(5.9, 3.5))
ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
fig.canvas.draw(); REND = fig.canvas.get_renderer()

def tw(s, size, weight="normal"):
    t = ax.text(0, 0, s, fontsize=size, fontweight=weight)
    bb = t.get_window_extent(renderer=REND)
    p = ax.transData.inverted().transform([(bb.x0, 0), (bb.x1, 0)])
    t.remove(); return p[1][0] - p[0][0]

PARTS = ["App", "Rotta REST", "Coda", "Fonte metadati", "Catalogo"]
X = [7.0, 26.0, 46.0, 70.0, 91.0]
TOP, BOT = 88.0, 6.0

ax.add_patch(Rectangle((0, 22.0), 100, 46.0, facecolor=BAND, edgecolor="none"))
ax.text(99.0, 24.0, "il lavoro e' eseguito dal consumatore", ha="right", va="bottom",
        fontsize=FS_M, style="italic", color="#666666")

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
    ax.text((x1 + x2) / 2, y + 1.4, label, ha="center", va="bottom",
            fontsize=FS_M, color="#333333")

msg(81.0, 0, 1, "GET /games/search")
msg(74.0, 1, 2, "accoda la ricerca e attende l'esito")
msg(64.0, 2, 3, "interrogazione con selezione dei campi")
msg(56.0, 3, 2, "risultati in ordine di pertinenza", ret=True)
msg(48.0, 2, 4, "normalizzazione e memorizzazione")
msg(40.0, 4, 2, "identificatori dei titoli", ret=True)
msg(30.0, 2, 1, "evento di completamento", ret=True)
msg(16.0, 1, 0, "risultati e correzione proposta", ret=True)

ax.plot([3.0, 1.6, 1.6, 3.0], [82.0, 82.0, 15.0, 15.0], color=ACCENT, linewidth=0.9)
ax.text(0.9, 48.5, "attesa dell'utente", ha="center", va="center", rotation=90,
        fontsize=FS_M, color=ACCENT)

out = "C:/Users/39392/Downloads/GameShelf/docs/figure/seq_ricerca_catalogo"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.03, dpi=300)
print("ok")
