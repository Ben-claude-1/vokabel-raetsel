#!/usr/bin/env python3
"""
Extrahiert 50 Sticker aus einem 10×5 Grid-Bild.
Verwendet die Nummern als exakte obere-linke Eckpunkte.
Sucht die Nummern gezielt NUR in den bekannten Lückenbereichen (Gap-Regionen).
"""
from PIL import Image
import json, urllib.request, urllib.error
from pathlib import Path

SRC     = Path("/Users/ben/Projects/Lern App/.tmp/images/1779294142727/image_0.png")
OUT_DIR = Path("/Users/ben/Projects/Lern App/stickers")
BASE    = "https://mac-studio.taild5562c.ts.net"
SVC     = json.load(open("/Users/ben/.local/etc/vokabel/jwts.json"))["service_role"]
GHPAGES = "https://ben-claude-1.github.io/vokabel-raetsel/stickers"

CATALOG = {
     1: ("chick",      "GREAT!",               "Chick – GREAT!"),
     2: ("cat",        "WELL DONE!",            "Cat – WELL DONE!"),
     3: ("dog",        "AWESOME!",              "Dog – AWESOME!"),
     4: ("donkey",     "YOU ROCK!",             "Donkey – YOU ROCK!"),
     5: ("hedgehog",   "STAR!",                 "Hedgehog – STAR!"),
     6: ("turtle",     "WAY TO GO!",            "Turtle – WAY TO GO!"),
     7: ("cat",        "EXCELLENT!",            "Cat – EXCELLENT!"),
     8: ("panda",      "GOOD JOB!",             "Panda – GOOD JOB!"),
     9: ("giraffe",    "KEEP IT UP!",           "Giraffe – KEEP IT UP!"),
    10: ("pig",        "BRILLIANT!",            "Pig – BRILLIANT!"),
    11: ("koala",      "NICE WORK!",            "Koala – NICE WORK!"),
    12: ("monkey",     "YES!",                  "Monkey – YES!"),
    13: ("raccoon",    "PERFECT!",              "Raccoon – PERFECT!"),
    14: ("mouse",      "GOOD!",                 "Mouse – GOOD!"),
    15: ("rabbit",     "KEEP SHINING!",         "Rabbit – KEEP SHINING!"),
    16: ("fox",        "AMAZING!",              "Fox – AMAZING!"),
    17: ("zebra",      "LOVE IT!",              "Zebra – LOVE IT!"),
    18: ("bear",       "YOU CAN DO IT!",        "Bear – YOU CAN DO IT!"),
    19: ("lion",       "KING JOB!",             "Lion – KING JOB!"),
    20: ("otter",      "FANTASTIC!",            "Otter – FANTASTIC!"),
    21: ("eagle",      "LET'S GO!",             "Eagle – LET'S GO!"),
    22: ("owl",        "SMART MOVE!",           "Owl – SMART MOVE!"),
    23: ("shark",      "WOOHOO!",               "Shark – WOOHOO!"),
    24: ("duck",       "YOU GOT THIS!",         "Duck – YOU GOT THIS!"),
    25: ("bear",       "AWESOME WORK!",         "Bear – AWESOME WORK!"),
    26: ("shark",      "KILLIN' IT!",           "Shark – KILLIN' IT!"),
    27: ("squirrel",   "NICE!",                 "Squirrel – NICE!"),
    28: ("rooster",    "COCK-A-DOODLE-DOO!",    "Rooster – COCK-A-DOODLE-DOO!"),
    29: ("sloth",      "TAKE IT EASY!",         "Sloth – TAKE IT EASY!"),
    30: ("dog",        "GOOD ONE!",             "Dog – GOOD ONE!"),
    31: ("bear",       "YOU DID IT!",           "Bear – YOU DID IT!"),
    32: ("toucan",     "TOUCAN DO IT!",         "Toucan – TOUCAN DO IT!"),
    33: ("wolf",       "DON'T GIVE UP!",        "Wolf – DON'T GIVE UP!"),
    34: ("cardinal",   "STAY FOCUSED!",         "Cardinal – STAY FOCUSED!"),
    35: ("buffalo",    "STRONG WORK!",          "Buffalo – STRONG WORK!"),
    36: ("penguin",    "YOU'RE THE BEST!",      "Penguin – YOU'RE THE BEST!"),
    37: ("goat",       "UNBEATABLE!",           "Goat – UNBEATABLE!"),
    38: ("tiger",      "TIGERIFIC!",            "Tiger – TIGERIFIC!"),
    39: ("bulldog",    "PAW-SOME!",             "Bulldog – PAW-SOME!"),
    40: ("llama",      "NO PROB-LLAMA!",        "Llama – NO PROB-LLAMA!"),
    41: ("chick",      "CHEEP CHEEP HOORAY!",   "Chick – CHEEP CHEEP HOORAY!"),
    42: ("penguin",    "HIGH FIVE!",            "Penguin – HIGH FIVE!"),
    43: ("beaver",     "KEEP GOING!",           "Beaver – KEEP GOING!"),
    44: ("sloth",      "HANG IN THERE!",        "Sloth – HANG IN THERE!"),
    45: ("pig",        "HOORAY!",               "Pig – HOORAY!"),
    46: ("elephant",   "BIG EFFORT!",           "Elephant – BIG EFFORT!"),
    47: ("tiger",      "SO PROUD OF YOU!",      "Tiger – SO PROUD OF YOU!"),
    48: ("crocodile",  "CRUSHED IT!",           "Crocodile – CRUSHED IT!"),
    49: ("fox",        "SUPER STAR!",           "Fox – SUPER STAR!"),
    50: ("panda",      "MISSION COMPLETE!",     "Panda – MISSION COMPLETE!"),
}

