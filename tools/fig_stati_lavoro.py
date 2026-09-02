#!/usr/bin/env python3
"""Figura 15 - Ciclo di vita di un lavoro nella coda.
Disegnata alla larghezza di stampa (textwidth = 15 cm)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Circle

plt.rcParams.update({"font.family": "sans-serif"})
DARK, GREY, ACCENT = "#2E2E2E", "#6E6E6E", "#3E6DA8"
FS_S, FS_L, FS_N = 7.2, 5.9, 5.9

fig, ax = plt.subplots(figsize=(5.9, 2.35))
ax.set_xlim(0, 100); ax.set_ylim(0, 48); ax.axis("off")
fig.canvas.draw(); REND = fig.canvas.get_renderer()

def tw(s, size, weight="normal"):
    t = ax.text(0, 0, s, fontsize=size, fontweight=weight)
    bb = t.get_window_extent(renderer=REND)
    p = ax.transData.inverted().transform([(bb.x0, 0), (bb.x1, 0)])
    t.remove(); return p[1][0] - p[0][0]

def state(cx, cy, label, border=DARK):
    w = tw(label, FS_S, "bold") + 7.0
    h = 10.0
    ax.add_patch(FancyBboxPatch((cx - w/2, cy - h/2), w, h,
        boxstyle="round,pad=0,rounding_size=2.2",
        facecolor="#FFFFFF", edgecolor=border, linewidth=1.0))
    ax.text(cx, cy, label, ha="center", va="center",
            fontsize=FS_S, fontweight="bold", color="#111111")
    return (cx, cy, w, h)

def trans(p1, p2, label, rad=0.0, lx=None, ly=None, color=DARK, ha="center", va="bottom"):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=8,
        linewidth=0.95, color=color, shrinkA=0, shrinkB=0,
        connectionstyle=f"arc3,rad={rad}"))
    if label:
        ax.text(lx, ly, label, ha=ha, va=va, fontsize=FS_L,
                color="#333333", linespacing=1.25)

ax.add_patch(Circle((3.5, 28.0), 1.5, facecolor=DARK, edgecolor="none"))
s1 = state(19.0, 28.0, "accodato")
s2 = state(51.0, 28.0, "in esecuzione")
s3 = state(84.0, 40.0, "completato")
s4 = state(84.0, 15.0, "fallito")

trans((5.0, 28.0), (s1[0]-s1[2]/2, 28.0), "creazione", lx=8.0, ly=34.5)
trans((s1[0]+s1[2]/2, 28.0), (s2[0]-s2[2]/2, 28.0),
      "autorizzazione" + chr(10) + "concorrenza e intervallo minimo", lx=34.0, ly=34.5)

trans((s2[0]+s2[2]/2-1.0, 31.0), (s3[0]-s3[2]/2, 38.0), "esito prodotto",
      rad=-0.12, lx=70.0, ly=37.5, ha="center", va="bottom")
trans((s2[0]+s2[2]/2-1.0, 25.0), (s4[0]-s4[2]/2, 17.0), "eccezione",
      rad=0.12, lx=69.5, ly=18.0, ha="center", va="bottom")

# Transizione non ordinaria: ripresa dei lavori interrotti
trans((47.0, 23.0), (23.0, 23.0), "al riavvio del servizio",
      rad=-0.5, lx=35.0, ly=11.5, color=ACCENT, va="top")

ax.text(99.0, 4.0, "gli stati finali sono rimossi dopo 24 ore",
        ha="right", va="bottom", fontsize=FS_N, style="italic", color=GREY)


out = "C:/Users/39392/Downloads/GameShelf/docs/figure/stati_lavoro"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.03, dpi=300)
print("ok")
