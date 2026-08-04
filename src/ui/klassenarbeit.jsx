import { sbDel, sbGet, sbPatch, sbPost } from '../core/api.js';
import { KA_TOPIC_LABELS, buildKaQuestions, isCorrectAnswer, kaGradeFor, kaResultsLoad, kaResultsSave, kaSentenceMatch, loadGrammarPool } from '../core/grammar.js';
import { lsGetRunsForPlayer, tallyAnswer } from '../core/leitner.js';
import { useEffect, useRef, useState } from '../core/react.js';
import { filterRunsByScope, scopeText } from '../core/scope.js';
import { AM, BtnStyle, G100, G200, G400, G50, G600, G900, GR, RE, T } from '../core/theme.js';
import { checkAnswer } from '../core/words.js';

function KlassenarbeitSetup({ player, chapters, scope, onStart, onDone }) {
  // Grammatik-Pool und die festen Übersetzungssätze sind Englisch — bei einer
  // anderen Sprache besteht die Arbeit nur aus deren Vokabeln.
  var isEnglish = !scope || scope.language==='en';
  var [runs,setRuns]=useState([]); var [selRuns,setSelRuns]=useState(new Set()); var [selTopics,setSelTopics]=useState(new Set(isEnglish?['sp','pp','sa','mv']:[])); var [loading,setLoading]=useState(true); var [starting,setStarting]=useState(false);
  useEffect(function(){lsGetRunsForPlayer(player.id).then(function(r){setRuns(filterRunsByScope(r||[],chapters,scope));setLoading(false);}).catch(function(){setLoading(false);});}, []);
  function toggleRun(id){setSelRuns(function(p){var n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});}
  function toggleTopic(t){setSelTopics(function(p){var n=new Set(p);n.has(t)?n.delete(t):n.add(t);return n;});}
  function handleStart(){
    setStarting(true);
    var topicArr=Array.from(selTopics);
    var selRunObjs=runs.filter(function(r){return selRuns.has(r.id);});
    var gp=(isEnglish&&topicArr.length>0)?Promise.all(topicArr.map(loadGrammarPool)).then(function(pools){var all=[];pools.forEach(function(pool){(pool||[]).forEach(function(q){if(q.sentence&&q.sentence.includes('___'))all.push(q);});});return all;}):Promise.resolve([]);
    gp.then(function(gPool){var qs=buildKaQuestions(selRunObjs,gPool,isEnglish);setStarting(false);onStart(qs);}).catch(function(){setStarting(false);});
  }
  var vocabEst=0; runs.filter(function(r){return selRuns.has(r.id);}).forEach(function(r){vocabEst+=(r.word_count||0);});
  var hasV=selRuns.size>0, hasG=isEnglish&&selTopics.size>0;
  var vQ=hasV&&hasG?20:(hasV?40:0), gQ=hasG&&hasV?20:(hasG?40:0);
  var totalEst=Math.min(vQ,vocabEst)+gQ+(isEnglish?10:0);
  var canStart=hasV||hasG;
  return (
    <div style={{padding:12}}>
      <div style={{fontWeight:'bold',fontSize:16,color:'#dc2626',marginBottom:2}}>📋 Klassenarbeit</div>
      <div style={{fontSize:12,color:G400,marginBottom:16}}>{scopeText(scope)} · Vorbereitung — ca. {totalEst} Fragen</div>
      <div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:8}}>🪜 Leiterspiel-Runs wählen</div>
      {loading?<div style={{color:G400,fontSize:12,marginBottom:16}}>Lade Runs…</div>:
        <div style={{marginBottom:16}}>
          {runs.map(function(run){var ck=selRuns.has(run.id);return(
            <div key={run.id} onClick={function(){toggleRun(run.id);}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',marginBottom:6,borderRadius:10,border:'2px solid '+(ck?'#dc2626':G200),background:ck?'#dc262611':'white',cursor:'pointer'}}>
              <div style={{width:20,height:20,borderRadius:4,border:'2px solid '+(ck?'#dc2626':G200),background:ck?'#dc2626':'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {ck&&<span style={{color:'white',fontSize:12,fontWeight:'bold'}}>✓</span>}
              </div>
              <div style={{flex:1}}><div style={{fontWeight:'bold',fontSize:13,color:G900}}>{run.icon||'🎯'} {run.name}</div><div style={{fontSize:11,color:G400}}>{run.word_count||0} Vokabeln</div></div>
            </div>);
          })}
          {runs.length===0&&<div style={{color:G400,fontSize:12}}>Keine Runs gefunden.</div>}
        </div>
      }
      {isEnglish&&<div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:8}}>✏️ Grammatik-Themen wählen</div>}
      {isEnglish&&<div style={{marginBottom:16}}>
        {Object.keys(KA_TOPIC_LABELS).map(function(t){var ck=selTopics.has(t);return(
          <div key={t} onClick={function(){toggleTopic(t);}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',marginBottom:6,borderRadius:10,border:'2px solid '+(ck?'#7c3aed':G200),background:ck?'#7c3aed11':'white',cursor:'pointer'}}>
            <div style={{width:20,height:20,borderRadius:4,border:'2px solid '+(ck?'#7c3aed':G200),background:ck?'#7c3aed':'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {ck&&<span style={{color:'white',fontSize:12,fontWeight:'bold'}}>✓</span>}
            </div>
            <div style={{fontWeight:'bold',fontSize:13,color:G900}}>{KA_TOPIC_LABELS[t]}</div>
          </div>);
        })}
      </div>}
      {isEnglish&&<div style={{padding:'10px 12px',borderRadius:10,background:'#f0fdf4',border:'1px solid #86efac',marginBottom:20}}>
        <div style={{fontWeight:'bold',fontSize:12,color:'#065f46',marginBottom:2}}>🐾 10 feste Sätze (immer dabei)</div>
        <div style={{fontSize:11,color:'#065f46'}}>Deutsch → Englisch: Hundepflege &amp; Haustiere</div>
      </div>}
      {!canStart&&<div style={{color:AM,fontSize:12,marginBottom:8,textAlign:'center'}}>{isEnglish?'Bitte mindestens einen Run oder ein Grammatik-Thema wählen.':'Bitte mindestens einen Run wählen.'}</div>}
      <button onClick={handleStart} disabled={!canStart||starting} style={BtnStyle('#dc2626','white',{width:'100%',padding:'14px',fontSize:15,fontWeight:'bold',opacity:(!canStart||starting)?0.5:1})}>{starting?'Lade Fragen…':'📋 Test starten (~'+totalEst+' Fragen)'}</button>
      <button onClick={onDone} style={BtnStyle(G100,G600,{width:'100%',padding:'10px',fontSize:13,marginTop:8})}>← Zurück</button>
    </div>
  );
}

function KlassenarbeitTest({ player, questions, onDone }) {
  var [idx,setIdx]=useState(0); var [input,setInput]=useState(''); var [log,setLog]=useState([]); var [phase,setPhase]=useState('q'); var [lastCorrect,setLastCorrect]=useState(false); var [lastExpected,setLastExpected]=useState('');
  var [showLog,setShowLog]=useState(false); var [saved,setSaved]=useState(false);
  var inputRef=useRef(null);
  useEffect(function(){if(inputRef.current&&phase==='q')inputRef.current.focus();},[idx,phase]);
  useEffect(function(){
    if(phase==='done'&&log.length>0&&!saved){
      setSaved(true);
      var corr=log.filter(function(l){return l.correct;}).length;
      var grade=kaGradeFor(corr,log.length);
      kaResultsSave({player_id:player.id,player_name:player.name,completed_at:new Date().toISOString(),correct:corr,total:log.length,grade:grade,log:log});
    }
  },[phase,log,saved]);
  var total=questions.length;
  var q=questions[Math.min(idx,total-1)];
  function submit(skipped){
    if(!q) return;
    var inp=input.trim();
    var correct=false;
    if(!skipped){
      if(q.kind==='vocab'){var s=checkAnswer(inp,q.answer);correct=s==='correct'||s==='partial';}
      else if(q.kind==='grammar') correct=isCorrectAnswer(q,inp);
      else if(q.kind==='sentence') correct=kaSentenceMatch(inp,q.answer);
    }
    tallyAnswer(correct);
    setLastCorrect(correct); setLastExpected(q.answer); setPhase('feedback');
  }
  function commitAnswer(correct){
    var entry={kind:q.kind,question:q.kind==='sentence'?q.german:(q.kind==='vocab'?q.german:q.sentence.replace(/\s*\([^)]+\)\s*$/,'').trim()),answer:q.answer,typed:input.trim(),correct:correct};
    var newLog=log.concat([entry]);
    setLog(newLog);
    if(idx+1>=total){setIdx(total);setPhase('done');}
    else{setIdx(function(i){return i+1;});setInput('');setPhase('q');}
  }
  if(phase==='done'||idx>=total){
    var corr=log.filter(function(l){return l.correct;}).length;
    var tot=log.length||total;
    var grade=kaGradeFor(corr,tot);
    var gCol=grade<=2?GR:grade<=3?AM:grade<=4?'#f97316':RE;
    var bk={vocab:{c:0,t:0},grammar:{c:0,t:0},sentence:{c:0,t:0}};
    log.forEach(function(l){var k=l.kind||'vocab';bk[k].t++;if(l.correct)bk[k].c++;});
    if(showLog){
      return(
        <div style={{padding:16}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
            <button onClick={function(){setShowLog(false);}} style={{background:'none',border:'none',color:T,fontSize:18,cursor:'pointer',padding:4}}>←</button>
            <span style={{fontWeight:'bold',fontSize:15,color:G900}}>Alle Antworten</span>
          </div>
          {log.map(function(l,i){
            var kindIcon=l.kind==='vocab'?'📝':l.kind==='grammar'?'✏️':'🐾';
            return(
              <div key={i} style={{borderRadius:10,border:'2px solid '+(l.correct?'#86efac':'#fca5a5'),background:l.correct?'#f0fdf4':'#fef2f2',padding:'10px 12px',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                  <span style={{fontSize:13}}>{l.correct?'✅':'❌'}</span>
                  <span style={{fontSize:10,color:G400}}>{kindIcon}</span>
                  <span style={{fontSize:12,color:G600,flex:1}}>{l.question}</span>
                </div>
                <div style={{fontSize:13,fontWeight:'bold',color:l.correct?'#065f46':'#991b1b'}}>→ {l.answer}</div>
                {!l.correct&&l.typed&&<div style={{fontSize:12,color:G500,marginTop:2}}>Du: <span style={{textDecoration:'line-through'}}>{l.typed}</span></div>}
              </div>
            );
          })}
          <button onClick={onDone} style={BtnStyle('#dc2626','white',{width:'100%',padding:'12px',fontSize:14,fontWeight:'bold',marginTop:8})}>← Zurück</button>
        </div>
      );
    }
    return(
      <div style={{padding:16}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:56,marginBottom:8}}>🎓</div>
          <div style={{fontSize:22,fontWeight:'bold',color:T,marginBottom:4}}>Test abgeschlossen!</div>
          <div style={{fontSize:40,fontWeight:'bold',color:gCol,marginBottom:4}}>{corr}/{tot}</div>
          <div style={{fontSize:14,color:G600,marginBottom:4}}>Note: <span style={{fontWeight:'bold',fontSize:24,color:gCol}}>{grade}</span></div>
          <div style={{fontSize:11,color:G400}}>{Math.round(corr/tot*100)}% richtig</div>
        </div>
        <div style={{background:G50,borderRadius:12,padding:12,marginBottom:16}}>
          {bk.vocab.t>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'5px 0',borderBottom:'1px solid '+G100}}><span style={{color:G600}}>📝 Vokabeln</span><span style={{fontWeight:'bold',color:bk.vocab.c/bk.vocab.t>=0.7?GR:RE}}>{bk.vocab.c}/{bk.vocab.t}</span></div>}
          {bk.grammar.t>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'5px 0',borderBottom:'1px solid '+G100}}><span style={{color:G600}}>✏️ Grammatik</span><span style={{fontWeight:'bold',color:bk.grammar.c/bk.grammar.t>=0.7?GR:RE}}>{bk.grammar.c}/{bk.grammar.t}</span></div>}
          {bk.sentence.t>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'5px 0'}}><span style={{color:G600}}>🐾 Sätze</span><span style={{fontWeight:'bold',color:bk.sentence.c/bk.sentence.t>=0.7?GR:RE}}>{bk.sentence.c}/{bk.sentence.t}</span></div>}
        </div>
        <button onClick={function(){setShowLog(true);}} style={BtnStyle('#7c3aed','white',{width:'100%',padding:'12px',fontSize:13,fontWeight:'bold',marginBottom:8})}>📋 Alle Antworten ansehen</button>
        <button onClick={onDone} style={BtnStyle('#dc2626','white',{width:'100%',padding:'14px',fontSize:15,fontWeight:'bold'})}>← Zurück</button>
      </div>
    );
  }
  if(phase==='feedback'){
    var isSent=q.kind==='sentence';
    return(
      <div style={{padding:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
          <div style={{flex:1,height:6,borderRadius:3,background:G100,overflow:'hidden'}}><div style={{height:'100%',width:(idx/total*100)+'%',background:lastCorrect?GR:RE,borderRadius:3}}/></div>
          <span style={{fontSize:11,color:G400,minWidth:40,textAlign:'right'}}>{idx}/{total}</span>
        </div>
        <div style={{textAlign:'center',padding:'16px',borderRadius:14,background:lastCorrect?'#d1fae5':'#fee2e2',marginBottom:16}}>
          <div style={{fontSize:32,marginBottom:4}}>{lastCorrect?'✅':'❌'}</div>
          <div style={{fontSize:16,fontWeight:'bold',color:lastCorrect?'#065f46':'#991b1b'}}>{lastCorrect?'Richtig!':'Nicht ganz.'}</div>
        </div>
        <div style={{background:G50,borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:11,color:G400,marginBottom:4}}>Richtige Antwort:</div>
          <div style={{fontSize:15,fontWeight:'bold',color:G900}}>{lastExpected}</div>
          {input.trim()&&input.trim()!==lastExpected&&<div style={{fontSize:12,color:RE,marginTop:4}}>Deine Antwort: <span style={{textDecoration:'line-through'}}>{input.trim()}</span></div>}
        </div>
        {isSent?(
          <div>
            <div style={{fontSize:12,color:G600,marginBottom:6,textAlign:'center'}}>Stimmt deine Antwort inhaltlich überein?</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={function(){commitAnswer(true);}} style={BtnStyle(GR,'white',{flex:1,padding:'12px',fontSize:13,fontWeight:'bold'})}>✓ Ja</button>
              <button onClick={function(){commitAnswer(false);}} style={BtnStyle(RE,'white',{flex:1,padding:'12px',fontSize:13,fontWeight:'bold'})}>✗ Nein</button>
            </div>
          </div>
        ):(
          <button onClick={function(){commitAnswer(lastCorrect);}} style={BtnStyle(T,'white',{width:'100%',padding:'12px',fontSize:14,fontWeight:'bold'})}>Weiter →</button>
        )}
      </div>
    );
  }
  var kindIcon=q.kind==='vocab'?'📝':q.kind==='grammar'?'✏️':'🐾';
  var kindLabel=q.kind==='vocab'?'Vokabel':q.kind==='grammar'?'Grammatik':'Satz übersetzen';
  var kindCol=q.kind==='vocab'?T:q.kind==='grammar'?'#7c3aed':'#059669';
  return(
    <div style={{padding:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <div style={{flex:1,height:6,borderRadius:3,background:G100,overflow:'hidden'}}><div style={{height:'100%',width:(idx/total*100)+'%',background:'#dc2626',borderRadius:3,transition:'width 0.3s'}}/></div>
        <span style={{fontSize:11,color:G400,minWidth:40,textAlign:'right'}}>{idx+1}/{total}</span>
      </div>
      <div style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:20,background:kindCol+'22',marginBottom:12}}>
        <span style={{fontSize:12}}>{kindIcon}</span>
        <span style={{fontSize:10,fontWeight:'bold',color:kindCol,letterSpacing:0.5}}>{kindLabel.toUpperCase()}</span>
      </div>
      {q.kind==='vocab'&&(
        <div style={{background:'#eff6ff',borderRadius:14,padding:16,marginBottom:16,border:'2px solid #93c5fd'}}>
          <div style={{fontSize:11,color:G400,marginBottom:6}}>Deutsch — schreibe das englische Wort:</div>
          <div style={{fontSize:22,fontWeight:'bold',color:G900}}>{q.german}</div>
        </div>
      )}
      {q.kind==='grammar'&&(
        <div style={{background:'#f5f3ff',borderRadius:14,padding:16,marginBottom:16,border:'2px solid #c4b5fd'}}>
          <div style={{fontSize:11,color:G400,marginBottom:6}}>{q.hint} — Lücke ausfüllen:</div>
          <div style={{fontSize:18,fontWeight:'bold',color:G900,lineHeight:1.6}}>
            {q.sentence.replace(/\s*\([^)]+\)\s*$/,'').trim()}
            {q.german_hint&&<span style={{color:'#7c3aed',fontWeight:'normal'}}> ({q.german_hint})</span>}
          </div>
        </div>
      )}
      {q.kind==='sentence'&&(
        <div style={{background:'#f0fdf4',borderRadius:14,padding:16,marginBottom:16,border:'2px solid #86efac'}}>
          <div style={{fontSize:11,color:G400,marginBottom:6}}>Übersetze auf Englisch:</div>
          <div style={{fontSize:16,fontWeight:'bold',color:'#065f46',lineHeight:1.6}}>{q.german}</div>
        </div>
      )}
      <textarea ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
        onKeyDown={function(e){if(e.key==='Enter'&&!e.shiftKey&&q.kind!=='sentence'){e.preventDefault();submit(false);}}}
        placeholder={q.kind==='sentence'?'Englischen Satz eingeben…':'Antwort eingeben…'}
        rows={q.kind==='sentence'?3:2}
        style={{width:'100%',padding:'12px',fontSize:15,border:'2px solid #dc2626',borderRadius:10,outline:'none',resize:'none',boxSizing:'border-box',marginBottom:10}}
      />
      <div style={{display:'flex',gap:8}}>
        <button onClick={function(){submit(true);}} style={BtnStyle(G100,G600,{flex:1,padding:'10px',fontSize:13})}>⏭ Überspringen</button>
        <button onClick={function(){submit(false);}} disabled={!input.trim()} style={BtnStyle('#dc2626','white',{flex:2,padding:'12px',fontSize:14,fontWeight:'bold',opacity:input.trim()?1:0.5})}>✓ Prüfen</button>
      </div>
    </div>
  );
}

