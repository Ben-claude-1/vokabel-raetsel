#!/usr/bin/env python3
"""Legt die unregelmäßigen Verben von Buchseite 292/293 (Camden Town 2, „Words")
als fünf Muster-Kapitel unter Klasse 6 · Englisch an (🐔 Chicken / 🍔 Hamburger /
📢 Echo / 🐱 Miau / 🔀 Sonstige) plus je einen gekoppelten Leiterspiel-Run für
den Verben-Trainer (siehe src/ui/verbdrill.jsx).

Ersetzt die alte, alphabetische Version (ein Kapitel `ch_klasse6_en_irr`, nur
Simple Past, type='noun'-Hack) komplett — die alte Kapitel/Run/Fortschritts-
Daten werden gelöscht, weil sich das Kartenformat grundlegend geändert hat
(3 Formen pro Verb statt 1, Muster-Gruppierung statt Buchseiten-Reihenfolge).

Kartenformat pro Verb (ein Eintrag, nicht mehr eins pro Form):
  word = Grundform (Infinitiv), clue = Muster-Emoji + deutsche Bedeutung,
  meaning = reine deutsche Bedeutung (fürs Rückwärts-Abfragen),
  pastSimple / pastParticiple = die beiden Vergangenheitsformen,
  pattern = chicken|hamburger|echo|miau|sonstige, type='verb'.
Mehrdeutige Formen (burnt/burned, was/were) stehen wie gewohnt als
"haupt (alternative)" bzw. "haupt, alternative" — checkAnswer() akzeptiert
beides, siehe core/words.js.
"""
import json
import math
import os
import sys
import urllib.parse
import urllib.request

BASE = 'https://mac-studio.taild5562c.ts.net/rest/v1'
PARENT_ID = 'ch_klasse6_en'
OLD_CHAPTER_ID = 'ch_klasse6_en_irr'
TARGET_DATE = '2026-09-14'
# Ein Leiterspiel-Run darf laut Ben maximal 15 Vokabeln haben — Echo (40) und
# Sonstige (27) werden deshalb in mehrere gleich große Teil-Kapitel/-Runs
# gesplittet (siehe split_group()). Die alten Einzel-Runs "ch_..._echo" und
# "ch_..._sonstige" von vor dem Split werden migriert, nicht einfach gelöscht
# (siehe migrate_split_progress()) — Emma hatte dort schon Fortschritt.
MAX_RUN_SIZE = 15

PATTERNS = {
    'chicken':   {'title': '🐔 Chicken-Verben (alle 3 Formen gleich)', 'icon': '🐔', 'color': '#b45309'},
    'hamburger': {'title': '🍔 Hamburger-Verben (1. = 3. Form)', 'icon': '🍔', 'color': '#b91c1c'},
    'echo':      {'title': '📢 Echo-Verben (2. = 3. Form)', 'icon': '📢', 'color': '#1d4ed8'},
    'miau':      {'title': '🐱 Miau-Verben (I → A → U)', 'icon': '🐱', 'color': '#7c3aed'},
    'sonstige':  {'title': '🔀 Sonstige unregelmäßige Verben', 'icon': '🔀', 'color': '#0f766e'},
}
# Lernreihenfolge (klein & leicht zuerst, wie im Chat empfohlen).
ORDER = ['chicken', 'hamburger', 'echo', 'miau', 'sonstige']

