import { sbGet, sbPost } from '../core/api.js';
import { REVIEW_INTERVALS, lsDayEntry, lsGetProgress, lsGetRunsForPlayer, lsPercent, lsSaveProgress, lsToday, reviewHistoryStats, reviewOverdue, reviewPolicyOf, reviewRunSize, tallyAnswer } from '../core/leitner.js';
import { useEffect, useMemo, useRef, useState } from '../core/react.js';
import { langFlag, langLabel, runScope } from '../core/scope.js';
import { BtnStyle, G100, G200, G400, G50, G600, G900, RE, T, TD, TL } from '../core/theme.js';
import { shuffleArr } from '../core/util.js';
import { buildT2Layout, checkAnswer, normWordKey, parseData, wordDisplay } from '../core/words.js';
import { RepeatRunHistory } from './progress.jsx';

function WiederholungWrap(p){ return <div style={{maxWidth:460,margin:'0 auto',padding:'4px 2px'}}>{p.children}</div>; }

// Der Pool ist sprachübergreifend — in der Frage muss deshalb stehen, in welche
// Sprache übersetzt werden soll.
var ZIEL = {en:['Englische','Englisches'], es:['Spanische','Spanisches'],
            fr:['Französische','Französisches'], la:['Lateinische','Lateinisches']};
function zielSprache(l){ return (ZIEL[l]||ZIEL.en)[0]; }
function zielWort(l){ return (ZIEL[l]||ZIEL.en)[1]+' Wort…'; }

