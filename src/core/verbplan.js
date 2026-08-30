// Tagesplan für den Verben-Trainer (unregelmäßige Verben), nach der
// Chicken/Hamburger/Echo/Miau-Systematik aus dem 14-Tage-Lehrplan
// (https://chatgpt.com/share/6a91c113-c20c-83ed-bba4-c06b77c63ddf). Der Chat
// rechnet mit ~35 Beispielverben à 5 neue/Tag — unser Buch-Datensatz hat 83,
// ungleich verteilt (Echo allein 40). Deshalb wird der Plan aus den echten
// Wortlisten der fünf Muster-Runs berechnet statt fest vorgegeben, mit
// höherem Tagespensum (Standard 8/Tag), damit alle 83 bis zum Test durchlaufen.
//
// Rein informativ (siehe Session vom 29.08.2026) — nichts wird gesperrt, das
// ist nur eine Empfehlung im Run-Picker.

var PATTERN_ORDER = ['chicken', 'hamburger', 'echo_1', 'echo_2', 'echo_3', 'miau', 'sonstige_1', 'sonstige_2'];

// Echo (40) und Sonstige (27) sind zu groß für einen Leiterspiel-Run (max. 15
// Vokabeln, siehe build_irregular_verbs.py) und deshalb auf mehrere Kapitel/
// Runs "Teil X/Y" aufgeteilt — jeder Teil braucht hier einen eigenen Eintrag,
// weil er im Lernplan als eigener Schritt auftaucht (siehe verbGroupKey in
// leiterspiel.jsx).
var PATTERN_META = {
  chicken:    {emoji:'🐔', label:'Chicken'},
  hamburger:  {emoji:'🍔', label:'Hamburger'},
  echo_1:     {emoji:'📢', label:'Echo (Teil 1/3)'},
  echo_2:     {emoji:'📢', label:'Echo (Teil 2/3)'},
  echo_3:     {emoji:'📢', label:'Echo (Teil 3/3)'},
  miau:       {emoji:'🐱', label:'Miau'},
  sonstige_1: {emoji:'🔀', label:'Sonstige (Teil 1/2)'},
  sonstige_2: {emoji:'🔀', label:'Sonstige (Teil 2/2)'}
};

// Kleine Muster-Gruppen teilen sich einen Wiederholungstag mit der nächsten
// Gruppe, statt für 3-8 Verben einen eigenen Tag zu bekommen (Chicken+Hamburger
// zusammen 11 Verben, Miau+Sonstige zusammen 32) — sonst blieben für die 83
// Verben in den ~16 Tagen bis zum Test keine Lerntage übrig.
var DEFAULT_BLOCKS = [['chicken', 'hamburger'], ['echo_1', 'echo_2', 'echo_3'], ['miau', 'sonstige_1', 'sonstige_2']];

function addDays(dateStr, n) {
  var p = dateStr.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// `patternRuns` = [{pattern, words, created_at}] — je ein Eintrag pro
// Muster-Run, `words` bereits geparst (safeWords). Liefert null, wenn kein
// Startdatum oder keine Runs vorhanden sind.
function buildVerbPlan(patternRuns, opts) {
  opts = opts || {};
  var perDay = opts.perDay || 8;
  var blocks = opts.blocks || DEFAULT_BLOCKS;
  var startDate = opts.startDate;
  if (!startDate || !patternRuns || !patternRuns.length) return null;

  var byPattern = {};
  patternRuns.forEach(function(r) { if (r && r.pattern) byPattern[r.pattern] = r; });

  var days = [];
  var coveredSoFar = [];
  blocks.forEach(function(block, blockIdx) {
    var blockHasContent = false;
    block.forEach(function(pat) {
      var run = byPattern[pat];
      var words = run && run.words;
      if (!words || !words.length) return;
      blockHasContent = true;
      for (var i = 0; i < words.length; i += perDay) {
        days.push({type: 'new', pattern: pat, words: words.slice(i, i + perDay)});
      }
      coveredSoFar.push(pat);
    });
    if (blockHasContent) {
      var isLast = blockIdx === blocks.length - 1;
      days.push({type: isLast ? 'test' : 'review', patterns: coveredSoFar.slice()});
    }
  });

  return days.map(function(d, i) {
    return Object.assign({day: i + 1, date: addDays(startDate, i)}, d);
  });
}

// Der aktuelle Schritt wird über den echten Fortschritt ermittelt, nicht über
// das Kalenderdatum — sonst zeigt der Banner "Tag 4" an, obwohl Tag 1 noch gar
// nicht fertig ist. `isWordDone(pattern, word)` prüft, ob ein Verb Topf 3
// (Abfrage, frei ohne Hilfe) erreicht hat. `ackDays` (Set/Objekt {day:true})
// markiert Wiederholungs-/Testtage als "gesehen", weil die selbst keine
// eigene Wortliste zum Abhaken haben.
function verbPlanProgress(schedule, isWordDone, ackDays) {
  if (!schedule || !schedule.length) return null;
  ackDays = ackDays || {};
  for (var i = 0; i < schedule.length; i++) {
    var d = schedule[i];
    if (d.type === 'new') {
      var doneCount = d.words.filter(function(w) { return isWordDone(d.pattern, w.word); }).length;
      if (doneCount < d.words.length) {
        return Object.assign({total: schedule.length, doneCount: doneCount}, d);
      }
    } else if (!ackDays[d.day]) {
      return Object.assign({total: schedule.length}, d);
    }
  }
  return {type: 'finished', day: schedule.length, total: schedule.length};
}

function verbAckKey(playerId) { return 'lernapp_verbplan_ack_' + playerId; }

function loadVerbAck(playerId) {
  try {
    var raw = localStorage.getItem(verbAckKey(playerId));
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function ackVerbDay(playerId, day) {
  var acked = loadVerbAck(playerId);
  acked[day] = true;
  try { localStorage.setItem(verbAckKey(playerId), JSON.stringify(acked)); } catch (e) {}
}

// Merkt sich, bis zu welcher Tagesnummer die Gratulations-Popup schon gezeigt
// wurde — sonst poppt sie bei jedem Öffnen des Run-Pickers erneut auf.
function verbCelebrateKey(playerId) { return 'lernapp_verbplan_celebrated_' + playerId; }

function loadVerbCelebrated(playerId) {
  try { return parseInt(localStorage.getItem(verbCelebrateKey(playerId)) || '0', 10) || 0; } catch (e) { return 0; }
}

function saveVerbCelebrated(playerId, day) {
  try { localStorage.setItem(verbCelebrateKey(playerId), String(day)); } catch (e) {}
}

export { PATTERN_ORDER, PATTERN_META, DEFAULT_BLOCKS, buildVerbPlan, verbPlanProgress, loadVerbAck, ackVerbDay, loadVerbCelebrated, saveVerbCelebrated, addDays };
