import { sbGet, sbPatch, sbPost } from './api.js';
import { HW_POST, SB_URL } from './config.js';
import { chGrade, chLang, inScope, langLabel } from './scope.js';
import { dayKey, naturalSort, shuffleArr } from './util.js';
import { normWordKey, parseData, safeWords } from './words.js';

var DEFAULT_STREAK = { upThresholds:{1:2,2:1,3:1,4:1,5:1}, downThresholds:{1:0,2:1,3:1,4:1,5:1},
  testSize:20, grades:[{maxErrors:0,grade:1},{maxErrors:2,grade:2},{maxErrors:5,grade:3},{maxErrors:9,grade:4},{maxErrors:13,grade:5}] };

function lsGetRuns() { return sbGet('ls_runs','select=*&order=created_at.desc'); }

function lsGetRunsForPlayer(pid) { var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; if(!UUID.test(pid)) return lsGetRuns(); return sbGet('ls_runs','or=(is_admin_run.eq.true,player_id.eq.'+pid+')&order=created_at.desc'); }

function trackPot(wObj, pot, isCorrect) { if(!wObj.ps) wObj.ps={}; if(!wObj.ps[pot]) wObj.ps[pot]={c:0,w:0}; if(isCorrect) wObj.ps[pot].c=(wObj.ps[pot].c||0)+1; else wObj.ps[pot].w=(wObj.ps[pot].w||0)+1; }

var ANSWER_TALLY = {ok:0, bad:0, skip:0, credit:0};

// Wie viel eine richtige Antwort wert ist. In Topf 1 stehen vier Möglichkeiten
// zur Auswahl — da ist auch Raten oft richtig; frei abgerufen wird es erst ab
// Topf 3, und am meisten sagt die Wiederholung nach Tagen ohne Kontakt.
// Bezugsgröße: CREDIT_PER_MIN in core/goal.js.
var CREDIT = {
  pot1: 1,   // Multiple Choice
  pot2: 2,   // Buchstaben sortieren
  pot3: 4,   // frei tippen, Länge vorgegeben
  pot4: 5,   // frei tippen
  pot5: 6,   // rückwärts (Englisch → Deutsch)
  typed: 4,  // andere Spiele mit freier Eingabe (Grammatik, Trainer, Test)
  choice: 1, // andere Spiele mit Auswahl
  review0: 8, review1: 4, review2: 2,   // Wiederholung: ohne / mit 1 / mit 2 Tipps
};

function potCredit(pot){ return CREDIT['pot'+pot] || CREDIT.typed; }

// `skipped` = „nicht gewusst". Zählt als falsche Antwort und zusätzlich als
// Überspringer — daran hängt die Ehrlichkeits-Bedingung des Tagesziels.
// `credit` ist die Gutschrift einer richtigen Antwort (Standard: freie Eingabe).
function tallyAnswer(correct, skipped, credit){
  if(correct){ ANSWER_TALLY.ok++; ANSWER_TALLY.credit += (credit==null ? CREDIT.typed : credit); }
  else ANSWER_TALLY.bad++;
  if(skipped) ANSWER_TALLY.skip++;
}

// So viele Vokabeln lassen sich pro Runde einfach überspringen, bevor die
// Lösung gezeigt wird und einmal geschrieben werden muss — beides zählt
// weiter wie „nicht gewusst", der Abschreib-Schritt kostet aber Aufmerksamkeit
// statt eines Klicks. Hintergrund: am 12.08.2026 waren 83 von 86 Antworten
// reine Überspringer bei 0,6 s Antwortzeit — die Sitzung sah nach Lernen aus
// und war keines. Deshalb 0: jeder Überspringer geht sofort zum Abschreiben.
var SKIP_LIMIT = 0;

var DAY_LOG_KEEP = 180;   // Tage mit Kennzahlen

var DAY_WORDS_KEEP = 60;  // Tage mit Wort-Detail (spart Platz im Blob)

function lsToday(){ return dayKey(); }

function daysBetween(a, b){
  if(!a||!b) return null;
  var pa=a.split('-'), pb=b.split('-');
  return Math.round((Date.UTC(+pb[0],+pb[1]-1,+pb[2]) - Date.UTC(+pa[0],+pa[1]-1,+pa[2]))/86400000);
}

function lsWordCount(d){
  return [1,2,3,4,5,6].reduce(function(s,p){ return s + (((d.pots||{})[p]||[]).length); },0);
}

function lsDayEntry(d, pctBefore){
  var day = lsToday();
  if(!d.days) d.days = {};
  if(!d.days[day]) d.days[day] = {a:0, c:0, a1:0, c1:0, p0:Math.round(pctBefore||0), p1:Math.round(pctBefore||0), l:[], w:{}};
  return d.days[day];
}