function WiederholungMode({ player, chapters, mandatory, policy, onDone, onCompleted }){
  var [phase,setPhase]=useState('loading'); // loading, empty, intro, q, show, done
  var [pool,setPool]=useState([]);
  var [poolNote,setPoolNote]=useState('');
  var [history,setHistory]=useState([]);
  var [items,setItems]=useState([]);
  var [idx,setIdx]=useState(0);
  var [input,setInput]=useState('');
  var [hints,setHints]=useState(0);
  var [result,setResult]=useState(null);
  var [log,setLog]=useState([]);
  var [score,setScore]=useState(0);
  var [showReview,setShowReview]=useState(false);
  var [demoted,setDemoted]=useState(0);
  // Beim Öffnen festhalten: nach dem Lauf ist die Sperre weg, die Ansicht soll
  // aber weiter zeigen, dass es ein Pflichtlauf war (und danach ins Leiterspiel).
  var [wasMandatory] = useState(!!mandatory);
  var pid = player && player.id;
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var inputRef = useRef(null);

  // Sprache gehört in den Schlüssel: der Pool ist sprachübergreifend, und
  // „Hotel → hotel" gibt es auf Englisch wie auf Spanisch.
  function wkey(w, lang){ return (lang||w.lang||'')+'|'+(w.word||'').toLowerCase()+'|'+(w.clue||'').toLowerCase(); }

  useEffect(function(){
    if(!pid || !UUID.test(pid)){ setPhase('empty'); return; }
    Promise.all([
      sbGet('ls_progress','player_id=eq.'+pid+'&select=run_id,data'),
      sbGet('repeat_runs','player_id=eq.'+pid+'&select=*&order=created_at.desc&limit=30'),
      lsGetRunsForPlayer(pid)
    ]).then(function(res){
      var rows = Array.isArray(res[0])?res[0]:[];
      var hist = Array.isArray(res[1])?res[1]:[];
      var allRuns = Array.isArray(res[2])?res[2]:[];
      setHistory(hist);
      // Bewusst NICHT auf die gewählte Klasse/Sprache eingeschränkt: sobald der
      // Umschalter auf Klasse 6 steht, wäre der ganze Klasse-5-Wortschatz aus
      // der Wiederholung verschwunden und würde still verfallen. Stattdessen
      // hängt an jeder Vokabel die Sprache ihres Runs, damit in der Frage steht,
      // in welcher Sprache geantwortet werden soll.
      var runInfo = {};
      allRuns.forEach(function(r){ runInfo[r.id] = runScope(r, chapters||[]); });
      var map6={}, map5={};
      function add(map,w,runId,pot){
        var sc = runInfo[runId] || {};
        var k=wkey(w, sc.language); if(!w.word||!w.clue) return;
        if(!map[k]) map[k]={word:w.word,clue:w.clue,type:w.type,lang:sc.language||'en',grade:sc.grade||null,
          wrong:0,correct:0,src:[],lcMs:0,rl:0};
        map[k].wrong+=(w.wrong||0); map[k].correct+=(w.correct||0);
        map[k].src.push({runId:runId, pot:pot});
        // zuletzt gekonnt + erreichte Wiederholungsstufe zählen als Beleg mit
        var lc = w.lc ? Date.parse(w.lc+'T12:00:00Z') : 0;
        if(lc > map[k].lcMs) map[k].lcMs = lc;
        if((w.rl||0) > map[k].rl) map[k].rl = w.rl||0;
      }
      rows.forEach(function(row){
        if(!runInfo[row.run_id]) return;   // Run gehört nicht (mehr) zu diesem Kind
        var d=parseData(row.data), pots=d.pots||{};
        (pots[6]||[]).forEach(function(w){ add(map6,w,row.run_id,6); });
        (pots[5]||[]).forEach(function(w){ add(map5,w,row.run_id,5); });
      });
      var arr6=Object.keys(map6).map(function(k){return map6[k];});
      var finalPool=arr6, note='';
      if(arr6.length<20){
        var extra=Object.keys(map5).filter(function(k){return !map6[k];}).map(function(k){return map5[k];});
        finalPool=arr6.concat(extra);
        note='Erst '+arr6.length+' Vokabeln vollständig gelernt (Topf 6) — mit fast gelernten (Topf 5) aufgefüllt.';
      }
      setPool(finalPool); setPoolNote(finalPool.length>=20?'':note);
      setPhase(finalPool.length===0?'empty':'intro');
    }).catch(function(){ setPhase('empty'); });
  },[pid, chapters]);

  // Wiederholungsabstand je Vokabel aus der Lauf-Historie (1→3→7→14→30→60 Tage).
  var revStats = useMemo(function(){ return reviewHistoryStats(history); },[history]);
  var pol = reviewPolicyOf(policy);
  // Überfälligkeit je Vokabel: >= 1 heißt „jetzt dran".
  var ranked = useMemo(function(){
    var now = Date.now();
    return (pool||[]).map(function(w){
      return {item:w, over:reviewOverdue(w, revStats, now),
              hard:1 + 0.2*Math.max(0,(w.wrong||0)-(w.correct||0))};
    }).sort(function(a,b){ return (b.over*b.hard) - (a.over*a.hard); });
  },[pool, revStats]);
  var dueCount = useMemo(function(){
    return ranked.filter(function(x){ return x.over>=1; }).length;
  },[ranked]);
  // Was steckt im Pool — sichtbar machen, dass auch die alte Klasse dabei ist.
  var poolNachSprache = useMemo(function(){
    var m = {};
    (pool||[]).forEach(function(w){ var l=w.lang||'en'; m[l]=(m[l]||0)+1; });
    return Object.keys(m).sort().map(function(l){ return {lang:l, n:m[l]}; });
  },[pool]);

  function startRun(){
    // Die am längsten überfälligen zuerst — genau die zeigen, ob es sitzt.
    // Aus den doppelt so vielen Kandidaten wird gemischt, damit nicht jeder
    // Lauf identisch ist.
    var n = Math.min(reviewRunSize(pol, dueCount), ranked.length);
    var head = ranked.slice(0, Math.min(ranked.length, Math.max(n, n*2)));
    var picked = shuffleArr(head).slice(0, n).map(function(x){ return x.item; });
    picked.sort(function(a,b){ return 0; });
    setItems(picked); setIdx(0); setInput(''); setHints(0); setResult(null); setLog([]); setScore(0); setShowReview(false);
    setPhase('q');
  }

  var cur = items[idx];
  var hintData = useMemo(function(){
    var w=(cur&&cur.word)||'';
    var lay=buildT2Layout(w);
    return {dash:lay, scramble:shuffleArr(lay.targetNoSpaces.split(''))};
  },[cur&&cur.word]);

  useEffect(function(){ if(phase==='q'&&inputRef.current){ try{inputRef.current.focus();}catch(e){} } },[phase,idx]);

  function ptsForHints(h){ return h===0?10:h===1?5:0; }

  function submit(){
    if(!cur) return;
    var typed=input.trim(); if(!typed) return;
    var status=checkAnswer(typed, wordDisplay(cur));
    var correct = status==='correct'||status==='partial';
    tallyAnswer(correct);
    var pts = correct ? ptsForHints(hints) : 0;
    var entry={word:cur.word, clue:cur.clue, lang:cur.lang, typed:typed, correct:correct, hints:hints, points:pts, skipped:false};
    setLog(function(l){return l.concat([entry]);});
    setScore(function(s){return s+pts;});
    setResult({correct:correct, points:pts, answer:wordDisplay(cur), typed:typed, hints:hints, skipped:false});
    setPhase('show');
  }
  function giveUp(){
    if(!cur) return;
    var entry={word:cur.word, clue:cur.clue, lang:cur.lang, typed:'', correct:false, hints:hints, points:0, skipped:true};
    setLog(function(l){return l.concat([entry]);});
    setResult({correct:false, points:0, answer:wordDisplay(cur), typed:'', hints:hints, skipped:true});
    setPhase('show');
  }
  function next(){
    var ni=idx+1;
    if(ni>=items.length){ finishRun(); return; }
    setIdx(ni); setInput(''); setHints(0); setResult(null); setPhase('q');
  }
  // Das Ergebnis des Laufs zurück in den Lernstand schreiben. Zwei Richtungen:
  //
  //   verteidigt (ohne Tipp)  → Abstand wächst (rl+1), bleibt „gelernt"
  //   nur mit Tipp 1 gekonnt  → Abstand bleibt stehen, gilt als gesehen
  //   nur mit 2 Tipps gekonnt → zurück in Topf 5
  //   falsch / aufgegeben     → zurück in Topf 4, Abstand auf Anfang
  //
  // Ohne dieses Zurückschreiben wüsste das Leiterspiel nie, was der Lauf schon
  // geprüft hat — die Fälligkeit wäre in beiden Teilen eine andere Zahl.
  function applyRunResult(finalLog){
    var today = lsToday();
    var target = {};
    finalLog.forEach(function(l){
      var entry = pool.find(function(w){ return wkey(w)===wkey(l); });
      if(!entry) return;
      var to = (!l.correct) ? 4 : (l.hints>=2 ? 5 : null);   // null = bleibt liegen
      var lvl = (!l.correct || l.hints>=2) ? 0 : (l.hints>=1 ? (entry.rl||0) : Math.min((entry.rl||0)+1, REVIEW_INTERVALS.length-1));
      (entry.src||[]).forEach(function(ref){
        if(!target[ref.runId]) target[ref.runId] = [];
        target[ref.runId].push({word:l.word, to:to, rl:lvl, ok:!!l.correct});
      });
    });
    var runIds = Object.keys(target);
    if(!runIds.length) return Promise.resolve(0);
    var moved = 0;
    return Promise.all(runIds.map(function(runId){
      return lsGetProgress(pid, runId).then(function(rows){
        if(!Array.isArray(rows)||!rows.length) return;
        var row = rows[0], d = parseData(row.data);
        if(!d || !d.pots) return;
        var demotedHere = 0;
        target[runId].forEach(function(m){
          [4,5,6].forEach(function(p){
            var arr = d.pots[p]||[];
            var i = arr.findIndex(function(w){ return normWordKey(w.word)===normWordKey(m.word); });
            if(i<0) return;
            var w = arr[i];
            // Prüfergebnis am Wort festhalten — davon lebt die Fälligkeit.
            w.rl = m.rl;
            w.ls = today;
            if(m.ok) w.lc = today;
            if(m.to==null || p<=m.to) return;   // bleibt, wo es ist
            arr.splice(i,1);
            w.streak = 0;
            if(!d.pots[m.to]) d.pots[m.to] = [];
            d.pots[m.to].push(w);
            moved++; demotedHere++;
          });
        });
        // Im Tages-Log vermerken, damit der Prozent-Rückgang erklärbar bleibt.
        var day = lsDayEntry(d, lsPercent(d));
        if(demotedHere) day.rv = (day.rv||0) + demotedHere;
        day.p1 = Math.round(lsPercent(d));
        return lsSaveProgress(pid, runId, d, row.id);
      }).catch(function(){});
    })).then(function(){ return moved; });
  }

  function finishRun(){
    setPhase('done');
    if(!pid||!UUID.test(pid)) return;
    var finalLog = log;
    var correctCount=finalLog.filter(function(l){return l.correct;}).length;
    var h1=finalLog.filter(function(l){return l.hints===1;}).length;
    var h2=finalLog.filter(function(l){return l.hints===2;}).length;
    var body={player_id:pid, score:score, max_score:items.length*10, word_count:items.length, correct_count:correctCount, hint1_count:h1, hint2_count:h2, items:finalLog};
    sbPost('repeat_runs',body).then(function(res){
      if(res && !res._err) setHistory(function(h){ return [Object.assign({created_at:new Date().toISOString()},body,res||{})].concat(h); });
      return applyRunResult(finalLog);
    }).then(function(moved){
      setDemoted(moved||0);
      if(onCompleted) onCompleted();
    }).catch(function(){ if(onCompleted) onCompleted(); });
  }

  // ── Render ──
  if(phase==='loading') return <WiederholungWrap><div style={{textAlign:'center',padding:40,color:G400}}>Lade Lernpool…</div></WiederholungWrap>;
  if(phase==='empty') return <WiederholungWrap>
    <div style={{textAlign:'center',padding:30}}>
      <div style={{fontSize:40,marginBottom:10}}>🔁</div>
      <div style={{fontWeight:'bold',fontSize:15,marginBottom:6}}>Noch nichts zum Wiederholen</div>
      <div style={{fontSize:12,color:G600,marginBottom:16}}>Sobald du im Leiterspiel Vokabeln in den „Gelernt"-Topf gebracht hast, kannst du sie hier festigen.</div>
      <button onClick={function(){onDone(wasMandatory);}} style={BtnStyle(G100,G600,{padding:'10px 20px'})}>Zurück</button>
    </div>
  </WiederholungWrap>;

  if(phase==='intro') return <WiederholungWrap>
    <div style={{textAlign:'center',marginBottom:14}}>
      <div style={{fontSize:34}}>🔁</div>
      <div style={{fontWeight:'bold',fontSize:17,color:T}}>{wasMandatory?'Wiederholung fällig':'Wiederholung'}</div>
      <div style={{fontSize:12,color:G600}}>Gelerntes festigen · {Math.min(reviewRunSize(pol,dueCount),pool.length)} Vokabeln in diesem Lauf</div>
    </div>
    {wasMandatory&&<div style={{background:'#fef3c7',color:'#92400e',borderRadius:10,padding:'10px 12px',marginBottom:12,fontSize:12,lineHeight:1.5}}>
      🔒 Das Leiterspiel ist gesperrt, bis du diesen Lauf gemacht hast. Danach geht es sofort weiter.
    </div>}
    <div style={{background:TL,borderRadius:12,padding:'12px 14px',marginBottom:12,fontSize:12,color:TD,lineHeight:1.5}}>
      <div style={{fontWeight:'bold',marginBottom:4}}>So geht's</div>
      Tippe das gesuchte Wort. <b>Ohne Tipp = 10 Punkte</b>, nach Tipp 1 (Länge) noch <b>5</b>, nach Tipp 2 (Buchstaben) <b>0</b>. Dran sind die Vokabeln, die du am längsten nicht mehr sicher konntest. Was du hier <b>nicht</b> kannst, wandert im Leiterspiel zurück und wird nochmal geübt.
    </div>
    {poolNote&&<div style={{background:'#fef3c7',color:'#92400e',borderRadius:8,padding:'8px 10px',fontSize:11,marginBottom:12}}>{poolNote}</div>}
    <div style={{fontSize:11,color:G600,textAlign:'center',marginBottom:14}}>Lernpool: <b>{pool.length}</b> gelernte Vokabeln{dueCount>0&&<span> · <b style={{color:T}}>{dueCount}</b> sind dran 🔔</span>}
      <div style={{fontSize:10,color:G400,marginTop:3}}>aus allen Klassen und Sprachen: {poolNachSprache.map(function(x,i){ return <span key={x.lang}>{i>0?' · ':''}{langFlag(x.lang)} {x.n}</span>; })}</div>
    </div>
    {history.length>0&&<div style={{marginBottom:14}}><RepeatRunHistory runs={history} title="Deine bisherigen Läufe"/></div>}
    <button onClick={startRun} style={BtnStyle(T,'white',{width:'100%',padding:'14px',fontSize:15})}>▶ Lauf starten</button>
    <button onClick={function(){onDone(wasMandatory);}} style={BtnStyle(G100,G600,{width:'100%',padding:'10px',fontSize:12,marginTop:8})}>Zurück</button>
  </WiederholungWrap>;

  if(phase==='q' && cur) return <WiederholungWrap>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:G600,marginBottom:10}}>
      <span>Vokabel {idx+1} / {items.length}</span>
      <span style={{fontWeight:'bold',color:T}}>{score} Punkte</span>
    </div>
    <div style={{height:6,background:G100,borderRadius:3,overflow:'hidden',marginBottom:16}}>
      <div style={{height:'100%',width:Math.round(idx/items.length*100)+'%',background:T,borderRadius:3,transition:'width .3s'}}/>
    </div>
    <div style={{background:'white',borderRadius:14,border:'1px solid '+G200,padding:'18px 16px',marginBottom:12,textAlign:'center'}}>
      <div style={{fontSize:10,color:G400,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Übersetze ins {zielSprache(cur.lang)}</div>
      <div style={{fontSize:11,color:T,fontWeight:'bold',marginBottom:6}}>{langFlag(cur.lang)} {langLabel(cur.lang)}{cur.grade?' · Klasse '+cur.grade:''}</div>
      <div style={{fontSize:24,fontWeight:'bold',color:G900}}>{cur.clue}</div>
      <div style={{fontSize:11,color:hints===0?T:hints===1?'#d97706':RE,marginTop:6,fontWeight:'bold'}}>
        {hints===0?'🏆 10 Punkte möglich':hints===1?'💡 noch 5 Punkte':'💡 0 Punkte (Buchstaben-Hilfe)'}
      </div>
    </div>

    {hints>=1&&<div style={{background:G50,borderRadius:10,padding:'10px',marginBottom:12,textAlign:'center'}}>
      <div style={{fontSize:9,color:G400,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>{hints>=2?'Tipp 2 · Buchstaben':'Tipp 1 · Länge'}</div>
      {hints>=2
        ? <div style={{display:'flex',flexWrap:'wrap',gap:5,justifyContent:'center'}}>
            {hintData.scramble.map(function(l,i){return <span key={i} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:26,height:30,background:'white',border:'1px solid '+G200,borderRadius:6,fontSize:16,fontWeight:'bold',color:T}}>{l.toUpperCase()}</span>;})}
          </div>
        : <div style={{display:'flex',flexWrap:'wrap',gap:4,justifyContent:'center',alignItems:'flex-end'}}>
            {hintData.dash.items.map(function(it,i){
              if(it.type==='space') return <span key={i} style={{width:12}}/>;
              if(it.type==='static') return <span key={i} style={{fontSize:14,color:G600,fontStyle:'italic',margin:'0 2px'}}>{it.text}</span>;
              return <span key={i} style={{width:18,borderBottom:'2px solid '+G400,height:20}}/>;
            })}
          </div>}
    </div>}

    <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
      onKeyDown={function(e){ if(e.key==='Enter'){ e.preventDefault(); submit(); } }}
      placeholder={zielWort(cur.lang)} autoCapitalize="none" autoCorrect="off" spellCheck={false}
      style={{width:'100%',padding:'13px 14px',fontSize:17,border:'2px solid '+G200,borderRadius:10,boxSizing:'border-box',marginBottom:12,outline:'none'}}/>

    <button onClick={submit} disabled={!input.trim()} style={BtnStyle(input.trim()?T:G200,'white',{width:'100%',padding:'13px',fontSize:15,marginBottom:10,cursor:input.trim()?'pointer':'default'})}>Prüfen</button>

    <div style={{display:'flex',gap:8}}>
      {hints<1&&<button onClick={function(){setHints(1);}} style={BtnStyle(G100,'#d97706',{flex:1,padding:'10px',fontSize:12})}>💡 Tipp 1: Länge</button>}
      {hints===1&&<button onClick={function(){setHints(2);}} style={BtnStyle(G100,RE,{flex:1,padding:'10px',fontSize:12})}>💡 Tipp 2: Buchstaben</button>}
      <button onClick={giveUp} style={BtnStyle(G100,G600,{flex:1,padding:'10px',fontSize:12})}>Aufgeben</button>
    </div>
    <button onClick={onDone} style={{width:'100%',border:'none',background:'none',color:G400,fontSize:11,marginTop:14,cursor:'pointer'}}>Lauf abbrechen</button>
  </WiederholungWrap>;

  if(phase==='show' && result) return <WiederholungWrap>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:G600,marginBottom:10}}>
      <span>Vokabel {idx+1} / {items.length}</span>
      <span style={{fontWeight:'bold',color:T}}>{score} Punkte</span>
    </div>
    <div style={{background:result.correct?'#d1fae5':'#fee2e2',borderRadius:14,padding:'20px 16px',marginBottom:14,textAlign:'center'}}>
      <div style={{fontSize:34,marginBottom:6}}>{result.correct?'✅':'❌'}</div>
      <div style={{fontSize:14,fontWeight:'bold',color:result.correct?'#065f46':'#991b1b'}}>
        {result.correct?('Richtig! +'+result.points+' Punkte'):(result.skipped?'Übersprungen':'Leider falsch')}
      </div>
      {!result.correct&&<div style={{fontSize:12,color:'#991b1b',marginTop:8}}>Richtig wäre: <b>{result.answer}</b></div>}
      {!result.correct&&!result.skipped&&result.typed&&<div style={{fontSize:11,color:G600,marginTop:4}}>Deine Eingabe: „{result.typed}"</div>}
      <div style={{fontSize:11,color:G600,marginTop:8}}>{result.clue||cur&&cur.clue}</div>
    </div>
    <button onClick={next} style={BtnStyle(T,'white',{width:'100%',padding:'14px',fontSize:15})}>{idx+1>=items.length?'Ergebnis anzeigen':'Weiter →'}</button>
  </WiederholungWrap>;

  if(phase==='done'){
    var maxScore=items.length*10;
    var correctCount=log.filter(function(l){return l.correct;}).length;
    var pctScore=maxScore?Math.round(score/maxScore*100):0;
    var prevRun = history.filter(function(r){return r.items!==log;})[1]; // vorheriger echter Lauf
    var prevScore = history.length>1 ? (history[1]&&history[1].score) : null;
    var deltaTxt = (typeof prevScore==='number') ? (score>prevScore?('▲ +'+(score-prevScore)+' besser als letztes Mal!'):score<prevScore?('▼ '+(score-prevScore)+' ggü. letztem Lauf'):'± gleich wie letztes Mal') : null;
    return <WiederholungWrap>
      <div style={{textAlign:'center',marginBottom:14}}>
        <div style={{fontSize:36}}>{pctScore>=80?'🏆':pctScore>=50?'👍':'💪'}</div>
        <div style={{fontWeight:'bold',fontSize:15,color:T}}>Lauf beendet!</div>
      </div>
      <div style={{background:'white',borderRadius:14,border:'1px solid '+G200,padding:'16px',marginBottom:12,textAlign:'center'}}>
        <div style={{fontSize:34,fontWeight:'bold',color:T}}>{score} <span style={{fontSize:16,color:G400}}>/ {maxScore}</span></div>
        <div style={{fontSize:12,color:G600,marginTop:4}}>{correctCount} von {items.length} richtig</div>
        {deltaTxt&&<div style={{fontSize:12,fontWeight:'bold',marginTop:8,color:(typeof prevScore==='number'&&score>=prevScore)?T:RE}}>{deltaTxt}</div>}
      </div>
      {wasMandatory&&<div style={{background:TL,color:TD,borderRadius:10,padding:'10px 12px',marginBottom:12,fontSize:12,fontWeight:'bold',textAlign:'center'}}>
        🔓 Leiterspiel ist wieder frei!
      </div>}
      {demoted>0&&<div style={{background:'#fef3c7',color:'#92400e',borderRadius:10,padding:'10px 12px',marginBottom:12,fontSize:11,lineHeight:1.5}}>
        {demoted} Vokabel{demoted===1?' ist':'n sind'} zurück ins Leiterspiel gewandert — die übst du dort nochmal, bis sie wieder sitzen.
      </div>}
      {history.length>0&&<div style={{marginBottom:12}}><RepeatRunHistory runs={history} title="Verlauf"/></div>}
      <button onClick={function(){setShowReview(!showReview);}} style={BtnStyle(G100,G600,{width:'100%',padding:'10px',fontSize:12,marginBottom:8})}>{showReview?'▲ Antworten ausblenden':'📋 Alle Antworten ansehen'}</button>
      {showReview&&<div style={{background:'white',borderRadius:10,border:'1px solid '+G200,overflow:'hidden',marginBottom:12}}>
        {log.map(function(l,i){
          return <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderBottom:i<log.length-1?'1px solid '+G100:'none',fontSize:12}}>
            <span>{l.correct?'✅':'❌'}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:'bold',color:G900}}>{l.word} <span style={{color:G400,fontWeight:'normal'}}>· {l.clue}</span></div>
              {!l.correct&&!l.skipped&&l.typed&&<div style={{fontSize:10,color:RE}}>„{l.typed}"</div>}
            </div>
            <span style={{fontSize:10,color:l.hints>0?'#d97706':G400}}>{l.hints>0?('💡'+l.hints):''}</span>
            <span style={{fontWeight:'bold',color:l.points>0?T:G400,width:28,textAlign:'right'}}>{l.points}</span>
          </div>;
        })}
      </div>}
      <button onClick={startRun} style={BtnStyle(T,'white',{width:'100%',padding:'13px',fontSize:14,marginBottom:8})}>🔁 Nochmal</button>
      <button onClick={function(){onDone(wasMandatory);}} style={BtnStyle(G100,G600,{width:'100%',padding:'11px',fontSize:13})}>Fertig</button>
    </WiederholungWrap>;
  }
  return null;
}

export { WiederholungWrap, WiederholungMode };
