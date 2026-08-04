#!/usr/bin/env python3
"""Kapitel-Leiterspiele anlegen/aktualisieren (Bootstrap für die App-Funktion).

Zu jedem Themenkapitel einer Klasse/Sprache gehört genau ein Leiterspiel-Run,
der die ⭐-markierten (im Buch fett gedruckten) Vokabeln des Kapitels enthält.
Erkennungsmerkmal: ls_runs.auto_chapter_id = Kapitel-ID.

Dieselbe Logik läuft in der App (syncAutoRun in index.html) beim Speichern von
Kapitelwörtern — dieses Skript ist für den Erstaufbau bzw. nach einem Import.

Aufruf:  python3 scripts/sync_auto_runs.py 6 en
         python3 scripts/sync_auto_runs.py 6 es --dry
"""
import json
import subprocess
import sys

PSQL = "/Applications/Postgres.app/Contents/Versions/latest/bin/psql"
DB = ["-p", "5433", "-d", "vokabel"]
MIN_WORDS = 2


def q(sql):
    out = subprocess.run([PSQL] + DB + ["-t", "-A", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return out


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def sort_key(w):
    page = w.get("book_page")
    seq = w.get("seq")
    return (page if isinstance(page, int) else 99999,
            seq if isinstance(seq, int) else 99999,
            (w.get("word") or "").lower())


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    grade, lang = int(sys.argv[1]), sys.argv[2]
    dry = "--dry" in sys.argv

    rows = q("select json_agg(row_to_json(c)) from (select id,title,icon,words "
             "from chapters where parent_id is not null and grade=%d and language=%s "
             "order by id) c;" % (grade, sql_str(lang))).strip()
    chapters = json.loads(rows) if rows and rows != "" else []
    if not chapters:
        print("Keine Kapitel für Klasse %d / %s" % (grade, lang))
        return

    existing = {}
    ex = q("select json_agg(json_build_object('id',id,'auto',auto_chapter_id)) "
           "from ls_runs where auto_chapter_id is not null;").strip()
    for r in (json.loads(ex) if ex else []) or []:
        existing[r["auto"]] = r["id"]

    created = updated = skipped = 0
    for ch in chapters:
        words = ch.get("words") or []
        if isinstance(words, str):
            words = json.loads(words)
        picked = [w for w in words if w.get("important") and w.get("word")]
        picked.sort(key=sort_key)
        run_words = [{"word": w["word"], "clue": w.get("clue", ""),
                      "type": w.get("type") or "noun", "chapterId": ch["id"],
                      "important": True, "book_page": w.get("book_page"), "pot": 1}
                     for w in picked]
        payload = json.dumps(run_words, ensure_ascii=False)
        rid = existing.get(ch["id"])
        if rid:
            print("~ %-34s %3d ⭐-Wörter (Update)" % (ch["title"][:34], len(run_words)))
            if not dry:
                q("update ls_runs set name=%s, words=%s::jsonb, word_count=%d, "
                  "grade=%d, language=%s where id=%s;" %
                  (sql_str(ch["title"]), sql_str(payload), len(run_words),
                   grade, sql_str(lang), sql_str(rid)))
            updated += 1
            continue
        if len(run_words) < MIN_WORDS:
            print("· %-34s übersprungen (%d ⭐-Wörter)" % (ch["title"][:34], len(run_words)))
            skipped += 1
            continue
        print("+ %-34s %3d ⭐-Wörter (neu)" % (ch["title"][:34], len(run_words)))
        if not dry:
            q("insert into ls_runs (name,icon,player_id,is_admin_run,word_count,"
              "sentence_count,words,sentences,grade,language,auto_chapter_id) values "
              "(%s,%s,null,true,%d,0,%s::jsonb,'[]'::jsonb,%d,%s,%s);" %
              (sql_str(ch["title"]), sql_str(ch.get("icon") or "🪜"), len(run_words),
               sql_str(payload), grade, sql_str(lang), sql_str(ch["id"])))
        created += 1

    print("\n%s%d angelegt, %d aktualisiert, %d übersprungen" %
          ("[dry] " if dry else "", created, updated, skipped))


if __name__ == "__main__":
    main()
