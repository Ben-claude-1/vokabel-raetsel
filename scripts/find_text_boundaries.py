#!/usr/bin/env python3
"""
Findet die saubere Lücke zwischen Sticker-Texten für jede Spalte.
Sucht die "leere Zone" im Textband zwischen zwei Stickern.
"""
from PIL import Image
from pathlib import Path

SRC = Path("/Users/ben/Projects/Lern App/.tmp/images/1779294142727/image_0.png")
img = Image.open(SRC).convert("RGB")
p = img.load()
W, H = img.size

# Text-Y-Bänder: untere 30px jedes Content-Bereichs (wo die Texte sind)
TEXT_BANDS = {
    1: range(185, 211),
    2: range(415, 438),
    3: range(655, 678),
    4: range(905, 929),
    5: range(1155, 1182),
}

def has_content(x, band):
    """Gibt True zurück wenn in der Spalte x irgendein Pixel im Band Inhalt ist."""
    for y in band:
        r, g, b = p[x, y]
        bright = (r + g + b) / 3
        if bright < 240:
            return True
    return False

# Bekannte Gap-Bereiche
COL_GAPS = [
    (114, 150),
    (239, 275),
    (368, 407),
    (490, 539),
    (618, 672),
    (760, 810),
    (878, 921),
    (1006, 1044),
    (1111, 1152),
]

print("Analyse der sauberen Trennzonen:\n")
boundaries = [0]  # linke Grenze von Col 1

for row_num, band in TEXT_BANDS.items():
    print(f"--- Zeile {row_num} (y={band.start}-{band.stop}) ---")
    for gi, (gx1, gx2) in enumerate(COL_GAPS):
        # Suche von gx1-50 bis gx2+50 nach dem "leeren" Bereich
        sx1 = max(0, gx1 - 50)
        sx2 = min(W-1, gx2 + 50)
        profile = [(x, has_content(x, band)) for x in range(sx1, sx2+1)]

        # Finde den sauberen Bereich (längster zusammenhängender False-Block)
        best_start, best_end, best_len = sx1, sx2, 0
        cur_start = None
        for x, c in profile:
            if not c:
                if cur_start is None:
                    cur_start = x
            else:
                if cur_start is not None:
                    length = x - cur_start
                    if length > best_len:
                        best_len = length
                        best_start = cur_start
                        best_end = x - 1
                    cur_start = None
        if cur_start is not None:
            length = sx2 - cur_start + 1
            if length > best_len:
                best_len = length
                best_start = cur_start
                best_end = sx2

        mid = (best_start + best_end) // 2
        print(f"  Gap {gi+1} (x={gx1}-{gx2}): saubere Zone x={best_start}-{best_end} ({best_len}px) → Grenze x={mid}")

    break  # Erstmal nur Zeile 1 analysieren um die richtigen Col-Grenzen zu finden

print("\n\nVolle Analyse - Col-Grenzen über alle Zeilen (engste saubere Zone):")
col_boundaries = []
for gi, (gx1, gx2) in enumerate(COL_GAPS):
    sx1 = max(0, gx1 - 50)
    sx2 = min(W-1, gx2 + 50)

    tightest_start = sx1
    tightest_end = sx2

    for row_num, band in TEXT_BANDS.items():
        profile = [(x, has_content(x, band)) for x in range(sx1, sx2+1)]

        best_start, best_end, best_len = gx1, gx2, 0
        cur_start = None
        for x, c in profile:
            if not c:
                if cur_start is None:
                    cur_start = x
            else:
                if cur_start is not None:
                    length = x - cur_start
                    if length > best_len:
                        best_len = length
                        best_start = cur_start
                        best_end = x - 1
                    cur_start = None
        if cur_start is not None:
            length = sx2 - cur_start + 1
            if length > best_len:
                best_len = length
                best_start = cur_start
                best_end = sx2

        # Engste gemeinsame Zone
        tightest_start = max(tightest_start, best_start)
        tightest_end = min(tightest_end, best_end)

    if tightest_end > tightest_start:
        mid = (tightest_start + tightest_end) // 2
    else:
        mid = (gx1 + gx2) // 2
    col_boundaries.append(mid)
    print(f"Gap {gi+1}: tightest clean zone x={tightest_start}-{tightest_end} → Grenze x={mid}")

print("\nCOL_X = [")
lefts = [0] + col_boundaries
rights = col_boundaries + [W-1]
for c in range(10):
    print(f"    ({lefts[c]:4d}, {rights[c]:4d}),  # col {c+1}")
print("]")
