#!/usr/bin/env python3
"""
Batch all 31 Schule images through Claude Vision (Opus 4.7).
Extracts complete vocab + bold flag + type per word.
Saves to claude_vision_results.json.
"""
import os, sys, json, base64, urllib.request, glob, re, time

SRC = "/Users/ben/Projects/Lern App/icloud-schule"
OUT = "/Users/ben/Projects/Lern App/icloud-schule/claude_vision_results.json"
SVC_PATH = "/Users/ben/.local/etc/vokabel/jwts.json"
SB_URL = "https://mac-studio.taild5562c.ts.net/rest/v1"

PROMPT = '''You are looking at a German-English school-book vocabulary page (Camden Town, Klasse 5).

Extract EVERY English vocabulary entry visible on this page with the following data:
- word: English headword (verbs prefixed with "to ", multi-word like "(in) spring" kept whole, including "(no pl)" markers if present)
- clue: German translation (full as printed, including "fahren (mit), reiten")
- bold: true if the English headword is printed in BOLD/heavier type, false otherwise
- type: "verb" | "noun" | "adjective" | "phrase" | "other"

Pay close attention to BOLD detection: compare each entry's stroke thickness to the surrounding entries. Bold = visually heavier than the page baseline. Look carefully — small differences matter.

Skip example sentences, phonetic transcriptions in /…/ form, headings like "Pick-up: …", page numbers, footers.

Return ONLY JSON, no markdown fences:
{"page": <book page from bottom corner>, "theme": "<theme name from top, e.g. \\"Theme 4: Birthdays\\" or \\"Übersicht\\">", "words": [...]}'''

svc = json.load(open(SVC_PATH))['service_role']
hdr = {"apikey":svc,"Authorization":"Bearer "+svc}
req = urllib.request.Request(f"{SB_URL}/settings?key=eq.anthropic_key&select=value", headers=hdr)
with urllib.request.urlopen(req, timeout=20) as r:
    KEY = json.loads(r.read())[0]['value']

def call_claude(img_path):
    img_b64 = base64.b64encode(open(img_path,'rb').read()).decode()
    body = json.dumps({"model":"claude-opus-4-7","max_tokens":4096,"messages":[{"role":"user","content":[
        {"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":img_b64}},
        {"type":"text","text":PROMPT}
    ]}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST",
        headers={"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read())
    txt = ''.join(b.get('text','') for b in d.get('content',[]))
    m = re.search(r'\{[\s\S]*\}', txt)
    if not m: raise RuntimeError(f"No JSON in response: {txt[:200]}")
    return json.loads(m.group(0)), d.get('usage',{})

def main():
    images = sorted(glob.glob(os.path.join(SRC, "*.JPG")))
    print(f"Processing {len(images)} images with Claude Opus 4.7...")
    results = []
    total_in, total_out = 0, 0
    for i, img in enumerate(images):
        name = os.path.basename(img)
        t0 = time.time()
        try:
            data, usage = call_claude(img)
            elapsed = time.time()-t0
            total_in += usage.get('input_tokens',0)
            total_out += usage.get('output_tokens',0)
            results.append({"image": name, "data": data, "usage": usage})
            n = len(data.get('words',[]))
            bold = sum(1 for w in data.get('words',[]) if w.get('bold'))
            print(f"  [{i+1:2d}/{len(images)}] {name}: page={data.get('page')} theme={data.get('theme','?')[:30]:30s} {n} words ({bold} bold) — {elapsed:.1f}s")
        except Exception as e:
            print(f"  [{i+1:2d}/{len(images)}] {name}: ERROR {e}")
            results.append({"image": name, "error": str(e)})
        # save incrementally
        with open(OUT,'w') as f: json.dump(results, f, ensure_ascii=False, indent=2)
    cost_in = total_in/1_000_000 * 15
    cost_out = total_out/1_000_000 * 75
    print(f"\nTotal: {total_in:,} in + {total_out:,} out tokens, cost ${cost_in:.2f} + ${cost_out:.2f} = ${cost_in+cost_out:.2f}")
    print(f"Saved → {OUT}")

main()
