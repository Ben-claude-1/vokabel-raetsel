// Tagesaufgaben.
//
// Drei feste Aufträge pro Tag — 5 Minuten Grammatik, 10 Minuten Englisch,
// 10 Minuten Spanisch. Die Zeiten und die Belohnung für richtige Antworten
// stehen in core/goal.js; hier kommen nur die Punkte und die Darstellung dazu.
//
// Gespeichert wird nur, welche Belohnung schon abgeholt wurde, damit Punkte
// nicht doppelt gutgeschrieben werden.

import { sbGet, sbPatch, sbPost } from './api.js';
import { dayGoalState } from './goal.js';

// Punkte und Ziel-Bildschirm je Bereich.
var QUEST_META = {
  grammatik: {pts:60,  screen:'grammar'},
  englisch:  {pts:100, screen:'leiterspiel_menu'},
  spanisch:  {pts:100, screen:'leiterspiel_menu'},
};

// Ein Bonus obendrauf, wenn alle drei Aufgaben erledigt sind.
var ALL_DONE_BONUS = 150;

function questText(a){
  return a.goal+' Minuten '+a.label+(a.key==='grammatik'?' üben':' lernen');
}

// Ist der Wiederholungslauf fällig, ist das Leiterspiel gesperrt — dann führt
// der Weg zu den Sprachminuten über die Wiederholung.
function questState(reviewDue, stats, claimed){
  var st = dayGoalState(stats);
  var list = st.areas.map(function(a){
    var m = QUEST_META[a.key] || {pts:80, screen:'leiterspiel_menu'};
    return {
      key: a.key, icon: a.icon, label: a.label, lang: a.lang,
      pts: m.pts,
      screen: (reviewDue && a.lang) ? 'wiederholung' : m.screen,
      goal: a.goal, have: Math.min(a.have, a.goal), raw: a.have,
      saved: a.saved, correct: a.correct,
      text: questText(a),
      done: a.done,
      claimed: (claimed||[]).indexOf(a.key) >= 0,
    };
  });
  var alleFertig = list.every(function(q){ return q.done; });
  var offeneBelohnung = list.filter(function(q){ return q.done && !q.claimed; })
    .reduce(function(s,q){ return s+q.pts; }, 0);
  var bonusOffen = alleFertig && (claimed||[]).indexOf('bonus') < 0;
  if(bonusOffen) offeneBelohnung += ALL_DONE_BONUS;
  return {list:list, alleFertig:alleFertig, offeneBelohnung:offeneBelohnung, bonusOffen:bonusOffen,
          gespart:list.reduce(function(s,q){ return s+q.saved; }, 0), tag:st};
}

// ── Abgeholte Belohnungen ───────────────────────────────────────────────────
// Liegen in `settings` unter `quests_<playerId>`. Beim Tageswechsel wird der
// Eintrag zurückgesetzt, es bleibt also genau eine Zeile je Kind.

function questKey(pid){ return 'quests_' + pid; }

function loadClaimed(pid, day){
  if(!pid) return Promise.resolve([]);
  return sbGet('settings', 'key=eq.' + encodeURIComponent(questKey(pid)) + '&select=value')
    .then(function(rows){
      if(!rows || !rows[0]) return [];
      var v = {};
      try{ v = JSON.parse(rows[0].value); }catch(e){}
      return v && v.d === day && Array.isArray(v.claimed) ? v.claimed : [];
    })
    .catch(function(){ return []; });
}

function saveClaimed(pid, day, claimed){
  if(!pid) return Promise.resolve(false);
  var key = questKey(pid);
  var val = JSON.stringify({d:day, claimed:claimed});
  return sbGet('settings', 'key=eq.' + encodeURIComponent(key))
    .then(function(rows){
      return (rows && rows[0])
        ? sbPatch('settings', {value:val}, 'key=eq.' + encodeURIComponent(key))
        : sbPost('settings', {key:key, value:val});
    })
    .then(function(){ return true; })
    .catch(function(){ return false; });
}

export { QUEST_META, ALL_DONE_BONUS, questState, loadClaimed, saveClaimed };
