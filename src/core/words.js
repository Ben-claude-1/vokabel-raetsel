import { sbGet } from './api.js';
import { shuffleArr } from './util.js';

function getWordType(w) {
  var t = (w.type||'').toLowerCase();
  if(t==='verb') return 'verb'; if(t==='noun') return 'noun';
  if(t==='adjective'||t==='adj') return 'adj'; if(t==='phrase') return 'phrase';
  if((w.word||'').toLowerCase().startsWith('to ')) return 'verb';
  var clue=(w.clue||'').toLowerCase();
  if(clue.match(/(en|eln|ern)$/)&&!clue.match(/\s/)) return 'verb';
  if(clue.match(/(lich|ig|isch|sam|haft|los|voll|bar|reich|arm|frei)$/)) return 'adj';
  var word=(w.word||'').toLowerCase().replace(/^to /,'');
  if(word.match(/(ful|less|ous|ive|ent|ant|al|ic|ble|tic|ary|ory)$/)) return 'adj';
  var months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  if(months.indexOf(word)>=0) return 'month';
  return 'noun';
}

function quickDetectType(word, clue) {
  var w = (word||'').trim().toLowerCase();
  var c = (clue||'').trim().toLowerCase();
  if(w.startsWith('to ')) return 'verb';
  if(w.includes(',') || w.includes(';') || c.includes(',') || c.includes(';')) return 'phrase';
  if(w.split(' ').length >= 3) return 'phrase';
  if(c.match(/^(to\s+\w+|[\w]+en|[\w]+eln|[\w]+ern|[\w]+ieren)$/) && !c.includes(' ')) return 'verb';
  if(c.match(/(lich|ig|isch|sam|haft|los|voll|bar)$/) || w.match(/(ful|less|ous|ive|ent|ant|able|ible|al|ic|tic)$/)) return 'adjective';
  return null; // unknown — needs AI
}

function aiCategorizeWords(words, apiKey) {
  if(!words||!words.length||!apiKey) return Promise.resolve({});
  var list = words.map(function(w,i){ return (i+1)+'. "'+w.word+'" = "'+w.clue+'"'; }).join('\n');
  var prompt = 'Kategorisiere diese englischen Vokabeln. Antworte NUR mit einer JSON-Map {"wort":"typ",...}.\nErlaubte Typen: verb, noun, adjective, phrase, other\nRegeln: Verben beginnen oft mit "to", Phrasen haben mehrere Wörter oder Kommas.\n\n'+list;
  return fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:'claude-haiku-3-5-20241022',max_tokens:1000,messages:[{role:'user',content:prompt}]})
  }).then(function(r){return r.json();}).then(function(d){
    var txt=(d.content||[]).map(function(b){return b.text||'';}).join('').trim().replace(/```json|```/g,'').trim();
    try{ return JSON.parse(txt); }catch(e){ return {}; }
  }).catch(function(){ return {}; });
}

function wordDisplay(w) {
  if(!w) return '';
  var word = w.word||'';
  if(getWordType(w)==='verb' && !word.toLowerCase().startsWith('to ')) return 'to '+word;
  return word;
}

function makeQuizRound(allWords, usedWords, globalWords) {
  var pool = allWords.filter(function(w){ return !usedWords.has(w.word); });
  if (pool.length < 3) pool = allWords;
  var picked = shuffleArr(pool).slice(0, 3);
  var distSrc = (globalWords && globalWords.length >= 4) ? globalWords : allWords;
  return picked.map(function(correct) {
    var cType = getWordType(correct);
    var sameType = distSrc.filter(function(w){ return normWordKey(w.word)!==normWordKey(correct.word) && getWordType(w)===cType; });
    var anyOther = distSrc.filter(function(w){ return normWordKey(w.word)!==normWordKey(correct.word); });
    var pool2 = sameType.length >= 3 ? sameType : anyOther;
    var distractors = shuffleArr(pool2).slice(0,3);
    return { correct: correct, answers: shuffleArr([correct].concat(distractors)), type: 'de2en' };
  });
}

