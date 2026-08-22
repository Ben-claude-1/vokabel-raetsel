import { sbGet, sbPatch } from '../core/api.js';
import { buildOptions, grammarPickQuestions, isCorrectAnswer, loadGrammarPool, saveGrammarPool } from '../core/grammar.js';
import { logWordEvent, tallyAnswer } from '../core/leitner.js';
import { useEffect, useRef, useState } from '../core/react.js';
import { AM, BtnStyle, G100, G200, G400, G50, G600, G900, GR, RE, T, TD } from '../core/theme.js';

function GrammarAdmin({ player, chapters }) {
  var [topic, setTopic] = useState('sp');
  var [pool, setPool] = useState([]);
  var [loading, setLoading] = useState(false);
  var [generating, setGenerating] = useState(false);
  var [msg, setMsg] = useState('');
  var [batchN, setBatchN] = useState(10);
  var [apiKey, setApiKey] = useState('');
  var [savedKey, setSavedKey] = useState('');

  useEffect(function(){
    var k = localStorage.getItem('claude_api_key') || '';
    setApiKey(k); setSavedKey(k);
  },[]);

  useEffect(function(){
    setLoading(true);
    loadGrammarPool(topic).then(function(p){setPool(p);setLoading(false);}).catch(function(){setLoading(false);});
  },[topic]);

  function saveKey(){
    localStorage.setItem('claude_api_key', apiKey.trim());
    setSavedKey(apiKey.trim());
    setMsg('✓ API-Key gespeichert');
  }

  function generate(){
    var key = savedKey || localStorage.getItem('claude_api_key') || '';
    if(!key){setMsg('Bitte zuerst API-Key eintragen und speichern');return;}
    setGenerating(true); setMsg('');
    var topicLabel = topic==='sp'?'Simple Present':topic==='pp'?'Present Progressive':topic==='sa'?'some/any':'Modal Verbs (must/mustn\'t/should/shouldn\'t/need to/don\'t need to)';
    var promptDetail = topic==='sp'
      ? 'Verwende verschiedene Subjekte (I, you, he, she, we, they). Die Lücke ist das Verb in der richtigen Simple-Present-Form. Am Ende des Satzes steht der Infinitiv in Klammern als Hinweis. Das Feld "german_hint" enthält nur den deutschen Infinitiv (z.B. "spielen" für "to play"). WICHTIG: Nur EINE Lücke pro Satz. Beispiel: {"sentence":"She ___ football every day. (to play)","answer":"plays","distractors":["play","playing","played"],"rule":"Simple Present","translation":"Sie spielt jeden Tag Fußball.","german_hint":"spielen"}'
      : topic==='pp'
      ? 'Verwende verschiedene Subjekte (I, you, he, she, we, they). Die Lücke ist das Verb in der richtigen Present-Progressive-Form (am/is/are + Verb+ing). Am Ende des Satzes steht der Infinitiv in Klammern als Hinweis. Das Feld "german_hint" enthält nur den deutschen Infinitiv (z.B. "spielen" für "to play"). WICHTIG: Nur EINE Lücke pro Satz. Beispiel: {"sentence":"She ___ football right now. (to play)","answer":"is playing","distractors":["plays","play","are playing"],"rule":"Present Progressive","translation":"Sie spielt gerade Fußball.","german_hint":"spielen"}'
      : topic==='sa'
      ? 'Die Lücke ist "some" oder "any". Verwende alltägliche Sätze (Fragen, Verneinungen, Angebote, Bitten). WICHTIG: Nur EINE Lücke pro Satz. Beispiel: {"sentence":"Can I have ___ of these kiwis?","answer":"some","distractors":["any","no","a"],"rule":"some/any","translation":"Kann ich einige dieser Kiwis haben?"}'
      : 'Erstelle alltagsnahe Sätze für Schüler der 6. Klasse wo ein Modalverb fehlt. Verfügbare Modalverben: must, mustn\'t, should, shouldn\'t, need to, don\'t need to. WICHTIG: Manchmal sind mehrere Modalverben sinnvoll — gib dann ALLE akzeptablen Antworten im "acceptable_answers"-Array an (immer befüllen, auch wenn nur eine Antwort möglich ist). Das "answer"-Feld enthält die beste/typischste Antwort. Kein Hinweis in Klammern am Satzende. Beispiel: {"sentence":"You ___ eat so many sweets.","answer":"shouldn\'t","acceptable_answers":["shouldn\'t","mustn\'t"],"distractors":["must","should","need to"],"rule":"modal verbs","translation":"Du solltest nicht so viele Süßigkeiten essen."}';
    var distNote = topic==='sa'
      ? 'Die 3 distractors müssen sinnvolle aber falsche Alternativen sein (any, some, no, a, the).'
      : topic==='mv'
      ? 'Die distractors sind die Modalverben aus [must, mustn\'t, should, shouldn\'t, need to, don\'t need to] die NICHT in acceptable_answers stehen.'
      : 'Die 3 distractors müssen andere Konjugationsformen DESSELBEN Verbs sein (nicht andere Wörter).';
    var promptTemplate = function(n){
      var fields = topic==='mv'
        ? 'sentence (mit ___ als einziger Lücke), answer, acceptable_answers, distractors, rule, translation'
        : (topic==='sp'||topic==='pp')
        ? 'sentence (mit ___ als einziger Lücke, Infinitiv am Ende in Klammern), answer, distractors, rule, translation, german_hint'
        : 'sentence (mit ___ als einziger Lücke), answer, distractors, rule, translation';
      return 'Erstelle '+n+' verschiedene Lückentext-Aufgaben auf Englisch für das Thema '+topicLabel+'. '+promptDetail+' '+distNote+' Antworte NUR mit einem JSON-Array mit genau diesen Feldern: '+fields+'. Keine Erklärungen, kein Markdown, nur das JSON-Array.';
    };
    var CHUNK=10;
    var chunks=[];
    for(var ci=0;ci<batchN;ci+=CHUNK) chunks.push(Math.min(CHUNK,batchN-ci));
    var allNew=[];
    var currentPool=pool.slice();
    function runChunk(idx, retries){
      if(idx>=chunks.length){
        setPool(currentPool);
        setMsg('✓ '+allNew.length+' Sätze generiert und gespeichert');
        setGenerating(false);
        return;
      }
      var attempt=retries||0;
      setMsg('Generiere… ('+allNew.length+'/'+batchN+')'+(attempt>0?' — Versuch '+(attempt+1):''));
      fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:4000,messages:[{role:'user',content:promptTemplate(chunks[idx])}]})
      }).then(function(r){
        if(r.status===529||r.status===503||r.status===429){
          if(attempt<5){
            var wait=(attempt+1)*8000;
            setMsg('API überlastet — warte '+(wait/1000)+'s… ('+allNew.length+'/'+batchN+')');
            setTimeout(function(){ runChunk(idx,attempt+1); }, wait);
          } else {
            setMsg('Fehler: API dauerhaft überlastet. Bitte später erneut versuchen.');
            setGenerating(false);
          }
          return null;
        }
        return r.json();
      })
      .then(function(d){
        if(!d) return;
        if(d.error){ throw new Error(d.error.message||'API Fehler'); }
        var text=d.content&&d.content[0]&&d.content[0].text||'';
        var clean=text.replace(/```json|```/g,'').trim();
        var arr=JSON.parse(clean).map(function(q){ return Object.assign({id:Date.now()+'_'+Math.random().toString(36).slice(2)},q); });
        allNew=allNew.concat(arr);
        currentPool=currentPool.concat(arr);
        return saveGrammarPool(topic, currentPool).then(function(){ setTimeout(function(){ runChunk(idx+1,0); }, 500); });
      })
      .catch(function(e){ setMsg('Fehler bei Batch '+(idx+1)+': '+e.message); setGenerating(false); });
    }
    runChunk(0,0);
  }

  function deleteQ(id){
    var newPool = pool.filter(function(q){return q.id!==id;});
    saveGrammarPool(topic, newPool).then(function(){ setPool(newPool); });
  }

  function deleteAll(){
    if(!window.confirm('Alle '+pool.length+' Sätze löschen?')) return;
    saveGrammarPool(topic, []).then(function(){ setPool([]); setMsg('Pool geleert.'); });
  }

  return(
    <div style={{padding:8}}>
      <div style={{padding:'10px 12px',background:savedKey?'#d1fae5':'#fef3c7',borderRadius:8,border:'1px solid '+(savedKey?GR:AM),marginBottom:10}}>
        <div style={{fontWeight:'bold',fontSize:12,color:G900,marginBottom:6}}>🔑 Claude API-Key</div>
        {savedKey
          ? <div style={{fontSize:11,color:T}}>✓ Key hinterlegt ({savedKey.slice(0,8)}…)<button onClick={function(){setSavedKey('');setApiKey('');localStorage.removeItem('claude_api_key');}} style={{marginLeft:8,border:'none',background:'none',color:RE,cursor:'pointer',fontSize:11}}>Ändern</button></div>
          : <div style={{display:'flex',gap:6}}>
              <input value={apiKey} onChange={function(e){setApiKey(e.target.value);}} placeholder="sk-ant-…" type="password"
                style={{flex:1,padding:'6px 10px',fontSize:12,border:'1px solid '+AM,borderRadius:6,outline:'none'}}/>
              <button onClick={saveKey} style={BtnStyle(AM,'white',{padding:'6px 12px',fontSize:11})}>Speichern</button>
            </div>
        }
      </div>
      <div style={{display:'flex',gap:4,marginBottom:10,background:G100,padding:3,borderRadius:8}}>
        {[['sp','Simple Present'],['pp','Present Progressive'],['sa','some / any'],['mv','Modalverben']].map(function(t){
          return <button key={t[0]} onClick={function(){setTopic(t[0]);}} style={{flex:1,padding:'7px',borderRadius:6,border:'none',background:topic===t[0]?'white':G100,color:topic===t[0]?T:G600,fontWeight:'bold',fontSize:12,cursor:'pointer'}}>{t[1]}</button>;
        })}
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div style={{fontSize:12,color:G600}}>{loading?'Lade…':pool.length+' Sätze im Pool'}</div>
        {pool.length>0&&<button onClick={deleteAll} style={{border:'none',background:'none',color:RE,cursor:'pointer',fontSize:11,padding:'2px 4px'}}>🗑 Alle löschen</button>}
      </div>
      <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center'}}>
        <select value={batchN} onChange={function(e){setBatchN(Number(e.target.value));}} style={{padding:'6px 10px',borderRadius:6,border:'1px solid '+G200,fontSize:12}}>
          {[5,10,20,50].map(function(n){return <option key={n} value={n}>{n} Sätze</option>;})}
        </select>
        <button onClick={generate} disabled={generating||!savedKey} style={BtnStyle(T,'white',{flex:1,padding:'8px',fontSize:11,opacity:(!savedKey)?0.5:1})}>{generating?'Generiere…':'🤖 KI-Generierung'}</button>
      </div>
      {msg&&<div style={{fontSize:11,color:msg.startsWith('Fehler')?RE:T,padding:'6px 10px',background:msg.startsWith('Fehler')?'#fee2e2':'#d1fae5',borderRadius:6,marginBottom:8}}>{msg}</div>}
      <div style={{maxHeight:300,overflowY:'auto'}}>
        {pool.map(function(q,i){
          return <div key={q.id||i} style={{display:'flex',alignItems:'flex-start',gap:6,padding:'6px 8px',marginBottom:3,borderRadius:6,background:G50,border:'1px solid '+G200}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:'bold',color:G900}}>{q.sentence||q.text}</div>
              {q.answer&&<div style={{fontSize:10,color:T}}>✓ {q.answer}</div>}
              <div style={{fontSize:10,color:G600}}>{q.translation}</div>
            </div>
            <button onClick={function(){deleteQ(q.id||i);}} style={{border:'none',background:'none',color:G400,cursor:'pointer',fontSize:12,padding:'0 4px'}}>×</button>
          </div>;
        })}
      </div>
    </div>
  );
}

