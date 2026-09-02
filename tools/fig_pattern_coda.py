#!/usr/bin/env python3
"""Figura 12 - Il pattern di livellamento applicato al sistema.
Disegnata alla larghezza di stampa (textwidth = 15 cm)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

plt.rcParams.update({"font.family": "sans-serif"})
DARK, GREY = "#2E2E2E", "#6E6E6E"
QFILL, EXTF, ACCENT = "#E8EEF6", "#EDEDED", "#3E6DA8"
FS_T, FS_S, FS_N = 7.0, 5.9, 5.9

fig, ax = plt.subplots(figsize=(5.9, 3.1))
ax.set_xlim(0, 100); ax.set_ylim(0, 62); ax.axis("off")

def box(x, y, w, h, title, subs=(), fill="#FFFFFF", border=DARK):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="round,pad=0,rounding_size=0.9",
        facecolor=fill, edgecolor=border, linewidth=0.9))
    ax.text(x + w/2, y + h - 3.4, title, ha="center", va="center",
            fontsize=FS_T, fontweight="bold", color="#111111")
    for i, s in enumerate(subs):
        ax.text(x + w/2, y + h - 8.0 - i*3.7, s, ha="center", va="center",
                fontsize=FS_S, color="#555555")

def arr(p1, p2, color=DARK, lw=0.9, head=7, dashed=False):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=head,
        linewidth=lw, color=color, shrinkA=0, shrinkB=0,
        linestyle=(0, (3, 2)) if dashed else "-"))

box(0.5, 18.0, 19.0, 26.0, "Produttori", ("gestori HTTP", "attivita' periodiche"))

QX, QW, QY, QH = 30.0, 17.0, 12.0, 36.0
box(QX, QY, QW, QH, "Coda", ("persistente",), fill=QFILL, border=ACCENT)
for i in range(5):
    yy = QY + 4.5 + i * 4.3
    ax.plot([QX + 3.0, QX + QW - 3.0], [yy, yy], color=ACCENT, linewidth=0.5, alpha=0.5)

for yy in (41.0, 38.5, 36.0, 30.0, 27.8, 21.0):
    arr((19.5, yy), (QX, yy), color=GREY, lw=0.8, head=6)
ax.text(24.7, 50.0, "domanda\nimpulsiva", ha="center", va="bottom",
        fontsize=FS_N, style="italic", color=GREY, linespacing=1.25)

box(52.0, 22.0, 15.0, 18.0, "Regolatore", ("concorrenza", "intervallo"))
arr((QX + QW, 31.0), (52.0, 31.0))

box(71.5, 16.0, 14.0, 28.0, "Esecutori", ())
for i, yy in enumerate((28.0, 19.5)):
    ax.add_patch(FancyBboxPatch((74.0, yy), 9.0, 6.5,
        boxstyle="round,pad=0,rounding_size=0.6",
        facecolor="#F5F5F5", edgecolor=GREY, linewidth=0.7))
    ax.text(78.5, yy + 3.25, str(i + 1), ha="center", va="center",
            fontsize=FS_S, color="#555555")
arr((67.0, 31.0), (71.5, 31.0))

box(89.5, 20.0, 10.5, 20.0, "Fonti", ("esterne",), fill=EXTF, border=GREY)
for yy in (36.0, 31.0, 26.0):
    arr((85.5, yy), (89.5, yy), color=GREY, lw=0.8, head=6)
ax.text(87.0, 50.0, "flusso\nregolare", ha="center", va="bottom",
        fontsize=FS_N, style="italic", color=GREY, linespacing=1.25)

# I due parametri di regolazione, collegati al regolatore
ax.plot([59.5, 59.5], [22.0, 12.0], color=ACCENT, linewidth=0.6, linestyle=(0, (2, 2)))
ax.text(50.0, 8.5, "concorrenza 2  ·  intervallo minimo 250 ms  ·  al piu' 4 avvii al secondo",
        ha="center", va="top", fontsize=FS_N, color=ACCENT)

out = "C:/Users/39392/Downloads/GameShelf/docs/figure/pattern_coda"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.03, dpi=300)
print("ok")
