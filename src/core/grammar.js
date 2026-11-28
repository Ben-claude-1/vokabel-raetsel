import { sbGet, sbPatch, sbPost } from './api.js';
import { shuffle, shuffleArr } from './util.js';
import { normWordKey, safeWords } from './words.js';

var GRAMMAR_KEYS = { sp:'grammar_exercises_sp', pp:'grammar_exercises_pp', sa:'grammar_exercises_sa', mv:'grammar_exercises_mv', mm:'grammar_exercises_mm', lf:'grammar_exercises_lf', gf:'grammar_exercises_gf', cmp:'grammar_exercises_cmp' };

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

// ── Satzprüfung ────────────────────────────────────────────────────────────
// Feste Regeln, die jeder Übungssatz erfüllen muss. Sätze mit Befund werden den
// Kindern nie gezeigt (loadGrammarPool filtert sie) und bei der KI-Generierung
// gar nicht erst gespeichert. Ergänzt die KI-Gegenprüfung (aiReviewQuestions).
var RULE_TOPIC = {'Simple Present':'sp','Present Progressive':'pp','some/any':'sa','modal verbs':'mv','much/many':'mm','a little/a few':'lf','going to':'gf','comparatives':'cmp'};
var PAST_IRREG = ['went','ate','drank','wrote','ran','sang','swam','bought','sold','taught','did','had','was','were','made','took','came','saw','gave','got','said','told','found','thought','met','left','slept','sat','stood','wore','drove','rode','flew','began','broke','chose','forgot','knew','lost','paid','spoke','won','woke','felt','kept','brought','caught','fell','built','sent','spent','understood','drew','grew','threw','hid','fed','held','heard','led','meant','sent','shut','sold','stole','swept','tore','wept'];
var HABIT_RE = /\b(every|always|usually|often|sometimes|never|normally|generally|rarely|seldom|each (day|week|morning|evening|night|year|summer|winter)|once a|twice a|three times a|on (mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays|weekends)|at (the )?weekends?|in the (morning|evening|afternoon)s?)\b/i;
var NOW_RE = /\b(now|right now|at the moment|at present|currently|look!?|listen!?|this (minute|second))\b/i;
var PP_NOW_RE = /\b(right now|just now|at the moment|at present|currently|look!|listen!|this (minute|second))|^(look|listen|hurry|quiet|shh|be quiet|slow down)\b/i;
var FUTURE_RE =/\b(tomorrow|tonight|next|soon|later|this (evening|afternoon|weekend|summer|winter|autumn|spring|year|month|week|friday|saturday|sunday|monday|tuesday|wednesday|thursday)|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in (the future|\w+ (minutes?|hours?|days?|weeks?|months?|years?))|at the weekend|when \w+ grows? up)\b/i;
var PROG_RE = /^(am|is|are|'m|'s|'re)( not)? [a-z]+ing$|^(isn't|aren't) [a-z]+ing$/i;
var BOTH_CMP = ['common','polite','simple','narrow','quiet','clever','gentle','friendly','likely','unlikely','lovely','pleasant','handsome','cruel','stupid','shallow','subtle','sincere','remote','tasty','healthy','wealthy','angry','lively','mature','humble','costly','deadly','likely','yellow','hollow','mellow','sour','true'];
var UNCOUNT = ['water','milk','money','time','homework','sugar','juice','bread','rice','information','music','noise','fun','work','food','tea','coffee','snow','rain','cheese','butter','salt','traffic','luggage','furniture','advice','news','space','pasta','soup','honey','flour','oil','meat','fruit','chocolate','sand','air','paper','jam','ice','cream','petrol','gas','energy','electricity','help','luck','patience','courage','love','weather','sleep','exercise','rubbish','spaghetti','popcorn','ketchup','yoghurt','yogurt','lemonade','cola','wood','grass','hair','pepper','sunshine','light','progress','knowledge','equipment','fuel','garlic','toast','cake','pizza'];

function stripHint(s){ return (s||'').replace(/\s*\([^)]*\)\s*$/,'').trim(); }
function wordsOf(s){ return (s||'').toLowerCase().replace(/[^a-z' ]+/g,' ').split(/\s+/).filter(Boolean); }

function validateGrammarQuestion(q, topic) {
  var p=[];
  if(!q||typeof q.sentence!=='string'||!q.sentence.trim()) return ['Satz fehlt'];
  if(typeof q.answer!=='string'||!q.answer.trim()) return ['Lösung fehlt'];
  topic=topic||RULE_TOPIC[q.rule]||'';
  var s=q.sentence, ans=q.answer.trim(), al=ans.toLowerCase();
  var gaps=s.split('___').length-1;
  if(gaps!==1) p.push('Satz braucht genau eine Lücke ___ (hat '+gaps+')');
  var dist=(q.distractors||[]).map(function(d){return String(d||'').trim();}).filter(Boolean);
  var dl=dist.map(function(d){return d.toLowerCase();});
  if(dl.indexOf(al)>=0) p.push('Lösung steht auch unter den falschen Antworten');
  if(new Set(dl).size!==dl.length) p.push('falsche Antworten doppelt');
  var body=stripHint(s);
  var filled=body.replace('___',ans);
  var fw=wordsOf(filled);
  for(var i=1;i<fw.length;i++){ if(fw[i]===fw[i-1]&&fw[i]!=='that'&&fw[i]!=='had'){ p.push('doppeltes Wort nach dem Einsetzen: "'+fw[i]+' '+fw[i]+'"'); break; } }
  var after=wordsOf(body.split('___')[1]||'');
  var next=after[0]||'';
  var bodyNoGap=body.replace('___',' ');
  var isQ=/\?\s*$/.test(body);
  var neg=/\b(not|never|no|nobody|nothing|without|hardly)\b|n't\b/i.test(bodyNoGap);

  if(topic==='sp'){
    if(!HABIT_RE.test(bodyNoGap)) p.push('Simple Present ohne Signalwort für Gewohnheit (every day, always, usually …)');
    if(NOW_RE.test(bodyNoGap)) p.push('Simple Present mit "jetzt"-Signal (now, at the moment) – passt zum Present Progressive');
    if(FUTURE_RE.test(bodyNoGap)) p.push('Simple Present mit Zukunftsangabe');
    dl.forEach(function(d){
      var lw=d.split(' ').pop();
      if((/ed$/.test(lw)&&!/eed$/.test(lw))||PAST_IRREG.indexOf(lw)>=0) p.push('Ablenker "'+d+'" ist Vergangenheit – könnte ebenfalls passen');
      if(/^will /.test(d)) p.push('Ablenker "'+d+'" (will) könnte ebenfalls passen');
    });
  }
  if(topic==='pp'){
    // bloßes "now" reicht nicht ("She listens to music now" = heutzutage)
    if(!PP_NOW_RE.test(bodyNoGap)) p.push('Present Progressive ohne eindeutiges "gerade jetzt"-Signal (right now, at the moment, Look!, Listen! – "now" allein ist mehrdeutig)');
    if(HABIT_RE.test(bodyNoGap)) p.push('Present Progressive mit Gewohnheits-Signalwort');
    if(FUTURE_RE.test(bodyNoGap)) p.push('Present Progressive mit Zukunftsangabe – mehrdeutig');
    if(!PROG_RE.test(al)&&!/^(am|is|are)( not)? /.test(al)) p.push('Lösung ist keine Present-Progressive-Form');
  }
  if(topic==='gf'){
    if(!/going to/i.test(al)) p.push('Lösung enthält kein "going to"');
    if(!FUTURE_RE.test(bodyNoGap)) p.push('going-to-Satz ohne Zukunftsangabe (tomorrow, next week …)');
    dl.forEach(function(d){
      if(PROG_RE.test(d)&&!/going/.test(d)) p.push('Ablenker "'+d+'" (Present Progressive) wäre mit Zukunftsangabe auch richtig');
      if(/^will /.test(d)||/^'ll /.test(d)) p.push('Ablenker "'+d+'" (will) wäre auch richtig');
    });
  }
  if(topic==='cmp'){
    if(!/\bthan\b/i.test(body)) p.push('Steigerungssatz ohne "than"');
    var irr=['better','worse','further','farther','less','more'];
    if(!/er$/.test(al)&&!/^(more|less) /.test(al)&&irr.indexOf(al)<0) p.push('Lösung ist keine Komparativform');
    var hint=(s.match(/\(([^)]*)\)\s*$/)||[])[1]||'';
    var base=hint.trim().toLowerCase();
    if(base&&BOTH_CMP.indexOf(base)>=0){
      dl.forEach(function(d){
        if(d==='more '+base||(/^more /.test(al)&&/er$/.test(d)&&d.indexOf(base.replace(/y$/,'i').replace(/e$/,''))===0)) p.push('Ablenker "'+d+'" ist bei "'+base+'" ebenfalls erlaubt');
      });
    }
    dl.forEach(function(d){ if(d===al.replace(/^the /,'')) p.push('Ablenker gleich Lösung'); });
  }
  if(topic==='sa'){
    if(al!=='some'&&al!=='any') p.push('Lösung muss some oder any sein');
    if(isPolitenessQuestion(s)) p.push('Höflichkeitsfrage – widerspricht der Schulregel');
    var cond=/\bif\b/i.test(bodyNoGap);
    if(al==='some'&&(isQ||neg)) p.push('"some" in Frage/Verneinung – Schulregel verlangt "any"');
    if(al==='any'&&!isQ&&!neg&&!cond) p.push('"any" in positivem Aussagesatz – Schulregel verlangt "some"');
  }
  if(topic==='mm'||topic==='lf'){
    var opts=topic==='mm'?['much','many']:['a little','a few'];
    if(opts.indexOf(al)<0) p.push('Lösung muss '+opts.join(' oder ')+' sein');
    var noun=next;
    if(noun&&/^(of|more|than|too)$/.test(noun)) noun='';
    if(noun){
      var unc=UNCOUNT.indexOf(noun)>=0;
      var plural=/s$/.test(noun)&&!unc&&!/(ss|us|is)$/.test(noun);
      var countAns=al==='many'||al==='a few';
      if(unc&&countAns) p.push('"'+noun+'" ist nicht zählbar – "'+ans+'" falsch');
      if(plural&&!countAns) p.push('"'+noun+'" ist Plural/zählbar – "'+ans+'" falsch');
    }
  }
  if(topic==='mv'){
    if(MODAL_OPTS.indexOf(al)<0) p.push('Lösung ist keins der 6 Modalverben');
    (q.acceptable_answers||[]).forEach(function(a){ if(MODAL_OPTS.indexOf(String(a).toLowerCase())<0) p.push('"'+a+'" ist kein erlaubtes Modalverb'); });
  }
  return p;
}

function loadGrammarPoolRaw(topic) {
  return sbGet('settings','key=eq.'+GRAMMAR_KEYS[topic]).then(function(d){
    if(d&&d[0]){ try{ return JSON.parse(d[0].value)||[]; }catch(e){ return []; } }
    return [];
  });
}

// Für Spiel und Klassenarbeit: nur Sätze, die die Prüfung bestehen und nicht von
// der KI-Gegenprüfung als fehlerhaft markiert wurden (q.review.ok===false).
function loadGrammarPool(topic) {
  return loadGrammarPoolRaw(topic).then(function(pool){
    return pool.filter(function(q){
      if(q.review&&q.review.ok===false) return false;
      return validateGrammarQuestion(q, topic).length===0;
    });
  }).catch(function(){ return []; });
}

// KI-Gegenprüfung: ein zweites Modell kontrolliert jeden Satz unabhängig von der
// Generierung. Liefert je Satz {ok, problem}. Strukturierte Ausgabe per JSON-Schema.
var REVIEW_MODEL='claude-opus-5-5';
function aiReviewQuestions(key, topic, questions) {
  if(!questions.length) return Promise.resolve([]);
  var label=KA_TOPIC_LABELS[topic]||topic;
  var items=questions.map(function(q,i){
    return {i:i,sentence:q.sentence,answer:q.answer,acceptable_answers:q.acceptable_answers||undefined,wrong_options:(topic==='sa'?['some','any']:topic==='mm'?['much','many']:topic==='lf'?['a little','a few']:topic==='mv'?MODAL_OPTS:(q.distractors||[])).filter(function(d){return String(d).toLowerCase()!==String(q.answer).toLowerCase()&&(q.acceptable_answers||[]).map(function(a){return String(a).toLowerCase();}).indexOf(String(d).toLowerCase())<0;})};
  });
  var schoolRule = topic==='sa' ? ' Für some/any gilt die einfache Schulregel der 6. Klasse: "some" in positiven Aussagesätzen, "any" in Fragen und Verneinungen.'
    : topic==='mm' ? ' Für much/many: "many" bei zählbaren, "much" bei nicht zählbaren Nomen.'
    : topic==='lf' ? ' Für a little/a few: "a few" bei zählbaren Nomen im Plural, "a little" bei nicht zählbaren.'
    : '';
  var prompt='Du prüfst Lückentext-Aufgaben (Englisch, 6. Klasse, Thema: '+label+') für ein Lernspiel. Ein Kind sieht den Satz mit der Lücke ___ und wählt aus der Lösung plus den falschen Optionen (wrong_options); später tippt es die Lösung auch frei ein.'+schoolRule+
    '\n\nEine Aufgabe ist nur dann ok, wenn ALLES zutrifft:\n1. Der Satz mit eingesetzter Lösung ist grammatisch korrekt und natürliches Englisch.\n2. Keine der falschen Optionen ergibt eingesetzt einen ebenfalls korrekten Satz (auch nicht mit anderer Bedeutung oder anderer Zeitform).\n3. Der Satz ist eindeutig: Ein Kind, das die Regel des Themas kennt, kann die Lösung sicher bestimmen; der Hinweis in Klammern passt zur Lösung.\n4. Lösung und Übersetzung passen zusammen, keine Tippfehler.\n\nSei streng: Im Zweifel ok=false. Schreibe bei ok=false in "problem" kurz auf Deutsch, was falsch ist und wie der Satz eindeutig würde. Bei ok=true bleibt "problem" leer.\n\nAufgaben:\n'+JSON.stringify(items);
  var schema={type:'object',properties:{results:{type:'array',items:{type:'object',properties:{i:{type:'integer'},ok:{type:'boolean'},problem:{type:'string'}},required:['i','ok','problem'],additionalProperties:false}}},required:['results'],additionalProperties:false};
  return fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:REVIEW_MODEL,max_tokens:16000,output_config:{effort:'high',format:{type:'json_schema',schema:schema}},messages:[{role:'user',content:prompt}]})
  }).then(function(r){ return r.json().then(function(d){ if(!r.ok||d.error) throw new Error((d.error&&d.error.message)||('HTTP '+r.status)); return d; }); })
  .then(function(d){
    if(d.stop_reason==='refusal') throw new Error('KI-Prüfung abgelehnt');
    if(d.stop_reason==='max_tokens') throw new Error('KI-Prüfung abgeschnitten');
    var tb=(d.content||[]).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('');
    var res=JSON.parse(tb).results||[];
    var byI={}; res.forEach(function(x){ byI[x.i]=x; });
    // Fehlt ein Urteil, gilt der Satz als nicht geprüft → nicht ok.
    return questions.map(function(q,i){ var x=byI[i]; return x?{ok:!!x.ok,problem:x.problem||''}:{ok:false,problem:'keine Bewertung erhalten'}; });
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

// lastMap (optional): {rule: {sentence: letzte Antwort richtig?}} — Sätze, die
// zuletzt falsch waren, kommen deutlich öfter dran, damit sie sich ausbügeln lassen.
function grammarPickQuestions(pool, ruleStats, count, lastMap) {
  if(!pool||pool.length===0) return [];
  var weighted=pool.map(function(q){
    var st=ruleStats[q.rule]||{correct:0,total:0};
    var score=st.total>0?st.correct/st.total:0;
    var weight=1+(1-score)*3;
    var lm=lastMap&&lastMap[q.rule];
    if(lm&&lm[q.sentence]===false) weight*=20;
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

var KA_TOPIC_LABELS = {sp:'Simple Present',pp:'Present Progressive',sa:'some / any',mv:'Modalverben',mm:'much / many',lf:'a little / a few',gf:'going to',cmp:'Steigerung'};

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
  // much/many: always exactly 2 options
  if(q.rule==='much/many') return Math.random()<0.5?['much','many']:['many','much'];
  if(q.rule==='a little/a few') return Math.random()<0.5?['a little','a few']:['a few','a little'];
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

export { GRAMMAR_KEYS, MODAL_OPTS, isCorrectAnswer, GRAMMAR_VERBS, kaResultsSave, kaResultsLoad, loadGrammarPool, loadGrammarPoolRaw, validateGrammarQuestion, aiReviewQuestions, saveGrammarPool, grammarPickQuestions, KA_SAETZE, KA_TOPIC_LABELS, kaSentenceMatch, kaGradeFor, buildKaQuestions, buildOptions };
