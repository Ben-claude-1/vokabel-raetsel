var T = "#0f766e", TL = "#ccfbf1", TD = "#134e4a", AM = "#f59e0b", RE = "#ef4444", GR = "#22c55e";

var G50 = "#f8fafc", G100 = "#f1f5f9", G200 = "#e2e8f0", G400 = "#94a3b8", G600 = "#475569", G900 = "#0f172a";

function BtnStyle(bg, col, extra) {
  var base = { padding: "8px 18px", background: bg, color: col || "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: "bold", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" };
  if (extra) Object.assign(base, extra);
  return base;
}

var COLOR_BG = { green:'#d1fae5', yellow:'#fef9c3', red:'#fee2e2', new:'#f1f5f9' };

var COLOR_FG = { green:'#065f46', yellow:'#92400e', red:'#991b1b', new:'#475569' };

var COLOR_DOT = { green:'#22c55e', yellow:'#f59e0b', red:'#ef4444', new:'#94a3b8' };

var POT_PTS_CUM={1:10,2:30,3:60,4:100,5:140,6:200};

var POT_ICON={0:'⬜',1:'🔴',2:'🟠',3:'🟡',4:'🔵',5:'🟣',6:'✅'};

var POT_LABEL={1:'Topf 1',2:'Topf 2',3:'Topf 3',4:'Topf 4',5:'Topf 5',6:'Gelernt'};

var POT_COL={1:RE,2:'#f97316',3:AM,4:T,5:'#7c3aed',6:GR};

// Tagesziel = die Summe der drei Tagesaufgaben (5 Grammatik + 10 Englisch +
// 10 Spanisch, siehe core/quests.js). Vorher waren es 15 Minuten — für Tage
// davor gilt weiter der alte Wert, sonst würde eine Umstellung heute die
// Streak-Historie rückwirkend entwerten.
var DAILY_GOAL_SEC = 1500; // 25 Minuten
var DAILY_GOAL_SEC_ALT = 900; // bis 12.08.2026: 15 Minuten
var DAILY_GOAL_FROM = '2026-08-13';

function dailyGoalSec(day){ return (day && day < DAILY_GOAL_FROM) ? DAILY_GOAL_SEC_ALT : DAILY_GOAL_SEC; }

function dailyGoalMin(day){ return Math.round(dailyGoalSec(day)/60); }

var SCREEN_GAME = {
  leiterspiel_play:'leiterspiel',
  vocab_trainer:'vokabeltrainer',
  workout:'workout',
  sentence_learner:'satzmeister',
  quiz_solo:'satzquiz',
  quiz_duel:'quizduell',
  crossword:'kreuzwort',
  grammar:'grammatik',
  klassenarbeit_play:'klassenarbeit',
  wiederholung:'wiederholung',
  verbsort:'verbmuster',
  puzzle:'puzzle'
};

function screenGame(screen){ return SCREEN_GAME[screen] || null; }

var GAME_META = {
  leiterspiel:{icon:'🪜',label:'Leiterspiel'},
  vokabeltrainer:{icon:'📝',label:'Vokabeltrainer'},
  workout:{icon:'🏋️',label:'Workout'},
  satzmeister:{icon:'💬',label:'Satzmeister'},
  satzquiz:{icon:'🎯',label:'Satzquiz'},
  quizduell:{icon:'⚔️',label:'Quiz-Duell'},
  kreuzwort:{icon:'🧩',label:'Kreuzworträtsel'},
  grammatik:{icon:'✏️',label:'Grammatik'},
  klassenarbeit:{icon:'📋',label:'Klassenarbeit'},
  wiederholung:{icon:'🔁',label:'Wiederholung'},
  verbmuster:{icon:'🕵️',label:'Muster-Detektiv'},
  puzzle:{icon:'🧩',label:'Puzzle'},
  sonstiges:{icon:'⏱️',label:'Sonstiges'}
};

function gameOf(s){ return s.game || (s.run_id ? 'leiterspiel' : 'sonstiges'); }

var WD_LONG=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

export { T, TL, TD, AM, RE, GR, G50, G100, G200, G400, G600, G900, BtnStyle, COLOR_BG, COLOR_FG, COLOR_DOT, POT_PTS_CUM, POT_ICON, POT_LABEL, POT_COL, DAILY_GOAL_SEC, DAILY_GOAL_SEC_ALT, DAILY_GOAL_FROM, dailyGoalSec, dailyGoalMin, SCREEN_GAME, screenGame, GAME_META, gameOf, WD_LONG };
