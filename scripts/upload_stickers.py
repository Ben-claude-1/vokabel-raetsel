#!/usr/bin/env python3
"""Upload sticker pack to Supabase storage + create stickers table."""

import json, sys
from pathlib import Path
import urllib.request, urllib.error

JWT_FILE  = '/Users/ben/.local/etc/vokabel/jwts.json'
SB_URL    = 'https://zdtwlxclgsrfskqqnved.supabase.co'
STICKER_DIR = Path('/Users/ben/Downloads/learning_app_sticker_pack_50')
BUCKET    = 'stickers'

svc = json.load(open(JWT_FILE))['service_role']
HDR_BASE = {'apikey': svc, 'Authorization': f'Bearer {svc}'}

def req(method, path, body=None, content_type='application/json', extra_headers=None):
    url = SB_URL + path
    data = body if isinstance(body, bytes) else (json.dumps(body).encode() if body else None)
    headers = {**HDR_BASE, 'Content-Type': content_type}
    if extra_headers:
        headers.update(extra_headers)
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# ── 1. Tabelle anlegen ────────────────────────────────────────────────────────
print('── Stickers-Tabelle anlegen …')
sql = """
CREATE TABLE IF NOT EXISTS stickers (
  id          serial      PRIMARY KEY,
  filename    text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  animal      text,
  label       text,
  url         text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read" ON stickers;
CREATE POLICY "anon read" ON stickers FOR SELECT USING (true);
DROP POLICY IF EXISTS "service all" ON stickers;
CREATE POLICY "service all" ON stickers FOR ALL USING (true) WITH CHECK (true);
"""
status, body = req('POST', '/rest/v1/rpc/exec_sql', {'query': sql})
print(f'  Tabelle: {status}', body[:80] if status >= 300 else 'OK')

# ── 2. Storage-Bucket anlegen ─────────────────────────────────────────────────
print('── Storage-Bucket anlegen …')
status, body = req('POST', '/storage/v1/bucket',
                   {'id': BUCKET, 'name': BUCKET, 'public': True})
if status in (200, 201):
    print('  Bucket erstellt.')
elif 'already exists' in body.lower() or status == 409:
    print('  Bucket existiert bereits – ok.')
else:
    print(f'  Bucket: {status}', body[:120])

# ── Bekannte Namen (aus visuellem Review) ─────────────────────────────────────
NAMES = {
    'sticker_01': ('chick',         'GREAT!',       'Cool Chick – GREAT!'),
    'sticker_02': ('cat',           'WELL DONE',    'Cool Cat – WELL DONE'),
    'sticker_03': ('dog',           'AWESOME',      'Happy Dog – AWESOME'),
    'sticker_04': ('donkey',        'YOU ROCK',     'Donkey – YOU ROCK'),
    'sticker_05': ('rabbit',        'NICE',         'Rabbit – NICE!'),
    'sticker_06': ('cat',           'KEEP IT UP',   'Stylish Cat – KEEP IT UP'),
    'sticker_07': ('panda',         'GOOD JOB',     'Panda – GOOD JOB'),
    'sticker_08': ('hedgehog',      'SUPERSTAR',    'Hedgehog – SUPERSTAR'),
    'sticker_09': ('fox',           'EXCELLENT',    'Fox – EXCELLENT'),
    'sticker_10': ('chick',         'YES',          'Chick – YES!'),
    'sticker_11': ('highland cow',  'TOP',          'Highland Cow – TOP!'),
    'sticker_12': ('pig',           'BRILLIANT',    'Pig – BRILLIANT!'),
    'sticker_13': ('turtle',        'WAY TO GO',    'Turtle – WAY TO GO'),
    'sticker_14': ('turtle',        'WAY TO GO',    'Turtle – WAY TO GO (2)'),
    'sticker_15': ('fox',           'HOLY GOD',     'Fox – HOLY GOD!'),
}

# ── 3. Hochladen + DB-Einträge ────────────────────────────────────────────────
print('── Sticker hochladen …')
ok = 0; fail = 0
for i in range(1, 51):
    fn   = f'sticker_{i:02d}.png'
    stem = f'sticker_{i:02d}'
    fp   = STICKER_DIR / fn
    if not fp.exists():
        print(f'  {fn}: FEHLT – übersprungen')
        continue

    animal, label, name = NAMES.get(stem, (None, None, f'Sticker {i}'))

    # Upload
    img_data = fp.read_bytes()
    status, body = req('POST', f'/storage/v1/object/{BUCKET}/{fn}',
                       body=img_data, content_type='image/png',
                       extra_headers={'x-upsert': 'true'})
    if status not in (200, 201):
        print(f'  {fn}: Upload fehlgeschlagen ({status})', body[:80])
        fail += 1
        continue

    url = f'{SB_URL}/storage/v1/object/public/{BUCKET}/{fn}'

    # DB-Eintrag
    record = {'filename': fn, 'name': name, 'url': url, 'sort_order': i}
    if animal: record['animal'] = animal
    if label:  record['label']  = label

    status, body = req('POST', '/rest/v1/stickers', record,
                       extra_headers={'Prefer': 'resolution=merge-duplicates'})
    if status in (200, 201):
        print(f'  {fn}: ✓  {name}')
        ok += 1
    else:
        print(f'  {fn}: DB-Fehler ({status})', body[:80])
        fail += 1

print(f'\n── Fertig: {ok} ok, {fail} fehlgeschlagen')