function lsLogAnswer(d, e){
  var today = lsToday();
  var day = lsDayEntry(d, e.pctBefore);
  // `helped` = mit der Hilfe „wie im Topf davor" gelöst. Zählt als echte
  // Antwort, aber NICHT als Beleg für Können — sonst würde genau die
  // Behaltenskurve verwässert, die die Hilfe-Option umgehen soll.
  var counts = e.correct && !e.helped;
  day.a++; if(counts) day.c++;
  day.p1 = Math.round(e.pctAfter||day.p1);
  day.n = lsWordCount(d);
  if(!day.w) day.w = {};
  var rec = day.w[e.word];
  var first = !rec;
  if(!rec) rec = day.w[e.word] = {c:0, f:0, clue:e.clue||'', p:e.toPot};
  if(first){
    // Erstversuch des Tages: der zählt für „hat sie es wirklich behalten?".
    day.a1 = (day.a1||0)+1; if(counts) day.c1 = (day.c1||0)+1;
    rec.f1 = counts?1:0;
    var prevSeen = e.wObj && e.wObj.ls;
    var gap = daysBetween(prevSeen, today);
    if(gap!=null && gap>0) rec.g = gap;
    // Antwortzeiten über 2 Min sind Pausen, keine Denkzeit — nicht verwerten.
    if(e.rt!=null && e.rt>0 && e.rt<120000) rec.t = Math.round(e.rt);
  }
  if(e.skipped) rec.s = (rec.s||0)+1;
  if(e.helped) rec.h = (rec.h||0)+1;
  if(!e.helped){ if(e.correct) rec.c++; else rec.f++; }
  if(e.wObj){
    e.wObj.ls = today;
    if(counts) e.wObj.lc = today;
  }
  if(e.toPot!=null) rec.p = e.toPot;
  if(e.toPot===6 && e.fromPot!==6){
    if(!day.l) day.l = [];
    if(day.l.indexOf(e.word)<0) day.l.push(e.word);
  }
  // Alte Tage ausdünnen, damit der Fortschritts-Datensatz nicht wächst.
  var keys = Object.keys(d.days).sort();
  if(keys.length > DAY_LOG_KEEP) keys.slice(0, keys.length-DAY_LOG_KEEP).forEach(function(k){ delete d.days[k]; });
  var withWords = Object.keys(d.days).sort();
  if(withWords.length > DAY_WORDS_KEEP){
    withWords.slice(0, withWords.length-DAY_WORDS_KEEP).forEach(function(k){ if(d.days[k]) d.days[k].w = null; });
  }
}

// Lernen und Wiederholen wechseln sich ab: erst ein Stück lernen, dann prüfen,
// ob das Gelernte noch sitzt, dann weiterlernen.
//
// Den Takt gibt das Lernen vor — nach `answersTrigger` Antworten (oder nach
// `days` Tagen) schiebt sich der Lauf dazwischen. Bewusst NICHT der Rückstand:
// bei ~190 überfälligen Vokabeln wäre nach jedem Lauf sofort wieder gesperrt
// und es gäbe keinen Wechsel, sondern eine Dauerschleife Wiederholung.
// Der Rückstand steuert stattdessen die *Größe* des Laufs, damit er trotzdem
// aufholt.
var REVIEW_DEFAULT = {enabled:true, days:3, count:20, minPool:20,
  answersTrigger:80,   // so viele Lernantworten bis zum nächsten Lauf
  maxCount:30,         // Obergrenze, wenn viel Rückstand aufgelaufen ist
  // Vor einer Klassenarbeit soll der ganze Übungsplatz dem neuen Stoff gehören.
  // `pauseUntil` (Tag 'JJJJ-MM-TT', einschließlich) setzt die Pflicht-Wiederholung
  // bis dahin aus; danach greift sie ohne Zutun wieder. Bewusst ein Datum und
  // kein Schalter — ein Schalter bleibt aus, wenn niemand daran denkt.
  pauseUntil:'',
  pauseNote:''};       // wofür pausiert wird, nur zur Anzeige

var REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];

var DAY_MS = 86400000;

function reviewKey(w){ return normWordKey(w && w.word); }

function reviewHistoryStats(history){
  var m = {};
  // älteste zuerst, damit die Serie in der richtigen Richtung wächst
  var runs = (history||[]).slice().sort(function(a,b){
    return (Date.parse(a.created_at||'')||0) - (Date.parse(b.created_at||'')||0);
  });
  runs.forEach(function(run){
    var ts = Date.parse(run.created_at||'') || 0;
    var items = parseData(run.items);
    (Array.isArray(items)?items:[]).forEach(function(it){
      var k = reviewKey(it); if(!k) return;
      var e = m[k] || (m[k] = {last:0, level:0, lastOk:0});
      e.last = ts;
      // „Gekonnt" zählt nur ohne Tipp — mit Tipp ist es kein Beleg für Können.
      if(it.correct && !it.hints){ e.level = Math.min(REVIEW_INTERVALS.length-1, e.level+1); e.lastOk = ts; }
      else e.level = 0;
    });
  });
  return m;
}

// Überfälligkeit: >= 1 heißt „jetzt dran". Die Stufe steht am Wort selbst (`rl`,
// vom Wiederholungslauf zurückgeschrieben); die Lauf-Historie zählt zusätzlich
// mit, damit Läufe von vor der Umstellung nicht verloren gehen.
function reviewOverdue(entry, stats, nowMs){
  var st = stats && stats[reviewKey(entry)];
  var level = Math.max(entry.rl||0, st?st.level:0);
  var interval = REVIEW_INTERVALS[Math.min(level, REVIEW_INTERVALS.length-1)];
  var lastOk = Math.max(st?st.lastOk:0, entry.lcMs||0);
  if(!lastOk) return 99; // nie belegt gekonnt (Altbestand) → höchste Priorität
  return ((nowMs - lastOk) / DAY_MS) / interval;
}

