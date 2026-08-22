import { sbGet } from '../core/api.js';
import { logWordEvent, tallyAnswer } from '../core/leitner.js';
import { useEffect, useMemo, useRef, useState } from '../core/react.js';
import { rootsOf } from '../core/scope.js';
import { PROGRESS } from '../core/store.js';
import { AM, BtnStyle, COLOR_BG, COLOR_FG, G100, G200, G400, G50, G600, G900, GR, POT_COL, POT_ICON, POT_LABEL, RE, T, TD, TL } from '../core/theme.js';
import { shuffleArr } from '../core/util.js';
import { checkAnswer, getWordColor, parseData, safeWords, selectWorkoutWords } from '../core/words.js';

function VokabelTrainer({ words, player, onDone, title, game }) {
  var gameKey = game || 'vokabeltrainer';
  var shuffled = useMemo(function(){ return shuffleArr(words); }, []);
  var [idx, setIdx] = useState(0);
  var [input, setInput] = useState('');
  var [result, setResult] = useState(null);
  var [results, setResults] = useState([]);
  var [direction, setDirection] = useState('de2en');
  var inputRef = useRef();
  useEffect(function(){ if(inputRef.current && !result) inputRef.current.focus(); }, [idx, result]);
  var current = shuffled[idx];
  var question = direction==='de2en' ? current.clue : current.word;
  var answer = direction==='de2en' ? current.word : current.clue;
  var qLabel = direction==='de2en' ? 'Englisch eingeben:' : 'Deutsch eingeben:';
  function submit() {
    if (!input.trim() && !result) return;
    if (result) {
      var nextIdx = idx+1;
      if (nextIdx >= shuffled.length) { setResult(null); setIdx(shuffled.length); return; }
      setIdx(nextIdx); setInput(''); setResult(null);
      setTimeout(function(){ if(inputRef.current) inputRef.current.focus(); }, 50);
      return;
    }
    var status = checkAnswer(input, answer);
    var res = {status:status, correct:answer, typed:input, word:current.word, clue:current.clue, chapId:current.chapterId};
    var ok = status==='correct'||status==='partial';
    tallyAnswer(ok);
    logWordEvent(player&&player.id, gameKey, null, current.word, current.clue, ok, null);
    setResult(res); setResults(function(prev){ return prev.concat([res]); });
    if (player && player.id) PROGRESS.set(player.id, current.word, current.clue, current.chapterId, status==='correct');
  }
  if (idx >= shuffled.length) {
    var corr=results.filter(function(r){return r.status==='correct';}).length;
    var part=results.filter(function(r){return r.status==='partial';}).length;
    var wrong=results.filter(function(r){return r.status==='wrong';}).length;
    return (
      <div style={{padding:8}}>
        <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',borderRadius:14,padding:'20px',color:'white',textAlign:'center',marginBottom:14}}>
          <div style={{fontSize:36,marginBottom:6}}>{corr===shuffled.length?'🏆':corr>shuffled.length/2?'👍':'📚'}</div>
          <div style={{fontSize:20,fontWeight:'bold'}}>{corr} richtig · {part} halb · {wrong} falsch</div>
          <div style={{fontSize:12,opacity:.8}}>{shuffled.length} Vokabeln</div>
        </div>
        {results.map(function(r,i){
          var bg=r.status==='correct'?'#d1fae5':r.status==='partial'?'#fef9c3':'#fee2e2';
          var icon=r.status==='correct'?'✓':r.status==='partial'?'~':'✗';
          return (
            <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',marginBottom:3,borderRadius:8,background:bg,fontSize:12}}>
              <span style={{fontSize:16,minWidth:20}}>{icon}</span>
              <span style={{color:G600,minWidth:120}}>{r.clue}</span>
              <span style={{fontWeight:'bold',color:G900,flex:1}}>{r.correct}</span>
              {r.status!=='correct'&&<span style={{color:RE,fontSize:11}}>→ {r.typed}</span>}
            </div>
          );
        })}
        <button onClick={onDone} style={BtnStyle(T,'#fff',{width:'100%',padding:'10px',marginTop:12})}>← Zurück</button>
      </div>
    );
  }
  var resultColor = result ? (result.status==='correct'?GR:result.status==='partial'?AM:RE) : T;
  var resultBg = result ? (result.status==='correct'?'#d1fae5':result.status==='partial'?'#fef9c3':'#fee2e2') : 'white';
  return (
    <div style={{padding:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <div style={{flex:1,height:6,background:G200,borderRadius:3,overflow:'hidden'}}>
          <div style={{height:'100%',width:((idx/shuffled.length)*100)+'%',background:T,borderRadius:3}}/>
        </div>
        <span style={{fontSize:11,color:G400}}>{idx+1}/{shuffled.length}</span>
        <button onClick={function(){setDirection(direction==='de2en'?'en2de':'de2en');setInput('');setResult(null);}}
          style={{fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid '+G200,background:G50,cursor:'pointer',color:G600}}>⇄ Richtung</button>
      </div>
      <div style={{textAlign:'center',padding:'30px 20px',background:resultBg,borderRadius:16,marginBottom:12,border:'2px solid '+(result?resultColor:G200),transition:'all .3s'}}>
        <div style={{fontSize:11,color:G400,marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>{qLabel}</div>
        <div style={{fontSize:28,fontWeight:'bold',color:G900,marginBottom:result?12:0}}>{question}</div>
        {result&&<div style={{fontSize:18,fontWeight:'bold',color:resultColor}}>{result.status==='correct'?'✓ Richtig!':result.status==='partial'?'~ Fast richtig':'✗ Falsch'}</div>}
        {result&&<div style={{fontSize:13,color:G600,marginTop:4}}>Richtig: <strong>{result.correct}</strong>{result.typed&&result.status!=='correct'?'  (du: '+result.typed+')':''}</div>}
      </div>
      {!result&&(
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
            onKeyDown={function(e){if(e.key==='Enter')submit();}}
            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck="false"
            placeholder="Antwort eingeben…"
            style={{flex:1,padding:'12px 14px',fontSize:16,border:'2px solid '+T,borderRadius:8,outline:'none'}}/>
          <button onClick={submit} style={BtnStyle(T,'#fff',{padding:'12px 18px',fontSize:15})}>✓</button>
        </div>
      )}
      {result&&(
        <button onClick={submit} style={BtnStyle(T,'#fff',{width:'100%',padding:'12px',fontSize:15})}>
          {idx+1>=shuffled.length?'📊 Auswertung':'→ Nächste'}
        </button>
      )}
      <button onClick={function(){if(confirm('Abbrechen?'))onDone();}} style={BtnStyle(G100,G600,{width:'100%',marginTop:8,fontSize:12})}>Abbrechen</button>
    </div>
  );
}

function WorkoutSetup({ chapters, player, onStart }) {
  var [count, setCount] = useState(10);
  var [onlyImportant, setOnlyImportant] = useState(true);
  var [progressMap, setProgressMap] = useState({});
  var [loading, setLoading] = useState(true);
  useEffect(function(){
    if(!player) return;
    PROGRESS.getAll(player.id).then(function(map){setProgressMap(map);setLoading(false);});
  },[]);
  var allWords = useMemo(function(){
    var w=[];
    chapters.forEach(function(ch){
      (onlyImportant?safeWords(ch.words).filter(function(x){return x.important;}):ch.words)
        .forEach(function(ww){ w.push(Object.assign({},ww,{chapterId:ch.id,chapTitle:ch.title})); });
    });
    return w;
  },[chapters,onlyImportant]);
  var stats = useMemo(function(){
    var s={green:0,yellow:0,red:0,new:0};
    allWords.forEach(function(w){ var hist=progressMap[w.word]||[]; s[getWordColor(hist)]++; });
    return s;
  },[allWords,progressMap]);
  if(loading) return <div style={{textAlign:'center',padding:40,color:G400}}>Lade Fortschritt…</div>;
  return(
    <div style={{padding:8}}>
      <div style={{background:G50,borderRadius:12,padding:16,marginBottom:14,border:'1px solid '+G200}}>
        <div style={{fontWeight:'bold',fontSize:14,color:G900,marginBottom:10}}>📊 Dein Fortschritt</div>
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
          {[['green','🟢','Grün (sicher)'],['yellow','🟡','Gelb (unsicher)'],['red','🔴','Rot (schwach)'],['new','⬜','Neu']].map(function(x){
            return(
              <div key={x[0]} style={{flex:'1 1 80px',textAlign:'center',padding:'10px 6px',background:COLOR_BG[x[0]],borderRadius:10}}>
                <div style={{fontSize:20,fontWeight:'bold',color:COLOR_FG[x[0]]}}>{stats[x[0]]}</div>
                <div style={{fontSize:10,color:G400}}>{x[2]}</div>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:12,color:G600,padding:'8px 12px',background:'white',borderRadius:8,border:'1px solid '+G200}}>
          🎯 Im Workout: <strong>50% rot/neu</strong> · <strong>30% gelb</strong> · <strong>20% grün</strong>
        </div>
      </div>
      <div style={{marginBottom:14,padding:14,background:'white',borderRadius:12,border:'1px solid '+G200}}>
        <div style={{fontWeight:'bold',fontSize:13,marginBottom:10}}>Einstellungen</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,color:G600,marginBottom:6}}>Anzahl Vokabeln: <strong>{count}</strong></div>
          <div style={{display:'flex',gap:6}}>
            {[5,10,15,20,30].map(function(n){
              return <button key={n} onClick={function(){setCount(n);}} style={{flex:1,padding:'6px',borderRadius:6,border:'2px solid '+(count===n?T:G200),background:count===n?TL:'white',cursor:'pointer',fontWeight:'bold',fontSize:13,color:count===n?T:G600}}>{n}</button>;
            })}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div onClick={function(){setOnlyImportant(!onlyImportant);}} style={{width:22,height:22,borderRadius:6,border:'2px solid '+(onlyImportant?T:G200),background:onlyImportant?T:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            {onlyImportant&&<span style={{color:'white',fontSize:14}}>✓</span>}
          </div>
          <span style={{fontSize:13,color:G600}}>Nur ⭐ fett gedruckte Vokabeln ({allWords.length} verfügbar)</span>
        </div>
      </div>
      {allWords.length < 3 && <div style={{color:RE,fontSize:12,marginBottom:10,textAlign:'center'}}>Zu wenige Vokabeln.</div>}
      <button onClick={function(){
        var selected = selectWorkoutWords(allWords, progressMap, Math.min(count, allWords.length));
        onStart(selected, progressMap);
      }} disabled={allWords.length<3} style={BtnStyle(T,'#fff',{width:'100%',padding:'12px',fontSize:15,opacity:allWords.length<3?0.5:1})}>
        🏋️ Workout starten ({Math.min(count,allWords.length)} Vokabeln)
      </button>
    </div>
  );
}

function WorkoutSession({ words, player, progressMap, onDone }) {
  return <VokabelTrainer words={words} player={player} onDone={onDone} title="🏋️ Workout" game="workout" />;
}

function SentenceLearner({ chapters, player, onDone }) {
  var [selectedCh, setSelectedCh] = useState(null);
  var [idx, setIdx] = useState(0);
  var [input, setInput] = useState('');
  var [result, setResult] = useState(null);
  var [results, setResults] = useState([]);
  var [direction, setDirection] = useState('de2en');
  var inputRef = useRef();
  var chapWithSentences = useMemo(function(){
    return chapters.filter(function(ch){ return ch.sentences && ch.sentences.filter(function(s){return s.important;}).length>0; });
  },[chapters]);
  useEffect(function(){ if(inputRef.current && !result && selectedCh) inputRef.current.focus(); },[idx,result,selectedCh]);
  if(!selectedCh) return(
    <div style={{padding:8}}>
      <p style={{color:G600,fontSize:13,marginBottom:12}}>Wähle ein Kapitel zum Sätze lernen:</p>
      {chapWithSentences.length===0&&<div style={{textAlign:'center',color:G400,padding:20}}>Noch keine Sätze gespeichert.</div>}
      {chapWithSentences.map(function(ch){
        var cnt=ch.sentences.filter(function(s){return s.important;}).length;
        return(
          <button key={ch.id} onClick={function(){setSelectedCh(ch);setIdx(0);setInput('');setResult(null);setResults([]);}}
            style={{display:'block',width:'100%',textAlign:'left',padding:'12px 14px',marginBottom:6,borderRadius:10,border:'2px solid '+ch.color,background:'white',cursor:'pointer'}}>
            <div style={{fontWeight:'bold',color:ch.color}}>{ch.icon} {ch.title}</div>
            <div style={{fontSize:11,color:G400}}>{cnt} fett gedruckte Sätze</div>
          </button>
        );
      })}
    </div>
  );
  var sentences = shuffleArr(selectedCh.sentences.filter(function(s){return s.important;}));
  if(idx>=sentences.length){
    var corr2=results.filter(function(r){return r.status==='correct';}).length;
    return(
      <div style={{padding:8}}>
        <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',borderRadius:14,padding:20,color:'white',textAlign:'center',marginBottom:14}}>
          <div style={{fontSize:32,marginBottom:6}}>{corr2===sentences.length?'🏆':'📚'}</div>
          <div style={{fontSize:18,fontWeight:'bold'}}>{corr2}/{sentences.length} Sätze</div>
        </div>
        {results.map(function(r,i){
          return(
            <div key={i} style={{padding:'8px 10px',marginBottom:4,borderRadius:8,background:r.status==='correct'?'#d1fae5':'#fef9c3',fontSize:12}}>
              <div style={{fontWeight:'bold',color:G900}}>{r.en}</div>
              <div style={{color:G600}}>{r.de}</div>
              {r.status!=='correct'&&<div style={{color:AM,fontSize:11}}>Deine Antwort: {r.typed}</div>}
            </div>
          );
        })}
        <button onClick={onDone} style={BtnStyle(T,'#fff',{width:'100%',padding:'10px',marginTop:12})}>← Zurück</button>
      </div>
    );
  }
  var current = sentences[idx];
  var question = direction==='en2de'?current.text:current.translation;
  var answer = direction==='en2de'?current.translation:current.text;
  function submitSentence(){
    if(!input.trim()&&!result) return;
    if(result){
      if(idx+1>=sentences.length){ setIdx(sentences.length); return; }
      setIdx(function(i){return i+1;}); setInput(''); setResult(null);
      setTimeout(function(){if(inputRef.current)inputRef.current.focus();},50);
      return;
    }
    var status=checkAnswer(input,answer);
    var res={status:status,en:current.text,de:current.translation,typed:input};
    var ok=status==='correct'||status==='partial';
    tallyAnswer(ok);
    logWordEvent(player&&player.id, 'satzmeister', null, current.text, current.translation, ok, null);
    setResult(res); setResults(function(p){return p.concat([res]);});
  }
  return(
    <div style={{padding:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <div style={{flex:1,height:5,background:G200,borderRadius:3,overflow:'hidden'}}>
          <div style={{height:'100%',width:((idx/sentences.length)*100)+'%',background:T,borderRadius:3}}/>
        </div>
        <span style={{fontSize:11,color:G400}}>{idx+1}/{sentences.length}</span>
        <button onClick={function(){setDirection(direction==='en2de'?'de2en':'en2de');setInput('');setResult(null);}}
          style={{fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid '+G200,background:G50,cursor:'pointer',color:G600}}>⇄</button>
      </div>
      <div style={{textAlign:'center',padding:'20px 16px',background:result?(result.status==='correct'?'#d1fae5':'#fef9c3'):'#f8fafc',borderRadius:14,marginBottom:12,border:'2px solid '+(result?(result.status==='correct'?GR:AM):G200)}}>
        <div style={{fontSize:11,color:G400,marginBottom:6}}>Übersetze ins {direction==='en2de'?'Deutsche':'Englische'}:</div>
        <div style={{fontSize:16,fontWeight:'bold',color:G900,lineHeight:1.4}}>{question}</div>
        {result&&<div style={{marginTop:10,fontSize:13,color:result.status==='correct'?T:AM}}><strong>Richtig: </strong>{answer}</div>}
      </div>
      {!result&&(
        <div style={{display:'flex',gap:8,marginBottom:10}}>
          <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
            onKeyDown={function(e){if(e.key==='Enter')submitSentence();}}
            placeholder="Übersetzung…"
            style={{flex:1,padding:'10px 12px',fontSize:14,border:'2px solid '+T,borderRadius:8,outline:'none'}}/>
          <button onClick={submitSentence} style={BtnStyle(T)}>✓</button>
        </div>
      )}
      {result&&<button onClick={submitSentence} style={BtnStyle(T,'#fff',{width:'100%',padding:'10px'})}>{idx+1>=sentences.length?'📊 Fertig':'→ Nächster'}</button>}
    </div>
  );
}

function ProgressStats({ chapters, player, allCategories }) {
  var [learnedSet, setLearnedSet] = useState({});
  var [potMap, setPotMap] = useState({});
  var [loading, setLoading] = useState(true);
  var [expanded, setExpanded] = useState({});
  var [viewMode, setViewMode] = useState('chapters');
  useEffect(function(){
    if(!player) return;
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!UUID.test(player.id)){setLoading(false);return;}
    sbGet('ls_progress','player_id=eq.'+player.id+'&select=data').then(function(rows){
      var learned={}, pots={};
      (Array.isArray(rows)?rows:[]).forEach(function(row){
        var data={}; data=parseData(row.data);
        var p=data.pots||{};
        [1,2,3,4,5,6].forEach(function(pot){
          (p[pot]||[]).forEach(function(w){
            if(!pots[w.word]||pots[w.word]<pot) pots[w.word]=pot;
            if(pot===6) learned[w.word]=true;
          });
        });
      });
      setLearnedSet(learned); setPotMap(pots); setLoading(false);
    }).catch(function(){ setLoading(false); });
  },[]);
  if(loading) return <div style={{textAlign:'center',padding:30,color:G400}}>Lade Leiterspiel-Daten…</div>;
  function toggle(id){setExpanded(function(prev){var n=Object.assign({},prev);n[id]=!n[id];return n;});}
  var topLevel=rootsOf(chapters).slice().sort(function(a,b){return a.id<b.id?-1:1;});
  var allWords=[]; chapters.forEach(function(ch){safeWords(ch.words).forEach(function(w){allWords.push(w);});});
  var totalWords=allWords.length;
  var totalLearned=allWords.filter(function(w){return !!learnedSet[w.word];}).length;
  var overallPct=totalWords>0?Math.round(totalLearned/totalWords*100):0;
  var totalPoints=player.total_score||0;
  var catMap={};
  (allCategories||[]).forEach(function(cat){ catMap[cat.id]={name:cat.name,icon:cat.icon||'🏷',bg:cat.bg||G100,text:cat.text||G600,total:0,learned:0}; });
  allWords.forEach(function(w){
    (w.cats||[]).forEach(function(cid){
      if(!catMap[cid]) catMap[cid]={name:cid,icon:'🏷',bg:G100,text:G600,total:0,learned:0};
      catMap[cid].total++;
      if(learnedSet[w.word]) catMap[cid].learned++;
    });
  });
  var catList=Object.keys(catMap).filter(function(k){return catMap[k].total>0;}).map(function(k){return Object.assign({id:k},catMap[k]);});
  catList.sort(function(a,b){return (b.learned/Math.max(b.total,1))-(a.learned/Math.max(a.total,1));});
  function pctColor(p){return p>=80?GR:p>=50?AM:RE;}
  return(
    <div>
      <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',borderRadius:14,padding:16,color:'white',marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div><div style={{fontSize:28,fontWeight:'bold'}}>{overallPct}%</div><div style={{fontSize:11,opacity:0.8}}>{totalLearned} / {totalWords} Vokabeln gelernt</div></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:28,fontWeight:'bold'}}>{totalPoints} Pkt</div><div style={{fontSize:11,opacity:0.8}}>Gesamt-Punkte</div></div>
        </div>
        <div style={{height:8,background:'rgba(255,255,255,0.25)',borderRadius:4,overflow:'hidden'}}>
          <div style={{height:'100%',width:overallPct+'%',background:'white',borderRadius:4,transition:'width 0.5s'}}/>
        </div>
      </div>
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {[['chapters','📚 Kapitel'],['categories','🏷️ Kategorien']].map(function(tab){
          return <button key={tab[0]} onClick={function(){setViewMode(tab[0]);}}
            style={{flex:1,padding:'7px',borderRadius:8,border:'2px solid '+(viewMode===tab[0]?T:G200),background:viewMode===tab[0]?TL:'white',cursor:'pointer',fontWeight:'bold',fontSize:12,color:viewMode===tab[0]?T:G600,touchAction:'manipulation'}}>
            {tab[1]}
          </button>;
        })}
      </div>
      {viewMode==='chapters'&&(
        <div>
          {topLevel.map(function(kap){
            var children=chapters.filter(function(c){return c.parent_id===kap.id;});
            var kapWords=[]; children.forEach(function(ch){safeWords(ch.words).forEach(function(w){kapWords.push(w);});});
            var kapTotal=kapWords.length;
            var kapLearned=kapWords.filter(function(w){return !!learnedSet[w.word];}).length;
            var kapPct=kapTotal>0?Math.round(kapLearned/kapTotal*100):0;
            var kapOpen=expanded[kap.id];
            return(
              <div key={kap.id} style={{marginBottom:10,border:'2px solid '+(kapOpen?kap.color||T:G200),borderRadius:12,overflow:'hidden'}}>
                <div onClick={function(){toggle(kap.id);}} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 12px',background:kapOpen?(kap.color||T)+'15':'white',cursor:'pointer'}}>
                  <span style={{fontSize:20}}>{kap.icon}</span>
                  <div style={{flex:1}}><div style={{fontWeight:'bold',fontSize:13,color:kap.color||T}}>{kap.title}</div><div style={{fontSize:10,color:G400,marginTop:1}}>{kapLearned}/{kapTotal} Vokabeln gelernt</div></div>
                  <div style={{fontWeight:'bold',fontSize:18,color:pctColor(kapPct),marginRight:4}}>{kapPct}%</div>
                  <span style={{color:G400,fontSize:11}}>{kapOpen?'▲':'▼'}</span>
                </div>
                <div style={{height:5,background:G100}}><div style={{height:'100%',width:kapPct+'%',background:pctColor(kapPct),transition:'width 0.5s'}}/></div>
                {kapOpen&&children.map(function(ch){
                  var chTotal=safeWords(ch.words).length;
                  var chLearned=safeWords(ch.words).filter(function(w){return !!learnedSet[w.word];}).length;
                  var chPct=chTotal>0?Math.round(chLearned/chTotal*100):0;
                  var chOpen=expanded[ch.id];
                  return(
                    <div key={ch.id} style={{borderTop:'1px solid '+G100}}>
                      <div onClick={function(){toggle(ch.id);}} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px 8px 18px',cursor:'pointer',background:chOpen?ch.color+'12':'#fafafa'}}>
                        <span style={{fontSize:15}}>{ch.icon}</span>
                        <div style={{flex:1}}><div style={{fontWeight:'bold',fontSize:12,color:ch.color}}>{ch.title}</div><div style={{fontSize:10,color:G400}}>{chLearned}/{chTotal}</div></div>
                        <div style={{width:50,height:4,background:G200,borderRadius:2,overflow:'hidden',marginRight:6}}><div style={{height:'100%',width:chPct+'%',background:pctColor(chPct)}}/></div>
                        <span style={{fontSize:11,fontWeight:'bold',color:pctColor(chPct),minWidth:32,textAlign:'right'}}>{chPct}%</span>
                        <span style={{color:G400,fontSize:10,marginLeft:4}}>{chOpen?'▲':'▼'}</span>
                      </div>
                      {chOpen&&(
                        <div style={{padding:'4px 8px 8px 24px',background:'#fafafa'}}>
                          {safeWords(ch.words).map(function(w,i){
                            var pot=potMap[w.word]||0;
                            return(
                              <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 6px',borderBottom:'1px solid '+G100,borderRadius:6}}>
                                <span style={{fontSize:13}}>{POT_ICON[pot]}</span>
                                <span style={{fontSize:11,fontWeight:w.important?'bold':'normal',flex:1,color:G900}}>{w.word}</span>
                                <span style={{fontSize:10,color:G400,marginRight:4}}>{w.clue}</span>
                                {pot>0&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:8,background:POT_COL[pot]+'22',color:POT_COL[pot],fontWeight:'bold',whiteSpace:'nowrap'}}>{POT_LABEL[pot]}</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {viewMode==='categories'&&(
        <div>
          {catList.length===0&&<div style={{textAlign:'center',color:G400,padding:20,fontSize:13}}>Noch keine Kategorien zugewiesen.</div>}
          {catList.map(function(cat){
            var pct=cat.total>0?Math.round(cat.learned/cat.total*100):0;
            return(
              <div key={cat.id} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',marginBottom:5,background:'white',borderRadius:10,border:'1px solid '+G200}}>
                <span style={{fontSize:18}}>{cat.icon}</span>
                <span style={{fontSize:12,fontWeight:'bold',flex:1,color:G600}}>{cat.name}</span>
                <span style={{fontSize:11,color:G400,minWidth:40,textAlign:'right'}}>{cat.learned}/{cat.total}</span>
                <div style={{width:70,height:6,background:G200,borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:pct+'%',background:pctColor(pct),transition:'width 0.5s'}}/></div>
                <span style={{fontSize:12,fontWeight:'bold',color:pctColor(pct),minWidth:36,textAlign:'right'}}>{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { VokabelTrainer, WorkoutSetup, WorkoutSession, SentenceLearner, ProgressStats };