# (Grundform, Simple Past, Past Participle, deutsche Bedeutung, Muster, Buchseite)
VERBS = [
    ('be', 'was, were', 'been', 'sein', 'sonstige', 292),
    ('become', 'became', 'become', 'werden', 'hamburger', 292),
    ('begin', 'began', 'begun', 'anfangen', 'miau', 292),
    ('bet', 'bet', 'bet', 'wetten', 'chicken', 292),
    ('bite', 'bit', 'bitten', 'beißen', 'sonstige', 292),
    ('blow up', 'blew up', 'blown up', 'in die Luft sprengen', 'sonstige', 292),
    ('break', 'broke', 'broken', '(zer)brechen', 'sonstige', 292),
    ('bring', 'brought', 'brought', '(mit)bringen', 'echo', 292),
    ('build', 'built', 'built', 'bauen', 'echo', 292),
    ('burn', 'burnt (burned)', 'burnt (burned)', '(ab)brennen', 'echo', 292),
    ('buy', 'bought', 'bought', 'kaufen', 'echo', 292),
    ('catch', 'caught', 'caught', '(auf)fangen', 'echo', 292),
    ('choose', 'chose', 'chosen', '(aus)wählen', 'sonstige', 292),
    ('come', 'came', 'come', 'kommen', 'hamburger', 292),
    ('cost', 'cost', 'cost', 'kosten', 'chicken', 292),
    ('creep', 'crept', 'crept', 'schleichen', 'echo', 292),
    ('cut', 'cut', 'cut', 'schneiden', 'chicken', 292),
    ('do', 'did', 'done', 'machen, tun', 'sonstige', 292),
    ('draw', 'drew', 'drawn', 'zeichnen', 'sonstige', 292),
    ('drink', 'drank', 'drunk', 'trinken', 'miau', 292),
    ('drive', 'drove', 'driven', 'fahren', 'sonstige', 292),
    ('eat', 'ate', 'eaten', 'essen, fressen', 'sonstige', 292),
    ('fall', 'fell', 'fallen', '(um)fallen', 'sonstige', 292),
    ('feed', 'fed', 'fed', 'füttern, zu essen geben', 'echo', 292),
    ('feel', 'felt', 'felt', '(sich) fühlen', 'echo', 292),
    ('fight', 'fought', 'fought', '(be)kämpfen', 'echo', 292),
    ('find', 'found', 'found', 'finden', 'echo', 292),
    ('fly', 'flew', 'flown', 'fliegen', 'sonstige', 292),
    ('forget', 'forgot', 'forgotten', 'vergessen', 'sonstige', 292),
    ('get', 'got', 'got (gotten)', 'bekommen', 'echo', 292),
    ('give', 'gave', 'given', 'geben', 'sonstige', 292),
    ('go', 'went', 'gone', 'fahren, gehen', 'sonstige', 292),
    ('hang up', 'hung up', 'hung up', 'aufhängen', 'echo', 292),
    ('have', 'had', 'had', 'haben', 'echo', 292),
    ('hear', 'heard', 'heard', 'hören', 'echo', 292),
    ('hide', 'hid', 'hidden', '(sich) verstecken', 'sonstige', 292),
    ('hold up', 'held up', 'held up', 'hochhalten', 'echo', 292),
    ('hold', 'held', 'held', 'halten', 'echo', 292),
    ('hurt', 'hurt', 'hurt', 'wehtun, verletzen', 'chicken', 292),
    ('keep', 'kept', 'kept', '(bei)behalten', 'echo', 292),
    ('know', 'knew', 'known', 'kennen, wissen', 'sonstige', 292),
    ('lead', 'led', 'led', 'führen', 'echo', 293),
    ('learn', 'learnt (learned)', 'learnt (learned)', 'lernen, erfahren', 'echo', 293),
    ('leave', 'left', 'left', 'verlassen', 'echo', 293),
    ('let', 'let', 'let', 'lassen', 'chicken', 293),
    ('lie', 'lay', 'lain', 'liegen, sich hinlegen', 'sonstige', 293),
    ('light', 'lit', 'lit', 'anzünden', 'echo', 293),
    ('lose', 'lost', 'lost', 'verlieren', 'echo', 293),
    ('make', 'made', 'made', 'machen', 'echo', 293),
    ('mean', 'meant', 'meant', 'bedeuten, meinen', 'echo', 293),
    ('meet', 'met', 'met', '(sich) treffen', 'echo', 293),
    ('pay', 'paid', 'paid', '(be)zahlen', 'echo', 293),
    ('put', 'put', 'put', 'legen, setzen, stellen', 'chicken', 293),
    ('read', 'read', 'read', 'lesen', 'chicken', 293),
    ('ride', 'rode', 'ridden', 'fahren, reiten', 'sonstige', 293),
    ('ring up', 'rang up', 'rung up', 'anrufen', 'miau', 293),
    ('run', 'ran', 'run', 'rennen', 'hamburger', 293),
    ('say', 'said', 'said', 'sagen', 'echo', 293),
    ('see', 'saw', 'seen', 'sehen', 'sonstige', 293),
    ('sell', 'sold', 'sold', 'verkaufen', 'echo', 293),
    ('send', 'sent', 'sent', '(zu)schicken', 'echo', 293),
    ('set off', 'set off', 'set off', 'aufbrechen, loslaufen', 'chicken', 293),
    ('shoot off', 'shot off', 'shot off', 'losschießen', 'echo', 293),
    ('show', 'showed', 'shown', 'zeigen', 'sonstige', 293),
    ('sing', 'sang', 'sung', 'singen', 'miau', 293),
    ('sit', 'sat', 'sat', 'sitzen', 'echo', 293),
    ('sleep', 'slept', 'slept', 'schlafen', 'echo', 293),
    ('smell', 'smelt (smelled)', 'smelt (smelled)', 'riechen', 'echo', 293),
    ('speak', 'spoke', 'spoken', 'sprechen', 'sonstige', 293),
    ('spend', 'spent', 'spent', 'Geld ausgeben, Zeit verbringen', 'echo', 293),
    ('spoil', 'spoilt (spoiled)', 'spoilt (spoiled)', 'ruinieren', 'echo', 293),
    ('stand', 'stood', 'stood', 'stehen', 'echo', 293),
    ('steal', 'stole', 'stolen', 'stehlen', 'sonstige', 293),
    ('swim', 'swam', 'swum', 'schwimmen', 'miau', 293),
    ('take', 'took', 'taken', '(mit)nehmen', 'sonstige', 293),
    ('tell', 'told', 'told', 'erzählen, sagen', 'echo', 293),
    ('think', 'thought', 'thought', 'denken, glauben, meinen', 'echo', 293),
    ('throw', 'threw', 'thrown', 'werfen', 'sonstige', 293),
    ('understand', 'understood', 'understood', 'verstehen', 'echo', 293),
    ('wake up', 'woke up', 'woken up', 'aufwachen, aufwecken', 'sonstige', 293),
    ('wear', 'wore', 'worn', 'tragen, anhaben', 'sonstige', 293),
    ('win', 'won', 'won', 'gewinnen', 'echo', 293),
    ('write', 'wrote', 'written', 'schreiben', 'sonstige', 293),
]