function reviewPolicyOf(raw){
  var p = Object.assign({}, REVIEW_DEFAULT);
  try{ var v = typeof raw==='string' ? JSON.parse(raw) : raw; if(v) Object.assign(p, v); }catch(e){}
  p.days = Math.max(1, Number(p.days)||REVIEW_DEFAULT.days);
  p.count = Math.max(5, Number(p.count)||REVIEW_DEFAULT.count);
  p.minPool = Math.max(1, Number(p.minPool)||REVIEW_DEFAULT.minPool);
  p.answersTrigger = Math.max(10, Number(p.answersTrigger)||REVIEW_DEFAULT.answersTrigger);
  p.maxCount = Math.max(p.count, Number(p.maxCount)||REVIEW_DEFAULT.maxCount);
  p.pauseUntil = /^\d{4}-\d{2}-\d{2}$/.test(p.pauseUntil||'') ? p.pauseUntil : '';
  p.pauseNote = String(p.pauseNote||'').slice(0,80);
  return p;
}

// Läuft die Pause noch? Verglichen wird der Tagesschlüssel als Zeichenkette —
// 'JJJJ-MM-TT' sortiert lexikografisch wie chronologisch, und der Vergleich
// bleibt damit in derselben Zeitzone wie der restliche Lernstand.
function reviewPaused(policy, today){
  var p = reviewPolicyOf(policy);
  return !!(p.pauseUntil && (today || lsToday()) <= p.pauseUntil);
}

// Umfang des nächsten Laufs: Standardgröße, bei Rückstand mehr — aber gedeckelt,
// damit ein Lauf nie zur Strafarbeit wird.
function reviewRunSize(policy, dueCount){
  var p = reviewPolicyOf(policy);
  return Math.max(p.count, Math.min(p.maxCount, Math.ceil((dueCount||0)/5)));
}

// `stats` = {dueCount, answersSince} aus dem Lernstand.
//
// Gesperrt wird nur, wenn es überhaupt etwas zu wiederholen gibt UND das
// Lernpensum seit dem letzten Lauf voll ist. Der Rückstand selbst sperrt nicht
// (siehe REVIEW_DEFAULT) — sonst gäbe es keinen Wechsel.
function reviewLockState(policy, lastReviewIso, poolSize, stats){
  var p = reviewPolicyOf(policy);
  var s = stats || {};
  var out = {locked:false, policy:p, daysSince:null, reason:null, paused:false, pausedUntil:'',
    dueCount:s.dueCount||0, answersSince:s.answersSince||0, runSize:reviewRunSize(p, s.dueCount)};
  // Pause vor allem anderen: in der Testwoche zählt der neue Stoff, nicht der alte.
  if(reviewPaused(p)){ out.paused = true; out.pausedUntil = p.pauseUntil; return out; }
  if(!p.enabled || poolSize < p.minPool) return out;
  if(!(s.dueCount>0)) return out;   // nichts fällig → nichts zu prüfen
  var last = lastReviewIso ? Date.parse(lastReviewIso) : 0;
  out.daysSince = last ? Math.floor((Date.now()-last)/DAY_MS) : null;
  if(!last) out.reason = 'first';
  else if((s.answersSince||0) >= p.answersTrigger) out.reason = 'learned';
  else if(out.daysSince >= p.days) out.reason = 'days';
  out.locked = !!out.reason;
  return out;
}

// Wie viele gelernte Vokabeln sind fällig? Zählt über mehrere Runs hinweg und
// entdoppelt, weil dasselbe Wort in mehreren Runs stehen kann.
function countDue6(progressList, today){
  var t = today || lsToday();
  var seen = {}, due = 0, pool = 0;
  (progressList||[]).forEach(function(d){
    (((d||{}).pots||{})[6]||[]).forEach(function(w){
      var k = normWordKey(w && w.word); if(!k || seen[k]) return;
      seen[k] = 1; pool++;
      if(due6(w, t) >= 0) due++;
    });
  });
  return {due:due, pool:pool};
}

// Lernantworten seit dem letzten Wiederholungslauf — der dritte Auslöser.
// Grundlage sind die Sitzungen im Lernstand, die einen Zeitstempel tragen.
function answersSinceReview(progressList, lastReviewIso){
  var since = lastReviewIso ? Date.parse(lastReviewIso) : 0;
  if(!since) return 0;
  var n = 0;
  (progressList||[]).forEach(function(d){
    ((d||{}).sessions||[]).forEach(function(s){
      if(s && s.ts && s.ts > since) n += s.ans||0;
    });
  });
  return n;
}

function lsDayStats(data, day){
  var d = data||{};
  var log = d.days && d.days[day];
  if(log) return {ans:log.a||0, cor:log.c||0, first:log.a1||0, firstCor:log.c1||0, count:log.n||null,
    p0:log.p0, p1:log.p1, learned:(log.l||[]).slice(), words:log.w||null, exact:true};
  var sess = (d.sessions||[]).filter(function(s){ return s && s.d===day; });
  if(!sess.length) return null;
  var ans=0, cor=0;
  sess.forEach(function(s){ ans+=s.ans||0; cor+=s.cor||0; });
  // % vor dem Tag = Stand der letzten Session davor
  var before = null;
  (d.sessions||[]).forEach(function(s){ if(s && s.d < day && s.pct!=null) before = s.pct; });
  var last = sess[sess.length-1];
  return {ans:ans, cor:cor, p0:before!=null?before:null, p1:last.pct!=null?last.pct:null, learned:null, words:null, exact:false};
}

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ein Datensatz je Antwort, spielübergreifend (Tabelle `word_events`) — davon
// hängt die Tagesansicht "welche Vokabel wo, richtig/falsch, welcher Topf" ab.
// Bewusst fire-and-forget (wie updatePresence): eine verlorene Zeile darf das
// Spiel nie blockieren oder verlangsamen.
function logWordEvent(playerId, game, runId, word, clue, correct, pot){
  if(!playerId || !UUID_RE.test(playerId) || !word) return;
  sbPost('word_events', {player_id:playerId, game:game,
    run_id:(runId && UUID_RE.test(runId)) ? runId : null,
    word:word, clue:clue||null, correct:!!correct,
    pot:(pot==null?null:pot)}).catch(function(){});
}