function makeAllRounds(chapters, allChapters) {
  var allWords = [];
  chapters.forEach(function(ch){ safeWords(ch.words).forEach(function(w){ allWords.push(Object.assign({},w,{chapId:ch.id,chapTitle:ch.title,chapColor:ch.color,chapIcon:ch.icon})); }); });
  if (allWords.length < 4) return [];
  var globalWords = null;
  if(allChapters && allChapters !== chapters) {
    globalWords = [];
    allChapters.forEach(function(ch){ safeWords(ch.words).forEach(function(w){ globalWords.push(Object.assign({},w)); }); });
    if(globalWords.length < 4) globalWords = null;
  }
  var rounds = [], used = new Set();
  for (var i = 0; i < 6; i++) {
    var round = makeQuizRound(allWords, used, globalWords);
    round.forEach(function(q){ used.add(q.correct.word); });
    rounds.push(round);
  }
  return rounds;
}

function normalizeAnswer(s) {
  return s.trim().toLowerCase()
    .replace(/^(to|die|der|das|ein|eine|einen|einem|einer|ich|sie|er|es|wir|ihr)\s+/i, '')
    .replace(/[.,!?;:]/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProperNoun(correct) {
  var core = correct.split(/[,;/]+/)[0].trim().replace(/\([^)]*\)/g,'').trim();
  return core.length > 0 && core[0] === core[0].toUpperCase() && core[0] !== core[0].toLowerCase();
}

function wordVariants(raw) {
  var w = raw.trim(), variants = [w];
  var core = w.replace(/\([^)]*\)/g,'').replace(/[()]/g,'').replace(/\s+/g,' ').trim();
  if (core && core!==w) variants.push(core);
  var parts = w.split(/(\([^)]*\))/);
  var optionals = [], base2 = [];
  parts.forEach(function(p){
    if(/^\([^)]*\)$/.test(p)){
      var inner = p.slice(1,-1);
      var opts2 = inner.indexOf(',') >= 0 ? [''].concat(inner.split(',')) : [inner,''];
      optionals.push({pos:base2.length, options:opts2}); base2.push('');
    } else { base2.push(p); }
  });
  function combo2(opts,idx,cur){
    if(idx>=opts.length){
      var v2=base2.slice(); opts.forEach(function(o,i){v2[o.pos]=cur[i];});
      var joined=v2.join('').replace(/\s+/g,' ').trim(); if(joined) variants.push(joined); return;
    }
    opts[idx].options.forEach(function(opt){combo2(opts,idx+1,cur.concat([opt]));});
  }
  if(optionals.length>0&&optionals.length<=3) combo2(optionals,0,[]);
  var seen2={};
  return variants.filter(function(v){if(!v||seen2[v])return false;seen2[v]=1;return true;});
}

