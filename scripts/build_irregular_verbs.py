#!/usr/bin/env python3
"""Legt die unregelmäßigen Verben von Buchseite 292/293 (Camden Town 2, „Words")
als eigenes Kapitel unter Klasse 6 · Englisch an und hält den Leiterspiel-Run
darüber synchron (auto_chapter_id).

Kartenformat: gefragt wird die deutsche Bedeutung + Grundform, geschrieben wird
die simple-past-Form. Topf 5 fragt umgekehrt ab, deshalb steht die deutsche
Bedeutung vorne und alles Weitere in Klammern — checkAnswer akzeptiert dann den
Kern vor der Klammer. In der Klammer dürfen weder Komma noch Schrägstrich stehen.
"""
import json
import os
import re
import sys
import urllib.request

BASE = 'https://mac-studio.taild5562c.ts.net/rest/v1'
CHAPTER_ID = 'ch_klasse6_en_irr'
CHAPTER_TITLE = 'Irregular verbs – simple past (S. 292/293)'
PARENT_ID = 'ch_klasse6_en'

# (Grundform, simple past, deutsche Bedeutung, Buchseite)
# Wortlaut wie im Buch; Semikolon durch Komma ersetzt, damit die
# Antwortprüfung beide Bedeutungen als Alternativen erkennt.
VERBS = [
    ('be',         None,               'sein',                        292),
    ('become',     'became',           'werden',                      292),
    ('begin',      'began',            'anfangen',                    292),
    ('bet',        'bet',              'wetten',                      292),
    ('bite',       'bit',              'beißen',                      292),
    ('blow up',    'blew up',          'in die Luft sprengen',        292),
    ('break',      'broke',            '(zer)brechen',                292),
    ('bring',      'brought',          '(mit)bringen',                292),
    ('build',      'built',            'bauen',                       292),
    ('burn',       'burnt (burned)',   '(ab)brennen',                 292),
    ('buy',        'bought',           'kaufen',                      292),
    ('catch',      'caught',           '(auf)fangen',                 292),
    ('choose',     'chose',            '(aus)wählen',                 292),
    ('come',       'came',             'kommen',                      292),
    ('cost',       'cost',             'kosten',                      292),
    ('creep',      'crept',            'schleichen',                  292),
    ('cut',        'cut',              'schneiden',                   292),
    ('do',         'did',              'machen, tun',                 292),
    ('draw',       'drew',             'zeichnen',                    292),
    ('drink',      'drank',            'trinken',                     292),
    ('drive',      'drove',            'fahren',                      292),
    ('eat',        'ate',              'essen, fressen',              292),
    ('fall',       'fell',             '(um)fallen',                  292),
    ('feed',       'fed',              'füttern, zu essen geben',     292),
    ('feel',       'felt',             '(sich) fühlen',               292),
    ('fight',      'fought',           '(be)kämpfen',                 292),
    ('find',       'found',            'finden',                      292),
    ('fly',        'flew',             'fliegen',                     292),
    ('forget',     'forgot',           'vergessen',                   292),
    ('get',        'got',              'bekommen',                    292),
    ('give',       'gave',             'geben',                       292),
    ('go',         'went',             'fahren, gehen',               292),
    ('hang up',    'hung up',          'aufhängen',                   292),
    ('have',       'had',              'haben',                       292),
    ('hear',       'heard',            'hören',                       292),
    ('hide',       'hid',              '(sich) verstecken',           292),
    ('hold up',    'held up',          'hochhalten',                  292),
    ('hold',       'held',             'halten',                      292),
    ('hurt',       'hurt',             'wehtun, verletzen',           292),
    ('keep',       'kept',             '(bei)behalten',               292),
    ('know',       'knew',             'kennen, wissen',              292),
    ('lead',       'led',              'führen',                      293),
    ('learn',      'learnt (learned)', 'lernen, erfahren',            293),
    ('leave',      'left',             'verlassen',                   293),
    ('let',        'let',              'lassen',                      293),
    ('lie',        'lay',              'liegen, sich hinlegen',       293),
    ('light',      'lit',              'anzünden',                    293),
    ('lose',       'lost',             'verlieren',                   293),
    ('make',       'made',             'machen',                      293),
    ('mean',       'meant',            'bedeuten, meinen',            293),
    ('meet',       'met',              '(sich) treffen',              293),
    ('pay',        'paid',             '(be)zahlen',                  293),
    ('put',        'put',              'legen, setzen, stellen',      293),
    ('read',       'read',             'lesen',                       293),
    ('ride',       'rode',             'fahren, reiten',              293),
    ('ring up',    'rang (up)',        'anrufen',                     293),
    ('run',        'ran',              'rennen',                      293),
    ('say',        'said',             'sagen',                       293),
    ('see',        'saw',              'sehen',                       293),
    ('sell',       'sold',             'verkaufen',                   293),
    ('send',       'sent',             '(zu)schicken',                293),
    ('set off',    'set off',          'aufbrechen, loslaufen',       293),
    ('shoot off',  'shot off',         'losschießen',                 293),
    ('show',       'showed',           'zeigen',                      293),
    ('sing',       'sang',             'singen',                      293),
    ('sit',        'sat',              'sitzen',                      293),
    ('sleep',      'slept',            'schlafen',                    293),
    ('smell',      'smelt (smelled)',  'riechen',                     293),
    ('speak',      'spoke',            'sprechen',                    293),
    ('spend',      'spent',            'Geld ausgeben, Zeit verbringen', 293),
    ('spoil',      'spoilt (spoiled)', 'ruinieren',                   293),
    ('stand',      'stood',            'stehen',                      293),
    ('steal',      'stole',            'stehlen',                     293),
    ('swim',       'swam',             'schwimmen',                   293),
    ('take',       'took',             '(mit)nehmen',                 293),
    ('tell',       'told',             'erzählen, sagen',             293),
    ('think',      'thought',          'denken, glauben, meinen',     293),
    ('throw',      'threw',            'werfen',                      293),
    ('understand', 'understood',       'verstehen',                   293),
    ('wake up',    'woke up',          'aufwachen, aufwecken',        293),
    ('wear',       'wore',             'tragen, anhaben',             293),
    ('win',        'won',              'gewinnen',                    293),
    ('write',      'wrote',            'schreiben',                   293),
]


