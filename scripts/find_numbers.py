#!/usr/bin/env python3
"""
Erkennt die Nummern-Positionen (1-50) im Grid-Bild
durch Suche nach dunklen Pixeln in der oberen linken Ecke jeder Zelle.
"""
from PIL import Image
from pathlib import Path

SRC = Path("/Users/ben/Projects/Lern App/.tmp/images/1779294142727/image_0.png")
img = Image.open(SRC).convert("RGB")
W, H = img.size

# Grobe Zellgröße für die Suchregion
cell_w = W / 10
cell_h = H / 5

# Zellen-Positionen der Nummern sammeln
col_x_mins = [W] * 10   # kleinste x pro Spalte
row_y_mins = [H] * 5    # kleinste y pro Zeile

print("Nummer-Positionen (dunkelster Pixel im oberen linken Viertel jeder Zelle):")
print(f"{'Nr':>3}  {'col':>3}  {'row':>3}  {'x':>5}  {'y':>5}  {'brightness':>10}")

for row in range(5):
    for col in range(10):
        i = row * 10 + col + 1

        # Suchbereich: oberes linkes Viertel der erwarteten Zelle
        sx1 = int(col * cell_w)
        sx2 = int(sx1 + cell_w * 0.45)
        sy1 = int(row * cell_h)
        sy2 = int(sy1 + cell_h * 0.30)

        min_b = 255
        min_x, min_y = sx1, sy1

        for y in range(sy1, min(sy2, H)):
            for x in range(sx1, min(sx2, W)):
                r, g, b = img.getpixel((x, y))
                b_val = (r + g + b) / 3
                if b_val < min_b:
                    min_b = b_val
                    min_x, min_y = x, y

        print(f"{i:>3}  {col+1:>3}  {row+1:>3}  {min_x:>5}  {min_y:>5}  {min_b:>10.1f}")

        if min_x < col_x_mins[col]:
            col_x_mins[col] = min_x
        if min_y < row_y_mins[row]:
            row_y_mins[row] = min_y

print("\n── Aus Nummer-Positionen abgeleitete Zellgrenzen ──")
print("COL_X = [")
for c in range(10):
    x_start = col_x_mins[c]
    x_end   = col_x_mins[c + 1] - 1 if c < 9 else W - 1
    print(f"    ({x_start:4d}, {x_end:4d}),  # col {c+1}")
print("]")

print("ROW_Y = [")
for r in range(5):
    y_start = row_y_mins[r]
    y_end   = row_y_mins[r + 1] - 1 if r < 4 else H - 1
    print(f"    ({y_start:4d}, {y_end:4d}),  # row {r+1}")
print("]")
