#!/usr/bin/env node
// Schulportal-Sync für Emma: neue Vokabel-Hausaufgaben (Englisch, Spanisch) -> automatisch Leiterspiel-Run,
// und abends um 19:00 Alexa-Erinnerung, falls heute noch keine 30 Minuten an diesen Vokabeln gelernt wurden.
//
//   node sync.mjs sync            neue Hausaufgaben prüfen, Runs anlegen
//   node sync.mjs sync --dry      nur anzeigen, nichts schreiben
//   node sync.mjs sync --init     alle aktuellen Einträge als "gesehen" markieren (keine Runs)
//   node sync.mjs sync --history  Parser-Test über die komplette Kursmappe (dry)
//   node sync.mjs remind          Lernzeit prüfen, ggf. Alexa-Ansage in Emmas Zimmer
//   node sync.mjs remind --dry    nur anzeigen
//   node sync.mjs remind --force  auch senden, wenn schon erinnert wurde
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { withPortal, listCourses, courseHistory } from './portal.mjs';

const EMMA = 'd46d1397-e280-4bfa-9f35-b5a52f3edb50';
const PG = 'http://127.0.0.1:8766';
const ALEXA = 'http://127.0.0.1:8080/alexa/say';
const GOAL_MIN = 30;
const TARGET_DAYS = 2; // Zieldatum des neuen Runs = heute + 2 Tage -> Pacing-Banner schiebt an
const STATE_DIR = path.join(os.homedir(), '.local/state/lernapp-schulportal');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const LANG_NAME = { en: 'Englisch', es: 'Spanisch' };
const LANG_ICON = { en: '🇬🇧', es: '🇪🇸' };

const args = process.argv.slice(2);
const cmd = args[0];
const flag = f => args.includes('--' + f);
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

// ---------- State ----------
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { seen: [], reminded: null }; }
}
function saveState(s) { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1)); }