def build_words():
    words, seq = [], 0
    for base, past, de, page in VERBS:
        if base == 'be':
            forms = [('was', 'be → simple past: I he she it'),
                     ('were', 'be → simple past: you we they')]
        else:
            forms = [(past, base + ' → simple past')]
        for form, hint in forms:
            seq += 1
            words.append({
                'seq': seq,
                'word': form,
                'clue': '%s (%s)' % (de, hint),
                # bewusst kein 'verb': sonst stellt wordDisplay() ein „to" voran
                # und die Lösung hieße „to went".
                'type': 'noun',
                'book_page': page,
                'important': True,
                'src_page': 'S. %d (Irregular verbs)' % page,
                'theme_num': 99,
                'theme_title': CHAPTER_TITLE,
            })
    for w in words:
        assert '/' not in w['clue'], w['clue']
        assert not re.search(r'\([^)]*,[^)]*\)', w['clue']), w['clue']
    return words


def jwt():
    path = os.path.expanduser('~/.local/etc/vokabel/jwts.json')
    return json.load(open(path))['service_role']


def call(method, path, payload=None, prefer=None):
    tok = jwt()
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('apikey', tok)
    req.add_header('Authorization', 'Bearer ' + tok)
    req.add_header('Content-Type', 'application/json')
    if prefer:
        req.add_header('Prefer', prefer)
    with urllib.request.urlopen(req) as r:
        body = r.read().decode()
    return json.loads(body) if body.strip() else None


def main():
    words = build_words()
    print('%d Karten aus %d Verben' % (len(words), len(VERBS)))
    if '--dry-run' in sys.argv:
        for w in words:
            print('%-18s | %s' % (w['word'], w['clue']))
        return

    existing = call('GET', '/chapters?id=eq.%s&select=id' % CHAPTER_ID)
    payload = {'id': CHAPTER_ID, 'title': CHAPTER_TITLE, 'color': '#0f766e',
               'icon': '⏪', 'words': words, 'sentences': [],
               'parent_id': PARENT_ID, 'grade': 6, 'language': 'en',
               'is_builtin': False}
    if existing:
        call('PATCH', '/chapters?id=eq.%s' % CHAPTER_ID,
             {k: v for k, v in payload.items() if k != 'id'})
        print('Kapitel aktualisiert:', CHAPTER_ID)
    else:
        call('POST', '/chapters', payload, prefer='return=minimal')
        print('Kapitel angelegt:', CHAPTER_ID)

    # Leiterspiel-Run: gleiche Wörter, an das Kapitel gekoppelt (⭐-Automatik)
    run_words = [{'word': w['word'], 'clue': w['clue'], 'type': w['type'],
                  'chapterId': CHAPTER_ID, 'important': True,
                  'book_page': w['book_page'], 'pot': 1} for w in words]
    runs = call('GET', '/ls_runs?auto_chapter_id=eq.%s&select=id' % CHAPTER_ID)
    patch = {'name': CHAPTER_TITLE, 'words': run_words, 'word_count': len(run_words),
             'grade': 6, 'language': 'en', 'icon': '⏪',
             'auto_chapter_id': CHAPTER_ID}
    if runs:
        call('PATCH', '/ls_runs?id=eq.%s' % runs[0]['id'], patch)
        print('Run aktualisiert:', runs[0]['id'])
    else:
        old = call('GET', "/ls_runs?select=id&name=like.Unregelm*")
        if old:
            call('PATCH', '/ls_runs?id=eq.%s' % old[0]['id'], patch)
            print('Run aktualisiert:', old[0]['id'])
        else:
            patch.update({'player_id': None, 'is_admin_run': True, 'sentences': '[]',
                          'sentence_count': 0, 'target_date': '2026-09-14',
                          'target_pct': 100})
            res = call('POST', '/ls_runs', patch, prefer='return=representation')
            print('Run angelegt:', res[0]['id'])


if __name__ == '__main__':
    main()
