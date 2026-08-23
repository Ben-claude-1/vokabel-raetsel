import { sbGet, sbPatch, sbPost } from './api.js';
import { shuffle, shuffleArr } from './util.js';
import { normWordKey, safeWords } from './words.js';

var GRAMMAR_KEYS = { sp:'grammar_exercises_sp', pp:'grammar_exercises_pp', sa:'grammar_exercises_sa', mv:'grammar_exercises_mv' };

var MODAL_OPTS = ['must', "mustn't", 'should', "shouldn't", 'need to', "don't need to"];

function isCorrectAnswer(q, input) {
  var all = (q.acceptable_answers && q.acceptable_answers.length > 0) ? q.acceptable_answers : [q.answer];
  return all.some(function(a){ return a.toLowerCase().trim() === input.toLowerCase().trim(); });
}

var GRAMMAR_VERBS = [
  {word:'to play',clue:'spielen'},{word:'to work',clue:'arbeiten'},
  {word:'to go',clue:'gehen'},{word:'to eat',clue:'essen'},
  {word:'to drink',clue:'trinken'},{word:'to read',clue:'lesen'},
  {word:'to write',clue:'schreiben'},{word:'to run',clue:'laufen'},
  {word:'to sing',clue:'singen'},{word:'to dance',clue:'tanzen'},
  {word:'to cook',clue:'kochen'},{word:'to swim',clue:'schwimmen'},
  {word:'to travel',clue:'reisen'},{word:'to learn',clue:'lernen'},
  {word:'to teach',clue:'lehren, unterrichten'},{word:'to help',clue:'helfen'},
  {word:'to buy',clue:'kaufen'},{word:'to sell',clue:'verkaufen'}
];

function kaResultsSave(result) {
  return sbGet('settings','key=eq.ka_results&select=value').then(function(rows){
    var arr=[];
    if(rows&&rows[0]){try{arr=JSON.parse(rows[0].value);}catch(e){}}
    arr.push(result);
    if(arr.length>500) arr=arr.slice(-500);
    var val=JSON.stringify(arr);
    if(rows&&rows[0]) return sbPatch('settings',{value:val},'key=eq.ka_results');
    return sbPost('settings',{key:'ka_results',value:val});
  });
}

function kaResultsLoad() {
  return sbGet('settings','key=eq.ka_results&select=value').then(function(rows){
    if(rows&&rows[0]){try{return JSON.parse(rows[0].value);}catch(e){}}
    return [];
  });
}

function isPolitenessQuestion(sentence) {
  var s=(sentence||'').toLowerCase().trim();
  return /^(can|could) i (have|borrow|get|take)\b/.test(s) || /^would you like\b/.test(s) || /please\??$/.test(s);
}

function loadGrammarPool(topic) {
  return sbGet('settings','key=eq.'+GRAMMAR_KEYS[topic]).then(function(d){
    if(d&&d[0]){
      try{
        var pool=JSON.parse(d[0].value);
        if(topic==='sa') pool=pool.filter(function(q){ return !isPolitenessQuestion(q.sentence); });
        return pool;
      }catch(e){return [];}
    }
    return [];
  });
}

function saveGrammarPool(topic, pool) {
  var key=GRAMMAR_KEYS[topic];
  return sbGet('settings','key=eq.'+key).then(function(d){
    var val=JSON.stringify(pool);
    if(d&&d[0]) return sbPatch('settings',{value:val},'key=eq.'+key);
    return sbPost('settings',{key:key,value:val});
  });
}

function grammarPickQuestions(pool, ruleStats, count) {
  if(!pool||pool.length===0) return [];
  var weighted=pool.map(function(q){
    var st=ruleStats[q.rule]||{correct:0,total:0};
    var score=st.total>0?st.correct/st.total:0;
    var weight=1+(1-score)*3;
    return Object.assign({},q,{_weight:weight});
  });
  var picked=[], seen=new Set();
  var attempts=0;
  while(picked.length<count&&attempts<count*10){
    attempts++;
    var totalW=weighted.reduce(function(s,q){return s+q._weight;},0);
    var r=Math.random()*totalW, cum=0, sel=weighted[0];
    for(var i=0;i<weighted.length;i++){cum+=weighted[i]._weight;if(cum>=r){sel=weighted[i];break;}}
    if(!seen.has(sel.id)){seen.add(sel.id);picked.push(sel);}
  }
  return shuffle(picked);
}

var KA_SAETZE = [
  {de:'Ein Hund braucht tägliche Pflege: man muss ihn füttern und ihm die Zähne putzen.',en:'A dog needs daily care: you have to feed it and clean its teeth.'},
  {de:'Du solltest deinen Hund regelmäßig waschen, damit er sauber bleibt.',en:'You should wash your dog regularly so that it stays clean.'},
  {de:'Es ist wichtig, mit deinem Hund spazieren zu gehen, damit er genug Bewegung bekommt.',en:'It is important to go for a walk with your dog so it gets enough exercise.'},
  {de:'Sorge immer dafür, dass dein Hund eine Schüssel frisches Wasser hat.',en:'Always make sure your dog has a bowl of fresh water.'},
  {de:'Ein guter Besitzer muss sicherstellen, dass der Hund zum Arzt geht, wenn er krank ist.',en:'A good owner has to make sure that the dog sees a doctor when it is sick.'},
  {de:'Einen Hund zu haben hält dich aktiv, weil du jeden Tag draußen mit ihm rennst und spielst.',en:'Having a dog keeps you active because you run and play outside with it every day.'},
  {de:'Du fühlst dich nie ganz allein, wenn ein Haustier zuhause auf dich wartet.',en:'You never feel completely alone when you have a pet at home waiting for you.'},
  {de:'Einen Hund oder eine Katze zu streicheln hilft dir nach einem langen Schultag, ruhig und weniger gestresst zu sein.',en:'Stroking a cat or a dog helps you feel calm and less stressed after a long day at school.'},
  {de:'Wenn du für ein Haustier sorgst, lernst du verantwortungsbewusst zu sein und an andere zu denken.',en:'When you take care of a pet, you learn to be responsible and to think about others.'},
  {de:'Es ist wichtig, ein Haustier zu haben, weil es dir beibringt, dass jedes Lebewesen Liebe und Aufmerksamkeit braucht.',en:'It is important to have a pet because it teaches you that every living thing needs love and attention.'}
];

