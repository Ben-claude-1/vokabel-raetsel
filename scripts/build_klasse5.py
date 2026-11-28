#!/usr/bin/env python3
"""
Reorganize the 789 extracted Schule vocabularies into:
  Klasse 5 (Kapitel)
    └── one Themenbereich per detected Theme + 'Übersicht: Word lists'
         (each with book_page-sorted vocabs, important flags carried over)

Then PATCH old chapter to retire it.
"""
import os, json, re, urllib.request
from collections import defaultdict

EXTRACTED = "/Users/ben/Projects/Lern App/icloud-schule/extracted.json"
META = "/Users/ben/Projects/Lern App/icloud-schule/page_metadata.json"
BOLD = "/Users/ben/Projects/Lern App/icloud-schule/bold_v2.json"

SB_URL = "https://zdtwlxclgsrfskqqnved.supabase.co"
SB_SVC = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
          "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdHdseGNsZ3NyZnNrcXFudmVkIiwicm9sZSI6"
          "InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxMzM0MiwiZXhwIjoyMDkwMzg5MzQyfQ."
          "OBa1kMDG0HOq7C6MRvf9WhIbdCgN6nFhRuwdkqTzEb0")
HDR = {"apikey":SB_SVC,"Authorization":"Bearer "+SB_SVC,"Content-Type":"application/json"}

ALLOWED_TYPES = {'verb','noun','adjective','phrase','other'}
TYPE_MAP = {'adverb':'other','conjunction':'other','pronoun':'other','preposition':'other','article':'other','interjection':'other'}

def ntype(t):
    if not t: return 'other'
    t = t.lower().strip().split('|')[0].strip()
    return t if t in ALLOWED_TYPES else TYPE_MAP.get(t,'other')

def nword(w,t):
    w = (w or '').strip()
    if not w: return w
    w = re.sub(r'^[°•*_y\d]+\s+','',w)
    w = re.sub(r'^[a-z]\s+(?=[A-Z(])','',w)
    w = w.strip(' .,;:_')
    if t=='verb' and not w.lower().startswith('to '):
        if not re.search(r'\b(am|is|are|was|were|been|will|would|can|could|may|might|shall|should|must)\b', w.lower()):
            w = 'to '+w
    return w

def nclue(c):
    c = (c or '').strip()
    c = re.sub(r'^[°•*]\s*','',c)
    return c.strip(' .,;:')

def kn(w):
    return re.sub(r'^to\s+','',(w or '').lower().strip())

