#!/usr/bin/env python3
"""Figura 17 - Schema logico per titolarita' del dato."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

plt.rcParams.update({"font.family": "sans-serif"})
INK, GREY = "#1F2328", "#6E6E6E"
SH_F, SH_E = "#DCE7F5", "#3E6DA8"     # condiviso
PU_F, PU_E = "#DCEFDF", "#3E8A4B"     # per utente
IN_F, IN_E = "#ECECEC", "#7A7A7A"     # infrastruttura
BR_F, BR_E = "#FBEFD6", "#B98A2E"     # tabella ponte
FS_T, FS_B, FS_N = 7.2, 6.6, 6.0

fig, ax = plt.subplots(figsize=(5.9, 3.5))
ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")

def region(x, y, w, h, title, fill, edge):
    ax.add_patch(Rectangle((x, y), w, h, facecolor=fill, edgecolor=edge,
                           linewidth=0.8, alpha=0.30))
    ax.text(x + w/2, y + h - 3.2, title, ha="center", va="center",
            fontsize=FS_T, fontweight="bold", color=edge)

def tab(cx, cy, w, name, fill, edge):
    ax.add_patch(FancyBboxPatch((cx - w/2, cy - 4.2), w, 8.4,
        boxstyle="round,pad=0,rounding_size=0.8",
        facecolor=fill, edgecolor=edge, linewidth=0.9))
    ax.text(cx, cy, name, ha="center", va="center", fontsize=FS_B, color=INK)

def arr(p1, p2):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-", linewidth=0.9,
        color=GREY, shrinkA=0, shrinkB=0))

region(1.0, 44.0, 26.0, 50.0, "Catalogo condiviso", SH_F, SH_E)
tab(14.0, 80.0, 20.0, "Saga", SH_F, SH_E)
tab(14.0, 66.0, 20.0, "Gioco", SH_F, SH_E)
arr((14.0, 75.8), (14.0, 70.2))
ax.text(14.0, 52.0, "una riga per titolo,\nvalida per tutti", ha="center", va="center",
        fontsize=FS_N, style="italic", color=SH_E, linespacing=1.3)

region(53.0, 30.0, 46.0, 64.0, "Dati del singolo utente", PU_F, PU_E)
tab(65.0, 84.0, 22.0, "Utente", PU_F, PU_E)
tab(65.0, 70.0, 22.0, "folder\_map".replace("\_", "_"), PU_F, PU_E)
tab(65.0, 56.0, 22.0, "Cartella", PU_F, PU_E)
tab(87.0, 70.0, 22.0, "Diario", PU_F, PU_E)
tab(87.0, 56.0, 22.0, "Allegato", PU_F, PU_E)
tab(76.0, 42.0, 30.0, "Cartella_Contenuto", PU_F, PU_E)

region(1.0, 4.0, 98.0, 20.0, "Infrastruttura", IN_F, IN_E)
tab(20.0, 11.0, 26.0, "job_queue", IN_F, IN_E)
tab(50.0, 11.0, 26.0, "push_tokens", IN_F, IN_E)
tab(80.0, 11.0, 26.0, "epic_seen", IN_F, IN_E)

tab(40.0, 66.0, 24.0, "Libreria_Utente", BR_F, BR_E)
arr((24.0, 66.0), (28.0, 66.0))
arr((52.0, 66.0), (54.0, 66.0))
arr((52.0, 68.0), (54.0, 82.0))
ax.text(40.0, 58.0, "associazione\nfra i due mondi", ha="center", va="center",
        fontsize=FS_N, style="italic", color=BR_E, linespacing=1.3)

out = "C:/Users/39392/Downloads/GameShelf/docs/figure/titolarita_dati"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.04, dpi=300)
print("ok")
