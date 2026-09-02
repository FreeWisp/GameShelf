#!/usr/bin/env python3
"""Figura 4 - Fasi che compongono la latenza di una richiesta."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

plt.rcParams.update({"font.family": "sans-serif"})
DARK, GREY, ACCENT = "#2E2E2E", "#6E6E6E", "#8C2F2F"
B1, B2, B3, B4 = "#DCE7F5", "#E4EFE2", "#F7EAD6", "#EFE4F0"
FS_P, FS_M, FS_L = 7.0, 6.0, 6.0

fig, ax = plt.subplots(figsize=(5.9, 3.7))
ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")

CX, SX = 12.0, 60.0
for x, name in ((CX, "Client"), (SX, "Server")):
    ax.add_patch(FancyBboxPatch((x-8.5, 90.0), 17.0, 6.0,
        boxstyle="round,pad=0,rounding_size=0.8",
        facecolor="#FFFFFF", edgecolor=DARK, linewidth=0.9))
    ax.text(x, 93.0, name, ha="center", va="center", fontsize=FS_P,
            fontweight="bold", color="#111111")
    ax.plot([x, x], [6.0, 90.0], color=GREY, linewidth=0.6, linestyle=(0, (2, 2.5)))

def msg(y, right, label):
    p1, p2 = ((CX, y), (SX, y)) if right else ((SX, y), (CX, y))
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=7,
        linewidth=0.85, color=DARK, shrinkA=0, shrinkB=0))
    ax.text((CX+SX)/2, y + 1.2, label, ha="center", va="bottom",
            fontsize=FS_M, color="#333333")

def band(y0, y1, fill, label, sub):
    ax.add_patch(Rectangle((63.0, y0), 36.0, y1-y0, facecolor=fill, edgecolor="none"))
    ax.text(64.5, (y0+y1)/2 + 1.6, label, ha="left", va="center",
            fontsize=FS_L, fontweight="bold", color="#333333")
    ax.text(64.5, (y0+y1)/2 - 2.2, sub, ha="left", va="center",
            fontsize=FS_L, color="#666666")

band(70.0, 86.0, B1, "handshake TCP", "un round-trip")
band(52.0, 68.0, B2, "handshake TLS 1.3", "un round-trip (due con TLS 1.2)")
band(26.0, 50.0, B3, "attesa del server", "un round-trip + elaborazione")
band(10.0, 24.0, B4, "trasferimento", "dipende dalla dimensione")

msg(83.0, True,  "SYN")
msg(77.0, False, "SYN-ACK")
msg(71.5, True,  "ACK")
msg(65.0, True,  "ClientHello")
msg(59.0, False, "ServerHello, certificato, Finished")
msg(53.5, True,  "Finished")
msg(47.0, True,  "richiesta HTTP")
ax.add_patch(FancyBboxPatch((SX-2.2, 33.0), 4.4, 9.0,
    boxstyle="round,pad=0,rounding_size=0.5",
    facecolor="#FFFFFF", edgecolor=DARK, linewidth=0.9))
ax.text(SX - 4.0, 37.5, "elaborazione", ha="right", va="center",
        fontsize=FS_M, style="italic", color="#555555")
msg(29.0, False, "primo byte della risposta")
msg(21.0, False, "resto del corpo")

ax.plot([2.6, 1.4, 1.4, 2.6], [83.5, 83.5, 20.5, 20.5], color=ACCENT, linewidth=0.9)
ax.text(0.7, 52.0, "tempo di risposta percepito", ha="center", va="center",
        rotation=90, fontsize=FS_L, color=ACCENT)

ax.text(50.0, 3.0, "La risoluzione del nome precede l'handshake e si somma alle fasi rappresentate.",
        ha="center", va="center", fontsize=FS_L, style="italic", color=GREY)

out = "C:/Users/39392/Downloads/GameShelf/docs/figure/fasi_latenza"
for e in ("pdf", "png"):
    fig.savefig(f"{out}.{e}", bbox_inches="tight", pad_inches=0.04, dpi=300)
print("ok")
