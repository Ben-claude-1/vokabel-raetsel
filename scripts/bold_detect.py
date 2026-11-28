#!/usr/bin/env python3
"""
Bold-Detection für Schulbuch-Vokabel-Seiten.
Ansatz: Apple Vision OCR liefert Bbox + Text. Pro Bbox messen wir die Pixel-Dichte
(schwarze Pixel / Bbox-Fläche). Bold-Wörter haben ~30-50% höhere Dichte als die
Page-Baseline. Da auf einer Schulbuchseite der Großteil der Wörter NICHT bold ist,
nehmen wir das untere 50%-Perzentil als Baseline.
"""
import os, sys, json, re, glob, subprocess, urllib.request, base64
from PIL import Image, ImageOps
from collections import defaultdict

SRC = "/Users/ben/Projects/Lern App/icloud-schule"
OUT = "/Users/ben/Projects/Lern App/icloud-schule/bold_detected.json"
OCR_DIR = "/tmp/schule-ocr"
os.makedirs(OCR_DIR, exist_ok=True)

# Tuning
BOLD_THRESHOLD_RATIO = 1.20  # Bbox ink-density / page-baseline; >this = bold
THRESHOLD_LUMA = 140         # 0-255: pixels darker than this count as ink
MIN_BBOX_PIXELS = 200        # ignore tiny bboxes (noise)
MAX_BBOX_W_RATIO = 0.30      # ignore bboxes wider than 30% (likely captions/lines)

def run_ocr(img_path):
    """Run Apple Vision OCR (cached)."""
    base = os.path.splitext(os.path.basename(img_path))[0]
    cache = os.path.join(OCR_DIR, base + ".tsv")
    if not os.path.exists(cache) or os.path.getsize(cache) == 0:
        with open(cache, 'w') as f:
            subprocess.run(["swift", "/Users/ben/Projects/Lern App/scripts/ocr.swift", img_path],
                           stdout=f, check=False)
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

def ink_density(img, x_pct, y_pct, w_pct, h_pct):
    """Crop bbox (Vision uses normalized coords, origin bottom-left), measure black-pixel ratio."""
    W, H = img.size
    # Vision Y is bottom-up; PIL is top-down
    left = int(x_pct * W)
    top = int((1 - y_pct - h_pct) * H)
    right = int((x_pct + w_pct) * W)
    bottom = int((1 - y_pct) * H)
    if right <= left or bottom <= top: return None, 0
    crop = img.crop((left, top, right, bottom)).convert('L')
    px = crop.load()
    cw, ch = crop.size
    total = cw * ch
    if total < MIN_BBOX_PIXELS: return None, total
    ink = sum(1 for j in range(ch) for i in range(cw) if px[i,j] < THRESHOLD_LUMA)
    return ink / total, total

def normkey(w):
    return re.sub(r'^to\s+', '', (w or '').lower().strip())

def is_phonetic(t):
    """Skip phonetic transcription lines (between slashes)."""
    return '/' in t and (t.startswith('/') or t.startswith(',') or '/'.join(t.split('/')[:-1]).count(' ')<2)

def main():
    images = sorted(glob.glob(os.path.join(SRC, "*.JPG")))
    print(f"Processing {len(images)} images...")
    all_bold = {}        # normkey -> True
    all_seen = {}        # normkey -> count of times seen across pages
    page_results = []
    for img_path in images:
        name = os.path.basename(img_path)
        ocr = run_ocr(img_path)
        if not ocr:
            print(f"  {name}: no OCR data, skip"); continue
        try: img = Image.open(img_path)
        except: print(f"  {name}: PIL load failed"); continue
        # Filter to "vocabulary candidates": short text in left column (x < 0.30), not phonetic
        candidates = []
        for r in ocr:
            if r['w'] > MAX_BBOX_W_RATIO: continue
            if is_phonetic(r['t']): continue
            if r['x'] >= 0.30: continue
            density, area = ink_density(img, r['x'], r['y'], r['w'], r['h'])
            if density is None: continue
            r['density'] = density
            candidates.append(r)
        if len(candidates) < 5:
            print(f"  {name}: only {len(candidates)} candidates, skip baseline calc"); continue
        # Baseline: median density of candidates (most words are NOT bold)
        sorted_d = sorted(c['density'] for c in candidates)
        median = sorted_d[len(sorted_d)//2]
        # Identify bold candidates
        bolds_here = []
        for c in candidates:
            ratio = c['density'] / median if median>0 else 1
            is_bold = ratio >= BOLD_THRESHOLD_RATIO
            if is_bold:
                # extract first word as headword
                words = re.split(r'[\s/,()]+', c['t'])
                hw = words[0].strip()
                if not hw: continue
                # normalize "to" prefix consistency
                if hw.lower() == 'to' and len(words)>1:
                    hw = 'to ' + words[1]
                k = normkey(hw)
                if k:
                    bolds_here.append({'headword': hw, 'density': round(c['density'],3), 'ratio': round(ratio,2), 'text': c['t'][:60]})
                    all_bold[k] = True
            k_seen = normkey(re.split(r'[\s/,()]+', c['t'])[0])
            all_seen[k_seen] = all_seen.get(k_seen, 0) + 1
        page_results.append({'image':name, 'baseline_density':round(median,3), 'bold_count':len(bolds_here), 'samples':bolds_here[:5]})
        print(f"  {name}: baseline={median:.3f} bold={len(bolds_here)}/{len(candidates)}")

    # Write output
    with open(OUT,'w') as f:
        json.dump({
            'bold_keys': sorted(all_bold.keys()),
            'page_summary': page_results,
        }, f, ensure_ascii=False, indent=2)
    print(f"\nTotal bold-marked unique words: {len(all_bold)}")
    print(f"Output: {OUT}")

main()