def build_words_by_pattern():
    by_pattern = {p: [] for p in PATTERNS}
    seq = {p: 0 for p in PATTERNS}
    for base, past, part, de, pattern, page in VERBS:
        seq[pattern] += 1
        by_pattern[pattern].append({
            'seq': seq[pattern],
            'word': base,
            'clue': PATTERNS[pattern]['icon'] + ' ' + de,
            'meaning': de,
            'type': 'verb',
            'pastSimple': past,
            'pastParticiple': part,
            'pattern': pattern,
            'book_page': page,
            'important': True,
            'src_page': 'S. %d (Irregular verbs)' % page,
            'theme_num': 99,
            'theme_title': PATTERNS[pattern]['title'],
        })
    return by_pattern


def split_group(words, max_size=MAX_RUN_SIZE):
    """Teilt eine Wortliste in möglichst gleich große Chunks von höchstens
    max_size auf (Größenunterschied maximal 1), Reihenfolge bleibt erhalten."""
    n = len(words)
    if n <= max_size:
        return [words]
    k = math.ceil(n / max_size)
    base, extra = divmod(n, k)
    sizes = [base + 1] * extra + [base] * (k - extra)
    out = []
    i = 0
    for size in sizes:
        out.append(words[i:i + size])
        i += size
    return out