function notifyBen(msg) {
  log('NOTIFY BEN:', msg);
  spawnSync('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "Lern App · Schulportal"`]);
}

// ---------- PostgREST (lokal, service_role) ----------
function jwt() {
  const secret = fs.readFileSync(path.join(os.homedir(), '.local/etc/vokabel/jwt_secret'), 'utf8').trim();
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = b({ alg: 'HS256', typ: 'JWT' }) + '.' + b({ role: 'service_role', iat: now, exp: now + 3600 });
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}
async function rest(method, p, body) {
  const res = await fetch(PG + '/' + p, {
    method,
    headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`PostgREST ${method} ${p}: ${res.status} ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

// ---------- Hausaufgabe -> Wortliste ----------
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[()"“”„'.,;!?¡¿]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^(to|el|la|los|las|un|una|the|a|an)\s+/, '').trim();

const VOC = /\b(voc\w*|vokabel\w*|vocabulario)\b/i;
const SKIP = /wiederhol|test|korrektur|correction/i;

function parseHw(hw) {
  const text = hw.replace(/Anhänge:.*$/i, '').trim();
  const pages = [];
  const re = /\b(?:p|pp|pag|pág|págs|pags|s|seite)\.?\s*(\d{3})(?:\s*[\/\-–]\s*(\d{3}))?/gi;
  let m;
  while ((m = re.exec(text))) { pages.push(+m[1]); if (m[2]) pages.push(+m[2]); }
  const uni = text.match(/unidad\s*(\d)/i);
  let until = null;
  const u = text.match(/(?:until|bis|hasta)\s+(.+?)\s*$/i) || text.match(/>\s*(.+?)\s*$/);
  if (u) until = u[1].split(/\s+(?:workbook|wb|ex\b|exercises?|eng:)/i)[0].replace(/^[("“„']+|[)"”'.]+$/g, '').trim();
  return { text, pages: pages.length ? [Math.min(...pages), Math.max(...pages)] : null, unidad: uni ? +uni[1] : null, until };
}

async function loadPool(lang) {
  const chs = await rest('GET', `chapters?language=eq.${lang}&grade=eq.6&id=like.ch_klasse6_${lang}_%25&select=id,title,words`);
  const main = chs.filter(c => new RegExp(`^ch_klasse6_${lang}_[tu]\\d+$`).test(c.id))
    .sort((a, b) => +a.id.match(/\d+$/)[0] - +b.id.match(/\d+$/)[0]);
  return main.map(c => ({ ...c, words: c.words.map(w => ({ ...w, chapterId: c.id })) }));
}

function findUntil(list, x) {
  const n = norm(x);
  if (!n) return -1;
  let i = list.findIndex(w => norm(w.word) === n);
  if (i < 0) i = list.findIndex(w => norm(w.word).startsWith(n + ' ') || norm(w.word).startsWith(n));
  return i;
}

// Gibt { words, label } oder { reason } zurück.
function resolve(hwInfo, pool, lang) {
  const all = pool.flatMap(c => c.words);
  let sel = null;
  if (hwInfo.pages) {
    sel = all.filter(w => w.book_page >= hwInfo.pages[0] && w.book_page <= hwInfo.pages[1]);
    if (hwInfo.until) { const i = findUntil(sel, hwInfo.until); if (i >= 0) sel = sel.slice(0, i + 1); }
  } else if (hwInfo.unidad != null) {
    const ch = pool.find(c => c.id.endsWith('_u' + hwInfo.unidad) || c.id.endsWith('_t' + hwInfo.unidad));
    if (!ch) return { reason: 'Unidad ' + hwInfo.unidad + ' nicht gefunden' };
    sel = ch.words;
    if (hwInfo.until) { const i = findUntil(sel, hwInfo.until); if (i >= 0) sel = sel.slice(0, i + 1); }
  } else if (hwInfo.until) {
    for (const ch of pool) {
      const i = findUntil(ch.words, hwInfo.until);
      if (i >= 0) { sel = ch.words.slice(0, i + 1); break; }
    }
    if (!sel) return { reason: `Wort "${hwInfo.until}" in keinem Kapitel gefunden` };
  } else return { reason: 'weder Seite noch Unidad noch Endwort erkannt' };
  if (!sel.length) return { reason: 'keine Vokabeln für Seiten ' + (hwInfo.pages || []).join('-') };
  // Endwort auf der vollen Liste bestimmen, dann nur die wichtigen (fett gedruckten) Lernvokabeln
  // behalten (nur Englisch, wie bei den bisherigen HA-Runs).
  const endWord = sel[sel.length - 1].word;
  // Spanisch: auch die nicht fetten Vokabeln werden gelernt; Englisch: nur die fetten.
  if (lang !== 'es') sel = sel.filter(w => w.important !== false);
  if (!sel.length) return { reason: 'keine wichtigen Vokabeln im Bereich' };
  const label = hwInfo.pages ? `S. ${hwInfo.pages[0]}${hwInfo.pages[1] !== hwInfo.pages[0] ? '/' + hwInfo.pages[1] : ''}` : 'Vokabeln';
  return { words: sel, label, endWord };
}

const wkey = w => w.chapterId + '|' + w.word;

// ---------- sync ----------
async function sync() {
  const state = loadState();
  const seen = new Set(state.seen);
  const today = new Date();
  let created = 0;

  const portal = await withPortal(async t => {
    const courses = await listCourses(t);
    const out = [];
    for (const c of courses) {
      const lang = /^Englisch/.test(c.name) ? 'en' : /^Spanisch/.test(c.name) ? 'es' : null;
      if (!lang) continue;
      out.push({ lang, id: c.id, entries: await courseHistory(t, c.id) });
    }
    return out;
  });
  if (!portal.length) throw new Error('Kein Englisch-/Spanisch-Kurs im Schulportal gefunden');

  for (const { lang, id, entries } of portal) {
    if (!entries.length) throw new Error(`Kursmappe ${LANG_NAME[lang]} (${id}) leer gelesen - Portal-Layout geändert?`);
    const pool = await loadPool(lang);
    const runs = await rest('GET', `ls_runs?language=eq.${lang}&select=id,name,words`);
    const covered = new Set(runs.filter(r => /\bHA\b/.test(r.name)).flatMap(r =>
      (typeof r.words === 'string' ? JSON.parse(r.words) : r.words).map(wkey)));

    // älteste zuerst, damit "bis X" aufeinander aufbaut
    for (const e of [...entries].reverse()) {
      const key = `${lang}|${e.date}|${e.homework}`;
      if (!e.homework || !VOC.test(e.homework.replace(/Anhänge:.*$/i, ''))) { if (!flag('dry') || flag('history')) seen.add(key); continue; }
      if (seen.has(key) && !flag('history')) continue;
      if (flag('init')) { seen.add(key); continue; }

      const info = parseHw(e.homework);
      if (SKIP.test(info.text) && !info.pages && info.unidad == null && !info.until) {
        log(`${LANG_NAME[lang]} ${e.date}: Wiederholung/Test, kein neuer Run: ${info.text}`);
        seen.add(key); continue;
      }
      const r = resolve(info, pool, lang);
      if (!r.words) {
        log(`${LANG_NAME[lang]} ${e.date}: NICHT AUFGELÖST (${r.reason}): ${info.text}`);
        if (!flag('dry')) { notifyBen(`${LANG_NAME[lang]}-HA ${e.date} nicht automatisch erkannt: ${info.text.slice(0, 80)}`); seen.add(key); }
        continue;
      }
      const fresh = r.words.filter(w => !covered.has(wkey(w)));
      const lastW = r.endWord;
      if (!fresh.length) {
        log(`${LANG_NAME[lang]} ${e.date}: ${r.words.length} Vokabeln (${r.label}, bis "${lastW}") alle schon in einem HA-Run`);
        seen.add(key); continue;
      }
      const dd = e.date.slice(0, 5);
      const name = `${LANG_NAME[lang]} HA ${dd} (${info.pages ? r.label + ', ' : ''}bis "${lastW}")`;
      const target = new Date(today.getTime() + TARGET_DAYS * 86400000);
      const targetDate = target.toLocaleDateString('sv-SE'); // YYYY-MM-DD, lokal
      log(`${LANG_NAME[lang]} ${e.date}: NEUER RUN "${name}" mit ${fresh.length} Vokabeln, Ziel ${targetDate}  <- "${info.text}"`);
      fresh.forEach(w => covered.add(wkey(w)));
      if (flag('dry')) continue;
      await rest('POST', 'ls_runs', {
        name, is_admin_run: true, word_count: fresh.length, sentence_count: 0,
        words: fresh.map(w => ({ ...w, pot: 1 })), sentences: [],
        icon: LANG_ICON[lang], target_date: targetDate, target_pct: 100, grade: 6, language: lang,
      });
      seen.add(key); created++;
      notifyBen(`Neues Leiterspiel: ${name} (${fresh.length} Vokabeln)`);
    }
  }
  if (!flag('dry')) { state.seen = [...seen]; saveState(state); }
  log(`sync fertig, ${created} Runs angelegt${flag('init') ? ' (init: Einträge als gesehen markiert)' : ''}`);
}

// ---------- remind ----------
async function remind() {
  const state = loadState();
  const todayStr = new Date().toLocaleDateString('sv-SE');
  if (state.reminded === todayStr && !flag('force')) { log('heute schon erinnert'); return; }

  const since = Date.now() - 30 * 86400000;
  const runs = (await rest('GET', `ls_runs?language=in.(en,es)&select=id,name,language,word_count,created_at`))
    .filter(r => /\bHA\b/.test(r.name) && new Date(r.created_at).getTime() > since);
  if (!runs.length) { log('keine aktuellen HA-Runs'); return; }

  const ids = runs.map(r => r.id).join(',');
  const prog = await rest('GET', `ls_progress?player_id=eq.${EMMA}&run_id=in.(${ids})&select=run_id,data`);
  const pctOf = r => {
    const p = prog.find(x => x.run_id === r.id);
    if (!p) return 0;
    const d = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
    return Math.round(100 * ((d.pots && d.pots['6'] || []).length) / Math.max(1, r.word_count));
  };
  const open = runs.filter(r => pctOf(r) < 100);
  if (!open.length) { log('alle HA-Runs gelernt (Topf 6), nur noch Wiederholung - keine Erinnerung'); return; }

  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const sess = await rest('GET', `learn_sessions?player_id=eq.${EMMA}&started_at=gte.${encodeURIComponent(midnight.toISOString())}&run_id=in.(${open.map(r => r.id).join(',')})&select=active_seconds`);
  const min = Math.floor(sess.reduce((s, x) => s + x.active_seconds, 0) / 60);
  const langs = [...new Set(open.map(r => LANG_NAME[r.language]))].join(' und ');
  log(`offen: ${open.map(r => r.name).join(' | ')}; heute gelernt: ${min} min (Ziel ${GOAL_MIN})`);
  if (min >= GOAL_MIN) { log('Ziel erreicht, keine Erinnerung'); state.reminded = todayStr; saveState(state); return; }

  const text = min === 0
    ? `Hallo Emma! Du hast heute noch keine ${langs}-Vokabeln gelernt. Bitte lerne jetzt ${GOAL_MIN} Minuten in der Lern App.`
    : `Hallo Emma! Du hast heute erst ${min} Minuten ${langs}-Vokabeln gelernt. Bitte lerne noch ${GOAL_MIN - min} Minuten in der Lern App.`;
  log('Ansage:', text);
  if (flag('dry')) return;
  const res = await fetch(ALEXA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person: 'Emma', text }) });
  if (!res.ok) throw new Error('Alexa-Ansage fehlgeschlagen: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  state.reminded = todayStr; saveState(state);
  log('Alexa-Ansage gesendet');
}

try {
  if (cmd === 'sync') await sync();
  else if (cmd === 'remind') await remind();
  else { console.log('Aufruf: node sync.mjs sync|remind [--dry] [--init] [--history] [--force]'); process.exit(2); }
  process.exit(0);
} catch (e) {
  log('FEHLER:', e.message);
  notifyBen(`${cmd} fehlgeschlagen: ${e.message}`.slice(0, 200));
  process.exit(1);
}