var KA_TOPIC_LABELS = {sp:'Simple Present',pp:'Present Progressive',sa:'some / any',mv:'Modalverben'};

function kaSentenceMatch(input, target) {
  function norm(s){return (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();}
  var inp=norm(input).split(/\s+/).filter(Boolean);
  var tgt=norm(target).split(/\s+/).filter(Boolean);
  if(!tgt.length) return false;
  var inpSet={}; inp.forEach(function(w){inpSet[w]=1;});
  var matches=tgt.filter(function(w){return !!inpSet[w];}).length;
  return matches/tgt.length>=0.65;
}

function kaGradeFor(correct, total) {
  var pct=total>0?correct/total:0;
  if(pct>=0.95) return 1; if(pct>=0.85) return 2; if(pct>=0.70) return 3;
  if(pct>=0.55) return 4; if(pct>=0.40) return 5; return 6;
}

function buildKaQuestions(selectedRuns, grammarPool, withSentences) {
  var vocabMap={};
  selectedRuns.forEach(function(run){safeWords(run.words).forEach(function(w){var k=normWordKey(w.word);if(!vocabMap[k])vocabMap[k]=w;});});
  var vocabArr=Object.values(vocabMap);
  // KA_SAETZE sind englische Übersetzungssätze — nur für Englisch beilegen.
  var sentQs=(withSentences===false)?[]:KA_SAETZE.map(function(s){return {kind:'sentence',german:s.de,answer:s.en};});
  var remaining=40;
  var hasV=vocabArr.length>0, hasG=grammarPool.length>0;
  var vQ=hasV&&hasG?20:(hasV?40:0), gQ=hasG&&hasV?20:(hasG?40:0);
  var vocabQs=shuffleArr(vocabArr.slice()).slice(0,Math.min(vQ,vocabArr.length)).map(function(w){return {kind:'vocab',german:w.clue,answer:w.word};});
  var grammarQs=shuffleArr(grammarPool.slice()).slice(0,Math.min(gQ,grammarPool.length)).map(function(q){return {kind:'grammar',sentence:q.sentence,answer:q.answer,acceptable_answers:q.acceptable_answers||[],hint:q.rule||'',german_hint:q.german_hint||''};});
  return shuffleArr(vocabQs.concat(grammarQs).concat(sentQs));
}

function buildOptions(q, pool) {
  // some/any: always exactly 2 options
  if(q.rule==='some/any') return Math.random()<0.5?['some','any']:['any','some'];
  // modal verbs: show all 6 options shuffled
  if(q.rule==='modal verbs') {
    var mo=MODAL_OPTS.slice();
    for(var mi=mo.length-1;mi>0;mi--){var mj=Math.floor(Math.random()*(mi+1));var mt=mo[mi];mo[mi]=mo[mj];mo[mj]=mt;}
    return mo;
  }
  // sp/pp: 4 options = correct + 3 distractors
  var opts = [q.answer];
  var dist = (q.distractors||[]).filter(function(d){ return d&&d.toLowerCase()!==q.answer.toLowerCase(); });
  if(dist.length<3) {
    var poolAnswers = (pool||[]).filter(function(p){ return p.answer&&p.answer.toLowerCase()!==q.answer.toLowerCase(); }).map(function(p){return p.answer;});
    var arr=poolAnswers.slice(); for(var ii=arr.length-1;ii>0;ii--){var jj=Math.floor(Math.random()*(ii+1));var tmp=arr[ii];arr[ii]=arr[jj];arr[jj]=tmp;}
    var seen=new Set([q.answer.toLowerCase()].concat(dist.map(function(d){return d.toLowerCase();})));
    for(var pi=0;pi<arr.length&&dist.length<3;pi++){ if(!seen.has(arr[pi].toLowerCase())){seen.add(arr[pi].toLowerCase());dist.push(arr[pi]);} }
  }
  opts=opts.concat(dist.slice(0,3));
  while(opts.length<4) opts.push('…');
  var o=opts.slice(); for(var oi=o.length-1;oi>0;oi--){var oj=Math.floor(Math.random()*(oi+1));var ot=o[oi];o[oi]=o[oj];o[oj]=ot;}
  return o;
}

export { GRAMMAR_KEYS, MODAL_OPTS, isCorrectAnswer, GRAMMAR_VERBS, kaResultsSave, kaResultsLoad, loadGrammarPool, saveGrammarPool, grammarPickQuestions, KA_SAETZE, KA_TOPIC_LABELS, kaSentenceMatch, kaGradeFor, buildKaQuestions, buildOptions };