function lsGetProgress(pid,rid) { var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; if(!UUID.test(pid)||!UUID.test(rid)) return Promise.resolve([]); return sbGet('ls_progress','player_id=eq.'+pid+'&run_id=eq.'+rid+'&select=*'); }

function lsSaveProgress(pid,rid,data,eid) {
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!UUID.test(pid)||!UUID.test(rid)) return Promise.resolve({_ok:true});
  var payload={data:JSON.stringify(data),updated_at:new Date().toISOString()};
  if(eid) return sbPatch('ls_progress',payload,'id=eq.'+eid);
  var full=Object.assign({player_id:pid,run_id:rid},payload);
  return fetch(SB_URL+'/rest/v1/ls_progress?on_conflict=player_id,run_id',{
    method:'POST',
    headers:Object.assign({},HW_POST,{'Prefer':'resolution=merge-duplicates,return=representation'}),
    body:JSON.stringify(full),mode:'cors',credentials:'omit'
  }).then(function(r){return r.json();}).catch(function(){return {_ok:true};});
}

// Object.assign statt Feld-Whitelist: Zusatzfelder wie beim Verben-Trainer
// (pastSimple/pastParticiple/pattern/meaning) müssen den Lernstand überleben,
// sonst verschwinden sie beim ersten Speichern.
function lsInitProgress(words,sentences) { return {pots:{1:words.map(function(w){return Object.assign({},w,{type:w.type||'noun',chapterId:w.chapterId||'',streak:0,wrongStreak:0});}),2:[],3:[],4:[],5:[],6:[]},sentences:(sentences||[]).map(function(s){return{text:s.text,translation:s.translation,streak:0};}),bonusStarted:false,history:[],lastWord:null,streak:0}; }

function lsPercent(progress,gs) { var p=progress.pots||{}; var t=(p[1]||[]).length+(p[2]||[]).length+(p[3]||[]).length+(p[4]||[]).length+(p[5]||[]).length+(p[6]||[]).length; if(t===0) return 0; var score=(p[2]||[]).length*17+(p[3]||[]).length*34+(p[4]||[]).length*50+(p[5]||[]).length*67+(p[6]||[]).length*100; var base=Math.round(score/t); if(progress.bonusStarted&&(progress.sentences||[]).length>0){var sl=progress.sentences.filter(function(s){return s.streak>=2;}).length;return Math.min(100,base+Math.round(sl/progress.sentences.length*10));}return base; }

function lsGrade(pct,gs) { if(!gs||!gs.grades) return null; var correct=Math.round(pct/100*(gs.testSize||20)); var errors=(gs.testSize||20)-correct; var sorted=(gs.grades||[]).slice().sort(function(a,b){return a.maxErrors-b.maxErrors;}); for(var i=0;i<sorted.length;i++) if(errors<=sorted[i].maxErrors) return sorted[i].grade; return sorted.length?sorted[sorted.length-1].grade+1:null; }

function lsRunPacing(currentPct, targetPct, targetDate, sessionsSecondsForRun){
  if(!targetDate) return null;
  var tgt = Math.max(1, Math.min(100, targetPct||100));
  var gap = Math.max(0, tgt - (currentPct||0));
  var today = new Date(); today.setHours(0,0,0,0);
  var d = new Date(targetDate+'T00:00:00');
  var daysLeft = Math.ceil((d - today) / 86400000);
  var spentMin = Math.round((sessionsSecondsForRun||0)/60);
  var status, requiredMinPerDay=null, etaMessage='';
  if(gap===0){ status='done'; etaMessage='✅ Ziel erreicht'; }
  else if(daysLeft<=0){ status='overdue'; etaMessage='⚠️ Stichtag verstrichen — '+gap+'% offen'; }
  else if(currentPct<=0 || spentMin<2){
    status='no-data';
    etaMessage='Noch keine Lernzeit gemessen — Schätzung ab nächster Sitzung';
    requiredMinPerDay = Math.ceil((gap * 5) / daysLeft);
  } else {
    var minPerPct = spentMin / currentPct;
    var totalNeeded = gap * minPerPct;
    requiredMinPerDay = Math.ceil(totalNeeded / daysLeft);
    if(requiredMinPerDay<=15) status='easy';
    else if(requiredMinPerDay<=45) status='ok';
    else if(requiredMinPerDay<=90) status='hard';
    else status='unrealistic';
  }
  return { targetPct:tgt, currentPct:currentPct||0, gap:gap, daysLeft:daysLeft, spentMin:spentMin, requiredMinPerDay:requiredMinPerDay, status:status, etaMessage:etaMessage, targetDate:targetDate };
}

