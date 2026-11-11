// Admin: Ansicht EINES Spielers — Spieler wählen, dann
//  1) Lernzeit pro Tag (aufklappbar: was an dem Tag geübt wurde, jede Antwort)
//  2) Leiterspiele (neueste oben, mit aktuellem Topf-Inhalt)
//  3) Gelernt (Leiterspiele mit 100 %)
// Bewusst nur die Daten des ausgewählten Spielers laden und zeigen.
import { sbGet } from '../core/api.js';
import { lsGetRunsForPlayer, lsPercent } from '../core/leitner.js';
import { useEffect, useState } from '../core/react.js';
import { G100, G200, G400, G50, G600, G900, GAME_META, POT_COL, RE, T, TL, WD_LONG, gameOf } from '../core/theme.js';
import { dayKey, fmtDayShort, fmtDuration, shiftDay, weekdayOf } from '../core/util.js';
import { normWordKey, parseData, safeWords } from '../core/words.js';

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var LANG_FLAG = { en:'🇬🇧', es:'🇪🇸', fr:'🇫🇷', la:'🏛️' };
var LANG_NAME = { en:'Englisch', es:'Spanisch', fr:'Französisch', la:'Latein' };
var DAYS_BACK = 60;
var SEL_KEY = 'admin_player_view_sel';

function potLabel(p){ return p===6 ? 'Gelernt' : 'Topf '+p; }
function potShort(p){ return p===6 ? '✓' : 'T'+p; }
function hhmm(ts){ var d=new Date(ts); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
function dayOf(ts){ return String(ts||'').slice(0,10); }
function dayLabel(d){
  var today=dayKey();
  if(d===today) return 'Heute';
  if(d===shiftDay(today,-1)) return 'Gestern';
  return WD_LONG[weekdayOf(d)];
}
var VERDICT_TXT = {
  partial:'fast richtig (Tippfehler/Akzent)', ai:'von KI akzeptiert', helped:'mit Hilfe',
  skipped:'nicht gewusst', choice:'Auswahl', letters:'Buchstaben sortieren',
  match:'Paar-Zuordnung', match_wrong:'Paar-Zuordnung mit Fehlversuch',
  hints1:'mit 1 Tipp', hints2:'mit 2 Tipps'
};

function Section({ title, right, children }){
  return <div style={{marginBottom:16}}>
    <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:6}}>
      <div style={{fontWeight:'bold',fontSize:11,color:G600,textTransform:'uppercase',letterSpacing:1,flex:1}}>{title}</div>
      {right}
    </div>
    {children}
  </div>;
}

function PotChips({ pots }){
  return <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
    {[1,2,3,4,5,6].map(function(p){
      var n=((pots&&pots[p])||[]).length; if(!n) return null;
      var c=POT_COL[p];
      return <span key={p} style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:c+'18',color:c,fontWeight:'bold'}}>{p===6?'Gelernt':'T'+p}: {n}</span>;
    })}
  </div>;
}

