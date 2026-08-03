#!/usr/bin/env python3
"""Klasse-6-Vokabeln aus den k6-fotos/*.json in die Kapitel-Tabelle schreiben.

Legt den Kapitelbaum Klasse 6 -> Sprache -> Theme an und füllt die Theme-Kapitel
mit den Wörtern. Struktur und Wortformat sind identisch zu Klasse 5, zusätzlich
tragen alle Kapitel grade/language, damit die App danach filtern kann.

Aufruf:  python3 scripts/import_klasse6.py en      (oder: es)
         python3 scripts/import_klasse6.py en --dry
"""
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PSQL = "/Applications/Postgres.app/Contents/Versions/latest/bin/psql"
DB = ["-p", "5433", "-d", "vokabel"]

LANGS = {
    "en": {
        "glob": "k6-fotos/en_*.json",
        "node_id": "ch_klasse6_en",
        "node_title": "Englisch",
        "node_color": "#dc2626",
        "node_icon": "🇬🇧",
        "theme_prefix": "ch_klasse6_en_t",
    },
    "es": {
        "glob": "k6-fotos/es_*.json",
        "node_id": "ch_klasse6_es",
        "node_title": "Spanisch",
        "node_color": "#ca8a04",
        "node_icon": "🇪🇸",
        "theme_prefix": "ch_klasse6_es_u",
    },
}

# Farben/Icons wie in Klasse 5, damit die Themen visuell wiedererkennbar sind.
THEME_STYLE = [
    ("#0369a1", "📘"), ("#15803d", "📗"), ("#b45309", "📙"),
    ("#db2777", "📕"), ("#ea580c", "📔"), ("#0891b2", "🎨"),
    ("#7c3aed", "📚"), ("#0f766e", "📓"),
]

GRADE_ID = "ch_klasse6"
GRADE_TITLE = "Klasse 6"
GRADE_COLOR = "#7c3aed"
GRADE_ICON = "🎒"


def sql(statements):
    proc = subprocess.run(
        [PSQL] + DB + ["-v", "ON_ERROR_STOP=1", "-q"],
        input="\n".join(statements), text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        sys.exit("psql-Fehler:\n" + proc.stderr)
    return proc.stdout


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def load_words(pattern):
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
        rows += json.load(open(path, encoding="utf-8"))
    if not rows:
        sys.exit("Keine Wörter gefunden für " + pattern)
    return rows


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in LANGS:
        sys.exit("Aufruf: import_klasse6.py <en|es> [--dry]")
    lang = sys.argv[1]
    dry = "--dry" in sys.argv
    cfg = LANGS[lang]

    rows = load_words(cfg["glob"])

    # Nach Theme gruppieren; Reihenfolge = Buchseite, dann Auftreten auf der Seite.
    themes = {}
    for i, w in enumerate(rows):
        themes.setdefault((w["theme_num"], w["theme_title"]), []).append((i, w))

    statements = []
    statements.append(
        "INSERT INTO chapters (id, title, color, icon, words, sentences, parent_id, is_builtin, grade, language) "
        f"VALUES ({lit(GRADE_ID)}, {lit(GRADE_TITLE)}, {lit(GRADE_COLOR)}, {lit(GRADE_ICON)}, '[]'::jsonb, '[]'::jsonb, NULL, false, 6, NULL) "
        "ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, color=EXCLUDED.color, icon=EXCLUDED.icon, grade=EXCLUDED.grade;"
    )
    statements.append(
        "INSERT INTO chapters (id, title, color, icon, words, sentences, parent_id, is_builtin, grade, language) "
        f"VALUES ({lit(cfg['node_id'])}, {lit(cfg['node_title'])}, {lit(cfg['node_color'])}, {lit(cfg['node_icon'])}, '[]'::jsonb, '[]'::jsonb, {lit(GRADE_ID)}, false, 6, {lit(lang)}) "
        "ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, color=EXCLUDED.color, icon=EXCLUDED.icon, parent_id=EXCLUDED.parent_id, grade=EXCLUDED.grade, language=EXCLUDED.language;"
    )

    total = 0
    for n, (key, items) in enumerate(sorted(themes.items())):
        theme_num, theme_title = key
        color, icon = THEME_STYLE[n % len(THEME_STYLE)]
        chap_id = cfg["theme_prefix"] + str(theme_num)

        # Dubletten innerhalb eines Themes zusammenführen (gleiches Wort, andere
        # Bedeutung) — sonst fragt der Trainer dasselbe Wort zweimal ab.
        merged = {}
        order = []
        for _, w in items:
            k = w["word"].strip().lower()
            if k in merged:
                if w["clue"] not in merged[k]["clue"]:
                    merged[k]["clue"] += "; " + w["clue"]
                merged[k]["important"] = merged[k]["important"] or w["important"]
                continue
            merged[k] = dict(w)
            order.append(k)

        words = []
        for seq, k in enumerate(order, start=1):
            w = merged[k]
            words.append({
                "seq": seq,
                "word": w["word"],
                "clue": w["clue"],
                "type": w["type"],
                "important": bool(w["important"]),
                "book_page": w["book_page"],
                "src_page": w["src"] + ".jpeg",
                "theme_num": theme_num,
                "theme_title": theme_title,
            })
        total += len(words)

        payload = json.dumps(words, ensure_ascii=False)
        statements.append(
            "INSERT INTO chapters (id, title, color, icon, words, sentences, parent_id, is_builtin, grade, language) "
            f"VALUES ({lit(chap_id)}, {lit(theme_title)}, {lit(color)}, {lit(icon)}, {lit(payload)}::jsonb, '[]'::jsonb, {lit(cfg['node_id'])}, false, 6, {lit(lang)}) "
            "ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, color=EXCLUDED.color, icon=EXCLUDED.icon, "
            "words=EXCLUDED.words, parent_id=EXCLUDED.parent_id, grade=EXCLUDED.grade, language=EXCLUDED.language;"
        )
        print(f"  {theme_title}: {len(words)} Wörter ({sum(1 for x in words if x['important'])} wichtig)")

    print(f"Summe: {total} Wörter in {len(themes)} Kapiteln")
    if dry:
        print("(dry run — nichts geschrieben)")
        return
    sql(statements)
    print("✓ in die Datenbank geschrieben")


if __name__ == "__main__":
    main()
