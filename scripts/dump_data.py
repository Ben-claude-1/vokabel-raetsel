#!/usr/bin/env python3
"""Dump each public table to JSON and SQL INSERT statements."""
import json, os, urllib.request, urllib.error

OUT_DIR = "/Users/ben/Projects/Lern App/migration"
SB_URL = "https://zdtwlxclgsrfskqqnved.supabase.co"
SB_SVC = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
          "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdHdseGNsZ3NyZnNrcXFudmVkIiwicm9sZSI6"
          "InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxMzM0MiwiZXhwIjoyMDkwMzg5MzQyfQ."
          "OBa1kMDG0HOq7C6MRvf9WhIbdCgN6nFhRuwdkqTzEb0")

# Order matters: parents first, then dependents
ORDER = [
    "categories", "word_categories", "settings",
    "players",
    "chapters",
    "ls_runs",
    "ls_progress", "learn_sessions",
    "word_disputes", "word_progress", "puzzle_completions",
    "quiz_duels", "lobbies", "lobby_answers",
    "results", "sessions",
]

def fetch_table(name):
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{name}?select=*",
        headers={"apikey": SB_SVC, "Authorization": f"Bearer {SB_SVC}"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def sql_value(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)):
        s = json.dumps(v).replace("'", "''")
        return f"'{s}'::jsonb"
    s = str(v).replace("'", "''")
    return f"'{s}'"

def to_inserts(table, rows):
    if not rows: return f"-- {table}: 0 rows\n"
    cols = sorted({k for r in rows for k in r.keys()})
    lines = [f"-- {table}: {len(rows)} rows"]
    for r in rows:
        vals = [sql_value(r.get(c)) for c in cols]
        lines.append(f"INSERT INTO public.{table} ({', '.join(cols)}) VALUES ({', '.join(vals)});")
    return "\n".join(lines) + "\n"

os.makedirs(OUT_DIR, exist_ok=True)
all_sql = ["-- Vokabel-Rätsel: Daten-Dump aus Supabase", "-- Generiert: 2026-04-25\n",
           "-- Trigger temporär deaktivieren während Bulk-Insert",
           "SET session_replication_role = replica;\n"]
total = 0
for name in ORDER:
    try:
        rows = fetch_table(name)
        all_sql.append(to_inserts(name, rows))
        total += len(rows)
        # Save raw JSON too for debugging
        with open(f"{OUT_DIR}/data_{name}.json","w") as f:
            json.dump(rows, f, indent=2, default=str)
        print(f"  {name}: {len(rows)} rows")
    except urllib.error.HTTPError as e:
        print(f"  {name}: ERROR {e.code} {e.reason}")
        all_sql.append(f"-- {name}: SKIPPED ({e.code})\n")
all_sql.append("SET session_replication_role = origin;\n")

with open(f"{OUT_DIR}/data.sql","w") as f:
    f.write("\n".join(all_sql))
print(f"\nTotal {total} rows → {OUT_DIR}/data.sql")
