// Reine Prüffunktionen für Grammatiksätze (ohne Abhängigkeiten), damit sie
// sowohl die App als auch scripts/grammar_review.mjs (Nachtlauf) verwenden.

var MODAL_OPTS = ['must', "mustn't", 'should', "shouldn't", 'need to', "don't need to"];

var KA_TOPIC_LABELS = {sp:'Simple Present',pp:'Present Progressive',sa:'some / any',mv:'Modalverben',mm:'much / many',lf:'a little / a few',gf:'going to',cmp:'Steigerung'};

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

// Freigabe ist an den Inhalt gebunden: Wird Satz, Lösung oder ein Ablenker
// geändert, passt sig nicht mehr und der Satz gilt als ungeprüft.
function questionSig(q) {
  var s=JSON.stringify([q.sentence||'',q.answer||'',q.distractors||[],q.acceptable_answers||[]]);
  var h=0x811c9dc5;
  for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; }
  return ('0000000'+h.toString(16)).slice(-8);
}

// Nur geprüfte und bestätigte Sätze werden den Kindern gezeigt.
function isApproved(q, topic) {
  return !!(q&&q.review&&q.review.ok===true&&q.review.sig===questionSig(q)&&validateGrammarQuestion(q,topic).length===0);
}

// Ergebnis von Regeln + KI am Satz vermerken.
function stampReview(q, topic, aiRes) {
  var pr=validateGrammarQuestion(q,topic);
  var ok=!!(aiRes&&aiRes.ok)&&!pr.length;
  q.review={ok:ok,problem:[].concat(pr,aiRes&&!aiRes.ok?[aiRes.problem||'']:[]).filter(Boolean).join('; '),at:new Date().toISOString(),sig:questionSig(q)};
  return ok;
}

export { MODAL_OPTS, KA_TOPIC_LABELS, isPolitenessQuestion, validateGrammarQuestion, aiReviewQuestions, questionSig, isApproved, stampReview };
