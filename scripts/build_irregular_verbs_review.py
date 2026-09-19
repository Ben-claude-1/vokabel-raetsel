#!/usr/bin/env python3
"""Legt einen zusätzlichen, gemischten Leiterspiel-Run mit ALLEN 83
unregelmäßigen Verben an (alle Muster durcheinander, nicht mehr nach
Chicken/Hamburger/Echo/Miau/Sonstige getrennt wie in
scripts/build_irregular_verbs.py) und übernimmt für jeden Spieler den
aktuellen Topf-Stand aus den 8 bestehenden Muster-Runs — dadurch startet
der neue Run nicht bei 0%, sondern bei genau dem Fortschritt, den der
Spieler in den Einzel-Runs schon erreicht hat.

Ersetzt NICHTS: die 8 Muster-Runs (Lernplan, siehe verbplan.js) bleiben
unverändert bestehen, dieser Run ist ein zusätzliches Wiederholungs-Ziel
für "📝 Test starten" (verbdrill.jsx: VerbTestPanel mit Tipp-Stufen).
"""
import json
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from build_irregular_verbs import BASE, PARENT_ID, PATTERNS, build_words_by_pattern, call, ORDER

CHAPTER_ID = 'ch_klasse6_en_irr_alle'
RUN_NAME = '🔁 Alle unregelmäßigen Verben (gemischt)'


def normWordKey(w):
    w = (w or '').lower().strip()
    if w.startswith('to '):
        w = w[3:]
    return w


def build_all_words():
    by_pattern = build_words_by_pattern()
    words = []
    seq = 0
    for p in ORDER:
        for w in by_pattern[p]:
            seq += 1
            w2 = dict(w)
            w2['seq'] = seq
            words.append(w2)
    return words


def upsert_chapter(words):
    payload = {'id': CHAPTER_ID, 'title': RUN_NAME, 'color': '#0f766e', 'icon': '🔁',
               'words': words, 'sentences': [], 'parent_id': PARENT_ID,
               'grade': 6, 'language': 'en', 'is_builtin': False}
    existing = call('GET', '/chapters?id=eq.%s&select=id' % CHAPTER_ID)
    if existing:
        call('PATCH', '/chapters?id=eq.%s' % CHAPTER_ID, {k: v for k, v in payload.items() if k != 'id'})
        print('Kapitel aktualisiert:', CHAPTER_ID)
    else:
        call('POST', '/chapters', payload, prefer='return=minimal')
        print('Kapitel angelegt:', CHAPTER_ID)


def upsert_run(words):
    run_words = [dict(w, chapterId=CHAPTER_ID, pot=1) for w in words]
    runs = call('GET', '/ls_runs?select=id&name=eq.%s' % urllib.parse.quote(RUN_NAME))
    patch = {'name': RUN_NAME, 'icon': '🔁', 'words': json.dumps(run_words),
             'word_count': len(run_words), 'grade': 6, 'language': 'en',
             'sentences': '[]', 'sentence_count': 0}
    if runs:
        call('PATCH', '/ls_runs?id=eq.%s' % runs[0]['id'], patch)
        print('Run aktualisiert:', runs[0]['id'], RUN_NAME)
        return runs[0]['id']
    patch.update({'player_id': None, 'is_admin_run': True})
    res = call('POST', '/ls_runs', patch, prefer='return=representation')
    print('Run angelegt:', res[0]['id'], RUN_NAME)
    return res[0]['id']


def parse_progress_data(raw):
    d = raw
    if isinstance(d, str):
        d = json.loads(d)
    return d


EMPTY_POTS = lambda: {str(n): [] for n in range(1, 7)}


def source_run_ids():
    ids = []
    for p in ORDER:
        runs = call('GET', '/ls_runs?select=id,name&name=eq.%s' % urllib.parse.quote(PATTERNS[p]['title']))
        ids.extend([r['id'] for r in (runs or [])])
        i = 1
        while True:
            title = '%s · Teil %d/' % (PATTERNS[p]['title'], i)
            more = call('GET', '/ls_runs?select=id,name&name=like.%s*' % urllib.parse.quote(title))
            if not more:
                break
            ids.extend([r['id'] for r in more])
            i += 1
    return ids


def import_progress(combined_run_id):
    src_ids = source_run_ids()
    print('Quell-Runs:', len(src_ids))
    by_player = {}
    for rid in src_ids:
        rows = call('GET', '/ls_progress?select=player_id,data&run_id=eq.%s' % rid) or []
        for row in rows:
            data = parse_progress_data(row['data'])
            pots = data.get('pots') or {}
            dest = by_player.setdefault(row['player_id'], EMPTY_POTS())
            for pot_num, ws in pots.items():
                for w in (ws or []):
                    dest.setdefault(pot_num, []).append(w)

    for player_id, pots in by_player.items():
        total_correct = sum(w.get('correct', 0) for ws in pots.values() for w in ws)
        total_wrong = sum(w.get('wrong', 0) for ws in pots.values() for w in ws)
        total_words = sum(len(ws) for ws in pots.values())
        learned = len(pots.get('6', []))
        new_data = {'pots': pots, 'sentences': [], 'bonusStarted': False, 'history': [],
                    'lastWord': None, 'streak': 0, 'totalCorrect': total_correct,
                    'totalWrong': total_wrong, 'days': {}, 'sessions': []}
        existing = call('GET', '/ls_progress?select=id&player_id=eq.%s&run_id=eq.%s' % (player_id, combined_run_id))
        body = {'player_id': player_id, 'run_id': combined_run_id, 'data': json.dumps(new_data)}
        if existing:
            call('PATCH', '/ls_progress?id=eq.%s' % existing[0]['id'], {'data': json.dumps(new_data)})
        else:
            call('POST', '/ls_progress', body, prefer='return=minimal')
        pct = round(100 * learned / total_words) if total_words else 0
        print('  Fortschritt übernommen: player %s -> %d/%d Wörter gelernt (%d%%)' %
              (player_id, learned, total_words, pct))


def main():
    words = build_all_words()
    print('%d Verben insgesamt' % len(words))
    if '--dry-run' in sys.argv:
        for w in words:
            print('%-14s | %-20s | %-20s | %s' % (w['word'], w['pastSimple'], w['pastParticiple'], w['pattern']))
        return
    upsert_chapter(words)
    run_id = upsert_run(words)
    import_progress(run_id)


if __name__ == '__main__':
    main()