function GrammarProgress({ ruleStats, sessions, qStats }) {
  var qs=qStats||{};
  var mastered=Object.keys(qs).filter(function(id){return qs[id].correct>=2;}).length;
  var practiced=Object.keys(qs).length;
  var rules=Object.keys(ruleStats||{});
  var noData=rules.length===0&&(!sessions||sessions.length===0);
  return(
    <div>
      {practiced>0&&(
        <div style={{display:'flex',gap:8,marginBottom:10}}>
          <div style={{flex:1,padding:'10px',background:'#d1fae5',borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:22,fontWeight:'bold',color:T}}>{mastered}</div>
            <div style={{fontSize:10,color:T}}>gemeistert</div>
            <div style={{fontSize:9,color:G400}}>2× korrekt</div>
          </div>
          <div style={{flex:1,padding:'10px',background:G50,borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:22,fontWeight:'bold',color:G600}}>{practiced}</div>
            <div style={{fontSize:10,color:G600}}>geübt</div>
          </div>
          <div style={{flex:1,padding:'10px',background:'#fef3c7',borderRadius:10,textAlign:'center'}}>
            <div style={{fontSize:22,fontWeight:'bold',color:'#92400e'}}>{practiced-mastered}</div>
            <div style={{fontSize:10,color:'#92400e'}}>offen</div>
          </div>
        </div>
      )}
      {rules.map(function(rule){
        var st=ruleStats[rule];
        var pct=st.total>0?Math.round(st.correct/st.total*100):0;
        var col=pct>=80?GR:pct>=50?AM:RE;
        return <div key={rule} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',marginBottom:5,background:'white',borderRadius:8,border:'1px solid '+G200}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:'bold',fontSize:12,color:G900}}>{rule}</div>
            <div style={{fontSize:10,color:G400}}>{st.correct}/{st.total} richtig</div>
          </div>
          <div style={{width:60,height:5,background:G200,borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',width:pct+'%',background:col}}/>
          </div>
          <span style={{fontSize:12,fontWeight:'bold',color:col,minWidth:32,textAlign:'right'}}>{pct}%</span>
        </div>;
      })}
      {noData&&<div style={{textAlign:'center',color:G400,padding:12,fontSize:13}}>Noch keine Übungen absolviert.</div>}
    </div>
  );
}

function GrammarGame({ player, setPlayer, onDone }) {
  var [topic, setTopic] = useState(null);
  var [selTopics, setSelTopics] = useState(['sp']);
  var [pool, setPool] = useState([]);
  var [questions, setQuestions] = useState([]);
  var [qIdx, setQIdx] = useState(0);
  var [chosen, setChosen] = useState(null);
  var [input, setInput] = useState('');
  var inputRef = useRef();
  var [result, setResult] = useState(null);
  var [results, setResults] = useState([]);
  var [loading, setLoading] = useState(false);
  var [ruleStats, setRuleStats] = useState({});
  var [qStats, setQStats] = useState({});
  var [sessions, setSessions] = useState([]);
  var [phase, setPhase] = useState('menu');
  var [aiExplain, setAiExplain] = useState('');
  var [aiLoading, setAiLoading] = useState(false);
  var [grammarPts, setGrammarPts] = useState(10);
  var PROG_KEY = 'grammar_prog_'+(player&&player.id||'anon');

  React.useEffect(function(){
    sbGet('settings','key=eq.quiz_scoring&select=value').then(function(d){
      if(Array.isArray(d)&&d.length>0){try{var s=JSON.parse(d[0].value);if(s&&s.grammar_correct)setGrammarPts(s.grammar_correct);}catch(e){}}
    }).catch(function(){});
  },[]);

  useEffect(function(){
    try{ var s=localStorage.getItem(PROG_KEY); if(s){var p=JSON.parse(s);setRuleStats(p.ruleStats||{});setSessions(p.sessions||[]);setQStats(p.qStats||{});} }catch(e){}
  },[]);

  function saveProg(rs,sess,qs){
    try{ localStorage.setItem(PROG_KEY,JSON.stringify({ruleStats:rs,sessions:sess,qStats:qs})); }catch(e){}
  }

  function startTopics(topics){
    setLoading(true); setTopic(topics.join('+'));
    Promise.all(topics.map(function(t){ return loadGrammarPool(t); })).then(function(pools){
      var combined=[].concat.apply([],pools);
      var normalized=combined.map(function(q,i){
        var s=q.sentence||q.text||'';
        var a=q.answer||q.text||'';
        return Object.assign({id:q.id||('q'+i)},q,{sentence:s,answer:a});
      }).filter(function(q){return q.sentence&&q.answer&&q.sentence.includes('___');});
      if(!normalized||normalized.length===0){ setLoading(false); setPhase('empty'); return; }
      setPool(normalized);
      var qs=grammarPickQuestions(normalized,ruleStats,Math.min(10,normalized.length));
      qs=qs.map(function(q){ return Object.assign({},q,{_opts:buildOptions(q,normalized)}); });
      setQuestions(qs); setQIdx(0); setResults([]); setChosen(null); setResult(null); setPhase('game');
      setLoading(false);
    }).catch(function(){setLoading(false);});
  }

  function choose(opt){
    var q=questions[qIdx];
    if(!q||result) return;
    var correct=isCorrectAnswer(q,opt);
    tallyAnswer(correct);
    logWordEvent(player&&player.id, 'grammatik', null, q.answer||q.sentence, q.sentence, correct, null);
    var newRes={q:q,input:opt,correct:correct};
    setChosen(opt);
    setResults(function(r){return r.concat([newRes]);});
    var newStats=JSON.parse(JSON.stringify(ruleStats));
    if(!newStats[q.rule]) newStats[q.rule]={correct:0,total:0};
    newStats[q.rule].total++;
    if(correct) newStats[q.rule].correct++;
    setRuleStats(newStats);
    var newQStats=Object.assign({},qStats);
    if(!newQStats[q.id]) newQStats[q.id]={correct:0,total:0};
    newQStats[q.id].total++;
    if(correct) newQStats[q.id].correct++;
    setQStats(newQStats);
    setResult(newRes);
    if(!correct){
      setAiLoading(true);
      sbGet('settings','key=eq.anthropic_key').then(function(kd){
        var apiKey=(kd&&kd[0]&&kd[0].value)||localStorage.getItem('claude_api_key')||'';
        if(!apiKey){ setAiLoading(false); return; }
        fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({model:'claude-haiku-3-5-20241022',max_tokens:200,messages:[{role:'user',content:(function(){var aa=(q.acceptable_answers&&q.acceptable_answers.length>0)?q.acceptable_answers:[q.answer];return 'Erkläre kurz auf Deutsch, warum "'+aa.join('" oder "')+(aa.length>1?'" die richtigen Antworten sind':'" die richtige Antwort ist')+' für: "'+q.sentence+'". Schülerin, 6. Klasse. Max 2 Sätze.';}())}]})
        }).then(function(r){return r.json();}).then(function(data){
          var txt=data.content&&data.content[0]&&data.content[0].text||'';
          setAiExplain(txt); setAiLoading(false);
        }).catch(function(){setAiLoading(false);});
      }).catch(function(){setAiLoading(false);});
    } else { setAiExplain(''); }
  }

  function next(){
    if(qIdx+1>=questions.length){ finishSession(); return; }
    setQIdx(function(i){return i+1;}); setChosen(null); setInput(''); setResult(null); setAiExplain('');
    setTimeout(function(){ if(inputRef.current) inputRef.current.focus(); }, 50);
  }

  function finishSession(){
    var corr=results.filter(function(r){return r.correct;}).length;
    var newSess=(Array.isArray(sessions)?sessions:[]).concat([{date:new Date().toISOString(),correct:corr,total:results.length,topic:topic}]);
    setSessions(newSess); saveProg(ruleStats,newSess,qStats); setPhase('result');
    if(corr>0&&player&&player.id){
      var pts=corr*10;
      var newScore=Math.max(0,(player.total_score||0)+pts);
      var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if(UUID.test(player.id)){
        sbPatch('players',{total_score:newScore},'id=eq.'+player.id).catch(function(){});
      }
      if(setPlayer) setPlayer(function(p){return Object.assign({},p,{total_score:newScore});});
    }
  }

  if(phase==='menu') return(
    <div style={{padding:8}}>
      <div style={{marginBottom:12,padding:12,background:G50,borderRadius:10,border:'1px solid '+G200}}>
        <div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:6}}>📊 Fortschritt</div>
        <GrammarProgress ruleStats={ruleStats} sessions={Array.isArray(sessions)?sessions:[]} qStats={qStats}/>
      </div>
      <div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:8}}>Themen wählen:</div>
      {[['sp','Simple Present','Gegenwart — What does she do?'],['pp','Present Progressive','Verlaufsform — She is playing now.'],['sa','some / any','Mengen & Fragen — Can I have some?'],['mv','Modalverben','must / mustn\'t / should / shouldn\'t / need to']].map(function(t){
        var sel=selTopics.indexOf(t[0])>=0;
        return <div key={t[0]} onClick={function(){
            setSelTopics(function(prev){
              return sel?(prev.length>1?prev.filter(function(x){return x!==t[0];}):prev):prev.concat([t[0]]);
            });
          }}
          style={{display:'flex',alignItems:'center',gap:12,padding:'13px 14px',marginBottom:7,borderRadius:12,
            border:'2px solid '+(sel?T:G200),background:sel?T+'08':'white',cursor:'pointer',touchAction:'manipulation'}}>
          <div style={{width:20,height:20,borderRadius:5,border:'2px solid '+(sel?T:G400),background:sel?T:'white',
            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            {sel&&<span style={{color:'white',fontSize:13,fontWeight:'bold'}}>✓</span>}
          </div>
          <div>
            <div style={{fontWeight:'bold',fontSize:14,color:sel?T:G900}}>{t[1]}</div>
            <div style={{fontSize:11,color:G400}}>{t[2]}</div>
          </div>
        </div>;
      })}
      <button onClick={function(){startTopics(selTopics);}} disabled={selTopics.length===0}
        style={BtnStyle(T,'white',{width:'100%',padding:'13px',fontSize:14,marginTop:4,opacity:selTopics.length===0?0.4:1})}>
        {selTopics.length===2?'🔀 Gemischt starten':'▶ Starten'}
      </button>
    </div>
  );

  if(loading) return <div style={{textAlign:'center',padding:40,color:G400}}>Lade Fragen…</div>;

  if(phase==='empty') return(
    <div style={{padding:16,textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>📝</div>
      <div style={{fontWeight:'bold',fontSize:15,color:G900,marginBottom:8}}>Noch keine Übungen vorhanden</div>
      <div style={{fontSize:13,color:G600,marginBottom:16}}>
        Admin muss zuerst Sätze generieren: Admin → ✏️ Grammatik-Tab → Thema wählen → 🤖 KI-Generierung
      </div>
      <button onClick={function(){setPhase('menu');setTopic(null);}} style={BtnStyle(T,'white',{padding:'10px 20px'})}>← Zurück</button>
    </div>
  );

  if(phase==='result'){
    var corr2=results.filter(function(r){return r.correct;}).length;
    return(
      <div style={{padding:8}}>
        <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',borderRadius:14,padding:20,color:'white',textAlign:'center',marginBottom:12}}>
          <div style={{fontSize:36,marginBottom:6}}>{corr2>=8?'🏆':corr2>=6?'👍':'📚'}</div>
          <div style={{fontSize:20,fontWeight:'bold'}}>{corr2}/{results.length} richtig</div>
        </div>
        {results.map(function(r,i){
          return <div key={i} style={{padding:'6px 8px',marginBottom:3,borderRadius:7,background:r.correct?'#d1fae5':'#fee2e2',fontSize:11}}>
            <div style={{fontWeight:'bold',color:G900}}>{r.q.sentence}</div>
            <div style={{color:r.correct?T:RE}}>✓ <strong>{(r.q.acceptable_answers&&r.q.acceptable_answers.length>0)?r.q.acceptable_answers.join(' / '):r.q.answer}</strong>{!r.correct&&<span style={{color:G400}}> (du: {r.input})</span>}</div>
          </div>;
        })}
        <div style={{display:'flex',gap:6,marginTop:12}}>
          <button onClick={function(){setPhase('menu');setTopic(null);setResults([]);setQIdx(0);}} style={BtnStyle(G100,G600,{flex:1,padding:'11px',fontSize:13})}>← Menü</button>
          <button onClick={function(){startTopics(selTopics);}} style={BtnStyle(T,'white',{flex:1,padding:'11px',fontSize:13})}>🔄 Nochmal</button>
        </div>
      </div>
    );
  }

  var q=questions[qIdx];
  if(!q) return null;
  var isSomeAny=q.rule==='some/any'||q.rule==='modal verbs';
  var prevCorrect=(qStats[q.id]||{}).correct||0;
  var stage2=!isSomeAny&&prevCorrect>=2; // Stufe 2: Freitext
  var opts=q._opts||[q.answer];
  return(
    <div style={{padding:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <div style={{flex:1,height:5,background:G200,borderRadius:3,overflow:'hidden'}}>
          <div style={{height:'100%',width:((qIdx/questions.length)*100)+'%',background:T}}/>
        </div>
        {!isSomeAny&&<span style={{fontSize:10,padding:'2px 7px',borderRadius:8,background:stage2?'#fef3c7':'#e0f2fe',color:stage2?'#92400e':'#0369a1',fontWeight:'bold'}}>Stufe {stage2?2:1}</span>}
        <span style={{fontSize:11,color:G400}}>{qIdx+1}/{questions.length}</span>
      </div>
      <div style={{padding:'18px 16px',background:G50,borderRadius:14,marginBottom:14,border:'2px solid '+G200,textAlign:'center'}}>
        <div style={{fontSize:10,color:G400,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>{q.rule}</div>
        <div style={{fontSize:19,fontWeight:'bold',color:G900,lineHeight:1.4}}>{q.sentence}</div>
        {q.translation&&result&&<div style={{fontSize:11,color:G400,marginTop:6,fontStyle:'italic'}}>{q.translation}</div>}
      </div>
      {stage2&&!result&&(
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
            onKeyDown={function(e){if(e.key==='Enter'&&input.trim())choose(input.trim());}}
            placeholder="Antwort eintippen…" autoCapitalize="none" autoCorrect="off" autoComplete="off"
            style={{flex:1,padding:'13px 14px',fontSize:16,border:'2px solid '+T,borderRadius:10,outline:'none'}}/>
          <button onClick={function(){if(input.trim())choose(input.trim());}} style={BtnStyle(T,'white',{padding:'13px 16px',fontSize:16})}>✓</button>
        </div>
      )}
      {!stage2&&!result&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          {opts.map(function(opt,i){
            var isChosen=chosen===opt;
            var bg='white', border='2px solid '+G200, color=G900;
            if(isChosen){ bg=T+'18'; border='2px solid '+T; }
            return <button key={i} onClick={function(){choose(opt);}}
              style={{padding:'13px 10px',borderRadius:12,border:border,background:bg,color:color,
                fontSize:15,fontWeight:'bold',cursor:'pointer',touchAction:'manipulation'}}>
              {opt}
            </button>;
          })}
        </div>
      )}
      {result&&!stage2&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          {opts.map(function(opt,i){
            var isChosen=chosen===opt;
            var isCorrect=isCorrectAnswer(q,opt);
            var bg='white', border='2px solid '+G200, color=G900;
            if(isCorrect){ bg='#d1fae5'; border='2px solid '+GR; color=T; }
            else if(isChosen&&!isCorrect){ bg='#fee2e2'; border='2px solid '+RE; color=RE; }
            return <button key={i} disabled style={{padding:'13px 10px',borderRadius:12,border:border,background:bg,color:color,fontSize:15,fontWeight:'bold',cursor:'default'}}>{opt}</button>;
          })}
        </div>
      )}
      {result&&(
        <div style={{padding:'10px 12px',borderRadius:10,background:result.correct?'#d1fae5':'#fee2e2',border:'1px solid '+(result.correct?GR:RE),marginBottom:8}}>
          <div style={{fontWeight:'bold',color:result.correct?T:RE,marginBottom:result.correct?0:4}}>
            {result.correct?'✓ Richtig!'+(prevCorrect+1>=2&&!isSomeAny?' — Ab jetzt Stufe 2! ✏️':''):'✗ Falsch — richtig: '+((q.acceptable_answers&&q.acceptable_answers.length>0)?q.acceptable_answers.join(' / '):q.answer)}
          </div>
          {aiLoading&&<div style={{fontSize:11,color:G400,marginTop:4}}>KI erklärt…</div>}
          {aiExplain&&<div style={{fontSize:11,color:G600,marginTop:4}}>{aiExplain}</div>}
        </div>
      )}
      {result&&<button onClick={next} style={BtnStyle(T,'white',{width:'100%',padding:'13px',fontSize:14})}>{qIdx+1>=questions.length?'📊 Auswertung':'→ Weiter'}</button>}
    </div>
  );
}

export { GrammarAdmin, GrammarProgress, GrammarGame };
