#!/usr/bin/env python3
"""
Apply Claude Vision batch results to local DB.
Strategy: for each page result, replace all words with that book_page
within the matching Theme (or Übersicht for pages 207/208).
Keeps words on other pages untouched.
"""
import os, json, re, urllib.request

CV_RESULTS = "/Users/ben/Projects/Lern App/icloud-schule/claude_vision_results.json"
SB_URL = "https://mac-studio.taild5562c.ts.net/rest/v1"
SVC = json.load(open("/Users/ben/.local/etc/vokabel/jwts.json"))['service_role']
HDR = {"apikey":SVC,"Authorization":"Bearer "+SVC,"Content-Type":"application/json"}

def normkey(w):
    return re.sub(r'^to\s+','',(w or '').lower().strip())

def get_chapters_with_words():
    req = urllib.request.Request(f"{SB_URL}/chapters?id=like.ch_klasse5_*&select=id,title,words", headers=HDR)
    with urllib.request.urlopen(req, timeout=30) as r:
        rows = json.loads(r.read())
    out = {}
    for r in rows:
        ws = r['words']
        if isinstance(ws, str): ws = json.loads(ws)
        out[r['id']] = {'id': r['id'], 'title': r['title'], 'words': ws or []}
    return out

def patch_chapter_words(ch_id, words):
    body = json.dumps({"words": words}).encode()
    req = urllib.request.Request(f"{SB_URL}/chapters?id=eq.{ch_id}", data=body, method="PATCH",
                                  headers={**HDR, "Prefer":"return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status

def find_chapter_for_theme(chapters, theme_name):
    if not theme_name: return None
    # exact match first (e.g., "Theme 4: Birthdays")
    for ch in chapters.values():
        if ch['title'] == theme_name: return ch
    # partial match (Claude might say just "Birthdays")
    short = theme_name.lower().replace('theme', '').replace(':','').strip()
    short = re.sub(r'^\d+\s*', '', short).strip()
    for ch in chapters.values():
        if short and short in ch['title'].lower(): return ch
    # fallback: Übersicht
    if 'überblick' in theme_name.lower() or 'übersicht' in theme_name.lower() or 'overview' in theme_name.lower():
        for ch in chapters.values():
            if 'übersicht' in ch['title'].lower(): return ch
    return None

def main():
    with open(CV_RESULTS) as f:
        results = json.load(f)
    print(f"Loaded {len(results)} page results")
    chapters = get_chapters_with_words()
    print(f"Loaded {len(chapters)} Klasse-5 chapters")

    # Group results by target chapter
    seq_counter = {}
    chapter_updates = {}  # ch_id -> {pages: {page_num: [words]}, all_words: [...]}
    unmatched_pages = []
    for entry in results:
        if 'error' in entry:
            print(f"  Skip {entry['image']}: {entry['error']}"); continue
        d = entry['data']
        page = d.get('page')
        theme = d.get('theme', '')
        words = d.get('words', [])
        ch = find_chapter_for_theme(chapters, theme)
        if not ch:
            # Default to Übersicht for pages without Theme N
            for c in chapters.values():
                if 'übersicht' in c['title'].lower(): ch = c; break
        if not ch:
            unmatched_pages.append((entry['image'], page, theme))
            continue
        if ch['id'] not in chapter_updates:
            chapter_updates[ch['id']] = {'title': ch['title'], 'pages': {}}
        chapter_updates[ch['id']]['pages'][page] = {
            'src_page': entry['image'],
            'theme': theme,
            'words': words,
        }

    if unmatched_pages:
        print("UNMATCHED:", unmatched_pages)

    # Build new word lists per chapter
    for ch_id, upd in chapter_updates.items():
        old_words = chapters[ch_id]['words']
        # Pages we're replacing
        replacing_pages = set(upd['pages'].keys())
        # Keep old words from pages NOT being replaced
        kept = [w for w in old_words if w.get('book_page') not in replacing_pages]
        # Add new words from Claude (sorted by page, then within-page order)
        new_words = []
        seq = 1
        # Get theme number from chapter title
        m = re.match(r'Theme\s+(\d+)', upd['title'])
        theme_num = int(m.group(1)) if m else 0
        for page in sorted(upd['pages'].keys() or [None]):
            if page is None: continue
            page_data = upd['pages'][page]
            for idx, w in enumerate(page_data['words']):
                new_words.append({
                    'word': w.get('word','').strip(),
                    'clue': w.get('clue','').strip(),
                    'type': w.get('type','other'),
                    'important': bool(w.get('bold', False)),
                    'book_page': page,
                    'theme_num': theme_num,
                    'theme_title': upd['title'],
                    'src_page': page_data['src_page'],
                    'seq': seq,
                })
                seq += 1
        # Combine, dedupe within chapter
        seen = {}
        final = []
        for w in kept + new_words:
            k = normkey(w.get('word',''))
            if not k or not w.get('clue'): continue
            if k in seen:
                # If new entry is from claude (has book_page that we just updated), prefer it
                if w in new_words and seen[k] in kept:
                    final.remove(seen[k])
                    seen[k] = w
                    final.append(w)
                continue
            seen[k] = w
            final.append(w)
        # Final sort: by book_page (None last), then seq
        final.sort(key=lambda w: (w.get('book_page') or 99999, w.get('seq') or 99999))
        bold_count = sum(1 for w in final if w.get('important'))
        status = patch_chapter_words(ch_id, final)
        print(f"  {upd['title']}: {len(old_words)} → {len(final)} words ({bold_count} bold) [HTTP {status}]")

main()
