#!/usr/bin/env python3
"""
v2: Match imported vocabulary against OCR bboxes, measure ink density per word.
Only words that are actually in the imported chapter list are candidates.
"""
import os, sys, json, re, glob, subprocess
from PIL import Image
from collections import defaultdict

SRC = "/Users/ben/Projects/Lern App/icloud-schule"
WORDS_JSON = "/Users/ben/Projects/Lern App/icloud-schule/words_with_seq.json"
OUT = "/Users/ben/Projects/Lern App/icloud-schule/bold_v2.json"
OCR_DIR = "/tmp/schule-ocr"

THRESHOLD_LUMA = 140
BOLD_RATIO = 1.18  # density / per-page baseline

def normkey(w):
    return re.sub(r'^to\s+', '', (w or '').lower().strip())

def first_word(s):
    """Get first meaningful word from a string."""
    parts = re.split(r'[\s/,()]+', s.strip())
    parts = [p for p in parts if p]
    return parts[0] if parts else ''

def load_ocr(img_path):
    base = os.path.splitext(os.path.basename(img_path))[0]
    cache = os.path.join(OCR_DIR, base + ".tsv")
    if not os.path.exists(cache): return []
    rows = []
    with open(cache) as f:
        for line in f:
            parts = line.rstrip('\n').split('\t', 4)
            if len(parts) != 5: continue
            try: x,y,w,h = float(parts[0]),float(parts[1]),float(parts[2]),float(parts[3])
            except: continue
            t = parts[4].strip()
            if t: rows.append({'x':x,'y':y,'w':w,'h':h,'t':t})
    return rows

def ink_density(img, b):
    W, H = img.size
    left = max(0,int(b['x'] * W))
    top  = max(0,int((1 - b['y'] - b['h']) * H))
    right = min(W,int((b['x']+b['w']) * W))
    bottom = min(H,int((1 - b['y']) * H))
    if right<=left or bottom<=top: return None
    crop = img.crop((left,top,right,bottom)).convert('L')
    px = crop.load(); cw,ch = crop.size
    total = cw*ch
    if total < 200: return None
    ink = sum(1 for j in range(ch) for i in range(cw) if px[i,j] < THRESHOLD_LUMA)
    return ink/total

def clean_tokens(text):
    """Extract normalized word tokens from an OCR text line."""
    # Remove phonetic /…/, parentheses, leading numbers/bullets
    t = re.sub(r'/[^/]*/', '', text)
    t = re.sub(r'\([^)]*\)', '', t)
    t = re.sub(r'^[°•*\d._]+\s*', '', t.strip())
    t = t.replace('to*', 'to').replace('°','').replace('•','')
    tokens = re.split(r'[\s,;:!?]+', t)
    return [tok.strip().strip('.,;:!?').lower() for tok in tokens if tok.strip()]

def match_word_to_bbox(word, rows):
    """Find OCR row containing this vocab word as a token (left column only)."""
    target = normkey(word)
    if not target: return None
    target_tokens = re.split(r'\s+', target)  # e.g. "to play" → ["to","play"] or just ["play"]
    main_tok = target_tokens[-1]  # last token is most reliable (e.g. "play" in "to play")
    candidates = []
    for r in rows:
        if r['x'] >= 0.32: continue  # English column only
        toks = clean_tokens(r['t'])
        if not toks: continue
        # Match if main token appears AND it's at the start (English headword position)
        if toks[0] == main_tok or (len(toks)>1 and toks[0]=='to' and toks[1]==main_tok):
            candidates.append(r)
            continue
        # Or full-target match (for multi-word phrases)
        joined = ' '.join(toks)
        if target in joined:
            candidates.append(r)
    if not candidates: return None
    candidates.sort(key=lambda r: (r['x'], -r['y']))
    return candidates[0]

def main():
    with open(WORDS_JSON) as f:
        words = json.load(f)
    # Index words by source page
    by_page = defaultdict(list)
    for w in words:
        by_page[w['src_page']].append(w)
    print(f"Loaded {len(words)} unique vocab words across pages: {sorted(by_page.keys())[:5]}…")

    page_files = {int(re.search(r'(\d+)', os.path.basename(p)).group(1)): p
                  for p in glob.glob(os.path.join(SRC, "*.JPG"))}

    word_density = {}      # normkey -> density
    bold_results = []      # per-word results

    for page_num, vocab_list in sorted(by_page.items()):
        if page_num not in page_files:
            continue
        img_path = page_files[page_num]
        ocr = load_ocr(img_path)
        try: img = Image.open(img_path)
        except: continue

        # Measure each vocab word's density on this page
        page_densities = []
        page_results = []
        for w in vocab_list:
            row = match_word_to_bbox(w['word'], ocr)
            if not row:
                continue
            d = ink_density(img, row)
            if d is None: continue
            page_densities.append(d)
            page_results.append({'word': w['word'], 'clue': w['clue'], 'density': d})

        if len(page_densities) < 5:
            print(f"  page {page_num}: only {len(page_densities)} matches, skip")
            continue
        # Baseline: median (most words NOT bold)
        sorted_d = sorted(page_densities)
        baseline = sorted_d[len(sorted_d)//2]

        page_bold = 0
        for r in page_results:
            ratio = r['density']/baseline if baseline>0 else 1
            r['ratio'] = round(ratio,2)
            r['bold'] = ratio >= BOLD_RATIO
            r['page'] = page_num
            if r['bold']:
                page_bold += 1
                word_density[normkey(r['word'])] = ratio
            bold_results.append(r)
        print(f"  page {page_num}: {len(page_results)} measured, baseline={baseline:.3f}, bold={page_bold}")

    bold_words = sorted(set(normkey(r['word']) for r in bold_results if r['bold']))
    with open(OUT,'w') as f:
        json.dump({
            'bold_keys': bold_words,
            'all_results': bold_results,
        }, f, ensure_ascii=False, indent=2)
    print(f"\nTotal bold-marked unique vocab words: {len(bold_words)}")
    print(f"Sample: {bold_words[:20]}")
    print(f"Output: {OUT}")

main()