img = Image.open(SRC).convert("RGB")
pix = img.load()
W, H = img.size
print(f"Bildgröße: {W} × {H} px")

# ── Per-Zeile Spaltengrenzen (saubere Trennzonen im Text-Band je Zeile) ──────
# Berechnet aus dem Scan des untersten Textbands pro Zeile.
# Format: für jede Zeile eine Liste von 11 x-Werten (10 Spalten + rechter Rand)
ROW_COL_BOUNDS = {
    1: [  0, 135, 275, 410, 549, 670, 803, 925, 1043, 1122, 1253],
    2: [  0, 148, 267, 410, 531, 658, 798, 918, 1029, 1144, 1253],
    3: [  0, 131, 252, 405, 503, 637, 788, 888, 1023, 1126, 1253],
    4: [  0, 135, 234, 355, 507, 639, 770, 899, 1015, 1140, 1253],
    5: [  0, 118, 248, 363, 493, 637, 775, 889, 1029, 1126, 1253],
}
ROW_CONTENT = [
    (   0,  211),  # row 1
    ( 212,  438),  # row 2
    ( 439,  678),  # row 3
    ( 679,  929),  # row 4
    ( 930, 1253),  # row 5
]

# ── Bekannte vertikale Lücken (aus Helligkeitsanalyse) ───────────────────────
# Jede Lücke trennt zwei Spalten. Das Nummer-Label der rechten Spalte
# erscheint AM ANFANG (linkes Ende) dieser Lücke.
# Lücken = Spaltentrennlinien im Bild:
COL_GAPS = [
    (0,   16),   # linker Rand → Spalte 1 beginnt bei x=17
    (114, 150),  # Lücke 1-2 → Spalte 2 beginnt hier
    (239, 275),  # Lücke 2-3
    (368, 407),  # Lücke 3-4
    (490, 539),  # Lücke 4-5
    (618, 672),  # Lücke 5-6
    (760, 810),  # Lücke 6-7
    (878, 921),  # Lücke 7-8
    (1006,1044), # Lücke 8-9
    (1111,1152), # Lücke 9-10
    (1222,1253), # rechter Rand
]

# Bekannte horizontale Lücken (Zeilentrennlinien):
ROW_GAPS = [
    (0,   73),   # oberer Rand → Zeile 1 beginnt bei y=74
    (212, 301),  # Lücke 1-2
    (439, 536),  # Lücke 2-3
    (679, 779),  # Lücke 3-4
    (930, 1027), # Lücke 4-5
    (1183,1253), # unterer Rand
]

