#!/usr/bin/env python3
"""Diagramma dei casi d'uso di GameShelf, esteso con UC-08.
Riproduce lo stile del diagramma prodotto dal gruppo."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, FancyArrowPatch, Circle

plt.rcParams.update({"font.family": "sans-serif"})
INK = "#1A1A1A"
FS, FS_A, FS_S = 7.0, 7.2, 6.4

fig, ax = plt.subplots(figsize=(5.9, 6.0))
ax.set_xlim(0, 100); ax.set_ylim(0, 107); ax.axis("off")

def actor(cx, cy, name, stereo=None):
    ax.add_patch(Circle((cx, cy + 4.2), 1.6, fill=False, edgecolor=INK, linewidth=0.9))
    ax.plot([cx, cx], [cy + 2.6, cy - 1.4], color=INK, linewidth=0.9)
    ax.plot([cx - 2.6, cx + 2.6], [cy + 1.6, cy + 1.6], color=INK, linewidth=0.9)
    ax.plot([cx, cx - 2.2], [cy - 1.4, cy - 4.6], color=INK, linewidth=0.9)
    ax.plot([cx, cx + 2.2], [cy - 1.4, cy - 4.6], color=INK, linewidth=0.9)
    y = cy - 6.4
    if stereo:
        ax.text(cx, y, stereo, ha="center", va="top", fontsize=FS_S, color=INK)
        y -= 3.2
    ax.text(cx, y, name, ha="center", va="top", fontsize=FS_A, color=INK)

def uc(cx, cy, lines, rx=17.0, ry=5.4):
    ax.add_patch(Ellipse((cx, cy), rx*2, ry*2, fill=False, edgecolor=INK, linewidth=0.9))
    n = len(lines)
    for i, t in enumerate(lines):
        ax.text(cx, cy + (n-1)*1.9 - i*3.8, t, ha="center", va="center",
                fontsize=FS, color=INK)
    return (cx, cy, rx, ry)

def link(p1, p2):
    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color=INK, linewidth=0.8)

CX, RX = 46.0, 17.0
UCS = [
    (92.0, ["Gestione del Profilo"]),
    (80.0, ["Sincronizzazione", "Libreria"]),
    (68.0, ["Organizzazione", "Libreria"]),
    (56.0, ["Monitoraggio", "e Consultazione"]),
    (44.0, ["Gestione Archivio", "e Wishlist"]),
    (32.0, ["Diario di gioco"]),
    (20.0, ["Gestione notifiche"]),
    (8.0,  ["Ricerca e popolamento", "del catalogo"]),
]
for y, lab in UCS:
    uc(CX, y, lab)

actor(8.0, 50.0, "Utente")
for y, _ in UCS:
    link((11.5, 50.0), (CX - RX + 1.5, y))

actor(90.0, 80.0, "EpicGames", "<<system>>")
actor(90.0, 62.0, "Steam", "<<system>>")
actor(90.0, 44.0, "AltriStore", "<<system>>")
actor(90.0, 12.0, "IGDB", "<<system>>")
for ay in (80.0, 62.0, 44.0):
    link((CX + RX - 1.5, 80.0), (86.5, ay))
link((CX + RX - 1.5, 8.0), (86.5, 12.0))
link((CX + RX - 1.5, 56.0), (86.5, 14.5))

uc(80.0, 99.0, ["Condivisione", "QRCode"], rx=13.0, ry=5.0)
ax.add_patch(FancyArrowPatch((67.0, 97.2), (62.6, 94.6), arrowstyle="-|>",
    mutation_scale=9, linewidth=0.8, color=INK,
    linestyle=(0, (4, 2.5)), shrinkA=0, shrinkB=0))
ax.text(61.0, 100.5, "<<extend>>", ha="center", va="center", fontsize=FS_S, color=INK)

out = "C:/Users/39392/Downloads/GameShelf/docs/figure/uc_generale_esteso"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.05, dpi=300)
print("ok")
