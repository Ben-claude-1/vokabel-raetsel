#!/usr/bin/env python3
"""
Extract for each photo OCR:
  - book_page (the small number in bottom-right corner)
  - theme (e.g. "Theme 5: Pets and animals")
  - chapter_indicator (the bold number/letter near "Word lists" — e.g. "1", "2", "3", "4")
"""
import os, re, glob, json
from collections import defaultdict

OCR_DIR = "/tmp/schule-ocr"
OUT = "/Users/ben/Projects/Lern App/icloud-schule/page_metadata.json"

THEME_RE = re.compile(r'\bTheme\s+(\d+)\s*[:.]\s*(.+?)(?:/|$)', re.IGNORECASE)

def parse(path):
    rows = []
    with open(path) as f:
        for line in f:
            parts = line.rstrip('\n').split('\t', 4)
            if len(parts) != 5: continue
            try: x,y,w,h = float(parts[0]),float(parts[1]),float(parts[2]),float(parts[3])
            except: continue
            t = parts[4].strip()
            if t: rows.append({'x':x,'y':y,'w':w,'h':h,'t':t})
    return rows

def find_book_page(rows):
    """The book page number is the largest plain-integer text in the bottom corner area
    (y < 0.10). Excludes 'p. NN' references."""
    candidates = []
    for r in rows:
        if r['y'] >= 0.12: continue  # bottom margin
        # Pure integer (3-4 digits typical for textbook page like 207, 208 …)
        m = re.match(r'^(\d{2,4})$', r['t'].strip())
        if not m: continue
        n = int(m.group(1))
        if n < 1 or n > 999: continue
        candidates.append((n, r['x']))
    if not candidates: return None
    # Prefer right-side (higher x) → footer of a right page; left side → footer of a left page
    # Pick the one closest to the page edge (max(x, 1-x))
    candidates.sort(key=lambda c: max(c[1], 1-c[1]), reverse=True)
    return candidates[0][0]

def find_theme(rows):
    """Look for 'Theme N: Title' pattern in top half of page."""
    for r in rows:
        if r['y'] < 0.85: continue
        m = THEME_RE.search(r['t'])
        if m:
            num = m.group(1)
            title = m.group(2).strip().rstrip(':').strip()
            return {'num': int(num), 'title': title, 'raw': r['t']}
    return None

def find_chapter_indicator(rows):
    """The big bold digit/letter next to 'Word lists' (top, often left or center).
    Approximation: the largest bbox-height text in y > 0.93 region that's a single digit/letter."""
    cands = []
    for r in rows:
        if r['y'] < 0.93: continue
        # Single digit or "1.", "2."
        m = re.match(r'^\s*(\d{1,2})\.?\s*$', r['t'])
        if m:
            cands.append((r['h'], int(m.group(1)), r['x']))
    if not cands: return None
    cands.sort(key=lambda c: c[0], reverse=True)
    return cands[0][1]

def main():
    files = sorted(glob.glob(os.path.join(OCR_DIR, "IMG_*.tsv")))
    out = {}
    print(f"{'IMG':12s} {'page':>5s}  {'chap':>4s}  Theme")
    print("-"*60)
    for f in files:
        rows = parse(f)
        page = find_book_page(rows)
        theme = find_theme(rows)
        chap = find_chapter_indicator(rows)
        name = os.path.basename(f).replace('.tsv','.JPG')
        out[name] = {
            'book_page': page,
            'theme_num': theme['num'] if theme else None,
            'theme_title': theme['title'] if theme else None,
            'chapter_indicator': chap,
        }
        theme_str = (f"Theme {theme['num']}: {theme['title']}") if theme else '-'
        print(f"{name:12s} {str(page):>5s}  {str(chap):>4s}  {theme_str}")
    with open(OUT,'w') as f: json.dump(out,f,indent=2,ensure_ascii=False)
    print(f"\n→ {OUT}")
    # Group by theme
    by_theme = defaultdict(list)
    for name, m in out.items():
        key = m.get('theme_num')
        by_theme[key].append((name, m.get('book_page'), m.get('theme_title')))
    print("\nGrouped by Theme:")
    for k in sorted(by_theme.keys(), key=lambda x: (x is None, x or 0)):
        v = by_theme[k]
        title = next((t for _,_,t in v if t),'?')
        pages = sorted([p for _,p,_ in v if p])
        print(f"  Theme {k}: {title} — {len(v)} images, pages {pages}")

main()
