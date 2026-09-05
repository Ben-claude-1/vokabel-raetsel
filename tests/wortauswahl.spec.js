// Simulation der Leiterspiel-Wortauswahl.
//
// Prüft die drei Änderungen vom 10.08.2026 gegen echte Zahlen statt gegen
// Bauchgefühl. Referenz ist Emmas Theme 1: 414 Antworten an 4 Tagen,
// 55 % Erstversuch richtig, danach kein einziges Wort in „gelernt".
//
// Läuft ohne Browser — leitner.js wird über einen esbuild-Bundle geladen,
// weil config.js beim Import auf localStorage zugreift.

const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// leitner.js + Abhängigkeiten in eine CJS-Datei bündeln und laden
function loadLeitner() {
  const out = path.join(os.tmpdir(), 'leitner-test-bundle.js');
  execFileSync('npx', ['esbuild', 'src/core/leitner.js', '--bundle', '--format=cjs',
    '--platform=node', '--outfile=' + out], { cwd: path.join(__dirname, '..') });
  global.localStorage = { getItem: () => null, setItem: () => {} };
  delete require.cache[out];
  return require(out);
}

const L = loadLeitner();

const RUN_WORDS = 114;
const ANSWERS = 414;
const ACCURACY = 0.55;   // Emmas gemessene Erstversuch-Quote in Theme 1

function makeProgress() {
  const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (let i = 0; i < RUN_WORDS; i++) {
    pots[1].push({ word: 'w' + i, clue: 'k' + i, type: 'noun', streak: 0, wrongStreak: 0 });
  }
  return { pots, days: {}, sessions: [] };
}

function findWord(progress, word) {
  for (const pot of [1, 2, 3, 4, 5, 6]) {
    const idx = (progress.pots[pot] || []).findIndex(w => w.word === word);
    if (idx >= 0) return { pot, idx, w: progress.pots[pot][idx] };
  }
  return null;
}

// Eine Antwort verbuchen — dieselbe Logik wie in leiterspiel.jsx
function answer(progress, pick, correct, opts) {
  const gate = (opts || {}).gate !== false;
  const found = findWord(progress, pick.word);
  const { pot, idx, w } = found;
  progress.pots[pot].splice(idx, 1);
  const req = pot === 1 ? 2 : 1;
  let moveTo = pot;
  let streak = correct ? (w.streak || 0) + 1 : 0;
  if (correct && streak >= req) {
    if (!gate || L.canPromote(w)) { moveTo = Math.min(6, pot + 1); streak = 0; if (gate) L.markPromoted(w); }
    else streak = req;
  } else if (!correct && pot > 1) {
    moveTo = pot - 1; streak = 0;
  }
  w.streak = streak;
  w.correct = (w.correct || 0) + (correct ? 1 : 0);
  w.wrong = (w.wrong || 0) + (correct ? 0 : 1);
  w.ls = L.lsToday();
  if (correct) w.lc = L.lsToday();
  progress.pots[moveTo].push(w);
}

function potCounts(p) {
  return [1, 2, 3, 4, 5, 6].map(k => (p.pots[k] || []).length);
}

// Deterministischer Zufall, damit der Test nicht flackert
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function simulate({ pick, gate }) {
  const rnd = seeded(42);
  const origRandom = Math.random;
  Math.random = rnd;
  try {
    const p = makeProgress();
    const perWord = {};
    let last = null;
    for (let i = 0; i < ANSWERS; i++) {
      const w = pick(p, last, i);
      if (!w) break;
      perWord[w.word] = (perWord[w.word] || 0) + 1;
      answer(p, w, rnd() < ACCURACY, { gate });
      last = w.word;
    }
    const touched = Object.keys(perWord).length;
    const counts = Object.values(perWord).sort((a, b) => b - a);
    return {
      pots: potCounts(p),
      touched,
      maxPerWord: counts[0],
      medianPerWord: counts[Math.floor(counts.length / 2)],
    };
  } finally { Math.random = origRandom; }
}

// Die alte Auswahl: Gleichverteilung über die Töpfe 1–5
function oldPick(progress, lastWord) {
  const cands = [];
  [1, 2, 3, 4, 5].forEach(pot => (progress.pots[pot] || []).forEach(w => {
    if (!lastWord || w.word !== lastWord) cands.push({ word: w.word, clue: w.clue, pot });
  }));
  if (!cands.length) return null;
  return cands[Math.floor(Math.random() * cands.length)];
}

test('alte Auswahl streut die Arbeit gleichmäßig und lernt nichts fertig', () => {
  const r = simulate({ pick: oldPick, gate: false });
  // Reproduziert Emmas Befund: fast jedes Wort angefasst, so gut wie keins fertig
  expect(r.touched).toBeGreaterThan(100);
  expect(r.medianPerWord).toBeLessThanOrEqual(5);
  expect(r.pots[5]).toBeLessThanOrEqual(2);   // Topf 6 praktisch leer (Emma real: 0)
  console.log('ALT :', JSON.stringify(r));
});