// ── Wortauswahl ──────────────────────────────────────────────────────────────
// Vorher: shuffleArr über alle Wörter aus den Töpfen 1–5. Das verteilt die
// Arbeit gleichmäßig über den ganzen Run — gemessen an Emmas Theme 1: 414
// Antworten auf 113 Wörter (Median 4 je Wort), kein einziges Wort in „gelernt",
// weil dafür 6 richtige Antworten in Folge nötig sind. Gleichverteilung ist
// genau die falsche Zuteilung.
//
// Jetzt: ein begrenztes Arbeitsset, das erst abgearbeitet wird, bevor neue
// Wörter nachrücken, plus Gewichtung nach Dringlichkeit. Gedeckelt wird nur,
// wenn der offene Pool (Töpfe 1-5) größer ist als ACTIVE_POOL_SIZE — bei
// ≤20 offenen Vokabeln ist von Anfang an alles aktiv. Sobald eine Vokabel
// Topf 6 erreicht, verschwindet sie aus dem offenen Pool und die nächste
// ungelernte rückt ins Arbeitsset nach.
//
// Gelernte Wörter (Topf 6) kommen hier bewusst NICHT vor. Das Leiterspiel ist
// der Lern-Teil; das Behalten übernimmt der Wiederholungslauf, der sich als
// eigener Abschnitt dazwischenschiebt.

var WORKING_SET = 12;   // Fallback-Arbeitsset, falls opts.workingSet erzwungen wird
var ACTIVE_POOL_SIZE = 20;   // ab so vielen offenen Vokabeln wird das Arbeitsset gedeckelt

var REVIEW6_INTERVALS = [1, 3, 7, 14, 30, 60];

function wordSeen(w){ return ((w.correct||0)+(w.wrong||0)) > 0; }

// Ein Wort, das heute schon eine Stufe aufgestiegen ist, ruht bis morgen.
function retiredToday(w, today){ return (w.pd||'') === (today||lsToday()); }

// Überfälligkeit eines gelernten Worts in Tagen (>=0 = fällig).
function due6(w, today){
  var last = w.lc || w.ls || null;
  if(!last) return 999;  // nie belegt gekonnt (Altbestand) → höchste Priorität
  var lvl = Math.min(w.rl||0, REVIEW6_INTERVALS.length-1);
  var gap = daysBetween(last, today||lsToday());
  if(gap==null) return -1;
  return gap - REVIEW6_INTERVALS[lvl];
}

// Dringlichkeit innerhalb des Arbeitssets: niedriger Topf, zuletzt falsch und
// lange nicht gesehen ziehen nach oben.
function urgency(w, pot, today){
  var base = ({1:5, 2:4, 3:3, 4:2.5, 5:2})[pot] || 1;
  var failing = ((w.streak||0)===0 && (w.wrong||0)>0) ? 2 : 1;
  var gap = w.ls ? daysBetween(w.ls, today) : null;
  var age = gap==null ? 1.5 : Math.min(3, 1 + gap*0.3);
  var resting = retiredToday(w, today) ? 0.15 : 1;
  return base * failing * age * resting;
}

function weightedPick(list, weightFn){
  var total = 0;
  var ws = list.map(function(x){ var v = Math.max(0.01, weightFn(x)); total += v; return v; });
  var r = Math.random() * total;
  for(var i=0;i<list.length;i++){ r -= ws[i]; if(r<=0) return list[i]; }
  return list[list.length-1];
}

// Weiche statt harte Abwertung der zuletzt gefragten Wörter: ein harter
// Ausschluss ("nie das letzte Wort") zwingt bei nur 2 aktiven Wörtern (kleiner
// Lauf, eins schon gelernt) eine komplett feste Wechselreihenfolge
// (come, run, come, run, ...) — das wirkt für kleine Läufe wie ein Skript,
// nicht wie Zufall. Mit der Abwertung bleibt jedes Wort weiterhin wählbar,
// nur stark unwahrscheinlicher gleich wieder.
function recentPenalty(word, recentWords){
  var idx = (recentWords||[]).indexOf(word);
  if(idx<0) return 1;
  return [0.08, 0.3, 0.6][idx] || 0.8;
}

// ── Wort des Tages ───────────────────────────────────────────────────────────
// Genau eine Vokabel pro Tag, Spieler UND SPRACHE (nicht pro Run!) — Emma soll
// an einem Tag ein englisches und ein spanisches Wort des Tages sehen, nicht
// in jedem einzelnen Englisch-Run ein anderes. Quelle ist der offene Pool
// desjenigen Runs, der als erstes an diesem Tag für diese Sprache geöffnet
// wird — damit ist garantiert, dass die Vokabel dort auch wirklich vorkommt
// und noch nicht gelernt ist. Später am selben Tag geöffnete Runs derselben
// Sprache lesen denselben, in `settings` abgelegten Wert; taucht das Wort dort
// gar nicht auf, hat der Bonus in urgency() dort einfach keinen Effekt.
var WORD_OF_DAY_BOOST = 6;

function wordOfDaySettingsKey(playerId, lang){ return 'wod_'+String(playerId||'')+'_'+String(lang||''); }

// Offener Pool (Töpfe 1-5) als normalisierte Wortschlüssel — die Kandidaten
// für einen Claim, falls dieser Run das Wort des Tages als erster festlegt.
function openPoolKeys(pots){
  var out = [];
  [1,2,3,4,5].forEach(function(pot){ ((pots||{})[pot]||[]).forEach(function(w){
    if(w && !w.disputeId) out.push(normWordKey(w.word));
  }); });
  return out;
}

