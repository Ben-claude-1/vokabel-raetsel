#!/usr/bin/env node
// Gegenprüfung neuer Grammatiksätze (Nachtlauf, LaunchAgent com.vokabel.grammar-review).
//
// Jeder Satz in settings.grammar_exercises_* ohne gültige Freigabe (review.ok + passende
// sig, siehe src/core/grammar-check.js) wird mit den festen Regeln und der KI-Gegenprüfung
// kontrolliert und das Ergebnis am Satz vermerkt. Die App zeigt nur freigegebene Sätze –
// egal, ob ein Satz über die Admin-Generierung, ein Skript oder von Hand dazukam.
//
//   node scripts/grammar_review.mjs          nur ungeprüfte/geänderte Sätze
//   node scripts/grammar_review.mjs --all    alle Sätze neu prüfen
//   node scripts/grammar_review.mjs --dry    nichts speichern
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../src/core/grammar-check.js'), 'utf8');
const g = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const ALL = process.argv.includes('--all');
const DRY = process.argv.includes('--dry');
const PG = 'http://127.0.0.1:8766';

function jwt() {
  const secret = fs.readFileSync(path.join(os.homedir(), '.local/etc/vokabel/jwt_secret'), 'utf8').trim();
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = b({ alg: 'HS256', typ: 'JWT' }) + '.' + b({ role: 'service_role', iat: now, exp: now + 3600 });
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}
const H = { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' };
async function pg(q, opt = {}) {
  const r = await fetch(PG + '/' + q, { headers: H, ...opt });
  if (!r.ok) throw new Error('PostgREST ' + r.status + ' ' + (await r.text()));
  return r.status === 204 ? null : r.json();
}

// Pushover an Ben (Zugangsdaten aus der Keychain, wie ~/.local/bin/pushover-notify)
async function push(message) {
  if (DRY) return;
  try {
    const kc = (a) => execFileSync('security', ['find-generic-password', '-s', 'claude-sudo', '-a', a, '-w'], { encoding: 'utf8' }).trim();
    const body = new URLSearchParams({ token: kc('pushover-token'), user: kc('pushover-user'), title: 'Lern App: Grammatik-Prüfung', message: message.slice(0, 1000) });
    await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body });
  } catch (e) { console.error('Pushover fehlgeschlagen:', e.message); }
}

const needsCheck = (q, t) => ALL || !(q.review && q.review.sig === g.questionSig(q) && (q.review.ok === true || q.review.ok === false))
  || (q.review.ok === true && !g.isApproved(q, t)); // Regeln verschärft → neu prüfen

let checked = 0, rejected = 0;
const rejects = [];
try {
  const [kr] = await pg('settings?key=eq.anthropic_key&select=value');
  let key = kr && kr.value;
  try { const j = JSON.parse(key); if (typeof j === 'string') key = j; } catch {}
  if (!key) throw new Error('anthropic_key fehlt in settings');

  const rows = await pg('settings?key=like.grammar_exercises_*&select=key,value');
  for (const row of rows) {
    const topic = row.key.replace('grammar_exercises_', '');
    const pool = JSON.parse(row.value || '[]');
    const todo = pool.filter((q) => needsCheck(q, topic));
    if (!todo.length) continue;
    const stamped = new Map(); // id → review
    for (let i = 0; i < todo.length; i += 15) {
      const part = todo.slice(i, i + 15);
      const res = await g.aiReviewQuestions(key, topic, part);
      part.forEach((q, j) => {
        const ok = g.stampReview(q, topic, res[j]);
        stamped.set(q.id, q.review);
        checked++;
        if (!ok) { rejected++; rejects.push(`${topic}: ${q.sentence}`); console.log(`✗ ${topic}: ${q.sentence} → ${q.answer} | ${q.review.problem}`); }
      });
    }
    if (DRY) continue;
    // frisch laden und nur die Prüfvermerke übertragen, falls der Admin inzwischen etwas geändert hat
    const [cur] = await pg('settings?key=eq.' + row.key + '&select=value');
    const fresh = JSON.parse(cur.value || '[]');
    let n = 0;
    for (const q of fresh) {
      const rv = stamped.get(q.id);
      if (rv && rv.sig === g.questionSig(q)) { q.review = rv; n++; }
    }
    await pg('settings?key=eq.' + row.key, { method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(fresh) }) });
    console.log(`${row.key}: ${todo.length} geprüft, ${n} gespeichert`);
  }
} catch (e) {
  console.error(new Date().toISOString(), 'Fehler:', e.message);
  await push(`Gegenprüfung fehlgeschlagen: ${e.message}\nNeue Grammatiksätze bleiben ausgeblendet, bis die Prüfung läuft.`);
  process.exit(1);
}
if (rejected) await push(`${rejected} Grammatiksatz/-sätze beanstandet und für die Kinder ausgeblendet:\n` + rejects.slice(0, 5).join('\n') + '\nIm Admin unter ✏️ Gram. ändern oder löschen.');
console.log(new Date().toISOString(), `Grammatik-Gegenprüfung: ${checked} Sätze geprüft, ${rejected} beanstandet${DRY ? ' (dry)' : ''}`);
