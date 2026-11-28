#!/usr/bin/env node
// Test harness for parseWishStructured against the live local Postgres DB.
// Verifies 100% accuracy on structured wishes (page numbers, important, theme, alpha range).

const fs = require('fs');
const https = require('https');
const path = require('path');

// Load JWT
const jwts = JSON.parse(fs.readFileSync('/Users/ben/.local/etc/vokabel/jwts.json','utf8'));
const SVC = jwts.service_role;
const HOST = 'mac-studio.taild5562c.ts.net';

function fetchChapters(){
  return new Promise(function(resolve, reject){
    const opts = {
      hostname: HOST, port: 443, method: 'GET',
      path: '/rest/v1/chapters?select=id,title,parent_id,words',
      headers: { apikey: SVC, Authorization: 'Bearer '+SVC, Accept: 'application/json' },
    };
    const req = https.request(opts, function(r){
      let buf=''; r.on('data', d=>buf+=d); r.on('end', ()=>{
        try{ resolve(JSON.parse(buf)); } catch(e){ reject(new Error('Bad JSON: '+buf.slice(0,200))); }
      });
    });
    req.on('error', reject); req.end();
  });
}

// --- IDENTICAL COPIES from index.html (kept in sync; if you edit one, edit both) ---
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
  while(items.length && items[0].type==='space'){ items.shift(); target = target.replace(/^ /,''); }
  while(items.length && items[items.length-1].type==='space'){ items.pop(); target = target.replace(/ $/,''); }
  return { items: items, targetNoSpaces: target.replace(/ /g,'') };
}
function wordDisplay(w){
  if(!w) return '';
  var word = w.word||'';
  if((w.type||'').toLowerCase()==='verb' && !word.toLowerCase().startsWith('to ')) return 'to '+word;
  return word;
}
// checkAnswer + helpers (mirrored from index.html for testing pots 3-5 acceptance)
function wordVariants(raw) {
  var w = raw.trim(), variants = [w];
  var core = w.replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();
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
function stripParens(s){ return String(s||'').replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim(); }
// Notenschlüssel für 10 Vokabeln — mirrored from index.html (LeitersSpielSession.testGradeFor)
function testGradeFor(errors){
  if(errors<=0) return 1;
  if(errors<=1) return 2;
  if(errors<=2) return 3;
  if(errors<=4) return 4;
  if(errors<=6) return 5;
  return 6;
}
// Gewichtete Test-Auswahl mit Vokabeln + Sätzen — mirrored from index.html (LeitersSpielSession.pickTestItems)
function pickTestItems(d, sentences, count, rng){
  rng = rng || Math.random;
  var pool = [];
  [1,2,3,4,5,6].forEach(function(pot){
    (d.pots[pot]||[]).forEach(function(w){
      pool.push({item:Object.assign({},w,{pot:pot,kind:'word'}), weight:1+0.2*Math.max(0,(w.wrong||0)-(w.correct||0))});
    });
  });
  (sentences||[]).forEach(function(s){
    pool.push({item:Object.assign({},s,{kind:'sentence'}), weight:1});
  });
  var n = Math.min(count, pool.length);
  var picked = [];
  for(var i=0;i<n;i++){
    var totalW = pool.reduce(function(s,x){return s+x.weight;},0);
    var r = rng()*totalW, cum = 0, selIdx = 0;
    for(var j=0;j<pool.length;j++){
      cum += pool[j].weight;
      if(cum >= r){ selIdx = j; break; }
    }
    picked.push(pool[selIdx].item);
    pool.splice(selIdx,1);
  }
  return picked;
}
function normWordKey(w){ return (w||'').toLowerCase().trim().replace(/^to\s+/,''); }
// Sammelt alle Sätze aus den Kapiteln, deren wordRef einer Vokabel im aktuellen Run entspricht.
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
function checkAnswer(typed, correct) {
  if (!typed || !typed.trim()) return 'empty';
  var t = typed.trim();
  var tCan = canonAnswer(t);
  var tCanNS = tCan.replace(/\s+/g,'');
  var corrects = correct.split(/[\/]+/).map(function(s){ return s.trim(); }).filter(Boolean);
  if(corrects.length===1&&corrects[0].indexOf(',')>=0&&!/\([^)]*,[^)]*\)/.test(corrects[0])){
    corrects=corrects[0].split(',').map(function(s){return s.trim();}).filter(Boolean);
  }
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
function parseWishStructured(wish, chapters){
  var filters = [];
  var conds = [];
  var w = (wish||'').toLowerCase();
  if(/(\bwichtig\w*|\bimportant\b|\bbold\b|\bfett\w*|⭐)/.test(w)){
    filters.push(function(x){ return !!x.important; });
    conds.push('wichtig');
  }
  var pgRange = w.match(/(?:seiten?|s\.|pages?|p\.)\s*(?:von\s*)?(\d+)\s*(?:bis|to|-|–|—)\s*(?:seite\s*)?(\d+)/);
  var pgSingle = null;
  if(pgRange){
    var lo = +pgRange[1], hi = +pgRange[2];
    if(lo>hi){ var t=lo; lo=hi; hi=t; }
    filters.push(function(x){ return typeof x.book_page==='number' && x.book_page>=lo && x.book_page<=hi; });
    conds.push('Seiten '+lo+'–'+hi);
  } else {
    pgSingle = w.match(/(?:seiten?|s\.|pages?|p\.)\s*(\d+)/);
    if(pgSingle){
      var pg = +pgSingle[1];
      filters.push(function(x){ return x.book_page===pg; });
      conds.push('Seite '+pg);
    }
  }
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
// --- END COPY ---

function buildAllWords(chapters){
  var out = [];
  chapters.forEach(function(c){
    if(!c.parent_id) return; // mirror frontend filter
    var ws = c.words;
    if(typeof ws === 'string') { try { ws = JSON.parse(ws); } catch(e){ ws=[]; } }
    (ws||[]).forEach(function(w){
      out.push(Object.assign({}, w, { chapId: c.id, chapTitle: c.title }));
    });
  });
  return out;
}

function applyFilters(allWords, det, chapters){
  return allWords.filter(function(w){
    return det.filters.every(function(f){ return f(w, chapters); });
  });
}

(async function(){
  console.log('Loading chapters from local PG via PostgREST…');
  const chapters = await fetchChapters();
  const allWords = buildAllWords(chapters);
  console.log('Total chapters: '+chapters.length+'  Total words: '+allWords.length);

  // Compute ground-truth sets
  const byPage = {};
  allWords.forEach(function(w){
    if(typeof w.book_page === 'number'){
      if(!byPage[w.book_page]) byPage[w.book_page] = [];
      byPage[w.book_page].push(w);
    }
  });
  const importantAll = allWords.filter(w=>w.important);

  // Choose a sample page that has both important and non-important entries
  const pagesSorted = Object.keys(byPage).map(Number).sort((a,b)=>a-b);
  const samplePage = pagesSorted.find(p => byPage[p].some(w=>w.important) && byPage[p].some(w=>!w.important)) || pagesSorted[0];
  const importantOnPage = byPage[samplePage].filter(w=>w.important);

  const tests = [
    {
      wish: 'Seite '+samplePage,
      expect: byPage[samplePage].slice(),
    },
    {
      wish: 'wichtige Vokabeln von Seite '+samplePage,
      expect: importantOnPage,
    },
    {
      wish: 'Wichtige Vokabeln von Seite '+samplePage,
      expect: importantOnPage,
    },
    {
      wish: 'wichtig',
      expect: importantAll,
    },
    {
      wish: 'Seiten '+samplePage+' bis '+(samplePage+2),
      expect: allWords.filter(w => typeof w.book_page==='number' && w.book_page>=samplePage && w.book_page<=samplePage+2),
    },
    {
      wish: 'von Seite '+samplePage+' bis '+(samplePage+2),
      expect: allWords.filter(w => typeof w.book_page==='number' && w.book_page>=samplePage && w.book_page<=samplePage+2),
    },
    {
      wish: 'wichtige aus Theme 5',
      expect: allWords.filter(function(w){
        if(!w.important) return false;
        var cur = chapters.find(c=>c.id===w.chapId);
        var depth=0;
        while(cur && depth<6){
          var t = (cur.title||'').toLowerCase();
          if(t.indexOf('theme 5')>=0 || t.indexOf('kapitel 5')>=0) return true;
          if(!cur.parent_id) break;
          cur = chapters.find(c=>c.id===cur.parent_id);
          depth++;
        }
        return false;
      }),
    },
    {
      wish: 'S. '+samplePage,
      expect: byPage[samplePage].slice(),
    },
  ];

  let allPassed = true;
  for(const t of tests){
    const det = parseWishStructured(t.wish, chapters);
    if(!det.matched){
      console.log('FAIL [no match]: "'+t.wish+'" — parser did not detect any pattern');
      allPassed = false; continue;
    }
    const got = applyFilters(allWords, det, chapters);
    const expectKeys = new Set(t.expect.map(w => (w.word||'').toLowerCase()+'|'+w.chapId));
    const gotKeys    = new Set(got.map(w        => (w.word||'').toLowerCase()+'|'+w.chapId));
    const missing = [...expectKeys].filter(k=>!gotKeys.has(k));
    const extra   = [...gotKeys].filter(k=>!expectKeys.has(k));
    if(missing.length===0 && extra.length===0){
      console.log('PASS  ['+got.length+']: "'+t.wish+'"  ('+det.description+')');
    } else {
      console.log('FAIL  exp='+t.expect.length+' got='+got.length+' miss='+missing.length+' extra='+extra.length+': "'+t.wish+'"');
      if(missing.length) console.log('  missing:', missing.slice(0,8));
      if(extra.length)   console.log('  extra:  ', extra.slice(0,8));
      allPassed = false;
    }
  }

  // Negative test: completely unstructured wish must NOT match (should fall back to LLM)
  const noMatchWish = 'Vokabeln über Tiere und Hobbys';
  const noMatchDet = parseWishStructured(noMatchWish, chapters);
  if(noMatchDet.matched){
    console.log('FAIL [false positive]: "'+noMatchWish+'" → matched='+noMatchDet.description);
    allPassed = false;
  } else {
    console.log('PASS  [no match → LLM fallback]: "'+noMatchWish+'"');
  }

  // === Topf-2 layout: parens become static labels, target = letters only ===
  console.log('\n--- Topf 2 buildT2Layout (target = letters to type) ---');
  const t2cases = [
    [{word:'fish (pl fish or fishes)',     type:'noun'},     'fish'],
    [{word:'budgie (= budgerigar) (informal)', type:'noun'}, 'budgie'],
    [{word:'open (from ... to ...)',       type:'adjective'},'open'],
    [{word:'air (no pl)',                  type:'noun'},     'air'],
    [{word:'bike (informal)',              type:'noun'},     'bike'],
    [{word:'gym (= gymnastics, pl)',       type:'noun'},     'gym'],
    [{word:'Mr (= Mister)',                type:'other'},    'Mr'],
    [{word:'child (pl children)',          type:'noun'},     'child'],
    [{word:'Bye! (= Goodbye!) (informal)', type:'other'},    'Bye!'],
    [{word:'(in) winter',                  type:'other'},    'winter'],
    [{word:'(magic) wand',                 type:'noun'},     'wand'],
    [{word:'to climb (up)',                type:'verb'},     'toclimb'],
    [{word:'to wait (for)',                type:'verb'},     'towait'],
    [{word:'capital (city)',               type:'noun'},     'capital'],
    [{word:'a lot (of)',                   type:'other'},    'alot'],
    [{word:'to be upset (about sth)',      type:'verb'},     'tobeupset'],
    [{word:'horse',                        type:'noun'},     'horse'],
    [{word:'sing',                         type:'verb'},     'tosing'],
  ];
  for(const [w,exp] of t2cases){
    const layout = buildT2Layout(wordDisplay(w));
    const got = layout.targetNoSpaces;
    if(got===exp) console.log('PASS  '+JSON.stringify(w.word)+' → tile target = '+JSON.stringify(got));
    else { console.log('FAIL  '+JSON.stringify(w.word)+' → '+JSON.stringify(got)+'   exp='+JSON.stringify(exp)); allPassed=false; }
  }

  // === Töpfe 3-5: typing without parens must always be accepted ===
  console.log('\n--- Töpfe 3-5 checkAnswer (no parens required) ---');
  const p35cases = [
    // [vocab, typed-by-user, expected-result]
    [{word:'fish (pl fish or fishes)', type:'noun'},     'fish',                         'correct'],
    [{word:'budgie (= budgerigar) (informal)', type:'noun'}, 'budgie',                   'correct'],
    [{word:'open (from ... to ...)',   type:'adjective'},'open',                         'correct'],
    [{word:'open (from ... to ...)',   type:'adjective'},'open (from ... to ...)',       'correct'],
    [{word:'air (no pl)',              type:'noun'},     'air',                          'correct'],
    [{word:'(in) winter',              type:'other'},    'winter',                       'correct'],
    [{word:'(in) winter',              type:'other'},    'in winter',                    'correct'],
    [{word:'to climb (up)',            type:'verb'},     'to climb',                     'correct'],
    [{word:'to climb (up)',            type:'verb'},     'to climb up',                  'correct'],
    [{word:'capital (city)',           type:'noun'},     'capital',                      'correct'],
    [{word:'capital (city)',           type:'noun'},     'capital city',                 'correct'],
    [{word:'Mr (= Mister)',            type:'other'},    'Mr',                           'correct'],
    [{word:'child (pl children)',      type:'noun'},     'child',                        'correct'],
    [{word:'Bye! (= Goodbye!) (informal)', type:'other'},'Bye!',                         'correct'],
    [{word:'horse',                    type:'noun'},     'horse',                        'correct'],
    [{word:'horse',                    type:'noun'},     'cow',                          'wrong'],
  ];
  for(const [w, typed, exp] of p35cases){
    const correctAnswer = wordDisplay(w);
    const got = checkAnswer(typed, correctAnswer);
    if(got===exp) console.log('PASS  '+JSON.stringify(w.word)+' typed='+JSON.stringify(typed)+' → '+got);
    else { console.log('FAIL  '+JSON.stringify(w.word)+' typed='+JSON.stringify(typed)+' → '+got+'   exp='+exp); allPassed=false; }
  }

  // === Notenschlüssel für 10-Vokabeln-Test ===
  console.log('\n--- testGradeFor (Notenschlüssel 10 Vokabeln) ---');
  const gradeCases = [
    [0,1],[1,2],[2,3],[3,4],[4,4],[5,5],[6,5],[7,6],[8,6],[9,6],[10,6],
  ];
  for(const [err,expGrade] of gradeCases){
    const got = testGradeFor(err);
    if(got===expGrade) console.log('PASS  '+err+' Fehler → Note '+got);
    else { console.log('FAIL  '+err+' Fehler → Note '+got+'   exp='+expGrade); allPassed=false; }
  }

  // === Gewichtete Test-Wortauswahl (mit Sätzen) ===
  console.log('\n--- pickTestItems (gewichtete Auswahl, ohne Wiederholung) ---');
  // 1) Picks count items, all unique, drawn only from the run.
  const sampleData = { pots: {
    1: [{word:'apple',clue:'Apfel',correct:0,wrong:0}, {word:'banana',clue:'Banane',correct:5,wrong:0}],
    2: [{word:'cherry',clue:'Kirsche',correct:0,wrong:3}],
    3: [{word:'date',clue:'Dattel',correct:1,wrong:1}],
    4: [{word:'elder',clue:'Holunder',correct:0,wrong:5}],
    5: [{word:'fig',clue:'Feige',correct:2,wrong:0}],
    6: [{word:'grape',clue:'Traube',correct:3,wrong:0}],
  }};
  const totalAvail = 7;
  const got = pickTestItems(sampleData, [], 10);
  if(got.length===totalAvail) console.log('PASS  picks min(10,verfügbar): erwartet '+totalAvail+', erhielt '+got.length);
  else { console.log('FAIL  picks min(10,verfügbar): exp '+totalAvail+' got '+got.length); allPassed=false; }
  const seen = {};
  let dup=false;
  got.forEach(w=>{ if(seen[w.word]) dup=true; seen[w.word]=1; });
  if(!dup) console.log('PASS  keine Duplikate');
  else { console.log('FAIL  Duplikate gefunden'); allPassed=false; }
  // every item has kind:'word'
  if(got.every(it=>it.kind==='word')) console.log('PASS  alle items haben kind="word"');
  else { console.log('FAIL  kind-Tag fehlt'); allPassed=false; }

  // 2) With smaller count, returns exactly count.
  const got3 = pickTestItems(sampleData, [], 3);
  if(got3.length===3) console.log('PASS  count=3 → 3 Wörter');
  else { console.log('FAIL  count=3 → '+got3.length); allPassed=false; }

  // 3) Statistical: word with high net wrong (elder: wrong-correct=5 → weight=2.0) appears
  //    significantly more often than baseline (apple: weight=1.0) over many small samples.
  const trials = 4000;
  const counts = {};
  for(let i=0;i<trials;i++){
    const pick = pickTestItems(sampleData, [], 1);
    const w = pick[0].word;
    counts[w] = (counts[w]||0)+1;
  }
  const pElderExp = 0.25, pAppleExp = 0.125;
  const pElder = (counts['elder']||0)/trials;
  const pApple = (counts['apple']||0)/trials;
  const elderOk = Math.abs(pElder-pElderExp) < 0.04;
  const appleOk = Math.abs(pApple-pAppleExp) < 0.04;
  if(elderOk && appleOk && pElder > pApple*1.5){
    console.log('PASS  Gewichtung: p(elder w=2.0)='+pElder.toFixed(3)+' (~'+pElderExp+'), p(apple w=1.0)='+pApple.toFixed(3)+' (~'+pAppleExp+')');
  } else {
    console.log('FAIL  Gewichtung: p(elder)='+pElder.toFixed(3)+' exp~'+pElderExp+', p(apple)='+pApple.toFixed(3)+' exp~'+pAppleExp);
    allPassed=false;
  }

  // 4) Empty data → empty array.
  const emptyGot = pickTestItems({pots:{1:[],2:[],3:[],4:[],5:[],6:[]}}, [], 10);
  if(emptyGot.length===0) console.log('PASS  leerer Run → []');
  else { console.log('FAIL  leerer Run → '+emptyGot.length+' picks'); allPassed=false; }

  // 5) Sätze werden mit ausgewählt und mit kind:'sentence' getaggt.
  const sentSamples = [
    {text:'I eat an apple every day.', translation:'Ich esse jeden Tag einen Apfel.', wordRef:'apple'},
    {text:'The elder bush is in bloom.', translation:'Der Holunderbusch blüht.', wordRef:'elder'},
  ];
  const mixGot = pickTestItems(sampleData, sentSamples, 10);
  if(mixGot.length === totalAvail + sentSamples.length) console.log('PASS  Sätze werden zu Pool hinzugefügt: '+mixGot.length);
  else { console.log('FAIL  exp='+(totalAvail+sentSamples.length)+' got='+mixGot.length); allPassed=false; }
  const sentItems = mixGot.filter(it=>it.kind==='sentence');
  if(sentItems.length===sentSamples.length && sentItems.every(s=>s.text&&s.translation&&s.wordRef)){
    console.log('PASS  '+sentItems.length+' Sätze korrekt getaggt mit text/translation/wordRef');
  } else { console.log('FAIL  Satz-Tagging: '+JSON.stringify(sentItems.slice(0,2))); allPassed=false; }

  // 6) Statistical: bei einem Run mit nur 1 Wort + 1 Satz, beide gleichgewichtet (~50/50).
  const tinyData = {pots:{1:[{word:'foo',clue:'Foo',correct:0,wrong:0}],2:[],3:[],4:[],5:[],6:[]}};
  const tinySents = [{text:'A foo sentence.', translation:'Ein Foo-Satz.', wordRef:'foo'}];
  const tinyTrials = 4000;
  let wordCt = 0, sentCt = 0;
  for(let i=0;i<tinyTrials;i++){
    const it = pickTestItems(tinyData, tinySents, 1)[0];
    if(it.kind==='word') wordCt++; else sentCt++;
  }
  const pWord = wordCt/tinyTrials;
  if(Math.abs(pWord-0.5) < 0.04) console.log('PASS  Wort/Satz Gleichverteilung: p(word)='+pWord.toFixed(3));
  else { console.log('FAIL  p(word)='+pWord.toFixed(3)+' exp~0.5'); allPassed=false; }

  // === collectRunSentences ===
  console.log('\n--- collectRunSentences (Sätze nach wordRef matchen) ---');
  const chapMock = [
    {id:'c1', sentences:[
      {text:'I have an apple.', translation:'Ich habe einen Apfel.', wordRef:'apple'},
      {text:'No translation.', translation:'', wordRef:'apple'}, // ungültig, keine DE
      {text:'No ref.', translation:'Kein Bezug.', wordRef:''}, // ungültig, kein wordRef
    ]},
    {id:'c2', sentences:[
      {text:'Cherries are red.', translation:'Kirschen sind rot.', wordRef:'cherry'},
      {text:'Plums are blue.', translation:'Pflaumen sind blau.', wordRef:'plum'}, // nicht im run
    ]},
    {id:'c3', sentences:null},
  ];
  const collected = collectRunSentences(sampleData, chapMock);
  // Erwartet: apple (1×), cherry (1×). plum nicht im run, Sätze ohne translation/wordRef werden gefiltert.
  if(collected.length===2) console.log('PASS  collectRunSentences findet 2 valide Sätze');
  else { console.log('FAIL  exp=2 got='+collected.length+': '+JSON.stringify(collected)); allPassed=false; }
  const refs = collected.map(s=>s.wordRef).sort();
  if(refs[0]==='apple' && refs[1]==='cherry') console.log('PASS  korrekte wordRefs: '+refs.join(','));
  else { console.log('FAIL  wordRefs: '+refs.join(',')); allPassed=false; }

  // wordRef matching ignoriert "to "-Prefix bei Verben
  const verbData = {pots:{1:[{word:'to play',clue:'spielen',correct:0,wrong:0}],2:[],3:[],4:[],5:[],6:[]}};
  const verbCh = [{id:'cv', sentences:[{text:'I play football.',translation:'Ich spiele Fußball.',wordRef:'play'}]}];
  const verbCol = collectRunSentences(verbData, verbCh);
  if(verbCol.length===1) console.log('PASS  wordRef "play" matched gegen Vokabel "to play"');
  else { console.log('FAIL  to-Prefix matching: '+verbCol.length); allPassed=false; }

  console.log('\n=== '+(allPassed?'ALL TESTS PASSED ✓':'TESTS FAILED ✗')+' ===');
  process.exit(allPassed?0:1);
})().catch(e=>{ console.error('ERROR:', e); process.exit(2); });
