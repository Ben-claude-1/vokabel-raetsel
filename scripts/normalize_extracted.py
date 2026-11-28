#!/usr/bin/env python3
"""Normalize extracted.json: fix verb prefix, map types, deduplicate."""
import json, re, sys
from collections import defaultdict

SRC = "/Users/ben/Projects/Lern App/icloud-schule/extracted.json"
OUT = "/Users/ben/Projects/Lern App/icloud-schule/normalized.json"

ALLOWED_TYPES = {'verb','noun','adjective','phrase','other'}
TYPE_MAP = {
    'adverb': 'other', 'conjunction': 'other', 'pronoun': 'other',
    'preposition': 'other', 'article': 'other', 'interjection': 'other',
}

def norm_type(t):
    if not t: return 'other'
    t = t.lower().strip()
    if '|' in t: t = t.split('|')[0].strip()
    if t in ALLOWED_TYPES: return t
    return TYPE_MAP.get(t, 'other')

def norm_word(w, t):
    w = (w or '').strip()
    if not w: return w
    # Strip leading garbage: numbers, single underscores, asterisks, bullets, single letters before space
    w = re.sub(r'^[°•*_y\d]+\s+', '', w)
    w = re.sub(r'^[a-z]\s+(?=[A-Z(])', '', w)  # single lowercase letter before capital/paren
    w = w.strip(' .,;:_')
    # Verbs: ensure "to " prefix
    if t == 'verb' and not w.lower().startswith('to '):
        if not re.search(r'\b(am|is|are|was|were|been|will|would|can|could|may|might|shall|should|must)\b', w.lower()):
            w = 'to ' + w
    return w

def norm_clue(c):
    c = (c or '').strip()
    c = re.sub(r'^[°•*]\s*', '', c)
    c = c.strip(' .,;:')
    return c

def key(w):
    """Normalization for dedup."""
    k = (w or '').lower().strip()
    k = re.sub(r'^to\s+', '', k)
    return k

def main():
    with open(SRC) as f: data = json.load(f)
    seen = {}
    duplicates = 0
    skipped = 0
    for page in data:
        page_words = []
        for w in page['cleaned_words']:
            t = norm_type(w.get('type'))
            word = norm_word(w.get('word'), t)
            clue = norm_clue(w.get('clue'))
            if not word or not clue: skipped += 1; continue
            if len(word) > 60 or len(clue) > 80: skipped += 1; continue
            k = key(word)
            if k in seen:
                duplicates += 1
                # Keep richer entry (longer clue likely better)
                if len(clue) > len(seen[k]['clue']):
                    seen[k]['clue'] = clue
                seen[k]['source_pages'].add(page['image'])
                continue
            seen[k] = {'word': word, 'clue': clue, 'type': t, 'important': False, 'source_pages': {page['image']}}
            page_words.append(seen[k])
    final = []
    for v in seen.values():
        v['source_pages'] = sorted(v['source_pages'])
        final.append(v)
    final.sort(key=lambda v: v['word'].lower())
    with open(OUT, 'w') as f:
        json.dump(final, f, ensure_ascii=False, indent=2)
    print(f"Input: {sum(len(p['cleaned_words']) for p in data)}")
    print(f"Skipped (empty/too long): {skipped}")
    print(f"Duplicates merged: {duplicates}")
    print(f"Unique entries: {len(final)} → {OUT}")
    # Type breakdown
    types = defaultdict(int)
    for v in final: types[v['type']] += 1
    print(f"Types: {dict(types)}")
    # Quality checks
    no_to = [v for v in final if v['type']=='verb' and not v['word'].lower().startswith('to ')]
    print(f"Verbs without 'to ' prefix (modal/aux exempt): {len(no_to)}")
    if no_to[:5]: print(f"  Sample: {[v['word'] for v in no_to[:5]]}")

main()