def http_post(path, body):
    req = urllib.request.Request(SB_URL+path, data=json.dumps(body).encode(),
                                  headers={**HDR,"Prefer":"return=representation"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def http_patch(path, body):
    req = urllib.request.Request(SB_URL+path, data=json.dumps(body).encode(),
                                  headers={**HDR,"Prefer":"return=minimal"}, method="PATCH")
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def main():
    with open(EXTRACTED) as f: pages = json.load(f)
    with open(META) as f: meta = json.load(f)
    with open(BOLD) as f: bold_keys = set(json.load(f)['bold_keys'])

    # Fix outliers in book_page (interpolate missing or fix obvious mis-OCR like '83')
    img_order = sorted(meta.keys())
    # Fill gaps and fix outliers
    for i, img in enumerate(img_order):
        m = meta[img]
        bp = m.get('book_page')
        if bp is None or (bp is not None and (bp < 80 or bp > 250)):
            # Interpolate from neighbors in IMG order
            prev_bp = next((meta[img_order[j]]['book_page'] for j in range(i-1,-1,-1)
                           if meta[img_order[j]].get('book_page') and 80 <= meta[img_order[j]]['book_page'] <= 250), None)
            next_bp = next((meta[img_order[j]]['book_page'] for j in range(i+1,len(img_order))
                           if meta[img_order[j]].get('book_page') and 80 <= meta[img_order[j]]['book_page'] <= 250), None)
            if prev_bp and next_bp:
                # Best guess: prev+1 if next-prev >= delta
                guess = prev_bp + 1
                meta[img]['book_page'] = guess
                meta[img]['book_page_estimated'] = True
                print(f"  {img}: book_page interpolated → {guess}")
            elif prev_bp:
                meta[img]['book_page'] = prev_bp + 1
                meta[img]['book_page_estimated'] = True

    # Build per-theme structure
    by_theme = defaultdict(lambda: {'title': None, 'words': []})
    for page in pages:
        img = page['image']
        m = meta.get(img, {})
        theme_num = m.get('theme_num')
        theme_title = m.get('theme_title') or 'Übersicht'
        bp = m.get('book_page')
        # For pages without theme: bucket as "Übersicht"
        key = (theme_num if theme_num is not None else 0, theme_title)
        by_theme[key]['title'] = theme_title
        for idx, w in enumerate(page['cleaned_words']):
            t = ntype(w.get('type'))
            word = nword(w.get('word'), t)
            clue = nclue(w.get('clue'))
            if not word or not clue: continue
            if len(word)>60 or len(clue)>80: continue
            by_theme[key]['words'].append({
                'word': word, 'clue': clue, 'type': t,
                'important': kn(word) in bold_keys,
                'book_page': bp,
                'theme_num': theme_num,
                'theme_title': theme_title,
                'src_page': img,
                '_pos': idx,  # within-page order
            })

    # Sort each theme by book_page then within-page-position; dedupe
    final_themes = []
    for key in sorted(by_theme.keys()):
        ws = by_theme[key]['words']
        ws.sort(key=lambda w: (w.get('book_page') or 9999, w['_pos']))
        seen = {}
        seq = 0
        unique = []
        for w in ws:
            k = kn(w['word'])
            if k in seen: continue
            seen[k] = 1
            seq += 1
            w['seq'] = seq
            del w['_pos']
            unique.append(w)
        final_themes.append({'theme_num': key[0], 'theme_title': by_theme[key]['title'], 'words': unique})

    print("\nFinal hierarchy:")
    total = 0
    for t in final_themes:
        bold = sum(1 for w in t['words'] if w['important'])
        pages_set = sorted(set(w.get('book_page') for w in t['words'] if w.get('book_page')))
        print(f"  Theme {t['theme_num']}: {t['theme_title']} — {len(t['words'])} words ({bold} bold), pages {pages_set}")
        total += len(t['words'])
    print(f"  TOTAL {total}")

    # Create Klasse 5 chapter
    print("\nCreate 'Klasse 5'…")
    klasse5_id = 'ch_klasse5_'+str(int(__import__('time').time()))
    body = {
        'id': klasse5_id, 'title': 'Klasse 5',
        'color': '#0369a1', 'icon': '🎒',
        'parent_id': None, 'words': [], 'sentences': [], 'is_builtin': False,
    }
    res = http_post('/rest/v1/chapters', body)
    print(f"  → {res[0]['id']}")

    # Create one Themenbereich per theme
    for i, t in enumerate(final_themes):
        sub_id = f"ch_klasse5_t{t['theme_num']}_"+str(int(__import__('time').time()))+str(i)
        title = t['theme_title']
        if t['theme_num']>0: title = f"Theme {t['theme_num']}: {t['theme_title']}"
        sub_body = {
            'id': sub_id, 'title': title,
            'color': ['#7c3aed','#0369a1','#15803d','#b45309','#db2777','#ea580c','#0891b2'][i%7],
            'icon': ['📚','📘','📗','📙','📕','📔','🎨'][i%7],
            'parent_id': klasse5_id,
            'words': t['words'],
            'sentences': [],
            'is_builtin': False,
        }
        http_post('/rest/v1/chapters', sub_body)
        print(f"  + {title}: {len(t['words'])} words")

    # Retire old chapter (rename, keep as backup)
    print("\nRetire old 'Schule – Import April 2026' (rename to backup)…")
    http_patch("/rest/v1/chapters?id=eq.ch_1777119985000",
               {'title': '_BACKUP: Schule – Import April 2026 (vor Reorg)', 'icon': '🗄️'})
    print("Done.")

main()