# Suche im Lückenbereich nach dem Nummern-Label (dunkelstes Pixel in der Lücke)
# Das Nummern-Label gibt die LINKE Grenze der zugehörigen Spalte an.
def find_number_in_gap(gap_x1, gap_x2, search_y1, search_y2):
    """Findet das dunkelste Pixel in einem Lückenbereich = Nummern-Label."""
    min_b = 255
    min_x = (gap_x1 + gap_x2) // 2  # Fallback: Lückenmitte
    for y in range(search_y1, search_y2 + 1):
        for x in range(gap_x1, gap_x2 + 1):
            r, g, b = pix[x, y]
            b_val = (r + g + b) / 3
            if b_val < min_b:
                min_b = b_val
                min_x = x
    return min_x, min_b

# Suche Nummern in der ersten Zeilen-Lücke (oberer Rand, y=0-73)
# Diese Nummern geben die exakten Spalten-Startpositionen an
print("\nNummern-Positionen (in oberer Lücke, y=0-73):")
col_starts = []
for c, (gx1, gx2) in enumerate(COL_GAPS):
    nx, nb = find_number_in_gap(gx1, gx2, 0, 73)
    col_starts.append(nx)
    print(f"  Lücke {c}: x={gx1}-{gx2} → Nummer bei x={nx} (helligkeit={nb:.1f})")

# Suche Nummern im linken Rand der Zeilen-Lücken (x=0-16, in den Lücken)
print("\nNummern-Positionen (in linker Spalten-Lücke, x=0-16):")
row_starts = []
for r, (gy1, gy2) in enumerate(ROW_GAPS):
    ny, nb = find_number_in_gap(0, 16, gy1, gy2)
    # Für Zeilen: Nummern-y gibt obere Grenze der Zeile an
    row_starts.append(gy1)  # Zeile beginnt am Lücken-Start
    print(f"  Lücke {r}: y={gy1}-{gy2} → y_start={gy1}")

# ── Zellgrenzen: Lücken-Start der nachfolgenden Lücke = Zellende ─────────────
# col_end[c] = col_starts[c+1]  (wo die nächste Lücke beginnt)
print("\n── Berechnete Zellgrenzen ──")
cells_x = []
for c in range(10):
    x1 = col_starts[c]      # Lückenstart dieser Spalte
    x2 = col_starts[c + 1] - 1  # bis vor die nächste Lücke
    cells_x.append((x1, x2))
    print(f"  Col {c+1}: x={x1}-{x2} ({x2-x1+1}px)")

cells_y = []
for r in range(5):
    y1 = row_starts[r]
    y2 = row_starts[r + 1] - 1
    cells_y.append((y1, y2))
    print(f"  Row {r+1}: y={y1}-{y2} ({y2-y1+1}px)")

# ── Sticker ausschneiden (per-Zeile Grenzen) ─────────────────────────────────
OUT_DIR.mkdir(exist_ok=True)
BG = (251, 250, 250)

for i in range(1, 51):
    col = (i - 1) % 10
    row = (i - 1) // 10
    bounds = ROW_COL_BOUNDS[row + 1]
    x1 = bounds[col]
    x2 = bounds[col + 1] - 1
    y1, y2 = ROW_CONTENT[row]

    crop = img.crop((x1, y1, x2 + 1, y2 + 1))
    cw, ch = crop.size

    # Quadratisch zentrieren (ohne Verzerren)
    side = max(cw, ch)
    square = Image.new("RGB", (side, side), BG)
    square.paste(crop, ((side - cw) // 2, (side - ch) // 2))

    final = square.resize((300, 300), Image.LANCZOS)
    out_path = OUT_DIR / f"sticker_{i:02d}.png"
    final.save(out_path, "PNG", optimize=True)

print(f"\n✓ 50 Sticker gespeichert → {OUT_DIR}")

# ── DB aktualisieren ─────────────────────────────────────────────────────────
HDR = {"apikey": SVC, "Authorization": f"Bearer {SVC}",
       "Content-Type": "application/json",
       "Prefer": "resolution=merge-duplicates,return=minimal"}

def api(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(BASE + path, data=data, headers=HDR, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

records = [{"filename": f"sticker_{i:02d}.png", "name": name, "animal": animal,
            "label": label, "url": f"{GHPAGES}/sticker_{i:02d}.png", "sort_order": i}
           for i, (animal, label, name) in CATALOG.items()]
status, _ = api("POST", "/rest/v1/stickers?on_conflict=filename", records)
print(f"DB: {'✓ OK' if status in (200,201) else f'Fehler {status}'}")
print("\n✅ Fertig!")