test('neue Auswahl bündelt auf ein Arbeitsset und bringt Wörter durch', () => {
  const r = simulate({
    pick: (p, last, i) => L.lsPickWord(p, last, {}),
    gate: false,
  });
  // Deutlich weniger Wörter, dafür jedes intensiv
  expect(r.touched).toBeLessThan(60);
  expect(r.maxPerWord).toBeGreaterThan(8);
  expect(r.pots[5]).toBeGreaterThan(10);   // Wörter erreichen „gelernt"
  console.log('NEU :', JSON.stringify(r));
});

test('Tagesschranke lässt kein Wort an einem Tag bis „gelernt" klettern', () => {
  const r = simulate({
    pick: (p, last, i) => L.lsPickWord(p, last, {}),
    gate: true,
  });
  // An einem einzigen Tag ist höchstens Topf 2 erreichbar
  expect(r.pots[5]).toBe(0);
  expect(r.pots[2]).toBe(0);
  expect(r.pots[1]).toBeGreaterThan(20);
  console.log('GATE:', JSON.stringify(r));
});

test('canPromote sperrt nur den laufenden Tag', () => {
  const w = {};
  expect(L.canPromote(w)).toBe(true);
  L.markPromoted(w);
  expect(L.canPromote(w)).toBe(false);
  w.pd = '2020-01-01';
  expect(L.canPromote(w)).toBe(true);
});

// ── Zweiteilung: Leiterspiel lernt, der Wiederholungslauf behält ────────────

