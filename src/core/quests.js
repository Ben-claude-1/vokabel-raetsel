// Tagesaufgaben.
//
// Drei feste Aufträge pro Tag, sichtbar auf der Startseite:
//
//   ✏️  5 Minuten Grammatik
//   🇬🇧 10 Minuten Englisch
//   🇪🇸 10 Minuten Spanisch
//
// Gemessen wird die aktive Lernzeit aus `learn_sessions` — Grammatik über das
// Spiel, die beiden Sprachen über die Sprache der Sitzung. Es wird nichts
// zusätzlich mitgeschrieben; gespeichert wird nur, welche Belohnung schon
// abgeholt wurde, damit Punkte nicht doppelt gutgeschrieben werden.

import { sbGet, sbPatch, sbPost } from './api.js';

// Die drei Aufgaben. `goal` sind Minuten, `pts` die Belohnung.
// `lang` = Sprache der Sitzung (null bei Grammatik, die zählt über das Spiel).
var DAILY = [
  {key:'grammatik', icon:'✏️',  goal:5,  pts:60,  lang:null, screen:'grammar',
   text:function(n){ return n+' Minuten Grammatik üben'; }},
  {key:'englisch',  icon:'🇬🇧', goal:10, pts:100, lang:'en', screen:'leiterspiel_menu',
   text:function(n){ return n+' Minuten Englisch lernen'; }},
  {key:'spanisch',  icon:'🇪🇸', goal:10, pts:100, lang:'es', screen:'leiterspiel_menu',
   text:function(n){ return n+' Minuten Spanisch lernen'; }},
];

// Ein Bonus obendrauf, wenn alle drei Aufgaben erledigt sind.
var ALL_DONE_BONUS = 150;

// Ist der Wiederholungslauf fällig, ist das Leiterspiel gesperrt — dann führt
// der Weg zu den Sprachminuten über die Wiederholung.
function questsForDay(reviewDue){
  return DAILY.map(function(q){
    return {key:q.key, icon:q.icon, pts:q.pts, goal:q.goal, lang:q.lang,
      screen:(reviewDue && q.lang) ? 'wiederholung' : q.screen,
      text:q.text(q.goal)};
  });
}

// Stand einer Aufgabe aus den Minuten des Tages.
//   minutes  {grammatik:3, en:12, es:0} — aktive Lernzeit je Bereich
function questProgress(key, s){
  var min = (s && s.minutes) || {};
  switch(key){
    case 'grammatik': return min.grammatik || 0;
    case 'englisch':  return min.en || 0;
    case 'spanisch':  return min.es || 0;
    default:          return 0;
  }
}

function questState(reviewDue, stats, claimed){
  var list = questsForDay(reviewDue).map(function(q){
    var have = questProgress(q.key, stats);
    return Object.assign({}, q, {
      have: Math.min(have, q.goal),
      raw: have,
      done: have >= q.goal,
      claimed: (claimed||[]).indexOf(q.key) >= 0,
    });
  });
  var alleFertig = list.every(function(q){ return q.done; });
  var offeneBelohnung = list.filter(function(q){ return q.done && !q.claimed; })
    .reduce(function(s,q){ return s+q.pts; }, 0);
  var bonusOffen = alleFertig && (claimed||[]).indexOf('bonus') < 0;
  if(bonusOffen) offeneBelohnung += ALL_DONE_BONUS;
  return {list:list, alleFertig:alleFertig, offeneBelohnung:offeneBelohnung, bonusOffen:bonusOffen};
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

export { DAILY, ALL_DONE_BONUS, questsForDay, questProgress, questState, loadClaimed, saveClaimed };
