// Tagesaufgaben.
//
// Drei kleine Aufträge pro Tag, sichtbar auf der Startseite. Sie sollen drei
// Dinge auf einmal leisten:
//
//   Abwechslung  — eine der drei Aufgaben führt immer aus dem Leiterspiel
//                  heraus in ein anderes Spiel.
//   Behalten     — sobald der Wiederholungslauf fällig ist, wird er zur Aufgabe.
//   Sichtbarkeit — jede Aufgabe hat einen Balken, der sich beim Spielen füllt.
//
// Der Fortschritt wird aus Daten berechnet, die ohnehin anfallen (Tages-Log,
// Sitzungen, Wiederholungsläufe) — es wird nichts zusätzlich mitgeschrieben.
// Gespeichert wird nur, welche Belohnung schon abgeholt wurde, damit Punkte
// nicht doppelt gutgeschrieben werden.

import { sbGet, sbPatch, sbPost } from './api.js';
import { dayKey } from './util.js';

// Aufgaben-Katalog. `goal` ist die Zielzahl, `pts` die Belohnung.
var QUESTS = {
  learn:   {icon:'🪜', pts:100, goal:30, screen:'leiterspiel_menu',
            text:function(n){ return n+' Vokabeln im Leiterspiel üben'; }},
  first:   {icon:'🥇', pts:120, goal:12, screen:'leiterspiel_menu',
            text:function(n){ return n+' Vokabeln gleich beim ersten Versuch treffen'; }},
  climb:   {icon:'⬆️', pts:120, goal:6, screen:'leiterspiel_menu',
            text:function(n){ return n+' Vokabeln eine Stufe weiterbringen'; }},
  review:  {icon:'🔁', pts:150, goal:1, screen:'wiederholung',
            text:function(){ return 'Einen Wiederholungslauf machen'; }},
  time:    {icon:'⏱️', pts:80, goal:15, screen:'leiterspiel_menu',
            text:function(n){ return n+' Minuten lernen'; }},
  quiz:    {icon:'🎯', pts:80, goal:1, screen:'quiz_duel_menu',
            text:function(){ return 'Eine Runde Quiz spielen'; }},
  cross:   {icon:'🧩', pts:80, goal:1, screen:'crossword',
            text:function(){ return 'Ein Kreuzworträtsel lösen'; }},
  workout: {icon:'🏋️', pts:80, goal:1, screen:'workout_setup',
            text:function(){ return 'Ein Workout machen'; }},
  trainer: {icon:'📝', pts:80, goal:1, screen:'word_select_trainer',
            text:function(){ return 'Mit dem Vokabeltrainer üben'; }},
};

// Ein Bonus obendrauf, wenn alle drei Aufgaben erledigt sind.
var ALL_DONE_BONUS = 150;

var LERNEN = ['learn', 'first', 'climb'];
var ANDERE = ['quiz', 'cross', 'workout', 'trainer'];

// Tagesnummer — daraus wird die Auswahl abgeleitet, damit sie sich beim
// Neuladen nicht ändert und trotzdem jeden Tag anders aussieht.
function dayIndex(day){
  var p = (day || dayKey()).split('-');
  return Math.floor(Date.UTC(+p[0], +p[1]-1, +p[2]) / 86400000);
}

// Die drei Aufgaben des Tages. `reviewDue` schiebt die Wiederholung auf den
// Abwechslungs-Platz — dann ist sie die Aufgabe, die aus dem Leiterspiel führt.
function questsForDay(day, reviewDue){
  var i = dayIndex(day);
  var a = LERNEN[i % LERNEN.length];
  var b = reviewDue ? 'review' : ANDERE[i % ANDERE.length];
  return [a, b, 'time'].map(function(key){
    var q = QUESTS[key];
    return {key:key, icon:q.icon, pts:q.pts, goal:q.goal, screen:q.screen, text:q.text(q.goal)};
  });
}

// Stand einer Aufgabe aus den Rohzahlen des Tages.
//   answers    Antworten im Leiterspiel (Tages-Log)
//   firstOk    davon beim Erstversuch richtig
//   climbed    Vokabeln, die heute eine Stufe aufgestiegen sind
//   reviews    abgeschlossene Wiederholungsläufe
//   minutes    gemessene Lernminuten
//   games      {kreuzwort:1, satzquiz:0, …} Sitzungen je Spiel (learn_sessions.game)
function questProgress(key, s){
  s = s || {};
  switch(key){
    case 'learn':   return s.answers||0;
    case 'first':   return s.firstOk||0;
    case 'climb':   return s.climbed||0;
    case 'review':  return s.reviews||0;
    case 'time':    return s.minutes||0;
    // Spielnamen wie in learn_sessions.game (siehe SCREEN_GAME in theme.js)
    case 'quiz':    return ((s.games||{}).satzquiz||0) + ((s.games||{}).quizduell||0);
    case 'cross':   return (s.games||{}).kreuzwort||0;
    case 'workout': return (s.games||{}).workout||0;
    case 'trainer': return (s.games||{}).vokabeltrainer||0;
    default:        return 0;
  }
}

function questState(day, reviewDue, stats, claimed){
  var list = questsForDay(day, reviewDue).map(function(q){
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

export { QUESTS, ALL_DONE_BONUS, dayIndex, questsForDay, questProgress, questState, loadClaimed, saveClaimed };
