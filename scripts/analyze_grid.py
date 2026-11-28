#!/usr/bin/env python3
"""
Analysiert das Grid-Bild pixel-genau ohne numpy.
Findet die echten Spalten- und Zeilengrenzen.
"""
from PIL import Image
from pathlib import Path

SRC = Path("/Users/ben/Projects/Lern App/.tmp/images/1779293543555/image_0.png")

img = Image.open(SRC).convert("RGB")
pixels = img.load()
W, H = img.size
print(f"Bildgröße: {W} × {H} px")

# Durchschnittliche Helligkeit pro Spalte (x) und Zeile (y)
col_bright = []
for x in range(W):
    total = sum(pixels[x, y][0] + pixels[x, y][1] + pixels[x, y][2] for y in range(H))
    col_bright.append(total / (H * 3))

row_bright = []
for y in range(H):
    total = sum(pixels[x, y][0] + pixels[x, y][1] + pixels[x, y][2] for x in range(W))
    row_bright.append(total / (W * 3))

print(f"\nHelligkeit Spalten — min: {min(col_bright):.1f}, max: {max(col_bright):.1f}")
print(f"Helligkeit Zeilen  — min: {min(row_bright):.1f}, max: {max(row_bright):.1f}")

def find_gap_ranges(profile, threshold_pct=0.85):
    """Findet Bereiche (start, end) wo Helligkeit > threshold (= Lücken zwischen Stickern)."""
    thresh = max(profile) * threshold_pct
    gaps = []
    in_gap = False
    start = 0
    for i, v in enumerate(profile):
        if v >= thresh and not in_gap:
            start = i
            in_gap = True
        elif v < thresh and in_gap:
            gaps.append((start, i - 1, (start + i - 1) // 2))  # start, end, mid
            in_gap = False
    if in_gap:
        gaps.append((start, len(profile) - 1, (start + len(profile) - 1) // 2))
    return gaps

print("\n── Spalten-Lücken (vertikal verlaufende helle Streifen): ──")
col_gaps = find_gap_ranges(col_bright)
print(f"  Anzahl: {len(col_gaps)}")
for g in col_gaps:
    print(f"  x={g[0]}–{g[1]} (mitte={g[2]}, breite={g[1]-g[0]+1})")

print("\n── Zeilen-Lücken (horizontal verlaufende helle Streifen): ──")
row_gaps = find_gap_ranges(row_bright)
print(f"  Anzahl: {len(row_gaps)}")
for g in row_gaps:
    print(f"  y={g[0]}–{g[1]} (mitte={g[2]}, breite={g[1]-g[0]+1})")