function canonAnswer(s){
  if(!s) return '';
  s = String(s).toLowerCase().trim();
  s = s.replace(/\bjdn\.?\b/g,'jemanden').replace(/\bjdm\.?\b/g,'jemandem').replace(/\bjds\.?\b/g,'jemandes');
  s = s.replace(/\betw\.?\b/g,'etwas');
  s = s.replace(/\bsth\.?\b/g,'something').replace(/\bsb\.?\b/g,'somebody');
  s = s.replace(/[.,;:!?„"'»«]/g,'');
  s = s.replace(/\s+/g,' ').trim();
  return s;
}

function stripParens(s){ return String(s||'').replace(/\([^)]*\)/g,'').replace(/[()]/g,'').replace(/\s+/g,' ').trim(); }

// Ein einzelnes Token (durch Leerzeichen begrenzt) mit "/"-Alternativen in
// seine Möglichkeiten auf: "jede/r"→["jede","jeder"], "el/la"→["el","la"],
// "gato/-a"→["gato","gata"] (Bindestrich-Suffix ersetzt die letzte Silbe).
// Enthält das Token Klammern, bleibt es unangetastet — Klammer-Optionalität
// übernimmt wordVariants().
function expandSlashToken(tok){
  if(tok.indexOf('(')>=0 || tok.indexOf(')')>=0 || tok.indexOf('/')<0) return [tok];
  var parts = tok.split('/').map(function(s){return s.trim();}).filter(Boolean);
  if(parts.length<=1) return [tok];
  var base = parts[0], alts = [base];
  for(var i=1;i<parts.length;i++){
    var suf = parts[i];
    if(suf[0]==='-'){
      // "-a" ersetzt die letzte Vokal-Endung ("gato/-a"→"gata"), hängt sich
      // sonst nur an ("profesor/-a"→"profesora", Basis endet auf Konsonant).
      var raw = suf.slice(1);
      var endsVowel = /[aeiouyáéíóúü]$/i.test(base);
      alts.push(raw.length===1 && endsVowel && base.length>1 ? base.slice(0,-1)+raw : base+raw);
    } else {
      if(suf.length<=2 && base.length>=3) alts.push(base+suf); // "jede/r"→"jeder", "ein/e"→"eine"
      if(suf.length>1) alts.push(suf); // auch als eigenständige Alternative, z.B. "der/die"→"die"
    }
  }
  return alts;
}

// Eine ganze Komma-Alternative ("el/la gato/-a") tokenweise expandieren und
// per Kreuzprodukt kombinieren → "el gato","el gata","la gato","la gata".
// Klammerteile (auch mehrwortig, z.B. "(= el/la profe fam.)") bleiben dabei
// als Ganzes unangetastet, damit ein "/" in einer Klammer-Erläuterung nicht
// mit dem eigentlichen Antwort-Slash verwechselt wird.
function expandSlashAlt(alt){
  if(alt.indexOf('/')<0) return [];
  var segments = alt.match(/\([^)]*\)|[^()]+/g) || [alt];
  var combos = [''];
  segments.forEach(function(seg){
    if(seg[0]==='('){ combos = combos.map(function(c){ return c+seg; }); return; }
    var tokens = seg.split(/(\s+)/);
    tokens.forEach(function(tk){
      if(!tk) return;
      var alts = /^\s+$/.test(tk) ? [tk] : expandSlashToken(tk);
      var next = [];
      combos.forEach(function(c){ alts.forEach(function(a){ next.push(c+a); }); });
      if(next.length<=40) combos = next; // Explosion bei vielen Slashes vermeiden
    });
  });
  return combos.filter(function(c){ return c && c!==alt; });
}

// `extra`: zusätzlich akzeptierte, wörtliche Antworten (z.B. vom Admin
// bestätigte Anfechtungen) — werden 1:1 gegen die Eingabe geprüft.
function checkAnswer(typed, correct, extra) {
  if (!typed || !typed.trim()) return 'empty';
  var t = typed.trim();
  var tCan = canonAnswer(t);
  var tCanNS = tCan.replace(/\s+/g,'');
  if (extra && extra.length) {
    for (var ei=0; ei<extra.length; ei++) {
      var eCan = canonAnswer(String(extra[ei]||''));
      if (eCan && (eCan === tCan || eCan.replace(/\s+/g,'') === tCanNS)) return 'correct';
    }
  }
  // Split by comma first (main alternatives), then expand x/y suffix patterns within each
  var mainAlts = !/\([^)]*,[^)]*\)/.test(correct)
    ? correct.split(',').map(function(s){return s.trim();}).filter(Boolean)
    : [correct.trim()];
  var corrects = [];
  mainAlts.forEach(function(alt){
    corrects.push(alt); // die komplette angezeigte Schreibweise ist immer gültig
    corrects = corrects.concat(expandSlashAlt(alt));
  });
  // Falls die Lösung aus mehreren Komma-Alternativen besteht (z.B. "uno, una, un"),
  // auch den kompletten String als gültige Antwort zulassen, nicht nur die Einzelteile.
  if (mainAlts.length > 1) corrects.push(correct.trim());
  function isToVerb(c){ return /^to\s+/i.test(c.trim()); }
  function stripTo(c){ return c.replace(/^to\s+/i,'').trim(); }
  var allVariants = [];
  corrects.forEach(function(c){ allVariants = allVariants.concat(wordVariants(c)); });
  var tStripped = canonAnswer(stripParens(t));
  var tStrippedNS = tStripped.replace(/\s+/g,'');
  for (var i=0;i<allVariants.length;i++) {
    var vCan = canonAnswer(allVariants[i]);
    if (vCan === tCan) return 'correct';
    if (vCan.replace(/\s+/g,'') === tCanNS) return 'correct';
    var vStripped = canonAnswer(stripParens(allVariants[i]));
    if (vStripped && (vStripped === tCan || vStripped === tStripped)) return 'correct';
    if (vStripped && vStripped.replace(/\s+/g,'') === tStrippedNS) return 'correct';
  }
  for (var k=0;k<corrects.length;k++) {
    if (isToVerb(corrects[k])) { if (canonAnswer(stripTo(corrects[k])) === tCan) return 'partial'; }
  }
  return 'wrong';
}