// Aktueller Inhalt aller Töpfe eines Runs.
function PotContents({ pots }){
  return <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
    {[1,2,3,4,5,6].map(function(p){
      var list=(pots&&pots[p])||[]; if(!list.length) return null;
      var c=POT_COL[p];
      return <div key={p} style={{borderLeft:'3px solid '+c,paddingLeft:8}}>
        <div style={{fontSize:10,fontWeight:'bold',color:c,marginBottom:2}}>{potLabel(p)} · {list.length}</div>
        {list.map(function(w,i){
          return <div key={i} style={{display:'flex',gap:6,fontSize:11,padding:'1px 0'}}>
            <span style={{fontWeight:'bold',color:G900,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.isNew&&<span style={{fontSize:9,color:'#7c3aed',marginRight:4}}>NEU</span>}{w.word}</span>
            <span style={{color:G600,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.clue}</span>
            <span style={{fontSize:10,color:'#059669',whiteSpace:'nowrap'}}>✓{w.correct||0}</span>
            <span style={{fontSize:10,color:RE,whiteSpace:'nowrap'}}>✗{w.wrong||0}</span>
          </div>;
        })}
      </div>;
    })}
  </div>;
}

// Eine Antwortzeile: Uhrzeit · Frage → Eingabe · ✓/✗ · Topf vorher→nachher
function AnswerRow({ e }){
  var ok=e.correct;
  var hasAns = e.answer!=null && e.answer!=='';
  var vtxt = e.verdict ? (VERDICT_TXT[e.verdict]||e.verdict) : '';
  return <div style={{display:'grid',gridTemplateColumns:'36px 1fr auto',gap:6,padding:'4px 0',borderBottom:'1px solid '+G100,fontSize:11,alignItems:'start'}}>
    <span style={{color:G400,fontSize:10,paddingTop:1}}>{hhmm(e.created_at)}</span>
    <div style={{minWidth:0}}>
      <div><span style={{fontWeight:'bold',color:G900}}>{e.word}</span>{e.clue&&<span style={{color:G400}}> · {e.clue}</span>}</div>
      <div style={{fontSize:10,color:ok?'#059669':RE}}>
        {ok?'✓':'✗'} {hasAns ? <span>„{e.answer}"</span> : e.verdict==='skipped' ? '' : <span style={{color:G400}}>{e.answer===''?'(leer)':''}</span>}
        {vtxt&&<span style={{color:G400}}>{hasAns?' · ':''}{vtxt}</span>}
      </div>
    </div>
    <span style={{fontSize:10,fontWeight:'bold',whiteSpace:'nowrap',color:e.pot!=null?POT_COL[e.pot]:G400}}>
      {e.from_pot!=null?potShort(e.from_pot)+'→':''}{e.pot!=null?potShort(e.pot):''}
    </span>
  </div>;
}

// Ein Block innerhalb eines Tages: ein Leiterspiel-Run oder ein anderes Spiel.
function DayBlock({ title, icon, sec, events, cor, wrong, pots, defaultOpen }){
  var [open,setOpen]=useState(!!defaultOpen);
  var [showPots,setShowPots]=useState(false);
  var ans=cor+wrong;
  var pct=ans>0?Math.round(cor/ans*100):null;
  return <div style={{border:'1px solid '+G200,borderRadius:8,marginBottom:6,background:'white'}}>
    <div onClick={function(){setOpen(!open);}} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 9px',cursor:'pointer'}}>
      <span style={{fontSize:14}}>{icon}</span>
      <span style={{flex:1,minWidth:0,fontWeight:'bold',fontSize:12,color:G900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{title}</span>
      {sec>0&&<span style={{fontSize:11,color:G600}}>{fmtDuration(sec)}</span>}
      {ans>0&&<span style={{fontSize:11,fontWeight:'bold',color:pct>=80?T:pct>=50?'#d97706':RE}}>{cor}/{ans}</span>}
      <span style={{fontSize:10,color:G400}}>{open?'▲':'▼'}</span>
    </div>
    {open&&<div style={{padding:'0 9px 8px'}}>
      {events.length===0
        ? <div style={{fontSize:10,color:G400,padding:'4px 0'}}>Keine einzelnen Antworten gespeichert.</div>
        : events.map(function(e){ return <AnswerRow key={e.id} e={e}/>; })}
      {pots&&<div style={{marginTop:6}}>
        <button onClick={function(){setShowPots(!showPots);}} style={{border:'1px solid '+G200,background:G50,borderRadius:6,padding:'3px 8px',fontSize:10,color:G600,cursor:'pointer'}}>
          {showPots?'▲ Töpfe ausblenden':'🪜 Aktueller Stand der Töpfe'}
        </button>
        {showPots&&<PotContents pots={pots}/>}
      </div>}
    </div>}
  </div>;
}

function DayDetail({ day, sessions, events, runsById, progByRun }){
  // Gruppen: je Leiterspiel-Run, sonst je Spiel
  var groups={};
  function grp(key, init){ if(!groups[key]) groups[key]=Object.assign({sec:0,events:[],cor:0,wrong:0,first:null},init); return groups[key]; }
  sessions.forEach(function(s){
    var g=gameOf(s);
    var key = s.run_id && runsById[s.run_id] ? 'run:'+s.run_id : 'game:'+g;
    var G = grp(key, s.run_id && runsById[s.run_id] ? {runId:s.run_id} : {game:g});
    G.sec += s.active_seconds||0;
  });
  events.forEach(function(e){
    var key = e.run_id && runsById[e.run_id] ? 'run:'+e.run_id : 'game:'+(e.game||'sonstiges');
    var G = grp(key, e.run_id && runsById[e.run_id] ? {runId:e.run_id} : {game:e.game||'sonstiges'});
    G.events.push(e);
    if(e.correct) G.cor++; else G.wrong++;
    if(!G.first || e.created_at<G.first) G.first=e.created_at;
  });
  var list=Object.keys(groups).map(function(k){ return Object.assign({key:k},groups[k]); })
    .filter(function(g){ return g.sec>0 || g.events.length>0; });
  // Leiterspiele zuerst, dann nach Zeit
  list.sort(function(a,b){ return (b.runId?1:0)-(a.runId?1:0) || b.sec-a.sec; });
  if(list.length===0) return <div style={{fontSize:11,color:G400,padding:'6px 0'}}>An diesem Tag wurde nichts geübt.</div>;
  return <div style={{marginTop:8}}>
    {list.map(function(g){
      var run = g.runId ? runsById[g.runId] : null;
      var meta = GAME_META[g.game]||GAME_META.sonstiges;
      var prog = run ? progByRun[run.id] : null;
      return <DayBlock key={g.key+day}
        title={run ? run.name : meta.label}
        icon={run ? (run.icon||'🪜') : meta.icon}
        sec={g.sec} events={g.events} cor={g.cor} wrong={g.wrong}
        pots={prog?prog.pots:null} defaultOpen={list.length===1}/>;
    })}
  </div>;
}

function RunCard({ run, prog, lastPlayed, secTotal }){
  var [open,setOpen]=useState(false);
  var pots = prog ? (prog.pots||{}) : null;
  var total = pots ? [1,2,3,4,5,6].reduce(function(s,p){return s+((pots[p]||[]).length);},0) : (run.word_count||safeWords(run.words).length);
  var pct = prog ? Math.round(lsPercent(prog)) : 0;
  var learned = pots ? (pots[6]||[]).length : 0;
  return <div style={{border:'1px solid '+(prog?T+'44':G200),background:prog?TL:'white',borderRadius:9,padding:'8px 10px',marginBottom:6}}>
    <div onClick={function(){ if(prog) setOpen(!open); }} style={{display:'flex',alignItems:'center',gap:8,cursor:prog?'pointer':'default'}}>
      <span style={{fontSize:18}}>{run.icon||'🎯'}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:'bold',fontSize:12,color:G900}}>{run.name}</div>
        <div style={{fontSize:10,color:G400}}>
          {LANG_FLAG[run.language]||''} angelegt {fmtDayShort(dayOf(run.created_at))}
          {lastPlayed?' · zuletzt '+fmtDayShort(lastPlayed):''}
          {secTotal>0?' · '+fmtDuration(secTotal):''}
        </div>
      </div>
      {prog
        ? <div style={{textAlign:'right'}}>
            <div style={{fontSize:14,fontWeight:'bold',color:T}}>{pct}%</div>
            <div style={{fontSize:9,color:G400}}>{learned}/{total} gelernt</div>
          </div>
        : <span style={{fontSize:10,color:G400}}>nicht begonnen · {total} Vok.</span>}
      {prog&&<span style={{fontSize:10,color:G400}}>{open?'▲':'▼'}</span>}
    </div>
    {prog&&<div style={{marginTop:6}}>
      <div style={{height:4,background:G200,borderRadius:2,overflow:'hidden',marginBottom:5}}>
        <div style={{height:'100%',width:pct+'%',background:T}}/>
      </div>
      <PotChips pots={pots}/>
    </div>}
    {open&&pots&&<PotContents pots={pots}/>}
  </div>;
}

function AdminPlayerView({ allUsers }){
  var kids = (allUsers||[]).filter(function(u){ return !u.is_admin; });
  var initial = (function(){
    try{ var s=localStorage.getItem(SEL_KEY); if(s && kids.some(function(u){return u.id===s;})) return s; }catch(e){}
    var emma = kids.find(function(u){ return u.name==='Emma'; });
    return emma ? emma.id : (kids[0]&&kids[0].id);
  })();
  var [pid,setPid]=useState(initial);
  var [data,setData]=useState(null);
  var [openDay,setOpenDay]=useState(dayKey());
  var [lang,setLang]=useState('all');
  var [showLearned,setShowLearned]=useState(false);
  var [showUnstarted,setShowUnstarted]=useState(false);
  var [showAllDays,setShowAllDays]=useState(false);

  useEffect(function(){
    if(!pid && kids[0]) setPid(kids[0].id);
  },[kids.length]);

  useEffect(function(){
    if(!pid || !UUID.test(pid)) return;
    try{ localStorage.setItem(SEL_KEY,pid); }catch(e){}
    setData(null);
    var since = new Date(); since.setDate(since.getDate()-DAYS_BACK); since.setHours(0,0,0,0);
    var iso = since.toISOString();
    Promise.all([
      sbGet('learn_sessions','player_id=eq.'+pid+'&started_at=gte.'+iso+'&select=game,run_id,language,active_seconds,correct_count,wrong_count,started_at&order=started_at.asc&limit=5000'),
      sbGet('word_events','player_id=eq.'+pid+'&created_at=gte.'+iso+'&select=id,game,run_id,word,clue,correct,pot,from_pot,answer,verdict,created_at&order=created_at.asc&limit=20000'),
      sbGet('ls_progress','player_id=eq.'+pid+'&select=run_id,data,updated_at'),
      lsGetRunsForPlayer(pid),
      sbGet('learn_sessions','player_id=eq.'+pid+'&run_id=not.is.null&select=run_id,active_seconds,started_at&limit=20000')
    ]).then(function(r){
      var arr=function(x){ return Array.isArray(x)?x:[]; };
      var progByRun={};
      arr(r[2]).forEach(function(row){ var d=parseData(row.data); if(d&&d.pots) progByRun[row.run_id]=d; });
      var runs=arr(r[3]);
      var runsById={}; runs.forEach(function(x){ runsById[x.id]=x; });
      // Wie die App beim Öffnen (reconcile in leiterspiel.jsx): Wörter, die
      // nachträglich in den Run kamen, zählen als Topf 1; entfernte fallen raus.
      Object.keys(progByRun).forEach(function(rid){
        var run=runsById[rid]; if(!run) return;
        var keys={}; safeWords(run.words).forEach(function(w){ keys[normWordKey(w.word)]=w; });
        var d=progByRun[rid], seen={}, pots={1:[],2:[],3:[],4:[],5:[],6:[]};
        [1,2,3,4,5,6].forEach(function(p){ (d.pots[p]||[]).forEach(function(w){
          var k=normWordKey(w.word); if(!keys[k]||seen[k]) return; seen[k]=1; pots[p].push(w); }); });
        Object.keys(keys).forEach(function(k){ if(!seen[k]) pots[1].push(Object.assign({},keys[k],{correct:0,wrong:0,isNew:true})); });
        progByRun[rid]=Object.assign({},d,{pots:pots});
      });
      var runSec={}, runLast={};
      arr(r[4]).forEach(function(s){
        runSec[s.run_id]=(runSec[s.run_id]||0)+(s.active_seconds||0);
        var d=dayOf(s.started_at); if((s.active_seconds||0)>0 && (!runLast[s.run_id]||d>runLast[s.run_id])) runLast[s.run_id]=d;
      });
      setData({sessions:arr(r[0]), events:arr(r[1]), progByRun:progByRun, runs:runs, runsById:runsById, runSec:runSec, runLast:runLast, pid:pid});
    }).catch(function(){ setData({sessions:[],events:[],progByRun:{},runs:[],runsById:{},runSec:{},runLast:{},pid:pid}); });
  },[pid]);

  var player = kids.find(function(u){ return u.id===pid; });

  var picker = <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
    {kids.map(function(u){
      var sel=u.id===pid;
      return <button key={u.id} onClick={function(){ setPid(u.id); setOpenDay(dayKey()); }}
        style={{padding:'8px 14px',borderRadius:20,border:'2px solid '+(sel?T:G200),background:sel?T:'white',color:sel?'white':G600,fontWeight:'bold',fontSize:13,cursor:'pointer'}}>
        {u.name}
      </button>;
    })}
  </div>;

  if(!kids.length) return <div style={{color:G400,fontSize:12,padding:20,textAlign:'center'}}>Keine Spieler vorhanden.</div>;
  if(!data || data.pid!==pid) return <div>{picker}<div style={{textAlign:'center',padding:30,color:G400}}>Lade {player?player.name:''}…</div></div>;

  // ---- Tage ----
  var today=dayKey();
  var byDay={};
  function D(d){ return byDay[d]||(byDay[d]={sec:0,cor:0,wrong:0,sessions:[],events:[]}); }
  data.sessions.forEach(function(s){ var x=D(dayOf(s.started_at)); x.sec+=s.active_seconds||0; x.sessions.push(s); });
  data.events.forEach(function(e){ var x=D(dayOf(e.created_at)); x.events.push(e); if(e.correct) x.cor++; else x.wrong++; });
  // Sitzungen ohne Wort-Events (ältere Spiele): Zähler aus learn_sessions nehmen
  Object.keys(byDay).forEach(function(d){
    var x=byDay[d];
    if(x.events.length===0) x.sessions.forEach(function(s){ x.cor+=s.correct_count||0; x.wrong+=s.wrong_count||0; });
  });
  var days=[]; for(var i=0;i<DAYS_BACK;i++) days.push(shiftDay(today,-i));
  var activeDays=days.filter(function(d){ return byDay[d] && (byDay[d].sec>0 || byDay[d].events.length>0); });
  var visibleDays = showAllDays ? days.filter(function(d){ return d===today || byDay[d]; }) : days.slice(0,14);
  var maxSec = visibleDays.reduce(function(m,d){ return Math.max(m,(byDay[d]&&byDay[d].sec)||0); }, 60);
  var weekSec = days.slice(0,7).reduce(function(s,d){ return s+((byDay[d]&&byDay[d].sec)||0); },0);

  // ---- Leiterspiele ----
  var runs = data.runs.slice().filter(function(r){ return lang==='all' || r.language===lang; });
  runs.sort(function(a,b){ return String(b.created_at).localeCompare(String(a.created_at)); });
  var learnedRuns = runs.filter(function(r){ var p=data.progByRun[r.id]; return p && lsPercent(p)>=100; });
  var openRuns = runs.filter(function(r){ var p=data.progByRun[r.id]; return p && lsPercent(p)<100; });
  var unstartedRuns = runs.filter(function(r){ return !data.progByRun[r.id]; });
  var langs = {}; data.runs.forEach(function(r){ if(r.language) langs[r.language]=1; });

  return <div>
    {picker}

    <Section title={'📅 Lernzeit pro Tag · '+(player?player.name:'')}
      right={<span style={{fontSize:10,color:G400}}>7 Tage: {fmtDuration(weekSec)} · {activeDays.length} Lerntage / {DAYS_BACK}</span>}>
      <div style={{background:'white',border:'1px solid '+G200,borderRadius:10,overflow:'hidden'}}>
        {visibleDays.map(function(d){
          var x=byDay[d]||{sec:0,cor:0,wrong:0,sessions:[],events:[]};
          var isOpen=openDay===d;
          var ans=x.cor+x.wrong;
          var min=Math.round(x.sec/60);
          var empty = x.sec===0 && ans===0;
          return <div key={d} style={{borderBottom:'1px solid '+G100,background:isOpen?G50:'white'}}>
            <div onClick={function(){ if(!empty) setOpenDay(isOpen?null:d); }}
              style={{display:'grid',gridTemplateColumns:'82px 1fr 54px 62px 14px',gap:8,alignItems:'center',padding:'7px 10px',cursor:empty?'default':'pointer'}}>
              <div>
                <div style={{fontSize:12,fontWeight:'bold',color:empty?G400:G900}}>{dayLabel(d)}</div>
                <div style={{fontSize:9,color:G400}}>{fmtDayShort(d)}</div>
              </div>
              <div style={{height:8,background:G100,borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',width:Math.round(x.sec/maxSec*100)+'%',background:min>=10?T:'#f59e0b',borderRadius:4}}/>
              </div>
              <div style={{fontSize:12,fontWeight:'bold',color:empty?G400:G900,textAlign:'right'}}>{empty?'–':min+' Min'}</div>
              <div style={{fontSize:10,color:G600,textAlign:'right'}}>{ans>0?<span><span style={{color:'#059669'}}>✓{x.cor}</span> <span style={{color:RE}}>✗{x.wrong}</span></span>:''}</div>
              <span style={{fontSize:9,color:G400}}>{empty?'':isOpen?'▲':'▼'}</span>
            </div>
            {isOpen&&!empty&&<div style={{padding:'0 10px 10px'}}>
              <DayDetail day={d} sessions={x.sessions} events={x.events} runsById={data.runsById} progByRun={data.progByRun}/>
            </div>}
          </div>;
        })}
      </div>
      <button onClick={function(){setShowAllDays(!showAllDays);}} style={{marginTop:6,border:'none',background:'none',color:T,fontSize:11,cursor:'pointer',padding:0}}>
        {showAllDays?'▲ nur letzte 14 Tage':'▼ alle Lerntage der letzten '+DAYS_BACK+' Tage'}
      </button>
    </Section>

    <Section title={'🪜 Leiterspiele · '+openRuns.length}
      right={<div style={{display:'flex',gap:3}}>
        {['all'].concat(Object.keys(langs).sort()).map(function(l){
          var sel=lang===l;
          return <button key={l} onClick={function(){setLang(l);}} style={{padding:'2px 7px',fontSize:10,borderRadius:10,border:'1px solid '+(sel?T:G200),background:sel?T:'white',color:sel?'white':G600,cursor:'pointer'}}>
            {l==='all'?'Alle':(LANG_FLAG[l]||'')+' '+(LANG_NAME[l]||l)}
          </button>;
        })}
      </div>}>
      {openRuns.length===0&&<div style={{fontSize:11,color:G400,padding:10,textAlign:'center'}}>Keine angefangenen Leiterspiele.</div>}
      {openRuns.map(function(r){ return <RunCard key={r.id} run={r} prog={data.progByRun[r.id]} lastPlayed={data.runLast[r.id]} secTotal={data.runSec[r.id]||0}/>; })}
    </Section>

    <Section title={'⏳ Noch nicht begonnen · '+unstartedRuns.length}
      right={unstartedRuns.length>0&&<button onClick={function(){setShowUnstarted(!showUnstarted);}} style={{border:'none',background:'none',color:T,fontSize:11,cursor:'pointer'}}>{showUnstarted?'▲ ausblenden':'▼ anzeigen'}</button>}>
      {showUnstarted&&unstartedRuns.map(function(r){ return <RunCard key={r.id} run={r} prog={null} lastPlayed={data.runLast[r.id]} secTotal={data.runSec[r.id]||0}/>; })}
    </Section>

    <Section title={'✅ Gelernt · '+learnedRuns.length}
      right={learnedRuns.length>0&&<button onClick={function(){setShowLearned(!showLearned);}} style={{border:'none',background:'none',color:T,fontSize:11,cursor:'pointer'}}>{showLearned?'▲ ausblenden':'▼ anzeigen'}</button>}>
      {learnedRuns.length===0&&<div style={{fontSize:11,color:G400,padding:6}}>Noch kein Leiterspiel komplett gelernt.</div>}
      {showLearned&&learnedRuns.map(function(r){ return <RunCard key={r.id} run={r} prog={data.progByRun[r.id]} lastPlayed={data.runLast[r.id]} secTotal={data.runSec[r.id]||0}/>; })}
    </Section>
  </div>;
}

export { AdminPlayerView };
