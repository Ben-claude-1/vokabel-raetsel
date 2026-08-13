import { dailyGoalSec } from './theme.js';

function shuffleArr(arr) { return arr.slice().sort(function(){ return Math.random()-0.5; }); }

var shuffle = shuffleArr;

function naturalSort(a, b) {
  var ka = ((a.title||a.word||a.name||'')+'').toLowerCase(), kb = ((b.title||b.word||b.name||'')+'').toLowerCase();
  var na=ka.match(/^(\D*)(\d+)/), nb=kb.match(/^(\D*)(\d+)/);
  if(na&&nb&&na[1]===nb[1]) return parseInt(na[2])-parseInt(nb[2]);
  return ka.localeCompare(kb);
}

function fmtTestStamp(t){ if(!t) return ''; if(t.ts){ var d=new Date(t.ts); var pad=function(n){return String(n).padStart(2,'0');}; return (t.date||d.toISOString().slice(0,10))+' '+pad(d.getHours())+':'+pad(d.getMinutes()); } return t.date||''; }

// Tagesschlüssel in Ortszeit. Wichtig: new Date().toISOString() rechnet nach UTC —
// aus lokaler Mitternacht wird in Berlin dadurch der Vortag, und der Tag stimmt
// dann nirgends mehr mit den Zeitstempeln aus der Datenbank überein (die kommen
// mit +02:00 zurück, also bereits in Ortszeit).
function dayKey(d) {
  var x = d ? new Date(d) : new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());
}

function buildByDay(sessions) {
  var byDay = {};
  (sessions||[]).forEach(function(s){
    var k = s.started_at ? String(s.started_at).slice(0,10) : (s.d||'');
    if(!k) return;
    byDay[k] = (byDay[k]||0) + (s.active_seconds||s.dur||0);
  });
  return byDay;
}

function calcStreakFromByDay(byDay) {
  var today = new Date(); today.setHours(0,0,0,0);
  var todayKey = dayKey(today);
  var streak = (byDay[todayKey]||0) >= dailyGoalSec(todayKey) ? 1 : 0;
  var d = new Date(today); d.setDate(d.getDate()-1);
  for(var i=0; i<365; i++){
    var k = dayKey(d);
    if((byDay[k]||0) >= dailyGoalSec(k)){ streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return streak;
}

function getWeekDays() {
  var d = new Date(); d.setHours(0,0,0,0);
  var mon = new Date(d); mon.setDate(d.getDate()-((d.getDay()+6)%7));
  var days = [];
  for(var i=0; i<7; i++){ var day=new Date(mon); day.setDate(mon.getDate()+i); days.push(dayKey(day)); }
  return days;
}

function getWeekKey() { return getWeekDays()[0]; }

function fmtDuration(sec){ var m=Math.round((sec||0)/60); if(m<60) return m+' Min'; var h=Math.floor(m/60); return h+'h '+(m%60)+'m'; }

function shiftDay(k, delta){ var p=k.split('-'); var d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2])); d.setUTCDate(d.getUTCDate()+delta); return d.toISOString().slice(0,10); }

function weekdayOf(k){ var p=k.split('-'); return new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).getUTCDay(); }

function fmtDayShort(k){ var p=k.split('-'); return (+p[2])+'.'+(+p[1])+'.'; }

export { shuffleArr, shuffle, naturalSort, fmtTestStamp, dayKey, buildByDay, calcStreakFromByDay, getWeekDays, getWeekKey, fmtDuration, shiftDay, weekdayOf, fmtDayShort };
