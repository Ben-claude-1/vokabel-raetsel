// Das Tagesziel.
//
// Drei Bereiche mit eigener Zeit — 5 Minuten Grammatik, 10 Minuten Englisch,
// 10 Minuten Spanisch. Zwei Regeln kommen dazu:
//
//   Belohnung   Richtige Antworten verkürzen die Zeit: je 10 richtige Antworten
//               eine Minute weniger in genau dem Bereich, in dem sie anfielen —
//               höchstens bis auf die Hälfte. Wer es kann, ist schneller fertig.
//   Ehrlichkeit Ein Tag zählt nur mit genug echten Antworten. Reines
//               Durchklicken („nicht gewusst") lässt die Zeit laufen, ohne dass
//               gelernt wird; am 12.08.2026 waren 83 von 86 Antworten so
//               entstanden. Falsche Antworten schaden dagegen nie — bestraft
//               wird nur, wer es gar nicht versucht.
//
// Alles rechnet auf `learn_sessions`: Minuten, richtige Antworten und
// Überspringer fallen beim Spielen ohnehin an.

import { dayKey } from './util.js';

var AREAS = [
  {key:'grammatik', icon:'✏️',  label:'Grammatik', min:5,  lang:null},
  {key:'englisch',  icon:'🇬🇧', label:'Englisch',  min:10, lang:'en'},
  {key:'spanisch',  icon:'🇪🇸', label:'Spanisch',  min:10, lang:'es'},
];

var CORRECT_PER_MIN = 10;   // richtige Antworten je gesparter Minute
var MIN_ANSWERS = 20;       // so viele Antworten braucht ein Tag mindestens
var MAX_SKIP_SHARE = 0.5;   // höchstens die Hälfte davon darf „nicht gewusst" sein

// Ab hier gilt diese Regel. Für frühere Tage bleibt es bei der alten
// Zeitschranke, sonst würde die Umstellung die Streak-Historie entwerten.
var GOAL_RULE_FROM = '2026-08-13';
var LEGACY_GOAL_SEC = 900;  // davor: 15 Minuten am Tag, ohne Bedingung

// Zu welchem Bereich zählt eine Sitzung? Grammatik über das Spiel (es gibt sie
// nur auf Englisch, soll aber die Englisch-Zeit nicht füllen), alles andere
// über die Sprache.
function areaOfSession(s, runLang){
  if(!s) return null;
  if(s.game === 'grammatik') return 'grammatik';
  var lang = s.language || (runLang && runLang[s.run_id]) || null;
  if(lang === 'en') return 'englisch';
  if(lang === 'es') return 'spanisch';
  return null;
}

// Rohzahlen je Tag aus den Sitzungen. `runLang` (optional) ordnet alte
// Sitzungen ohne Sprache über ihren Leiterspiel-Run zu.
function buildDayStats(sessions, runLang){
  var out = {};
  (sessions||[]).forEach(function(s){
    if(!s || !s.started_at) return;
    var k = dayKey(new Date(s.started_at));
    var d = out[k] || (out[k] = {sec:0, secBy:{}, corBy:{}, ans:0, cor:0, skip:0});
    var sec = s.active_seconds||0;
    d.sec += sec;
    var korrekt = s.correct_count||0, falsch = s.wrong_count||0, skip = s.skipped_count||0;
    d.ans += korrekt + falsch; d.cor += korrekt; d.skip += skip;
    var a = areaOfSession(s, runLang);
    if(a){ d.secBy[a] = (d.secBy[a]||0) + sec; d.corBy[a] = (d.corBy[a]||0) + korrekt; }
  });
  return out;
}

// Zeitziel eines Bereichs nach Abzug der Belohnung.
function areaGoalMin(area, correct){
  var gespart = Math.floor((correct||0)/CORRECT_PER_MIN);
  var maxGespart = Math.floor(area.min/2);      // nie unter die Hälfte
  return area.min - Math.min(gespart, maxGespart);
}

// Stand eines Tages: je Bereich Ziel und Ist, dazu die Ehrlichkeits-Bedingung.
function dayGoalState(st){
  st = st || {sec:0, secBy:{}, corBy:{}, ans:0, skip:0};
  var areas = AREAS.map(function(a){
    var cor = (st.corBy||{})[a.key]||0;
    var goal = areaGoalMin(a, cor);
    var have = Math.floor(((st.secBy||{})[a.key]||0)/60);
    return {key:a.key, icon:a.icon, label:a.label, lang:a.lang, goal:goal, have:have,
            done:have>=goal, saved:a.min-goal, correct:cor};
  });
  var ans = st.ans||0, skip = st.skip||0;
  var genug = ans >= MIN_ANSWERS;
  var ehrlich = ans>0 ? (skip/ans) <= MAX_SKIP_SHARE : false;
  return {
    areas: areas,
    goalMin: areas.reduce(function(s,a){ return s+a.goal; }, 0),
    haveMin: Math.floor((st.sec||0)/60),
    zeitFertig: areas.every(function(a){ return a.done; }),
    answers: ans, skipped: skip, genugAntworten: genug, ehrlich: ehrlich,
    erfuellt: areas.every(function(a){ return a.done; }) && genug && ehrlich,
  };
}

// Woran es heute noch hakt — ein Satz für die Startseite.
function dayGoalHint(state){
  if(!state) return '';
  if(state.erfuellt) return '✅ Tagesziel erreicht!';
  var offen = state.areas.filter(function(a){ return !a.done; });
  if(offen.length){
    return offen.map(function(a){ return a.icon+' '+(a.goal-a.have)+' Min'; }).join(' · ')+' fehlen';
  }
  if(!state.genugAntworten) return 'Zeit ist voll — jetzt noch ein paar Vokabeln beantworten';
  if(!state.ehrlich) return 'Zu viel übersprungen — schau nochmal richtig hin';
  return '';
}

// Zählt ein Tag für die Streak? Vor der Umstellung nach der alten Zeitschranke.
function dayCounts(day, st){
  if(!st) return false;
  if(day && day < GOAL_RULE_FROM) return (st.sec||0) >= LEGACY_GOAL_SEC;
  return dayGoalState(st).erfuellt;
}

function calcStreakFromStats(stats){
  var today = new Date(); today.setHours(0,0,0,0);
  var todayKey = dayKey(today);
  var streak = dayCounts(todayKey, (stats||{})[todayKey]) ? 1 : 0;
  var d = new Date(today); d.setDate(d.getDate()-1);
  for(var i=0; i<365; i++){
    var k = dayKey(d);
    if(dayCounts(k, (stats||{})[k])){ streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return streak;
}

export { AREAS, CORRECT_PER_MIN, MIN_ANSWERS, MAX_SKIP_SHARE, GOAL_RULE_FROM, LEGACY_GOAL_SEC,
  areaOfSession, buildDayStats, areaGoalMin, dayGoalState, dayGoalHint, dayCounts, calcStreakFromStats };