function KlassenarbeitAdmin({ player, chapters, scope }) {
  var isEnglish = !scope || scope.language==='en';
  var [runs,setRuns]=useState([]); var [selRuns,setSelRuns]=useState(new Set()); var [selTopics,setSelTopics]=useState(new Set(isEnglish?['sp','pp','sa','mv']:[])); var [loading,setLoading]=useState(true); var [saving,setSaving]=useState(false); var [msg,setMsg]=useState(''); var [activeInfo,setActiveInfo]=useState(null);
  var [results,setResults]=useState([]); var [expandedResult,setExpandedResult]=useState(null); var [resultTab,setResultTab]=useState('test');
  useEffect(function(){
    lsGetRunsForPlayer(player.id).then(function(r){setRuns(filterRunsByScope(r||[],chapters,scope));setLoading(false);}).catch(function(){setLoading(false);});
    sbGet('settings','key=eq.klassenarbeit_active_test&select=value').then(function(rows){
      if(rows&&rows[0]){try{setActiveInfo(JSON.parse(rows[0].value));}catch(e){}}
    }).catch(function(){});
    kaResultsLoad().then(function(r){setResults(r||[]);}).catch(function(){});
  },[]);
  function toggleRun(id){setSelRuns(function(p){var n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});}
  function toggleTopic(t){setSelTopics(function(p){var n=new Set(p);n.has(t)?n.delete(t):n.add(t);return n;});}
  function handleSave(){
    if(!canSave||saving) return;
    setSaving(true); setMsg('');
    var topicArr=Array.from(selTopics);
    var selRunObjs=runs.filter(function(r){return selRuns.has(r.id);});
    var gp=(isEnglish&&topicArr.length>0)?Promise.all(topicArr.map(loadGrammarPool)).then(function(pools){var all=[];pools.forEach(function(pool){(pool||[]).forEach(function(q){if(q.sentence&&q.sentence.includes('___'))all.push(q);});});return all;}):Promise.resolve([]);
    gp.then(function(gPool){
      var qs=buildKaQuestions(selRunObjs,gPool,isEnglish);
      var payload={questions:qs,created_at:new Date().toISOString(),created_by:player.name,question_count:qs.length,
        grade:scope?scope.grade:null, language:scope?scope.language:null};
      sbGet('settings','key=eq.klassenarbeit_active_test&select=key').then(function(rows){
        var op=(rows&&rows.length>0)?sbPatch('settings',{value:JSON.stringify(payload)},'key=eq.klassenarbeit_active_test'):sbPost('settings',{key:'klassenarbeit_active_test',value:JSON.stringify(payload)});
        Promise.resolve(op).then(function(){setSaving(false);setActiveInfo(payload);setMsg('✅ Test gespeichert – alle Spieler können ihn jetzt starten.');}).catch(function(){setSaving(false);setMsg('❌ Fehler beim Speichern.');});
      }).catch(function(){setSaving(false);setMsg('❌ DB-Fehler.');});
    }).catch(function(){setSaving(false);setMsg('❌ Fehler beim Laden der Grammatik.');});
  }
  function handleDelete(){
    sbDel('settings','key=eq.klassenarbeit_active_test').then(function(){setActiveInfo(null);setMsg('Test gelöscht.');}).catch(function(){setMsg('❌ Löschen fehlgeschlagen.');});
  }
  var vocabEst=0; runs.filter(function(r){return selRuns.has(r.id);}).forEach(function(r){vocabEst+=(r.word_count||0);});
  var hasV=selRuns.size>0,hasG=isEnglish&&selTopics.size>0;
  var vQ=hasV&&hasG?20:(hasV?40:0),gQ=hasG&&hasV?20:(hasG?40:0);
  var totalEst=Math.min(vQ,vocabEst)+gQ+(isEnglish?10:0);
  var canSave=hasV||hasG;
  var sortedResults=results.slice().sort(function(a,b){return (b.completed_at||'').localeCompare(a.completed_at||'');});
  return(
    <div>
      <div style={{display:'flex',gap:4,marginBottom:12}}>
        {[['test','📋 Test'],['results','📊 Ergebnisse ('+results.length+')']].map(function(t){var ck=resultTab===t[0];return(
          <button key={t[0]} onClick={function(){setResultTab(t[0]);}} style={{flex:1,padding:'8px 4px',borderRadius:8,border:'2px solid '+(ck?'#dc2626':G200),background:ck?'#dc2626':'white',color:ck?'white':G600,fontSize:12,fontWeight:ck?'bold':'normal',cursor:'pointer',touchAction:'manipulation'}}>{t[1]}</button>
        );})}
      </div>
      {resultTab==='test'&&(
        <div>
          {activeInfo&&(
            <div style={{padding:'10px 12px',borderRadius:10,background:'#d1fae5',border:'1px solid #6ee7b7',marginBottom:12}}>
              <div style={{fontWeight:'bold',fontSize:12,color:'#065f46',marginBottom:2}}>✅ Aktiver Test</div>
              <div style={{fontSize:11,color:'#065f46',marginBottom:6}}>{activeInfo.question_count||'?'} Fragen · erstellt von {activeInfo.created_by} · {activeInfo.created_at?new Date(activeInfo.created_at).toLocaleDateString('de'):''}</div>
              <button onClick={handleDelete} style={{padding:'4px 10px',borderRadius:6,border:'none',background:'#dc2626',color:'white',fontSize:11,cursor:'pointer',touchAction:'manipulation'}}>🗑 Test löschen</button>
            </div>
          )}
          {msg&&<div style={{padding:'6px 10px',background:'#d1fae5',borderRadius:7,fontSize:11,color:T,marginBottom:8}}>{msg}</div>}
          <div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:2}}>🪜 Leiterspiel-Runs wählen</div>
          <div style={{fontSize:11,color:G400,marginBottom:8}}>{scopeText(scope)} — der Test wird für diese Klasse/Sprache aktiviert.</div>
          {loading?<div style={{color:G400,fontSize:12,marginBottom:16}}>Lade Runs…</div>:(
            <div style={{marginBottom:16}}>
              {runs.map(function(run){var ck=selRuns.has(run.id);return(
                <div key={run.id} onClick={function(){toggleRun(run.id);}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',marginBottom:6,borderRadius:10,border:'2px solid '+(ck?'#dc2626':G200),background:ck?'#dc262611':'white',cursor:'pointer',touchAction:'manipulation'}}>
                  <div style={{width:20,height:20,borderRadius:4,border:'2px solid '+(ck?'#dc2626':G200),background:ck?'#dc2626':'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{ck&&<span style={{color:'white',fontSize:12,fontWeight:'bold'}}>✓</span>}</div>
                  <div style={{flex:1}}><div style={{fontWeight:'bold',fontSize:13,color:G900}}>{run.icon||'🎯'} {run.name}</div><div style={{fontSize:11,color:G400}}>{run.word_count||0} Vokabeln</div></div>
                </div>);
              })}
              {runs.length===0&&<div style={{color:G400,fontSize:12}}>Keine Runs gefunden.</div>}
            </div>
          )}
          {isEnglish&&<div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:8}}>✏️ Grammatik-Themen wählen</div>}
          {isEnglish&&<div style={{marginBottom:16}}>
            {Object.keys(KA_TOPIC_LABELS).map(function(t){var ck=selTopics.has(t);return(
              <div key={t} onClick={function(){toggleTopic(t);}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',marginBottom:6,borderRadius:10,border:'2px solid '+(ck?'#7c3aed':G200),background:ck?'#7c3aed11':'white',cursor:'pointer',touchAction:'manipulation'}}>
                <div style={{width:20,height:20,borderRadius:4,border:'2px solid '+(ck?'#7c3aed':G200),background:ck?'#7c3aed':'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{ck&&<span style={{color:'white',fontSize:12,fontWeight:'bold'}}>✓</span>}</div>
                <div style={{fontWeight:'bold',fontSize:13,color:G900}}>{KA_TOPIC_LABELS[t]}</div>
              </div>);
            })}
          </div>}
          {isEnglish&&<div style={{padding:'10px 12px',borderRadius:10,background:'#f0fdf4',border:'1px solid #86efac',marginBottom:16}}>
            <div style={{fontWeight:'bold',fontSize:12,color:'#065f46',marginBottom:2}}>🐾 10 feste Sätze (immer dabei)</div>
            <div style={{fontSize:11,color:'#065f46'}}>Deutsch → Englisch: Hundepflege &amp; Haustiere</div>
          </div>}
          {!canSave&&<div style={{color:AM,fontSize:12,marginBottom:8,textAlign:'center'}}>{isEnglish?'Bitte mindestens einen Run oder ein Grammatik-Thema wählen.':'Bitte mindestens einen Run wählen.'}</div>}
          <button onClick={handleSave} disabled={!canSave||saving} style={BtnStyle('#dc2626','white',{width:'100%',padding:'14px',fontSize:14,fontWeight:'bold',opacity:(!canSave||saving)?0.5:1,touchAction:'manipulation'})}>{saving?'Erstelle Test…':'💾 Test erstellen & aktivieren (~'+totalEst+' Fragen)'}</button>
        </div>
      )}
      {resultTab==='results'&&(
        <div>
          {sortedResults.length===0&&<div style={{textAlign:'center',color:G400,fontSize:13,padding:24}}>Noch keine Ergebnisse vorhanden.</div>}
          {sortedResults.map(function(r,i){
            var gCol=r.grade<=2?GR:r.grade<=3?AM:r.grade<=4?'#f97316':RE;
            var isOpen=expandedResult===i;
            return(
              <div key={i} style={{borderRadius:12,border:'2px solid '+G200,marginBottom:10,overflow:'hidden'}}>
                <div onClick={function(){setExpandedResult(isOpen?null:i);}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:G50,cursor:'pointer',touchAction:'manipulation'}}>
                  <div style={{width:32,height:32,borderRadius:8,background:gCol,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:'bold',fontSize:15,flexShrink:0}}>{r.grade}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:'bold',fontSize:13,color:G900}}>{r.player_name}</div>
                    <div style={{fontSize:11,color:G400}}>{r.correct}/{r.total} richtig · {r.completed_at?new Date(r.completed_at).toLocaleString('de',''):''}
                    </div>
                  </div>
                  <span style={{color:G400,fontSize:12}}>{isOpen?'▲':'▼'}</span>
                </div>
                {isOpen&&r.log&&(
                  <div style={{padding:'8px 12px',borderTop:'1px solid '+G200}}>
                    {r.log.map(function(l,j){
                      var kindIcon=l.kind==='vocab'?'📝':l.kind==='grammar'?'✏️':'🐾';
                      return(
                        <div key={j} style={{display:'flex',alignItems:'flex-start',gap:6,padding:'5px 0',borderBottom:j<r.log.length-1?'1px solid '+G100:'none'}}>
                          <span style={{fontSize:12,flexShrink:0,marginTop:1}}>{l.correct?'✅':'❌'}</span>
                          <span style={{fontSize:10,color:G400,flexShrink:0,marginTop:2}}>{kindIcon}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,color:G600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.question}</div>
                            <div style={{fontSize:12,fontWeight:'bold',color:l.correct?'#065f46':'#991b1b'}}>→ {l.answer}</div>
                            {!l.correct&&l.typed&&<div style={{fontSize:11,color:G400}}>War: <span style={{textDecoration:'line-through'}}>{l.typed}</span></div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KlassenarbeitPlayer({ player, chapters, scope, onStart, onDone }) {
  var [info,setInfo]=useState(null); var [loading,setLoading]=useState(true);
  useEffect(function(){
    sbGet('settings','key=eq.klassenarbeit_active_test&select=value').then(function(rows){
      if(rows&&rows[0]){try{
        var t=JSON.parse(rows[0].value);
        // Tests ohne Klassen-/Sprach-Angabe stammen von vor der Umstellung und
        // bleiben für alle sichtbar; neuere nur in ihrer eigenen Auswahl.
        if(!t || !t.language || !scope || (Number(t.grade)===scope.grade && t.language===scope.language)) setInfo(t);
      }catch(e){}}
      setLoading(false);
    }).catch(function(){setLoading(false);});
  },[scope&&scope.grade, scope&&scope.language]);
  if(loading) return <div style={{padding:32,textAlign:'center',color:G400,fontSize:14}}>Lade…</div>;
  if(!info) return(
    <div style={{padding:24,textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:12}}>📋</div>
      <div style={{fontWeight:'bold',fontSize:16,color:G700,marginBottom:8}}>Keine Klassenarbeit aktiv</div>
      <div style={{fontSize:12,color:G400,marginBottom:24}}>Für {scopeText(scope)} hat der Lehrer noch keinen Test erstellt.</div>
      <button onClick={onDone} style={BtnStyle(G100,G600,{width:'100%',padding:'12px',fontSize:13,touchAction:'manipulation'})}>← Zurück</button>
    </div>
  );
  var dateStr=info.created_at?new Date(info.created_at).toLocaleDateString('de'):'';
  return(
    <div style={{padding:16}}>
      <div style={{textAlign:'center',marginBottom:24}}>
        <div style={{fontSize:52,marginBottom:8}}>📋</div>
        <div style={{fontWeight:'bold',fontSize:20,color:'#dc2626',marginBottom:4}}>Klassenarbeit</div>
        <div style={{fontSize:12,color:G400}}>{info.question_count||'?'} Fragen{dateStr?' · erstellt am '+dateStr:''}</div>
      </div>
      <div style={{padding:'12px 14px',borderRadius:12,background:'#fef2f2',border:'1px solid #fca5a5',marginBottom:24}}>
        <div style={{fontSize:12,color:'#991b1b'}}>⚠️ Schreibe alle Antworten so vollständig wie möglich. Du hast nur einen Versuch.</div>
      </div>
      <button onClick={function(){onStart(info.questions);}} style={BtnStyle('#dc2626','white',{width:'100%',padding:'14px',fontSize:16,fontWeight:'bold',marginBottom:8,touchAction:'manipulation'})}>▶ Test starten</button>
      <button onClick={onDone} style={BtnStyle(G100,G600,{width:'100%',padding:'10px',fontSize:13,touchAction:'manipulation'})}>← Zurück</button>
    </div>
  );
}

export { KlassenarbeitSetup, KlassenarbeitTest, KlassenarbeitAdmin, KlassenarbeitPlayer };
