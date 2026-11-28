#!/usr/bin/env python3
"""Batch-OCR + pair + LLM-clean every JPG in icloud-schule/."""
import os, sys, json, subprocess, re, glob, time, urllib.request

SRC = "/Users/ben/Projects/Lern App/icloud-schule"
OUT = "/Users/ben/Projects/Lern App/icloud-schule/extracted.json"
OCR_DIR = "/tmp/schule-ocr"
PAIR_DIR = "/tmp/schule-pairs"
os.makedirs(OCR_DIR, exist_ok=True)
os.makedirs(PAIR_DIR, exist_ok=True)

def run_ocr(img):
    base = os.path.splitext(os.path.basename(img))[0]
    out_path = os.path.join(OCR_DIR, base + ".tsv")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return out_path
    with open(out_path, 'w') as f:
        subprocess.run(["swift", "/tmp/ocr.swift", img], stdout=f, check=False)
    return out_path

def run_pair(ocr_path):
    base = os.path.splitext(os.path.basename(ocr_path))[0]
    out_path = os.path.join(PAIR_DIR, base + ".json")
    with open(out_path, 'w') as f:
        subprocess.run(["python3", "/tmp/ocr_pair.py", ocr_path], stdout=f, check=False)
    with open(out_path) as f:
        return json.load(f)

def llm_clean(pairs, source_name):
    """Use qwen2.5:32b to clean a list of (en, de) pairs into proper vocab entries."""
    if not pairs: return []
    pairs_str = json.dumps(pairs, ensure_ascii=False)
    prompt = (
        "Du bekommst rohe Vokabel-Paare aus einem englisch-deutschen Schulbuch (OCR + Layout-Pairing). "
        "Sie können Artefakte enthalten: führende Symbole (° • * y), abgeschnittene Lautschrift "
        "(/.../), Beispielsätze, leere Strings.\n\n"
        "Säubere und filtere die Liste. Behalte NUR echte Vokabel-Einträge (= ein englisches Wort/Phrase mit deutscher Übersetzung). "
        "Verben mit \"to \" prefixen (kein \"to*\"). Beispielsätze und Lautschrift entfernen.\n\n"
        "Antworte AUSSCHLIESSLICH mit JSON, keine Markdown-Fences, kein Kommentar:\n"
        "{\"words\":[{\"word\":\"...\",\"clue\":\"...\",\"type\":\"verb|noun|adjective|phrase|other\"}]}\n\n"
        "Rohe Paare:\n" + pairs_str
    )
    payload = json.dumps({
        "model": "qwen2.5:32b",
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.0, "num_ctx": 8192},
        "messages": [{"role": "user", "content": prompt}]
    }).encode()
    req = urllib.request.Request(
        "http://localhost:11434/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            d = json.loads(r.read().decode())
        content = d.get('message', {}).get('content', '')
        m = re.search(r'\{[\s\S]*\}', content)
        if not m: return []
        return json.loads(m.group(0)).get('words', [])
    except Exception as e:
        print(f"  LLM error: {e}", file=sys.stderr)
        return []

def main():
    images = sorted(glob.glob(os.path.join(SRC, "*.JPG")))
    print(f"Processing {len(images)} images...")
    all_results = []
    for i, img in enumerate(images):
        name = os.path.basename(img)
        t0 = time.time()
        ocr_path = run_ocr(img)
        ocr_lines = sum(1 for _ in open(ocr_path))
        pairs = run_pair(ocr_path)
        t1 = time.time()
        cleaned = llm_clean(pairs, name)
        t2 = time.time()
        all_results.append({
            "image": name,
            "raw_pairs": len(pairs),
            "cleaned_words": cleaned,
        })
        print(f"  [{i+1:2d}/{len(images)}] {name}: ocr={ocr_lines}L  pairs={len(pairs)}  → {len(cleaned)} entries  ({t1-t0:.1f}s ocr + {t2-t1:.1f}s llm)")
    with open(OUT, 'w') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    total = sum(len(r['cleaned_words']) for r in all_results)
    print(f"\nTOTAL: {total} vocab entries across {len(images)} pages → {OUT}")

main()
