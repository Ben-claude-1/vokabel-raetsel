#!/usr/bin/env python3
"""Build a self-contained schema.sql from the JSON metadata dumps."""
import json, sys, os
from collections import defaultdict

OUT = "/Users/ben/Projects/Lern App/migration/schema.sql"

def load(path):
    with open(path) as f:
        return json.load(f)

cols = load("/tmp/schema_columns.json")
constraints = load("/tmp/schema_constraints.json")
indexes = load("/tmp/schema_indexes.json")
funcs = load("/tmp/schema_funcs.json")
triggers = load("/tmp/schema_triggers.json")

# Group columns by table
by_table = defaultdict(list)
for c in cols:
    by_table[c["table_name"]].append(c)

# Group constraints
pks = defaultdict(list)
fks = []
uniques = defaultdict(lambda: defaultdict(list))  # table -> name -> [cols]
checks = []
for c in constraints:
    t = c["constraint_type"]
    if t == "PRIMARY KEY":
        pks[c["table_name"]].append(c["column_name"])
    elif t == "FOREIGN KEY":
        fks.append(c)
    elif t == "UNIQUE":
        uniques[c["table_name"]][c["constraint_name"]].append(c["column_name"])
    elif t == "CHECK":
        checks.append(c)

def col_type(c):
    udt = c.get("udt_name") or ""
    dt = c.get("data_type") or ""
    if udt == "uuid": return "uuid"
    if udt == "int4": return "integer"
    if udt == "int8": return "bigint"
    if udt == "bool": return "boolean"
    if udt == "timestamptz": return "timestamptz"
    if udt == "timestamp": return "timestamp"
    if udt == "date": return "date"
    if udt == "jsonb": return "jsonb"
    if udt == "json": return "json"
    if udt == "text": return "text"
    if udt in ("varchar", "bpchar"):
        n = c.get("character_maximum_length")
        return f"varchar({n})" if n else "text"
    if udt == "numeric": return "numeric"
    if udt == "float8": return "double precision"
    if udt == "float4": return "real"
    return dt or udt

out = []
out.append("-- Vokabel-Rätsel: Schema-Dump aus Supabase "
          "(zdtwlxclgsrfskqqnved) für eigene Postgres-Migration")
out.append("-- Generiert: 2026-04-25\n")
out.append("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";\n")

# Tables
for table in sorted(by_table.keys()):
    out.append(f"-- Tabelle: {table}")
    out.append(f"CREATE TABLE IF NOT EXISTS public.{table} (")
    lines = []
    for c in by_table[table]:
        line = f"  {c['column_name']} {col_type(c)}"
        if c.get("column_default"):
            d = c["column_default"]
            line += f" DEFAULT {d}"
        if c["is_nullable"] == "NO":
            line += " NOT NULL"
        lines.append(line)
    if pks.get(table):
        lines.append(f"  PRIMARY KEY ({', '.join(pks[table])})")
    for cname, ucols in uniques.get(table, {}).items():
        if not pks.get(table) or sorted(pks[table]) != sorted(ucols):
            lines.append(f"  UNIQUE ({', '.join(ucols)})")
    out.append(",\n".join(lines))
    out.append(");\n")

# Foreign keys (after all tables exist)
out.append("-- Foreign keys")
for fk in fks:
    if not fk.get("ref_table"): continue
    out.append(f"ALTER TABLE public.{fk['table_name']} ADD CONSTRAINT {fk['constraint_name']} "
               f"FOREIGN KEY ({fk['column_name']}) REFERENCES public.{fk['ref_table']}({fk['ref_column']});")
out.append("")

# Indexes (skip PK indexes)
seen_idx = set()
out.append("-- Indexes")
for ix in indexes:
    name = ix["indexname"]
    if name in seen_idx: continue
    seen_idx.add(name)
    if name.endswith("_pkey"): continue  # skip PK
    out.append(f"{ix['indexdef']};")
out.append("")

# Functions
out.append("-- Functions")
for f in funcs:
    out.append(f["def"] + ";\n")

# Triggers
out.append("-- Triggers")
for t in triggers:
    timing = t.get("action_timing","BEFORE")
    evt = t.get("event_manipulation","INSERT")
    table = t.get("event_object_table")
    name = t.get("trigger_name")
    stmt = t.get("action_statement", "")
    out.append(f"CREATE TRIGGER {name} {timing} {evt} ON public.{table} {stmt};")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    f.write("\n".join(out))
print(f"Wrote {OUT} ({sum(len(l) for l in out)} chars)")