function getWordColor(history) {
  if (!history || history.length===0) return 'new';
  var last = history.slice(-4), correct = last.filter(Boolean).length;
  if (last.length>=4 && correct===4) return 'green';
  if (correct===0) return 'red';
  return 'yellow';
}

function selectWorkoutWords(allWords, progressMap, count) {
  var categorized={red:[],yellow:[],green:[],new:[]};
  allWords.forEach(function(w){
    var hist=progressMap[w.word]||[];
    categorized[getWordColor(hist)].push(w);
  });
  var red=shuffleArr(categorized.red.concat(categorized.new));
  var yellow=shuffleArr(categorized.yellow);
  var green=shuffleArr(categorized.green);
  var nRed=Math.min(Math.ceil(count*0.5), red.length);
  var nYellow=Math.min(Math.ceil(count*0.3), yellow.length);
  var nGreen=Math.min(count-nRed-nYellow, green.length);
  var pool=[].concat(red.slice(0,nRed), yellow.slice(0,nYellow), green.slice(0,nGreen));
  if (pool.length<count) {
    var used=new Set(pool.map(function(w){return w.word;}));
    var rest=shuffleArr(allWords.filter(function(w){return !used.has(w.word);}));
    pool=pool.concat(rest.slice(0,count-pool.length));
  }
  return shuffleArr(pool).slice(0,count);
}

function normWordKey(w) { return (w||'').toLowerCase().trim().replace(/^to\s+/,''); }

function collectRunSentences(progressData, chapters){
  var wordKeys = {};
  [1,2,3,4,5,6].forEach(function(pot){
    (((progressData||{}).pots||{})[pot]||[]).forEach(function(w){
      wordKeys[normWordKey(w.word)] = true;
    });
  });
  var sents = [];
  (chapters||[]).forEach(function(ch){
    (ch.sentences||[]).forEach(function(s){
      if(!s||!s.wordRef||!s.text||!s.translation) return;
      if(wordKeys[normWordKey(s.wordRef)]){
        sents.push({text:s.text, translation:s.translation, wordRef:s.wordRef, chapId:ch.id});
      }
    });
  });
  return sents;
}

function buildT2Layout(word){
  var items = []; var target = '';
  var s = String(word||''); var i = 0;
  while(i < s.length){
    if(s[i] === '('){
      var end = s.indexOf(')', i);
      if(end < 0) end = s.length - 1;
      items.push({type:'static', text: s.slice(i, end+1)});
      i = end + 1;
    } else if(s[i] === ' '){
      items.push({type:'space'});
      target += ' ';
      i++;
    } else {
      items.push({type:'slot', letter: s[i]});
      target += s[i];
      i++;
    }
  }
  // Collapse leading/trailing whitespace items so layout doesn't end with floating gaps
  while(items.length && items[0].type==='space'){ items.shift(); target = target.replace(/^ /,''); }
  while(items.length && items[items.length-1].type==='space'){ items.pop(); target = target.replace(/ $/,''); }
  return { items: items, targetNoSpaces: target.replace(/ /g,'') };
}

