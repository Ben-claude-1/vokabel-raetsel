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
    pick: (p, last, i) => L.lsPickWord(p, last, { answerNo: i, reviewEvery: 0 }),
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
    pick: (p, last, i) => L.lsPickWord(p, last, { answerNo: i, reviewEvery: 0 }),
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

test('fällige Wiederholungen kommen aus Topf 6 und respektieren den Abstand', () => {
  const today = L.lsToday();
  const daysAgo = n => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const p = makeProgress();
  // ein frisch gekonntes und ein lange nicht gesehenes gelerntes Wort
  p.pots[6].push({ word: 'frisch', clue: 'k', lc: daysAgo(0), rl: 0 });
  p.pots[6].push({ word: 'alt', clue: 'k', lc: daysAgo(40), rl: 0 });
  p.pots[6].push({ word: 'nie_belegt', clue: 'k' });

  expect(L.due6(p.pots[6][0], today)).toBeLessThan(0);      // noch nicht fällig
  expect(L.due6(p.pots[6][1], today)).toBeGreaterThan(0);   // überfällig
  expect(L.due6(p.pots[6][2], today)).toBe(999);            // nie belegt → Vorrang

  // jede 5. Frage ist eine Wiederholung
  const rev = L.lsPickWord(p, null, { answerNo: 5, reviewEvery: 5 });
  expect(rev.review).toBe(true);
  expect(rev.pot).toBe(6);
  expect(['alt', 'nie_belegt']).toContain(rev.word);

  // dazwischen normale Wörter
  const normal = L.lsPickWord(p, null, { answerNo: 6, reviewEvery: 5 });
  expect(normal.review).toBe(false);
  expect(normal.pot).toBeLessThan(6);
});