def build_groups():
    """Ein Eintrag pro tatsächlich anzulegendem Kapitel/Run — für kleine Muster
    (Chicken/Hamburger/Miau) genau einer, für die großen (Echo/Sonstige) mehrere
    Teile. `word['pattern']` bleibt dabei überall die Basis-Musterkennung
    (z.B. 'echo'), damit verbdrill.jsx (Chicken-Sonderregel, Muster-Badge)
    unverändert funktioniert — nur chapter_id/Run-Name/-Titel sind je Teil
    eindeutig (Suffix `_1`, `_2`, ...), siehe verbGroupKey() in leiterspiel.jsx."""
    by_pattern = build_words_by_pattern()
    groups = []
    for p in ORDER:
        chunks = split_group(by_pattern[p])
        n = len(chunks)
        for i, chunk in enumerate(chunks):
            key = p if n == 1 else '%s_%d' % (p, i + 1)
            title = PATTERNS[p]['title'] if n == 1 else '%s · Teil %d/%d' % (PATTERNS[p]['title'], i + 1, n)
            groups.append({
                'key': key, 'pattern': p, 'chapter_id': 'ch_klasse6_en_irr_' + key,
                'title': title, 'icon': PATTERNS[p]['icon'], 'color': PATTERNS[p]['color'],
                'words': chunk,
            })
    return groups


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


def delete_old():
    old_runs = call('GET', '/ls_runs?auto_chapter_id=eq.%s&select=id' % OLD_CHAPTER_ID)
    for r in (old_runs or []):
        call('DELETE', '/ls_progress?run_id=eq.%s' % r['id'])
        call('DELETE', '/ls_runs?id=eq.%s' % r['id'])
        print('Alter Run gelöscht:', r['id'])
    old_chapter = call('GET', '/chapters?id=eq.%s&select=id' % OLD_CHAPTER_ID)
    if old_chapter:
        call('DELETE', '/chapters?id=eq.%s' % OLD_CHAPTER_ID)
        print('Altes Kapitel gelöscht:', OLD_CHAPTER_ID)


def parse_progress_data(raw):
    # ls_progress.data ist jsonb, kommt über PostgREST aber teils doppelt
    # kodiert an (String statt Objekt) — beides abfangen.
    d = raw
    if isinstance(d, str):
        d = json.loads(d)
    return d


EMPTY_POTS = lambda: {str(n): [] for n in range(1, 7)}


def migrate_split_progress(groups, key_to_run_id):
    """Wörter aus dem alten, ungeteilten Echo-/Sonstige-Run (Topf-Stand,
    Streak, Zähler pro Wort) in die neuen Teil-Runs übernehmen, bevor der
    alte Run gelöscht wird — sonst geht angefangener Fortschritt verloren
    (siehe Session vom 30.08.2026, Emma hatte an beiden schon gespielt)."""
    word_to_group_key = {}
    for g in groups:
        if g['key'] == g['pattern']:
            continue  # nicht gesplittet, kein alter Run zu migrieren
        for w in g['words']:
            word_to_group_key[w['word']] = g['key']
    split_patterns = set(g['pattern'] for g in groups if g['key'] != g['pattern'])

    for pattern in split_patterns:
        old_chapter_id = 'ch_klasse6_en_irr_' + pattern
        # Verben-Runs werden bewusst ohne auto_chapter_id angelegt (siehe
        # Kommentar im Run-Upsert unten) — der einzige verlässliche Anker ist
        # der unveränderte Titel des alten, ungeteilten Runs.
        old_run = call('GET', '/ls_runs?select=id,name&name=eq.%s' % urllib.parse.quote(PATTERNS[pattern]['title']))
        if not old_run:
            continue
        old_run_id = old_run[0]['id']
        rows = call('GET', '/ls_progress?select=player_id,data&run_id=eq.%s' % old_run_id) or []
        for row in rows:
            data = parse_progress_data(row['data'])
            pots = data.get('pots') or {}
            by_new_group = {}
            for pot_num, words in pots.items():
                for w in (words or []):
                    key = word_to_group_key.get(w.get('word'))
                    if not key:
                        continue
                    by_new_group.setdefault(key, EMPTY_POTS())[pot_num].append(w)
            for key, new_pots in by_new_group.items():
                run_id = key_to_run_id.get(key)
                if not run_id:
                    continue
                total_correct = sum(w.get('correct', 0) for words in new_pots.values() for w in words)
                total_wrong = sum(w.get('wrong', 0) for words in new_pots.values() for w in words)
                new_data = {'pots': new_pots, 'sentences': [], 'bonusStarted': False, 'history': [],
                            'lastWord': None, 'streak': 0, 'totalCorrect': total_correct,
                            'totalWrong': total_wrong, 'days': {}, 'sessions': []}
                existing = call('GET', '/ls_progress?select=id&player_id=eq.%s&run_id=eq.%s' % (row['player_id'], run_id))
                body = {'player_id': row['player_id'], 'run_id': run_id, 'data': json.dumps(new_data)}
                if existing:
                    call('PATCH', '/ls_progress?id=eq.%s' % existing[0]['id'], {'data': json.dumps(new_data)})
                else:
                    call('POST', '/ls_progress', body, prefer='return=minimal')
                print('  Fortschritt migriert: player %s -> %s (%d Wörter)' %
                      (row['player_id'], key, sum(len(v) for v in new_pots.values())))
        call('DELETE', '/ls_progress?run_id=eq.%s' % old_run_id)
        call('DELETE', '/ls_runs?id=eq.%s' % old_run_id)
        call('DELETE', '/chapters?id=eq.%s' % old_chapter_id)
        print('Alter ungeteilter Run migriert & gelöscht:', pattern)