function parseWishStructured(wish, chapters){
  var filters = [];
  var conds = [];
  var w = (wish||'').toLowerCase();

  // 1) important / wichtig / fett / bold
  if(/(\bwichtig\w*|\bimportant\b|\bbold\b|\bfett\w*|⭐)/.test(w)){
    filters.push(function(x){ return !!x.important; });
    conds.push('wichtig');
  }

  // 2) Page range: "seite N bis M", "seiten N-M", "von seite N bis M", "s. N – M"
  var pgRange = w.match(/(?:seiten?|s\.|pages?|p\.)\s*(?:von\s*)?(\d+)\s*(?:bis|to|-|–|—)\s*(?:seite\s*)?(\d+)/);
  var pgSingle = null;
  if(pgRange){
    var lo = +pgRange[1], hi = +pgRange[2];
    if(lo>hi){ var t=lo; lo=hi; hi=t; }
    filters.push(function(x){ return typeof x.book_page==='number' && x.book_page>=lo && x.book_page<=hi; });
    conds.push('Seiten '+lo+'–'+hi);
  } else {
    // 3) Single page: "seite N", "auf seite N", "page N", "s. N"
    pgSingle = w.match(/(?:seiten?|s\.|pages?|p\.)\s*(\d+)/);
    if(pgSingle){
      var pg = +pgSingle[1];
      filters.push(function(x){ return x.book_page===pg; });
      conds.push('Seite '+pg);
    }
  }

  // 4) Theme/Kapitel/Chapter N — match leaf chapter or any ancestor
  var themeMatch = w.match(/(theme|kapitel|chapter)\s*(\d+)/);
  if(themeMatch){
    var num = themeMatch[2];
    var pats = ['theme '+num, 'kapitel '+num, 'chapter '+num];
    filters.push(function(x, chs){
      var cur = (chs||[]).find(function(c){ return c.id===x.chapId; });
      var depth = 0;
      while(cur && depth<6){
        var t = (cur.title||'').toLowerCase();
        for(var i=0;i<pats.length;i++){ if(t.indexOf(pats[i])>=0) return true; }
        if(!cur.parent_id) break;
        cur = (chs||[]).find(function(c){ return c.id===cur.parent_id; });
        depth++;
      }
      return false;
    });
    conds.push('Theme '+num);
  }

  // 5) Alphabetical word range: "von WORT_A bis WORT_B"
  // Skip if we already detected a page range OR if the operands look like numbers/seite.
  if(!pgRange){
    var alpha = (wish||'').match(/von\s+([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß'-]*)\s+bis\s+([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß'-]*)/);
    if(alpha){
      var aRaw = alpha[1].trim().toLowerCase();
      var bRaw = alpha[2].trim().toLowerCase();
      var skipWords = {seite:1,seiten:1,page:1,pages:1,kapitel:1,theme:1,chapter:1};
      if(!skipWords[aRaw] && !skipWords[bRaw] && !/^\d+$/.test(aRaw) && !/^\d+$/.test(bRaw)){
        var aLo = aRaw<bRaw?aRaw:bRaw;
        var bHi = aRaw<bRaw?bRaw:aRaw;
        filters.push(function(x){
          var k = (x.word||'').toLowerCase().replace(/^to\s+/,'').trim();
          return k>=aLo && k<=bHi;
        });
        conds.push('Vokabel '+aLo+'–'+bHi);
      }
    }
  }

  return { matched: filters.length>0, filters: filters, description: conds.join(' UND ') };
}

function sortWords(words){ return words.slice().sort(function(a,b){return (a.word||'').toLowerCase().localeCompare((b.word||'').toLowerCase());}); }

function translateSentenceEN2DE(en){
  return sbGet('settings','key=eq.anthropic_key').then(function(d){
    var key = (d&&d[0]&&d[0].value) || localStorage.getItem('claude_api_key') || '';
    if(!key) return Promise.reject(new Error('Kein Anthropic-API-Key hinterlegt'));
    return fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{role:'user', content:'Übersetze diesen englischen Satz präzise und natürlich ins Deutsche. Antworte NUR mit dem deutschen Satz, ohne Anführungszeichen, ohne Erklärungen.\n\n'+en}]
      })
    }).then(function(r){return r.json();}).then(function(j){
      if(j && j.content && j.content[0] && j.content[0].text) return j.content[0].text.trim();
      throw new Error('Keine Übersetzung erhalten');
    });
  });
}

function safeWords(w){if(Array.isArray(w))return w;if(!w)return[];try{return JSON.parse(w)||[];}catch(e){console.error('safeWords parse error',e);return [];}}

function parseData(d){if(d==null)return{};if(typeof d==='object')return d;try{return JSON.parse(d||'{}');}catch(e){return{};}}

export { getWordType, quickDetectType, aiCategorizeWords, wordDisplay, makeQuizRound, makeAllRounds, normalizeAnswer, isProperNoun, wordVariants, canonAnswer, stripParens, checkAnswer, getWordColor, selectWorkoutWords, normWordKey, collectRunSentences, buildT2Layout, parseWishStructured, sortWords, translateSentenceEN2DE, safeWords, parseData };
