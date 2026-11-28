#!/usr/bin/env python3
"""Pair English (left col) with German (right col) using OCR bboxes from Apple Vision."""
import sys, json, re

def load_lines(path):
    out = []
    with open(path) as f:
        for line in f:
            line = line.rstrip('\n')
            parts = line.split('\t', 4)
            if len(parts) != 5: continue
            x, y, w, h, t = parts
            try: x, y, w, h = float(x), float(y), float(w), float(h)
            except: continue
            if not t.strip(): continue
            out.append({'x':x,'y':y,'w':w,'h':h,'t':t.strip()})
    return out

def is_phonetic(t):
    return bool(re.match(r'^[/ˈ\,%].*[/]', t)) or '/' in t and len(re.findall(r'[a-zA-ZäöüÄÖÜß]', t)) < len(t)*0.5

def is_meta(t):
    # headers, page numbers, very short non-words
    if re.match(r'^\d+$', t): return True
    if re.match(r'^[•*◦]', t): return True
    if 'Word lists' in t: return True
    if 'Numbers' in t and '(S.' in t: return True
    if 'kannst du' in t or 'findest du' in t or 'erkennst du' in t: return True
    if t.startswith('* An dem'): return True
    return False

def main():
    lines = load_lines(sys.argv[1])
    # Group lines into rows by y (within ~1.5x line height)
    lines.sort(key=lambda l: -l['y'])
    rows = []
    for l in lines:
        if rows and abs(rows[-1][0]['y'] - l['y']) < l['h']*0.7:
            rows[-1].append(l)
        else:
            rows.append([l])
    # For each row: split into left/right by x; identify English vs German
    # Heuristic: y top-to-bottom, English (low x), German (mid x), examples (high x)
    pairs = []
    for row in rows:
        row.sort(key=lambda l: l['x'])
        # filter out phonetic lines and meta
        cleaned = [l for l in row if not is_phonetic(l['t']) and not is_meta(l['t'])]
        if not cleaned: continue
        # Try to find an English and a German term
        # English column ends typically before x~0.30; German column ~0.30-0.55
        en = [l for l in cleaned if l['x'] < 0.30]
        de = [l for l in cleaned if 0.30 <= l['x'] < 0.55]
        ex = [l for l in cleaned if l['x'] >= 0.55]
        en_t = ' '.join(l['t'] for l in en).strip()
        de_t = ' '.join(l['t'] for l in de).strip()
        # Strip "to* " marker (book uses asterisk for irregular verbs)
        en_t = re.sub(r'\bto\*\s+', 'to ', en_t)
        # Clean trailing phonetic-like tokens
        en_t = re.sub(r'\s*/[^/]*/\s*$', '', en_t).strip()
        en_t = re.sub(r'\s*\(.*?\)\s*$', '', en_t).strip()
        if en_t and de_t and len(en_t) < 60 and len(de_t) < 80:
            pairs.append({'en': en_t, 'de': de_t})
    print(json.dumps(pairs, ensure_ascii=False, indent=2))

main()