def main():
    groups = build_groups()
    total = sum(len(g['words']) for g in groups)
    print('%d Verben in %d Kapiteln/Runs' % (total, len(groups)))
    for g in groups:
        print('  %-14s %2d Verben  (%s)' % (g['key'], len(g['words']), g['title']))

    if '--dry-run' in sys.argv:
        for g in groups:
            print('\n== %s ==' % g['title'])
            for w in g['words']:
                print('%-14s | %-20s | %-20s | %s' % (w['word'], w['pastSimple'], w['pastParticiple'], w['meaning']))
        return

    if '--no-delete-old' not in sys.argv:
        delete_old()

    key_to_run_id = {}
    for g in groups:
        chapter_id = g['chapter_id']
        words = g['words']
        payload = {'id': chapter_id, 'title': g['title'], 'color': g['color'],
                   'icon': g['icon'], 'words': words, 'sentences': [],
                   'parent_id': PARENT_ID, 'grade': 6, 'language': 'en', 'is_builtin': False}
        existing = call('GET', '/chapters?id=eq.%s&select=id' % chapter_id)
        if existing:
            call('PATCH', '/chapters?id=eq.%s' % chapter_id, {k: v for k, v in payload.items() if k != 'id'})
            print('Kapitel aktualisiert:', chapter_id)
        else:
            call('POST', '/chapters', payload, prefer='return=minimal')
            print('Kapitel angelegt:', chapter_id)

        # Eigenständiger Run, bewusst OHNE auto_chapter_id: der generische
        # ⭐-Sync (autoRunWordsFor in core/leitner.js) kennt nur word/clue/type/
        # chapterId/important/book_page und würde pastSimple/pastParticiple/
        # pattern/meaning beim nächsten Sync stillschweigend wegwerfen.
        run_words = [dict(w, chapterId=chapter_id, pot=1) for w in words]
        run_name = g['title']
        runs = call('GET', '/ls_runs?select=id&name=eq.%s' % urllib.parse.quote(run_name))
        patch = {'name': run_name, 'icon': g['icon'], 'words': json.dumps(run_words),
                 'word_count': len(run_words), 'grade': 6, 'language': 'en',
                 'sentences': '[]', 'sentence_count': 0}
        if runs:
            call('PATCH', '/ls_runs?id=eq.%s' % runs[0]['id'], patch)
            print('Run aktualisiert:', runs[0]['id'], run_name)
            key_to_run_id[g['key']] = runs[0]['id']
        else:
            patch.update({'player_id': None, 'is_admin_run': True,
                          'target_date': TARGET_DATE, 'target_pct': 100})
            res = call('POST', '/ls_runs', patch, prefer='return=representation')
            print('Run angelegt:', res[0]['id'], run_name)
            key_to_run_id[g['key']] = res[0]['id']

    migrate_split_progress(groups, key_to_run_id)


if __name__ == '__main__':
    main()