// Liest das Wort des Tages für (Spieler, Sprache); legt es fest, falls heute
// noch keins existiert. `candidateKeys` ist der offene Pool DIESES Runs — nur
// relevant, falls er den Claim gewinnt (erster Aufruf des Tages).
function lsClaimWordOfDay(playerId, lang, today, candidateKeys){
  if(!playerId || !lang) return Promise.resolve(null);
  today = today || lsToday();
  var key = wordOfDaySettingsKey(playerId, lang);
  return sbGet('settings','key=eq.'+encodeURIComponent(key)).then(function(rows){
    var row = rows && rows[0];
    var v = null;
    if(row){ try{ v = JSON.parse(row.value); }catch(e){} }
    if(v && v.d===today && v.key) return v.key;
    if(!candidateKeys || !candidateKeys.length) return null;
    var pick = candidateKeys[Math.floor(Math.random()*candidateKeys.length)];
    var val = JSON.stringify({d:today, key:pick});
    var save = row ? sbPatch('settings',{value:val},'key=eq.'+encodeURIComponent(key))
                   : sbPost('settings',{key:key, value:val});
    return save.then(function(){ return pick; }).catch(function(){ return pick; });
  }).catch(function(){ return null; });
}

function lsPickWord(progress, recentWords, opts) {
  opts = opts || {};
  var today = lsToday();
  var pots = (progress && progress.pots) || {};
  var recent = Array.isArray(recentWords) ? recentWords : (recentWords ? [recentWords] : []);
  function flat(w,pot){ return Object.assign({},w,{streak:w.streak||0,correct:w.correct||0,
    wrong:w.wrong||0,disputeId:w.disputeId,pot:pot}); }
  function avail(pot){ return (pots[pot]||[]).filter(function(w){ return w && !w.disputeId; }); }

  // Offener Pool = alles, was noch nicht Topf 6 (gelernt) erreicht hat. Erst
  // ab mehr als ACTIVE_POOL_SIZE davon wird das Arbeitsset gedeckelt.
  var openPool = [1,2,3,4,5].reduce(function(s,pot){ return s + avail(pot).length; }, 0);
  var setSize = Math.max(4, opts.workingSet || Math.min(ACTIVE_POOL_SIZE, openPool) || WORKING_SET);

  var wodKey = opts.wordOfDayKey || null;

  // Arbeitsset: angefangene Wörter. Was heute schon aufgestiegen ist, zählt
  // nicht mit — sonst blockiert es den Nachschub und die Sitzung dreht sich
  // im Kreis.
  var working = [], resting = [];
  [2,3,4,5].forEach(function(pot){ avail(pot).forEach(function(w){
    (retiredToday(w,today)?resting:working).push({w:w, pot:pot});
  }); });
  avail(1).forEach(function(w){ if(wordSeen(w)) (retiredToday(w,today)?resting:working).push({w:w, pot:1}); });

  // Auffüllen mit noch nie gezeigten Wörtern.
  if(working.length < setSize){
    var fresh = avail(1).filter(function(w){ return !wordSeen(w); });
    fresh.slice(0, setSize - working.length).forEach(function(w){ working.push({w:w, pot:1}); });
  }

  var cands = working.concat(resting);

  // Das Wort des Tages muss immer wählbar sein, auch wenn es (noch) nicht im
  // regulär nachgerückten Arbeitsset steckt — sonst müsste es erst normal an
  // die Reihe kommen, und genau das soll die Auszeichnung ja umgehen.
  if(wodKey && !cands.some(function(x){ return normWordKey(x.w.word)===wodKey; })){
    for(var p=1; p<=5 && !cands.some(function(x){ return normWordKey(x.w.word)===wodKey; }); p++){
      var hit = avail(p).filter(function(w){ return normWordKey(w.word)===wodKey; })[0];
      if(hit) cands.push({w:hit, pot:p});
    }
  }

  if(!cands.length) return null;   // alles gelernt → der Run ist durch
  var pick = weightedPick(cands, function(x){
    var u = urgency(x.w, x.pot, today) * recentPenalty(x.w.word, recent);
    return (wodKey && normWordKey(x.w.word)===wodKey) ? u*WORD_OF_DAY_BOOST : u;
  });
  var picked = flat(pick.w, pick.pot);
  if(wodKey && normWordKey(picked.word)===wodKey) picked.wod = true;
  return picked;
}

// Aufstiege werden nicht gesperrt (ein kleiner Wörter-Pool wie ein
// Verben-Muster mit 3-8 Wörtern wäre sonst nach wenigen Minuten komplett
// eingefroren), aber der Tag wird gestempelt: `retiredToday`/`urgency()` oben
// ziehen ein heute schon aufgestiegenes Wort danach nur noch stark
// abgeschwächt (Faktor 0.15), es rutscht also möglichst weit nach hinten statt
// gleich wieder dranzukommen — Abstand statt Sperre.
function markPromoted(wObj, today){ wObj.pd = today||lsToday(); }

