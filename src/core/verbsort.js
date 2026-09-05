// Muster-Sortierer für die unregelmäßigen Verben.
//
// Der Verben-Trainer im Leiterspiel (siehe ui/verbdrill.jsx) fragt die drei
// Formen ab und zeigt das Muster dabei als Hilfe an. Hier läuft es umgekehrt:
// nur Verb + deutsche Bedeutung stehen da, das Muster muss selbst gefunden
// werden. Deshalb bewusst ein eigenes Spiel und kein weiterer Topf — es hat
// keine Leiter-Mechanik, sondern nur eine kleine Trefferstatistik je Verb,
// aus der die Auswahl der nächsten Runde gewichtet wird.
//
// Die Verben kommen aus den Muster-Kapiteln (ch_klasse6_en_irr_*, angelegt von
// scripts/build_irregular_verbs.py); erkennbar am `pattern`-Feld der Wörter,
// genau wie im Leiterspiel. Der Fortschritt liegt nur lokal (localStorage) —
// es ist ein Übungsspiel, kein Lernstand, der auf mehreren Geräten zusammen-
// passen müsste.

import { normWordKey, safeWords } from './words.js';

var SORT_PATTERNS = ['chicken', 'hamburger', 'echo', 'miau', 'sonstige'];

// Farben wie in den Kapiteln (build_irregular_verbs.py), Regel/Beispiel wie im
// Verben-Trainer — die Kinder sollen dieselben Merksätze wiedererkennen.
var SORT_PATTERN_META = {
  chicken:   {emoji:'🐔', label:'Chicken',   rule:'alle 3 Formen gleich',      example:'cut – cut – cut',            color:'#b45309'},
  hamburger: {emoji:'🍔', label:'Hamburger', rule:'1. und 3. Form gleich',     example:'come – came – come',         color:'#b91c1c'},
  echo:      {emoji:'📢', label:'Echo',      rule:'2. und 3. Form gleich',     example:'buy – bought – bought',      color:'#1d4ed8'},
  miau:      {emoji:'🐱', label:'Miau',      rule:'i → a → u',                 example:'begin – began – begun',      color:'#7c3aed'},
  sonstige:  {emoji:'🔀', label:'Sonstige',  rule:'alle 3 Formen verschieden', example:'break – broke – broken',      color:'#0f766e'}
};

// Ab dieser Trefferserie gilt ein Verb als „sitzt" — drei Mal hintereinander
// richtig einsortiert ist bei fünf Auswahlmöglichkeiten kein Zufall mehr.
var MASTER_STREAK = 3;

// Alle Verben mit Muster aus den Kapiteln, doppelte Einträge (Echo/Sonstige
// sind auf mehrere Teil-Kapitel verteilt) fliegen raus.
function collectVerbs(chapters) {
  var seen = {};
  var out = [];
  (chapters || []).forEach(function(ch) {
    safeWords(ch && ch.words).forEach(function(w) {
      if (!w || !w.word || !SORT_PATTERN_META[w.pattern]) return;
      var key = normWordKey(w.word);
      if (seen[key]) return;
      seen[key] = 1;
      out.push(Object.assign({}, w, {key: key}));
    });
  });
  return out;
}

function verbsByPattern(verbs) {
  var map = {};
  SORT_PATTERNS.forEach(function(p) { map[p] = []; });
  (verbs || []).forEach(function(v) { if (map[v.pattern]) map[v.pattern].push(v); });
  return map;
}

// ── Trefferstatistik ────────────────────────────────────────────────────────

function statsKey(playerId) { return 'lernapp_verbsort_' + playerId; }

function loadStats(playerId) {
  try {
    var raw = localStorage.getItem(statsKey(playerId));
    var v = raw ? JSON.parse(raw) : null;
    return (v && v.words) ? v : {words: {}, rounds: 0};
  } catch (e) { return {words: {}, rounds: 0}; }
}

function saveStats(playerId, stats) {
  try { localStorage.setItem(statsKey(playerId), JSON.stringify(stats)); } catch (e) {}
}

// Liefert einen neuen Stand — die Aufrufer arbeiten mit setState und dürfen den
// alten nicht in-place verändern.
function recordAnswer(stats, key, correct) {
  var words = Object.assign({}, stats.words || {});
  var st = words[key] || {ok: 0, bad: 0, streak: 0};
  words[key] = {
    ok: st.ok + (correct ? 1 : 0),
    bad: st.bad + (correct ? 0 : 1),
    streak: correct ? st.streak + 1 : 0
  };
  return Object.assign({}, stats, {words: words});
}

function isMastered(stats, key) {
  var st = (stats.words || {})[key];
  return !!(st && st.streak >= MASTER_STREAK);
}

function masteryCount(verbs, stats) {
  return (verbs || []).filter(function(v) { return isMastered(stats, v.key); }).length;
}

// Je wackliger ein Verb, desto öfter kommt es dran. Noch nie gesehen liegt
// bewusst zwischen „zuletzt falsch" und „einmal richtig": neue Verben sollen
// drankommen, aber nicht vor den bekannten Fehlerquellen.
function weightOf(stats, key) {
  var st = (stats.words || {})[key];
  if (!st) return 4;
  if (st.streak === 0) return 8;
  if (st.streak === 1) return 3;
  if (st.streak === 2) return 2;
  return 1;
}

function pickRound(verbs, stats, count, weakOnly) {
  var pool = (verbs || []).slice();
  if (weakOnly) {
    var weak = pool.filter(function(v) { return !isMastered(stats, v.key); });
    if (weak.length >= 4) pool = weak;
  }
  var picked = [];
  var n = Math.min(count || pool.length, pool.length);
  for (var i = 0; i < n; i++) {
    var total = pool.reduce(function(s, v) { return s + weightOf(stats, v.key); }, 0);
    var r = Math.random() * total;
    var idx = pool.length - 1;
    for (var j = 0; j < pool.length; j++) {
      r -= weightOf(stats, pool[j].key);
      if (r <= 0) { idx = j; break; }
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

export {
  SORT_PATTERNS, SORT_PATTERN_META, MASTER_STREAK,
  collectVerbs, verbsByPattern,
  loadStats, saveStats, recordAnswer, isMastered, masteryCount, weightOf, pickRound
};
