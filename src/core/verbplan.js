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

var PATTERN_ORDER = ['chicken', 'hamburger', 'echo', 'miau', 'sonstige'];

var PATTERN_META = {
  chicken:   {emoji:'🐔', label:'Chicken'},
  hamburger: {emoji:'🍔', label:'Hamburger'},
  echo:      {emoji:'📢', label:'Echo'},
  miau:      {emoji:'🐱', label:'Miau'},
  sonstige:  {emoji:'🔀', label:'Sonstige'}
};

// Kleine Muster-Gruppen teilen sich einen Wiederholungstag mit der nächsten
// Gruppe, statt für 3-8 Verben einen eigenen Tag zu bekommen (Chicken+Hamburger
// zusammen 11 Verben, Miau+Sonstige zusammen 32) — sonst blieben für die 83
// Verben in den ~16 Tagen bis zum Test keine Lerntage übrig.
var DEFAULT_BLOCKS = [['chicken', 'hamburger'], ['echo'], ['miau', 'sonstige']];

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

function verbPlanToday(schedule, todayStr) {
  if (!schedule || !schedule.length) return null;
  var idx = schedule.findIndex(function(d) { return d.date === todayStr; });
  if (idx < 0) return null;
  return Object.assign({total: schedule.length}, schedule[idx]);
}

export { PATTERN_ORDER, PATTERN_META, DEFAULT_BLOCKS, buildVerbPlan, verbPlanToday, addDays };
