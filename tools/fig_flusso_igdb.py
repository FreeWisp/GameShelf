#!/usr/bin/env python3
"""Figura 18 - Flusso dell'integrazione con la fonte dei metadati.
Disegnata alla dimensione di stampa (textwidth = 15 cm): i corpi indicati sono
quelli effettivi sulla pagina. I riquadri si dimensionano sul testo misurato."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

plt.rcParams.update({"font.family": "sans-serif"})
INT_F, INT_B = "#FFFFFF", "#333333"
EXT_F, EXT_B = "#EBEBEB", "#767676"
GREY = "#6E6E6E"
FS_T, FS_S, FS_N = 7.2, 6.2, 6.2      # titolo, sottotitolo, annotazione
PAD = 1.8

fig, ax = plt.subplots(figsize=(5.9, 2.9))
ax.set_xlim(0, 94); ax.set_ylim(0, 46); ax.axis("off")
fig.canvas.draw()
REND = fig.canvas.get_renderer()

def text_w(s, size, weight="normal"):
    t = ax.text(0, 0, s, fontsize=size, fontweight=weight)
    bb = t.get_window_extent(renderer=REND)
    p = ax.transData.inverted().transform([(bb.x0, 0), (bb.x1, 0)])
    t.remove()
    return p[1][0] - p[0][0]

def need(title, sub):
    return max(text_w(title, FS_T, "bold"), text_w(sub, FS_S)) + 2 * PAD

def box(x, y, w, h, title, sub, ext=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
        boxstyle="round,pad=0,rounding_size=0.9",
        facecolor=EXT_F if ext else INT_F,
        edgecolor=EXT_B if ext else INT_B, linewidth=0.9))
    ax.text(x + w/2, y + h/2 + 1.7, title, ha="center", va="center",
            fontsize=FS_T, fontweight="bold", color="#111111")
    ax.text(x + w/2, y + h/2 - 2.2, sub, ha="center", va="center",
            fontsize=FS_S, color="#555555")
    return (x, y, w, h)

def arrow(p1, p2, dashed=False, color=INT_B):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=8,
        linewidth=0.9, color=color,
        linestyle=(0, (3, 2)) if dashed else "-", shrinkA=0, shrinkB=0))

STEPS = [("Gestore", "della coda", False), ("Token", "in cache", False),
         ("Interrogazione", "campi espliciti", True),
         ("Normalizzazione", "modello interno", False),
         ("Catalogo", "condiviso", False)]
widths = [need(t, s) for t, s, _ in STEPS]
SPAN = 94.0
for _ in range(3):                     # converge in una o due iterazioni
    needed = sum(widths) + 2.2 * (len(widths) - 1)
    if needed <= SPAN: break
    k = (SPAN / needed) * 0.99
    FS_T, FS_S, FS_N = FS_T * k, FS_S * k, FS_N * k
    widths = [need(t, s) for t, s, _ in STEPS]
print('corpi finali: %.1f / %.1f pt' % (FS_T, FS_S))
GAP = 2.2
x0 = (94 - (sum(widths) + GAP * (len(widths) - 1))) / 2
Y, H = 17.0, 11.0

placed, x = [], x0
for (t, s, e), w in zip(STEPS, widths):
    placed.append(box(x, Y, w, H, t, s, ext=e)); x += w + GAP
for a, b in zip(placed, placed[1:]):
    arrow((a[0]+a[2], Y+H/2), (b[0], Y+H/2))

_, _, w2, _ = placed[1]; c2 = placed[1][0] + w2/2      # Token
_, _, w3, _ = placed[2]; c3 = placed[2][0] + w3/2      # Interrogazione

wa = need("Autorizzazione", "credenziali applicative")
xa = (c2 + c3) / 2 - wa / 2
box(xa, 33.0, wa, 9.0, "Autorizzazione", "credenziali applicative", ext=True)
arrow((c2, Y+H), (c2, 33.0), dashed=True, color=GREY)
arrow((c3, 33.0), (c3, Y+H), dashed=True, color=GREY)
ax.text(xa + wa + 2.5, 37.5, "solo alla scadenza", ha="left", va="center",
        fontsize=FS_N, style="italic", color=GREY)

wd = need("Durata stimata", "una chiamata per insieme")
xd = c3 - wd / 2 + 3.0
box(xd, 2.0, wd, 9.0, "Durata stimata", "una chiamata per insieme", ext=True)
arrow((c3 - 3.5, Y), (c3 - 3.5, 11.0), dashed=True, color=GREY)
arrow((c3 + 3.5, 11.0), (c3 + 3.5, Y), dashed=True, color=GREY)
ax.text(xd + wd + 2.5, 6.5, "facoltativa: il fallimento\nnon interrompe la ricerca",
        ha="left", va="center", fontsize=FS_N, style="italic", color=GREY)

out = "C:/Users/39392/Downloads/GameShelf/docs/figure/flusso_igdb"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.02, dpi=300)
print("larghezze riquadri:", [round(w, 1) for w in widths])