const daysAgo = (n) => {
  const d = new Date(L.lsToday() + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

test('das Leiterspiel fragt nie gelernte Vokabeln ab — das ist Sache der Wiederholung', () => {
  const p = makeProgress();
  p.pots[6].push({ word: 'laengst_faellig', clue: 'k', lc: daysAgo(90), rl: 0 });
  for (let i = 0; i < 200; i++) {
    const w = L.lsPickWord(p, null, {});
    expect(w.pot).toBeLessThan(6);
  }
});

// ── Arbeitsset-Deckel bei großen Runs ───────────────────────────────────────

function makeOpenPool(n) {
  const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (let i = 0; i < n; i++) pots[1].push({ word: 'w' + i, clue: 'k' + i, streak: 0 });
  return { pots };
}

test('bei mehr als 20 offenen Vokabeln bleibt das Arbeitsset auf 20 gedeckelt, bis eine gelernt ist', () => {
  const p = makeOpenPool(30);
  const touched = new Set();
  for (let i = 0; i < 300; i++) touched.add(L.lsPickWord(p, null, {}).word);
  expect(touched.size).toBeLessThanOrEqual(20);

  // Eine der aktiven Vokabeln „lernen" (Topf 6) — sie verschwindet aus dem offenen Pool.
  const idx = p.pots[1].findIndex(w => touched.has(w.word));
  p.pots[6].push(p.pots[1].splice(idx, 1)[0]);

  const touched2 = new Set();
  for (let i = 0; i < 400; i++) touched2.add(L.lsPickWord(p, null, {}).word);
  const nachgerueckt = [...touched2].filter(w => !touched.has(w));
  expect(nachgerueckt.length).toBeGreaterThan(0);
});

test('bei höchstens 20 offenen Vokabeln ist das Arbeitsset von Anfang an unbegrenzt', () => {
  const p = makeOpenPool(15);
  const touched = new Set();
  for (let i = 0; i < 300; i++) touched.add(L.lsPickWord(p, null, {}).word);
  expect(touched.size).toBe(15);
});

// ── Wort des Tages ───────────────────────────────────────────────────────────

test('lsEnsureWordOfDay wählt eine Vokabel aus dem offenen Pool und lässt sie stehen', () => {
  const p = makeOpenPool(10);
  const changed = L.lsEnsureWordOfDay(p, 'run-1');
  expect(changed).toBe(true);
  expect(p.wordOfDay.date).toBe(L.lsToday());
  expect(p.pots[1].some(w => w.word.toLowerCase() === p.wordOfDay.key)).toBe(true);

  // Erneuter Aufruf am selben Tag ändert nichts, solange die Vokabel noch offen ist.
  const before = JSON.stringify(p.wordOfDay);
  expect(L.lsEnsureWordOfDay(p, 'run-1')).toBe(false);
  expect(JSON.stringify(p.wordOfDay)).toBe(before);
});

test('lsEnsureWordOfDay zieht ein neues Wort nach, sobald das alte Topf 6 erreicht', () => {
  const p = makeOpenPool(5);
  L.lsEnsureWordOfDay(p, 'run-2');
  const key = p.wordOfDay.key;
  const idx = p.pots[1].findIndex(w => w.word.toLowerCase() === key);
  p.pots[6].push(p.pots[1].splice(idx, 1)[0]);

  const changed = L.lsEnsureWordOfDay(p, 'run-2');
  expect(changed).toBe(true);
  expect(p.wordOfDay.key).not.toBe(key);
});

test('lsPickWord bevorzugt das Wort des Tages deutlich und markiert es', () => {
  const p = makeOpenPool(20);
  L.lsEnsureWordOfDay(p, 'run-3');
  const key = p.wordOfDay.key;
  let wodHits = 0, marked = 0;
  for (let i = 0; i < 500; i++) {
    const w = L.lsPickWord(p, null, {});
    if (w.word.toLowerCase() === key) { wodHits++; if (w.wod) marked++; }
  }
  // Bei 20 gleich gewichteten Kandidaten wäre der Erwartungswert ohne Bonus ~25.
  expect(wodHits).toBeGreaterThan(80);
  expect(marked).toBe(wodHits);
});

test('Fälligkeit wächst mit der Stufe 1-3-7-14-30-60', () => {
  const today = L.lsToday();
  expect(L.due6({ word: 'a', lc: daysAgo(0), rl: 0 }, today)).toBeLessThan(0);   // heute gekonnt
  expect(L.due6({ word: 'a', lc: daysAgo(2), rl: 0 }, today)).toBeGreaterThan(0); // Stufe 0 = 1 Tag
  expect(L.due6({ word: 'a', lc: daysAgo(2), rl: 2 }, today)).toBeLessThan(0);    // Stufe 2 = 7 Tage
  expect(L.due6({ word: 'a', lc: daysAgo(40), rl: 4 }, today)).toBeGreaterThan(0); // Stufe 4 = 30 Tage
  expect(L.due6({ word: 'a' }, today)).toBe(999);                                 // nie belegt → Vorrang
});

test('der Wechsel wird vom Lernen getaktet, nicht vom Rückstand', () => {
  const pol = { enabled: true, days: 3, count: 20, minPool: 20, answersTrigger: 80, maxCount: 30 };
  const gestern = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Der entscheidende Fall: riesiger Rückstand, aber gerade erst wiederholt und
  // seitdem kaum gelernt -> NICHT gesperrt. Sonst gäbe es keinen Wechsel,
  // sondern eine Dauerschleife Wiederholung.
  const frisch = L.reviewLockState(pol, gestern, 200, { dueCount: 190, answersSince: 5 });
  expect(frisch.locked).toBe(false);

  // Pensum voll -> Lauf schiebt sich dazwischen
  const nachLernen = L.reviewLockState(pol, gestern, 200, { dueCount: 190, answersSince: 80 });
  expect(nachLernen.locked).toBe(true);
  expect(nachLernen.reason).toBe('learned');

  // Lange nichts gemacht -> auch dann
  const alt = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
  expect(L.reviewLockState(pol, alt, 200, { dueCount: 5, answersSince: 0 }).reason).toBe('days');

  // Nichts fällig -> nie gesperrt, egal wie lange her
  expect(L.reviewLockState(pol, alt, 200, { dueCount: 0, answersSince: 500 }).locked).toBe(false);

  // Noch nie wiederholt -> beim ersten Mal sofort
  expect(L.reviewLockState(pol, null, 200, { dueCount: 190, answersSince: 0 }).reason).toBe('first');

  // Zu kleiner Pool -> die Sperre gilt für Anfänger nicht
  expect(L.reviewLockState(pol, null, 5, { dueCount: 5, answersSince: 0 }).locked).toBe(false);
});

test('der Lauf wird größer, wenn Rückstand aufgelaufen ist — aber nicht endlos', () => {
  const pol = { count: 20, maxCount: 30 };
  expect(L.reviewRunSize(pol, 0)).toBe(20);
  expect(L.reviewRunSize(pol, 50)).toBe(20);
  expect(L.reviewRunSize(pol, 190)).toBe(30);
  expect(L.reviewRunSize(pol, 5000)).toBe(30);
});

test('countDue6 entdoppelt Wörter, die in mehreren Runs stehen', () => {
  const a = { pots: { 6: [{ word: 'same', lc: daysAgo(90) }, { word: 'x', lc: daysAgo(0) }] } };
  const b = { pots: { 6: [{ word: 'Same', lc: daysAgo(90) }] } };
  const r = L.countDue6([a, b]);
  expect(r.pool).toBe(2);
  expect(r.due).toBe(1);
});

test('answersSinceReview zählt nur Sitzungen nach dem letzten Lauf', () => {
  const lauf = Date.now() - 3600 * 1000;
  const d = { sessions: [
    { ts: lauf - 10000, ans: 40 },   // davor
    { ts: lauf + 10000, ans: 25 },   // danach
    { ts: lauf + 20000, ans: 15 },
  ] };
  expect(L.answersSinceReview([d], new Date(lauf).toISOString())).toBe(40);
  expect(L.answersSinceReview([d], null)).toBe(0);
});
