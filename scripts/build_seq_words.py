#!/usr/bin/env python3
"""Build a word list with seq numbers from raw extracted batch output."""
import json, re, sys
from collections import defaultdict

EXTRACTED = "/Users/ben/Projects/Lern App/icloud-schule/extracted.json"
OUT = "/Users/ben/Projects/Lern App/icloud-schule/words_with_seq.json"

ALLOWED_TYPES = {'verb','noun','adjective','phrase','other'}
TYPE_MAP = {
    'adverb': 'other', 'conjunction': 'other', 'pronoun': 'other',
    'preposition': 'other', 'article': 'other', 'interjection': 'other',
}

def norm_type(t):
    if not t: return 'other'
    t = t.lower().strip()
    if '|' in t: t = t.split('|')[0].strip()
    return t if t in ALLOWED_TYPES else TYPE_MAP.get(t, 'other')

def norm_word(w, t):
    w = (w or '').strip()
    if not w: return w
    w = re.sub(r'^[°•*_y\d]+\s+', '', w)
    w = re.sub(r'^[a-z]\s+(?=[A-Z(])', '', w)
    w = w.strip(' .,;:_')
    if t == 'verb' and not w.lower().startswith('to '):
        if not re.search(r'\b(am|is|are|was|were|been|will|would|can|could|may|might|shall|should|must)\b', w.lower()):
            w = 'to ' + w
    return w

def norm_clue(c):
    c = (c or '').strip()
    c = re.sub(r'^[°•*]\s*', '', c)
    return c.strip(' .,;:')

def keynorm(w):
    return re.sub(r'^to\s+', '', (w or '').lower().strip())

def main():
    with open(EXTRACTED) as f: pages = json.load(f)
    seq = 0
    seen = {}
    for page in pages:
        page_name = page['image']
        page_num = int(re.search(r'(\d+)', page_name).group(1))
        for w in page['cleaned_words']:
            seq += 1
            t = norm_type(w.get('type'))
            word = norm_word(w.get('word'), t)
            clue = norm_clue(w.get('clue'))
            if not word or not clue: continue
            if len(word) > 60 or len(clue) > 80: continue
            k = keynorm(word)
            if k in seen:
                # Already seen — keep first occurrence's seq, optionally update clue
                if len(clue) > len(seen[k]['clue']):
                    seen[k]['clue'] = clue
                continue
            seen[k] = {
                'word': word, 'clue': clue, 'type': t,
                'important': False, 'seq': seq,
                'src_page': page_num
            }
    final = sorted(seen.values(), key=lambda v: v['seq'])
    with open(OUT,'w') as f: json.dump(final,f,ensure_ascii=False,indent=2)
    print(f"Total unique entries: {len(final)}")
    print(f"Seq range: {final[0]['seq']} - {final[-1]['seq']}")
    print(f"Page range: {final[0]['src_page']} - {final[-1]['src_page']}")
    print(f"Sample (seq 1..5):")
    for v in final[:5]: print(f"  seq={v['seq']:4d} page={v['src_page']} {v['word']!r:30s} → {v['clue']!r}")

main()