function generateSentences(words, runName, forceNew, lang) {
  var langName = langLabel(lang||'en');
  var picked = shuffleArr(words).slice(0, Math.min(10, words.length));
  var wordList = picked.map(function(w){return '"'+w.word+'" ('+w.clue+')';}).join(', ');
  var prompt = 'Erstelle für jede dieser '+langName+'-Vokabeln genau einen kurzen einfachen '+langName+'-Satz (max. 10 Wörter) für Schüler (10-12 Jahre). Thema des Lernsets: "'+runName+'".\nVokabeln: '+wordList+'\nErsetze die Vokabel im Satz durch "___".\nAntworte NUR mit einem JSON-Array, ein Objekt pro Vokabel: [{"sentence":"...","answer":"'+langName+'es Wort","clue":"deutsche Übersetzung"}]. Kein Markdown, keine Erklärungen.';
  var cacheKey = 'satz_' + (lang||'en') + '_' + runName.replace(/[^a-zA-Z0-9]/g,'_').substring(0,40);
  function callApi(key) {
    return fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:2000,messages:[{role:'user',content:prompt}]})
    }).then(function(r){return r.json();}).then(function(d){
      if(d.error) throw new Error(d.error.message||'API Fehler');
      var text=d.content&&d.content[0]&&d.content[0].text||'';
      var m=text.match(/\[[\s\S]*\]/);
      if(!m) throw new Error('Kein JSON in Antwort');
      var sents=JSON.parse(m[0]);
      fetch(SB_URL+'/rest/v1/settings',{method:'POST',headers:Object.assign({},HW_POST,{'Prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify({key:cacheKey,value:JSON.stringify(sents)}),mode:'cors',credentials:'omit'});
      return sents;
    });
  }
  function generate() {
    return fetch(SB_URL+'/rest/v1/rpc/get_claude_key',{method:'POST',headers:HW_POST,body:'{}',mode:'cors',credentials:'omit'})
      .then(function(r){return r.json();})
      .then(function(key){
        if(!key) key=localStorage.getItem('claude_api_key')||'';
        if(!key) return Promise.reject(new Error('Kein API-Key hinterlegt'));
        return callApi(key);
      });
  }
  if(forceNew) return generate();
  return sbGet('settings','key=eq.'+encodeURIComponent(cacheKey)).then(function(cached){
    if(cached&&cached[0]&&cached[0].value){
      try{var p=JSON.parse(cached[0].value);if(Array.isArray(p)&&p.length>0)return p;}catch(e){}
    }
    return generate();
  });
}

var AUTO_RUN_MIN_WORDS = 2; // darunter lohnt sich kein Run (Leiterspiel braucht ≥2)

function autoRunWordsFor(chapter){
  return safeWords(chapter && chapter.words)
    .filter(function(w){ return w && w.important && w.word; })
    .slice()
    .sort(function(a,b){
      var pa=(a.book_page!=null?a.book_page:99999), pb=(b.book_page!=null?b.book_page:99999);
      if(pa!==pb) return pa-pb;
      var sa=(typeof a.seq==='number'?a.seq:99999), sb=(typeof b.seq==='number'?b.seq:99999);
      if(sa!==sb) return sa-sb;
      return (a.word||'').localeCompare(b.word||'');
    })
    .map(function(w){
      return {word:w.word, clue:w.clue, type:w.type||'noun', chapterId:chapter.id,
        important:true, book_page:w.book_page, pot:1};
    });
}

function autoRunName(chapter){ return chapter.title || 'Kapitel'; }

function syncAutoRun(chapter, opts){
  opts = opts || {};
  if(!chapter || !chapter.id || !chapter.parent_id) return Promise.resolve(null);
  var words = autoRunWordsFor(chapter);
  return sbGet('ls_runs','auto_chapter_id=eq.'+encodeURIComponent(chapter.id)+'&select=id,name,word_count')
    .then(function(rows){
      var existing = Array.isArray(rows) && rows[0];
      if(existing){
        if(words.length < AUTO_RUN_MIN_WORDS){
          // Kapitel hat keine ⭐-Wörter mehr: Run leeren statt löschen, damit
          // der Fortschritt der Kinder nicht verloren geht.
          if((existing.word_count||0)===0) return {action:'none', run:existing};
        }
        return sbPatch('ls_runs',{name:autoRunName(chapter), words:JSON.stringify(words),
          word_count:words.length, grade:chGrade(chapter), language:chLang(chapter)},
          'id=eq.'+existing.id)
          .then(function(ok){ return {action:ok?'updated':'error', run:existing, count:words.length}; });
      }
      if(!opts.allowCreate || words.length < AUTO_RUN_MIN_WORDS) return {action:'none'};
      var run = {name:autoRunName(chapter), icon:chapter.icon||'🪜', player_id:null,
        is_admin_run:true, word_count:words.length, sentence_count:0,
        grade:chGrade(chapter), language:chLang(chapter), auto_chapter_id:chapter.id,
        words:JSON.stringify(words), sentences:'[]', created_at:new Date().toISOString()};
      return sbPost('ls_runs',run).then(function(res){
        if(res&&res._err) return {action:'error', msg:res.msg};
        return {action:'created', run:res, count:words.length};
      });
    })
    .catch(function(){ return {action:'error'}; });
}

function scopeUsesAutoRuns(chapter, allChapters){
  var siblings = (allChapters||[]).filter(function(c){
    return c.parent_id && chGrade(c)===chGrade(chapter) && chLang(c)===chLang(chapter);
  }).map(function(c){ return c.id; });
  if(!siblings.length) return Promise.resolve(false);
  return sbGet('ls_runs','auto_chapter_id=in.('+siblings.map(encodeURIComponent).join(',')+')&select=id&limit=1')
    .then(function(rows){ return Array.isArray(rows) && rows.length>0; })
    .catch(function(){ return false; });
}

function syncAutoRunsForScope(allChapters, sc){
  var list = (allChapters||[]).filter(function(c){
    return c.parent_id && inScope(c, sc) && safeWords(c.words).length>0;
  }).sort(naturalSort);
  return list.reduce(function(p, ch){
    return p.then(function(acc){
      return syncAutoRun(ch, {allowCreate:true}).then(function(r){
        if(r&&r.action==='created') acc.created++;
        else if(r&&r.action==='updated') acc.updated++;
        return acc;
      });
    });
  }, Promise.resolve({created:0, updated:0}));
}

function saveChapterWords(chapter, newWords, allChapters, setChapters, setSaving, setMsg) {
  setSaving(true);
  if(!chapter.id){ setChapters(function(prev){ return prev.map(function(c){return c.id===chapter.id?Object.assign({},c,{words:newWords}):c;}); }); setSaving(false); setMsg('✓ (lokal)'); return; }
  sbPatch('chapters',{words:newWords},'id=eq.'+chapter.id).then(function(ok){
    if(ok){ setChapters(function(prev){ return prev.map(function(c){return c.id===chapter.id?Object.assign({},c,{words:newWords}):c;}); }); setMsg('✓ Gespeichert'); }
    else setMsg('Fehler!');
    setSaving(false);
    if(!ok) return;
    // ⭐-Änderungen ins Kapitel-Leiterspiel durchreichen.
    var updated = Object.assign({}, chapter, {words:newWords});
    scopeUsesAutoRuns(updated, allChapters).then(function(uses){
      return syncAutoRun(updated, {allowCreate:uses});
    }).then(function(r){
      if(r && (r.action==='updated'||r.action==='created')){
        setMsg('✓ Gespeichert · Leiterspiel „'+autoRunName(updated)+'": '+r.count+' ⭐-Wörter');
      }
    }).catch(function(){});
  });
}

function saveChapterSentences(chapter, newSentences, allChapters, setChapters, setSaving, setMsg) {
  setSaving(true);
  if(!chapter.id){ setChapters(function(prev){ return prev.map(function(c){return c.id===chapter.id?Object.assign({},c,{sentences:newSentences}):c;}); }); setSaving(false); setMsg('✓ (lokal)'); return; }
  sbPatch('chapters',{sentences:newSentences},'id=eq.'+chapter.id).then(function(ok){
    if(ok){ setChapters(function(prev){ return prev.map(function(c){return c.id===chapter.id?Object.assign({},c,{sentences:newSentences}):c;}); }); setMsg('✓ Gespeichert'); }
    else setMsg('Fehler!');
    setSaving(false);
  });
}

function lsPctSeries(data){
  var out = [];
  ((data||{}).sessions||[]).forEach(function(s){ if(s&&s.d&&s.pct!=null) out.push({d:s.d, pct:s.pct}); });
  var days = (data||{}).days||{};
  Object.keys(days).forEach(function(k){ if(days[k]&&days[k].p1!=null) out.push({d:k, pct:days[k].p1}); });
  out.sort(function(a,b){ return a.d<b.d?-1:a.d>b.d?1:0; });
  return out;
}

function lsDeltaSince(data, fromDay){
  var d = data||{};
  var days = d.days||{};
  var dayKeys = Object.keys(days).filter(function(k){ return k>=fromDay && days[k] && days[k].p0!=null; }).sort();
  var sess = (d.sessions||[]).filter(function(s){ return s && s.d>=fromDay && s.pct!=null; });
  if(!dayKeys.length && !sess.length) return 0;
  var start = null, startDay = null;
  if(dayKeys.length){ start = days[dayKeys[0]].p0; startDay = dayKeys[0]; }
  if(sess.length && (startDay===null || sess[0].d < startDay)) start = sess[0].pct;
  if(start==null) return 0;
  return Math.round(lsPercent(d)) - Math.round(start);
}

function lsAnswersSince(data, fromDay){
  var d = data||{}, n = 0, days = d.days||{}, counted = {};
  Object.keys(days).forEach(function(k){ if(k>=fromDay){ n += (days[k]||{}).a||0; counted[k]=1; } });
  (d.sessions||[]).forEach(function(s){ if(s && s.d>=fromDay && !counted[s.d]) n += s.ans||0; });
  return n;
}

function lsLearnedInRange(data, fromDay){
  var days = (data||{}).days||{}, n = 0;
  Object.keys(days).forEach(function(k){ if(k>=fromDay) n += ((days[k]||{}).l||[]).length; });
  return n;
}

export { DEFAULT_STREAK, SKIP_LIMIT, CREDIT, potCredit, lsGetRuns, lsGetRunsForPlayer, trackPot, ANSWER_TALLY, tallyAnswer, DAY_LOG_KEEP, DAY_WORDS_KEEP, lsToday, daysBetween, lsWordCount, lsDayEntry, lsLogAnswer, logWordEvent, REVIEW_DEFAULT, REVIEW_INTERVALS, DAY_MS, reviewKey, reviewHistoryStats, reviewOverdue, reviewPolicyOf, reviewPaused, reviewLockState, reviewRunSize, lsDayStats, lsGetProgress, lsSaveProgress, lsInitProgress, lsPercent, lsGrade, lsRunPacing, lsPickWord, WORKING_SET, ACTIVE_POOL_SIZE, WORD_OF_DAY_BOOST, openPoolKeys, lsClaimWordOfDay, REVIEW6_INTERVALS, due6, countDue6, answersSinceReview, markPromoted, generateSentences, AUTO_RUN_MIN_WORDS, autoRunWordsFor, autoRunName, syncAutoRun, scopeUsesAutoRuns, syncAutoRunsForScope, saveChapterWords, saveChapterSentences, lsPctSeries, lsDeltaSince, lsAnswersSince, lsLearnedInRange };
