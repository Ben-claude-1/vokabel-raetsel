import { safeWords } from './words.js';

var SCOPE_KEY = 'lernapp_scope';

var LANGS = {
  en:{label:'Englisch', flag:'🇬🇧', adj:'Englische', adjN:'Englisches', adjM:'Englischer'},
  es:{label:'Spanisch', flag:'🇪🇸', adj:'Spanische', adjN:'Spanisches', adjM:'Spanischer'},
  fr:{label:'Französisch', flag:'🇫🇷', adj:'Französische', adjN:'Französisches', adjM:'Französischer'},
  la:{label:'Latein', flag:'🏛️', adj:'Lateinische', adjN:'Lateinisches', adjM:'Lateinischer'}
};

function langLabel(l){ return (LANGS[l]||{}).label || (l||'').toUpperCase(); }

// Adjektivform für Fragetexte wie "Übersetze ins ___" / "___ Wort…" / "___ Satz…" —
// sprachneutral, damit z.B. das Leiterspiel bei Spanisch nicht "auf Englisch" fragt.
function langAdj(l){ return (LANGS[l]||{}).adj || LANGS.en.adj; }
function langAdjN(l){ return (LANGS[l]||{}).adjN || LANGS.en.adjN; }
function langAdjM(l){ return (LANGS[l]||{}).adjM || LANGS.en.adjM; }

// Reihenfolge, in der Sprachen abgearbeitet werden — im Wiederholungslauf wird
// nicht zwischen Sprachen hin- und hergesprungen: erst Englisch, dann Spanisch.
var LANG_ORDER = ['en', 'es', 'fr', 'la'];

function langRank(l){ var i = LANG_ORDER.indexOf(l||'en'); return i<0 ? LANG_ORDER.length : i; }

function langFlag(l){ return (LANGS[l]||{}).flag || '🗣️'; }

function chGrade(c){ return c && c.grade != null ? Number(c.grade) : 5; }

function chLang(c){ return (c && c.language) || 'en'; }

function inScope(c, sc){ return !!sc && chGrade(c)===sc.grade && chLang(c)===sc.language; }

function sameScope(a, b){ return !!a && !!b && a.grade===b.grade && a.language===b.language; }

function scopeText(sc){ return sc ? 'Klasse '+sc.grade+' · '+langFlag(sc.language)+' '+langLabel(sc.language) : ''; }

function listScopes(chapters){
  var seen = {}, out = [];
  (chapters||[]).forEach(function(c){
    if(!c.language) return;
    if(safeWords(c.words).length === 0) return;
    var k = chGrade(c)+'|'+chLang(c);
    if(seen[k]) return;
    seen[k] = 1; out.push({grade:chGrade(c), language:chLang(c)});
  });
  out.sort(function(a,b){ return a.grade-b.grade || a.language.localeCompare(b.language); });
  return out;
}

function defaultScope(scopes){
  if(!scopes || !scopes.length) return {grade:6, language:'en'};
  var byPref = scopes.filter(function(s){ return s.grade===6 && s.language==='en'; });
  if(byPref.length) return byPref[0];
  var en = scopes.filter(function(s){ return s.language==='en'; });
  var pool = en.length ? en : scopes;
  return pool[pool.length-1]; // höchste Klasse
}

function loadScope(){
  try{ var s = JSON.parse(localStorage.getItem(SCOPE_KEY)||'null');
    if(s && s.grade && s.language) return {grade:Number(s.grade), language:String(s.language)};
  }catch(e){}
  return null;
}

function saveScope(sc){ try{ localStorage.setItem(SCOPE_KEY, JSON.stringify(sc)); }catch(e){} }

function rootsOf(list){
  var ids = {}; (list||[]).forEach(function(c){ ids[c.id]=1; });
  return (list||[]).filter(function(c){ return !c.parent_id || !ids[c.parent_id]; });
}

function runScope(run, chapters){
  if(run && run.grade != null && run.language) return {grade:Number(run.grade), language:String(run.language)};
  var byId = {}; (chapters||[]).forEach(function(c){ byId[c.id]=c; });
  var counts = {}, best = null, bestN = 0;
  safeWords(run && run.words).forEach(function(w){
    var c = byId[w.chapterId]; if(!c) return;
    var k = chGrade(c)+'|'+chLang(c);
    counts[k] = (counts[k]||0)+1;
    if(counts[k] > bestN){ bestN = counts[k]; best = k; }
  });
  if(best){ var p = best.split('|'); return {grade:Number(p[0]), language:p[1]}; }
  return {grade:5, language:'en'};
}

function naturalIdCmp(a, b){
  var pa = String(a||'').toLowerCase().match(/(\d+|\D+)/g) || [];
  var pb = String(b||'').toLowerCase().match(/(\d+|\D+)/g) || [];
  for(var i=0; i<Math.max(pa.length, pb.length); i++){
    var xa = pa[i], xb = pb[i];
    if(xa===undefined) return -1;
    if(xb===undefined) return 1;
    if(/^\d/.test(xa) && /^\d/.test(xb)){
      var d = parseInt(xa,10) - parseInt(xb,10);
      if(d) return d;
    } else if(xa !== xb) return xa < xb ? -1 : 1;
  }
  return 0;
}

function sortRunsForDisplay(runs, chapters){
  var order = {};
  (chapters||[]).slice().sort(function(a,b){ return naturalIdCmp(a.id, b.id); })
    .forEach(function(c, i){ order[c.id] = i; });
  function idx(r){
    var k = r && r.auto_chapter_id;
    return (k && order[k]!=null) ? order[k] : null;
  }
  return (runs||[]).slice().sort(function(a,b){
    var ia = idx(a), ib = idx(b);
    if(ia!=null && ib!=null) return ia - ib;
    if(ia!=null) return -1;
    if(ib!=null) return 1;
    return String(b.created_at||'').localeCompare(String(a.created_at||''));
  });
}

function filterRunsByScope(runs, chapters, sc){
  if(!sc) return sortRunsForDisplay(runs, chapters);
  return sortRunsForDisplay((runs||[]).filter(function(r){ return sameScope(runScope(r, chapters), sc); }), chapters);
}

export { SCOPE_KEY, LANGS, LANG_ORDER, langLabel, langAdj, langAdjN, langAdjM, langRank, langFlag, chGrade, chLang, inScope, sameScope, scopeText, listScopes, defaultScope, loadScope, saveScope, rootsOf, runScope, naturalIdCmp, sortRunsForDisplay, filterRunsByScope };
