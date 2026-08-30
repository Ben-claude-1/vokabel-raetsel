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

# (Grundform, Simple Past, Past Participle, deutsche Bedeutung, Muster, Buchseite,
#  Eselsbrücke — merkt sich Muster + Schreibweise, siehe VerbHeader in verbdrill.jsx)
VERBS = [
    ('be', 'was, were', 'been', 'sein', 'sonstige', 292,
     'Sonstige-Verb, ganz besonders: be, was/were (je nachdem wer), been.'),
    ('become', 'became', 'become', 'werden', 'hamburger', 292,
     'Hamburger-Verb: become – became – become. Das Brötchen become bleibt gleich, die Füllung in der Mitte heißt became.'),
    ('begin', 'began', 'begun', 'anfangen', 'miau', 292,
     'Miau-Verb, I-A-U: begin, began, begun.'),
    ('bet', 'bet', 'bet', 'wetten', 'chicken', 292,
     'Chicken-Verb: bet bleibt bet bleibt bet – wie ein Huhn, das nie sein Ei wechselt.'),
    ('bite', 'bit', 'bitten', 'beißen', 'sonstige', 292,
     'Sonstige-Verb: bite, bit, bitten – die Bissspur bleibt (bitten wie „Bitte, beiß nicht nochmal!“).'),
    ('blow up', 'blew up', 'blown up', 'in die Luft sprengen', 'sonstige', 292,
     'Sonstige-Verb: blow up, blew up, blown up – wie ein Ballon: blow-blew-blown, genau wie know-knew-known.'),
    ('break', 'broke', 'broken', '(zer)brechen', 'sonstige', 292,
     'Sonstige-Verb: break, broke, broken – viele Sonstige-Verben enden in der 3. Form auf -en.'),
    ('bring', 'brought', 'brought', '(mit)bringen', 'echo', 292,
     'Echo-Verb: brought hallt zweimal zurück – bring, brought, brought (ough wie bei thought).'),
    ('build', 'built', 'built', 'bauen', 'echo', 292,
     'Echo-Verb: built hallt zweimal zurück – build, built, built.'),
    ('burn', 'burnt (burned)', 'burnt (burned)', '(ab)brennen', 'echo', 292,
     'Echo-Verb: burnt (burned) hallt zweimal zurück – burn, burnt, burnt.'),
    ('buy', 'bought', 'bought', 'kaufen', 'echo', 292,
     'Echo-Verb: bought hallt zweimal zurück – buy, bought, bought (wie brought, nur ohne r).'),
    ('catch', 'caught', 'caught', '(auf)fangen', 'echo', 292,
     'Echo-Verb: caught hallt zweimal zurück – catch, caught, caught (klingt wie court).'),
    ('choose', 'chose', 'chosen', '(aus)wählen', 'sonstige', 292,
     'Sonstige-Verb: choose, chose, chosen – die Wahl ist getroffen (the chosen one).'),
    ('come', 'came', 'come', 'kommen', 'hamburger', 292,
     'Hamburger-Verb: come – came – come. Du kommst bei come an, unterwegs warst du came.'),
    ('cost', 'cost', 'cost', 'kosten', 'chicken', 292,
     'Chicken-Verb: cost bleibt immer cost – der Preis ändert sich nie.'),
    ('creep', 'crept', 'crept', 'schleichen', 'echo', 292,
     'Echo-Verb: crept hallt zweimal zurück – creep, crept, crept.'),
    ('cut', 'cut', 'cut', 'schneiden', 'chicken', 292,
     'Chicken-Verb: cut bleibt immer cut – ein Schnitt bleibt ein Schnitt.'),
    ('do', 'did', 'done', 'machen, tun', 'sonstige', 292,
     'Sonstige-Verb: do, did, done – kurz did, fertig done.'),
    ('draw', 'drew', 'drawn', 'zeichnen', 'sonstige', 292,
     'Sonstige-Verb: draw, drew, drawn – wie know-knew-known, nur mit dr.'),
    ('drink', 'drank', 'drunk', 'trinken', 'miau', 292,
     'Miau-Verb, I-A-U: drink, drank, drunk.'),
    ('drive', 'drove', 'driven', 'fahren', 'sonstige', 292,
     'Sonstige-Verb: drive, drove, driven – wie ride-rode-ridden.'),
    ('eat', 'ate', 'eaten', 'essen, fressen', 'sonstige', 292,
     'Sonstige-Verb: eat, ate, eaten – ate klingt wie „ejt“, eaten endet auf -en.'),
    ('fall', 'fell', 'fallen', '(um)fallen', 'sonstige', 292,
     'Sonstige-Verb: fall, fell, fallen – the fallen leaves, die gefallenen Blätter.'),
    ('feed', 'fed', 'fed', 'füttern, zu essen geben', 'echo', 292,
     'Echo-Verb: fed hallt zweimal zurück – feed, fed, fed.'),
    ('feel', 'felt', 'felt', '(sich) fühlen', 'echo', 292,
     'Echo-Verb: felt hallt zweimal zurück – feel, felt, felt.'),
    ('fight', 'fought', 'fought', '(be)kämpfen', 'echo', 292,
     'Echo-Verb: fought hallt zweimal zurück – fight, fought, fought (wie thought, nur mit f).'),
    ('find', 'found', 'found', 'finden', 'echo', 292,
     'Echo-Verb: found hallt zweimal zurück – find, found, found.'),
    ('fly', 'flew', 'flown', 'fliegen', 'sonstige', 292,
     'Sonstige-Verb: fly, flew, flown – flew klingt wie Flöhe, flown wie ein Vogel weggeflogen.'),
    ('forget', 'forgot', 'forgotten', 'vergessen', 'sonstige', 292,
     'Sonstige-Verb: forget, forgot, forgotten – wie get-got-gotten, nur mit for davor.'),
    ('get', 'got', 'got (gotten)', 'bekommen', 'echo', 292,
     'Echo-Verb: got hallt zweimal zurück – get, got, got (Amerikaner sagen manchmal gotten).'),
    ('give', 'gave', 'given', 'geben', 'sonstige', 292,
     'Sonstige-Verb: give, gave, given – a given name ist der Vorname, der dir gegeben wurde.'),
    ('go', 'went', 'gone', 'fahren, gehen', 'sonstige', 292,
     'Sonstige-Verb: go, went, gone – ganz anders als alle: went klingt fremd, gone heißt einfach weg.'),
    ('hang up', 'hung up', 'hung up', 'aufhängen', 'echo', 292,
     'Echo-Verb: hung up hallt zweimal zurück – hang up, hung up, hung up.'),
    ('have', 'had', 'had', 'haben', 'echo', 292,
     'Echo-Verb: had hallt zweimal zurück – have, had, had.'),
    ('hear', 'heard', 'heard', 'hören', 'echo', 292,
     'Echo-Verb: heard hallt zweimal zurück – hear, heard, heard (klingt wie herd).'),
    ('hide', 'hid', 'hidden', '(sich) verstecken', 'sonstige', 292,
     'Sonstige-Verb: hide, hid, hidden – a hidden treasure, ein verstecktes Geheimnis.'),
    ('hold up', 'held up', 'held up', 'hochhalten', 'echo', 292,
     'Echo-Verb: held up hallt zweimal zurück – hold up, held up, held up.'),
    ('hold', 'held', 'held', 'halten', 'echo', 292,
     'Echo-Verb: held hallt zweimal zurück – hold, held, held.'),
    ('hurt', 'hurt', 'hurt', 'wehtun, verletzen', 'chicken', 292,
     'Chicken-Verb: hurt bleibt immer hurt – Aua tut immer gleich weh.'),
    ('keep', 'kept', 'kept', '(bei)behalten', 'echo', 292,
     'Echo-Verb: kept hallt zweimal zurück – keep, kept, kept.'),
    ('know', 'knew', 'known', 'kennen, wissen', 'sonstige', 292,
     'Sonstige-Verb: know, knew, known – knew klingt wie neu, well-known heißt wohlbekannt.'),
    ('lead', 'led', 'led', 'führen', 'echo', 293,
     'Echo-Verb: led hallt zweimal zurück – lead, led, led (denk an die LED-Lampe).'),
    ('learn', 'learnt (learned)', 'learnt (learned)', 'lernen, erfahren', 'echo', 293,
     'Echo-Verb: learnt (learned) hallt zweimal zurück – learn, learnt, learnt.'),
    ('leave', 'left', 'left', 'verlassen', 'echo', 293,
     'Echo-Verb: left hallt zweimal zurück – leave, left, left (auch: links).'),
    ('let', 'let', 'let', 'lassen', 'chicken', 293,
     'Chicken-Verb: let bleibt immer let – lass es einfach, wie es ist.'),
    ('lie', 'lay', 'lain', 'liegen, sich hinlegen', 'sonstige', 293,
     'Sonstige-Verb: lie, lay, lain (hinlegen) – Achtung, nicht verwechseln mit lie-lied-lied (lügen)!'),
    ('light', 'lit', 'lit', 'anzünden', 'echo', 293,
     'Echo-Verb: lit hallt zweimal zurück – light, lit, lit.'),
    ('lose', 'lost', 'lost', 'verlieren', 'echo', 293,
     'Echo-Verb: lost hallt zweimal zurück – lose, lost, lost.'),
    ('make', 'made', 'made', 'machen', 'echo', 293,
     'Echo-Verb: made hallt zweimal zurück – make, made, made.'),
    ('mean', 'meant', 'meant', 'bedeuten, meinen', 'echo', 293,
     'Echo-Verb: meant hallt zweimal zurück – mean, meant, meant.'),
    ('meet', 'met', 'met', '(sich) treffen', 'echo', 293,
     'Echo-Verb: met hallt zweimal zurück – meet, met, met.'),
    ('pay', 'paid', 'paid', '(be)zahlen', 'echo', 293,
     'Echo-Verb: paid hallt zweimal zurück – pay, paid, paid.'),
    ('put', 'put', 'put', 'legen, setzen, stellen', 'chicken', 293,
     'Chicken-Verb: put bleibt immer put – wo du\'s hinstellst, bleibt\'s stehen.'),
    ('read', 'read', 'read', 'lesen', 'chicken', 293,
     'Chicken-Verb: read bleibt read (geschrieben!) – nur gesprochen wird\'s zu „red“.'),
    ('ride', 'rode', 'ridden', 'fahren, reiten', 'sonstige', 293,
     'Sonstige-Verb: ride, rode, ridden – wie drive-drove-driven.'),
    ('ring up', 'rang up', 'rung up', 'anrufen', 'miau', 293,
     'Miau-Verb, I-A-U: ring up, rang up, rung up.'),
    ('run', 'ran', 'run', 'rennen', 'hamburger', 293,
     'Hamburger-Verb: run – ran – run. Start und Ziel heißen run, dazwischen bist du ran.'),
    ('say', 'said', 'said', 'sagen', 'echo', 293,
     'Echo-Verb: said hallt zweimal zurück – say, said, said (klingt wie sed).'),
    ('see', 'saw', 'seen', 'sehen', 'sonstige', 293,
     'Sonstige-Verb: see, saw, seen – I saw a saw, ich sah eine Säge.'),
    ('sell', 'sold', 'sold', 'verkaufen', 'echo', 293,
     'Echo-Verb: sold hallt zweimal zurück – sell, sold, sold.'),
    ('send', 'sent', 'sent', '(zu)schicken', 'echo', 293,
     'Echo-Verb: sent hallt zweimal zurück – send, sent, sent.'),
    ('set off', 'set off', 'set off', 'aufbrechen, loslaufen', 'chicken', 293,
     'Chicken-Verb: set off bleibt immer set off – der Start bleibt der Start.'),
    ('shoot off', 'shot off', 'shot off', 'losschießen', 'echo', 293,
     'Echo-Verb: shot off hallt zweimal zurück – shoot off, shot off, shot off.'),
    ('show', 'showed', 'shown', 'zeigen', 'sonstige', 293,
     'Sonstige-Verb: show, showed, shown – fast normal, nur die 3. Form verliert das -ed und wird zu -n.'),
    ('sing', 'sang', 'sung', 'singen', 'miau', 293,
     'Miau-Verb, I-A-U: sing, sang, sung.'),
    ('sit', 'sat', 'sat', 'sitzen', 'echo', 293,
     'Echo-Verb: sat hallt zweimal zurück – sit, sat, sat.'),
    ('sleep', 'slept', 'slept', 'schlafen', 'echo', 293,
     'Echo-Verb: slept hallt zweimal zurück – sleep, slept, slept.'),
    ('smell', 'smelt (smelled)', 'smelt (smelled)', 'riechen', 'echo', 293,
     'Echo-Verb: smelt (smelled) hallt zweimal zurück – smell, smelt, smelt.'),
    ('speak', 'spoke', 'spoken', 'sprechen', 'sonstige', 293,
     'Sonstige-Verb: speak, spoke, spoken – wie break-broke-broken, nur mit sp davor.'),
    ('spend', 'spent', 'spent', 'Geld ausgeben, Zeit verbringen', 'echo', 293,
     'Echo-Verb: spent hallt zweimal zurück – spend, spent, spent.'),
    ('spoil', 'spoilt (spoiled)', 'spoilt (spoiled)', 'ruinieren', 'echo', 293,
     'Echo-Verb: spoilt (spoiled) hallt zweimal zurück – spoil, spoilt, spoilt.'),
    ('stand', 'stood', 'stood', 'stehen', 'echo', 293,
     'Echo-Verb: stood hallt zweimal zurück – stand, stood, stood (zwei o wie zwei stehende Beine).'),
    ('steal', 'stole', 'stolen', 'stehlen', 'sonstige', 293,
     'Sonstige-Verb: steal, stole, stolen – wie break-broke-broken, nur gestohlen statt zerbrochen.'),
    ('swim', 'swam', 'swum', 'schwimmen', 'miau', 293,
     'Miau-Verb, I-A-U: swim, swam, swum.'),
    ('take', 'took', 'taken', '(mit)nehmen', 'sonstige', 293,
     'Sonstige-Verb: take, took, taken – taken wie im Film, jemand wurde mitgenommen.'),
    ('tell', 'told', 'told', 'erzählen, sagen', 'echo', 293,
     'Echo-Verb: told hallt zweimal zurück – tell, told, told.'),
    ('think', 'thought', 'thought', 'denken, glauben, meinen', 'echo', 293,
     'Echo-Verb: thought hallt zweimal zurück – think, thought, thought.'),
    ('throw', 'threw', 'thrown', 'werfen', 'sonstige', 293,
     'Sonstige-Verb: throw, threw, thrown – threw klingt wie through, wie blow-blew-blown.'),
    ('understand', 'understood', 'understood', 'verstehen', 'echo', 293,
     'Echo-Verb: understood hallt zweimal zurück – understand, understood, understood (steckt stood drin, wie bei stand).'),
    ('wake up', 'woke up', 'woken up', 'aufwachen, aufwecken', 'sonstige', 293,
     'Sonstige-Verb: wake up, woke up, woken up – wie break-broke-broken.'),
    ('wear', 'wore', 'worn', 'tragen, anhaben', 'sonstige', 293,
     'Sonstige-Verb: wear, wore, worn – worn out heißt abgetragen, kaputt getragen.'),
    ('win', 'won', 'won', 'gewinnen', 'echo', 293,
     'Echo-Verb: won hallt zweimal zurück – win, won, won.'),
    ('write', 'wrote', 'written', 'schreiben', 'sonstige', 293,
     'Sonstige-Verb: write, wrote, written – endet wie bite-bit-bitten auf -tten/-ten.'),
]


def build_words_by_pattern():
    by_pattern = {p: [] for p in PATTERNS}
    seq = {p: 0 for p in PATTERNS}
    for base, past, part, de, pattern, page, mnemonic in VERBS:
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
            'mnemonic': mnemonic,
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
                print('%-14s | %-20s | %-20s | %-30s | %s' % (w['word'], w['pastSimple'], w['pastParticiple'], w['meaning'], w['mnemonic']))
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
