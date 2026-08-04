import { hashPw, sbDel, sbGet, sbPatch, sbPost } from '../core/api.js';
import { SB_URL } from '../core/config.js';
import { DEFAULT_STREAK, lsGetRuns, lsPercent, lsRunPacing, saveChapterSentences, saveChapterWords, syncAutoRunsForScope } from '../core/leitner.js';
import { useEffect, useMemo, useRef, useState } from '../core/react.js';
import { chGrade, filterRunsByScope, scopeText } from '../core/scope.js';
import { AM, BtnStyle, DAILY_GOAL_SEC, G100, G200, G400, G50, G600, G900, GR, POT_COL, RE, T, TL } from '../core/theme.js';
import { calcStreakFromByDay, fmtTestStamp, getWeekDays, naturalSort } from '../core/util.js';
import { aiCategorizeWords, normWordKey, parseData, quickDetectType, safeWords, translateSentenceEN2DE } from '../core/words.js';
import { GrammarAdmin } from './grammar.jsx';
import { KlassenarbeitAdmin } from './klassenarbeit.jsx';
import { LeitersSpielCreate, LeitersSpielStreakSettings, RunEditor } from './leiterspiel.jsx';
import { DailyLearnChart, GameBreakdown, LeiterspielFortschritt, RepeatRunHistory, TagesDetail } from './progress.jsx';
import { LernVerlaufChart } from './widgets.jsx';

function AdminLernzeitOverview({ allUsers }) {
  var [sessions, setSessions] = useState([]);
  useEffect(function(){
    sbGet('learn_sessions','select=player_id,active_seconds,started_at').then(function(d){ if(Array.isArray(d)) setSessions(d); }).catch(function(){});
  },[]);
  var weekDays = getWeekDays();
  var today = new Date().toISOString().slice(0,10);
  var DAY_LABELS = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  var playerByDay = {};
  sessions.forEach(function(s){
    var pid=s.player_id; var k=s.started_at?String(s.started_at).slice(0,10):'';
    if(!k||!pid) return;
    if(!playerByDay[pid]) playerByDay[pid]={};
    playerByDay[pid][k]=(playerByDay[pid][k]||0)+(s.active_seconds||0);
  });
  if(!allUsers||allUsers.length===0) return null;
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontWeight:'bold',fontSize:11,color:G600,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>📅 Lernzeit diese Woche · Ziel: 15 Min/Tag</div>
      <div style={{background:'white',borderRadius:10,border:'1px solid '+G200,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'90px repeat(7,1fr)',background:G50,padding:'5px 8px',gap:2,borderBottom:'1px solid '+G200}}>
          <div/>
          {weekDays.map(function(d,i){
            var isToday=d===today, isFuture=d>today;
            return <div key={d} style={{textAlign:'center',fontSize:9,color:isFuture?G200:isToday?T:G600,fontWeight:isToday?'bold':'normal'}}>{DAY_LABELS[i]}<br/><span style={{fontSize:8}}>{d.slice(8)}.</span></div>;
          })}
        </div>
        {allUsers.map(function(u){
          var byDay=playerByDay[u.id]||{};
          var streak=calcStreakFromByDay(byDay);
          return <div key={u.id} style={{display:'grid',gridTemplateColumns:'90px repeat(7,1fr)',padding:'5px 8px',gap:2,borderBottom:'1px solid '+G50,alignItems:'center'}}>
            <div style={{fontSize:11,fontWeight:'bold',color:G900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {u.name}{streak>0&&<span style={{fontSize:9,color:'#d97706',marginLeft:3}}>🔥{streak}</span>}
            </div>
            {weekDays.map(function(d){
              var sec=byDay[d]||0, min=Math.round(sec/60);
              var done=sec>=DAILY_GOAL_SEC, isFuture=d>today, isToday=d===today;
              var bg=isFuture?'white':done?'#d1fae5':sec>0?'#fef3c7':'#f9fafb';
              var col=isFuture?G200:done?T:sec>0?'#92400e':G400;
              return <div key={d} style={{textAlign:'center',padding:'3px 1px',borderRadius:4,background:bg,border:'1px solid '+(isToday?T:'transparent')}}>
                <span style={{fontSize:9,fontWeight:'bold',color:col}}>{isFuture?'':min>0?min+'′':'–'}</span>
                {done&&!isFuture&&<div style={{fontSize:7,color:T}}>✓</div>}
              </div>;
            })}
          </div>;
        })}
      </div>
    </div>
  );
}

function LeitersSpielAdminOverview({ chapters, scope, player }) {
  var [runs, setRuns] = useState([]);
  var [allUsers, setAllUsers] = useState([]);
  var [allProgress, setAllProgress] = useState([]);
  var [allDisputes, setAllDisputes] = useState([]);
  var [allSessions, setAllSessions] = useState([]);
  var [loading, setLoading] = useState(true);
  var [editRun, setEditRun] = useState(null);
  var [tab, setTab] = useState('runs');
  var [expanded, setExpanded] = useState({});
  var [syncing, setSyncing] = useState(false);
  var [syncMsg, setSyncMsg] = useState('');
  function toggle(key){ setExpanded(function(prev){var n=Object.assign({},prev);n[key]=!n[key];return n;}); }
  useEffect(function(){
    Promise.all([
      lsGetRuns(),
      sbGet('players','select=id,name,total_score,is_active,is_admin').then(function(d){return Array.isArray(d)?d:[];}),
      sbGet('ls_progress','select=player_id,run_id,data').then(function(d){return Array.isArray(d)?d:[];}),
      sbGet('word_disputes','status=eq.open&order=created_at.desc').then(function(d){return Array.isArray(d)?d:[];}),
      sbGet('learn_sessions','select=player_id,run_id,active_seconds,started_at').then(function(d){return Array.isArray(d)?d:[];})
    ]).then(function(res){
      setRuns(filterRunsByScope(Array.isArray(res[0])?res[0]:[], chapters, scope));
      setAllUsers((res[1]||[]).filter(function(u){return !u.is_admin;}));
      setAllProgress(res[2]||[]);
      setAllDisputes(res[3]||[]);
      setAllSessions(res[4]||[]);
      setLoading(false);
    }).catch(function(){ setLoading(false); });
  },[scope&&scope.grade, scope&&scope.language]);
  function progressSessionsFor(playerId, runId){
    var row = allProgress.find(function(p){return p.player_id===playerId && p.run_id===runId;});
    if(!row) return [];
    var d = parseData(row.data);
    return (d && d.sessions) || [];
  }
  function secondsForPlayerRun(playerId, runId){
    var sessions = progressSessionsFor(playerId, runId);
    return sessions.reduce(function(s,sess){return s+(sess.dur||0);},0);
  }
  function secondsForPlayerTotal(playerId){
    var s = 0;
    (allProgress||[]).forEach(function(p){
      if(p.player_id !== playerId) return;
      var d = parseData(p.data);
      ((d && d.sessions) || []).forEach(function(sess){ s += sess.dur || 0; });
    });
    (allSessions||[]).forEach(function(r){
      if(r.player_id===playerId && !r.run_id) s += (r.active_seconds||0);
    });
    return s;
  }
  function fmtMin(sec){ var m=Math.round(sec/60); if(m<60) return m+' Min'; var h=Math.floor(m/60); return h+'h '+(m%60)+'m'; }
  function deleteRun(runId){
    var run = runs.find(function(r){return r.id===runId;});
    if(!run) return;
    var progRows = (allProgress||[]).filter(function(p){return p.run_id===runId;});
    var msg = 'Run "'+run.name+'" löschen?';
    if(progRows.length>0){
      msg += '\n\n⚠️ '+progRows.length+' Spieler-Fortschritt'+(progRows.length===1?'':'s')+' wird mit gelöscht (Pots, Streaks, Sessions).';
    }
    msg += '\n\nDas kann NICHT rückgängig gemacht werden.';
    if(!confirm(msg)) return;
    Promise.all([
      sbDel('ls_progress','run_id=eq.'+runId),
      sbDel('ls_runs','id=eq.'+runId)
    ]).then(function(){
      setRuns(function(prev){ return prev.filter(function(r){return r.id!==runId;}); });
      setAllProgress(function(prev){ return prev.filter(function(p){return p.run_id!==runId;}); });
    }).catch(function(e){ alert('Fehler beim Löschen: '+e.message); });
  }
  function getProgData(playerId, runId){
    var row = allProgress.find(function(p){return p.player_id===playerId&&p.run_id===runId;});
    if(!row) return null;
    var d = row.data;
    if(d == null) return null;
    if(typeof d === 'object') return d;
    try{ return JSON.parse(d||'{}'); }catch(e){ return null; }
  }
  function getWordCount(run){
    var wc = run.word_count; if(wc) return wc;
    var raw = run.words; if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch(e){raw=[];}}
    return Array.isArray(raw)?raw.length:0;
  }
  if(loading) return <div style={{textAlign:'center',padding:30,color:G400}}>Lade…</div>;
  if(editRun) return <RunEditor key={editRun.id} run={editRun} chapters={chapters} onSave={function(updated){ setRuns(function(prev){return prev.map(function(r){return r.id===updated.id?updated:r;});}); setEditRun(null); }} onCancel={function(){setEditRun(null);}}/> ;
  return(
    <div>
      <div style={{display:'flex',gap:4,marginBottom:12,background:G100,padding:3,borderRadius:8}}>
        {[['runs','🏃 Runs'],['progress','📊 Fortschritt'],['time','⏱️ Zeit'],['disputes','❓ Anfragen']].map(function(t){return <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{flex:1,padding:'6px 4px',borderRadius:6,border:'none',background:tab===t[0]?'white':G100,color:tab===t[0]?T:G600,fontWeight:'bold',fontSize:11,cursor:'pointer'}}>{t[1]}</button>;})}
      </div>
      {tab==='runs'&&(<div>
        <div style={{marginBottom:10,padding:'8px 10px',background:'#f0fdfa',border:'1px solid #99f6e4',borderRadius:8,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:170}}>
            <div style={{fontSize:11,fontWeight:'bold',color:'#0f766e'}}>🪜 Kapitel-Leiterspiele</div>
            <div style={{fontSize:10,color:G400}}>Pro Kapitel ein Run mit allen ⭐-Wörtern ({scopeText(scope)}). Wird beim Ändern der ⭐-Markierung automatisch nachgezogen.</div>
          </div>
          <button disabled={syncing} onClick={function(){
            setSyncing(true);
            syncAutoRunsForScope(chapters, scope).then(function(r){
              return lsGetRuns().then(function(rows){
                setRuns(filterRunsByScope(Array.isArray(rows)?rows:[], chapters, scope));
                setSyncMsg('✓ '+r.created+' angelegt, '+r.updated+' aktualisiert');
              });
            }).catch(function(){ setSyncMsg('Fehler beim Anlegen'); })
              .then(function(){ setSyncing(false); setTimeout(function(){setSyncMsg('');},4000); });
          }} style={BtnStyle(T,'white',{padding:'6px 11px',fontSize:11,opacity:syncing?0.6:1})}>
            {syncing?'…':'↻ Anlegen / aktualisieren'}
          </button>
          {syncMsg&&<span style={{fontSize:11,color:'#0f766e',fontWeight:'bold'}}>{syncMsg}</span>}
        </div>
        {runs.length===0&&<div style={{textAlign:'center',color:G400,padding:20,fontSize:13}}>Noch keine Runs vorhanden.</div>}
        {runs.map(function(run){
          function updateGoal(field, value){
            var body={}; body[field] = value;
            sbPatch('ls_runs', body, 'id=eq.'+run.id).then(function(ok){
              if(ok) setRuns(function(prev){return prev.map(function(r){return r.id===run.id?Object.assign({},r,body):r;});});
            });
          }
          return <div key={run.id} style={{padding:'10px 12px',marginBottom:6,borderRadius:10,border:'1px solid '+G200,background:'white'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:20}}>{run.icon||'🎯'}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:'bold',fontSize:13}}>{run.name}</div>
                <div style={{fontSize:10,color:G400}}>{getWordCount(run)} Vokabeln{run.is_admin_run?' · 📋 Klassen-Run':''}{run.auto_chapter_id?' · 🪜 folgt ⭐-Markierung':''}</div>
              </div>
              <button onClick={function(){setEditRun(run);}} style={BtnStyle(T,'white',{padding:'5px 10px',fontSize:11})}>✏️</button>
              <button onClick={function(){deleteRun(run.id);}} style={BtnStyle(RE,'white',{padding:'5px 10px',fontSize:11})}>🗑</button>
            </div>
            <div style={{marginTop:8,padding:'6px 8px',background:'#f0f9ff',borderRadius:6,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',fontSize:11}}>
              <span style={{color:'#0369a1',fontWeight:'bold'}}>🎯 Ziel:</span>
              <span style={{color:G600}}>bis</span>
              <input type='date' value={run.target_date||''}
                onChange={function(e){updateGoal('target_date', e.target.value||null);}}
                style={{padding:'3px 6px',fontSize:11,border:'1px solid '+G200,borderRadius:5,background:'white'}}/>
              <input type='number' min='1' max='100' value={run.target_pct!=null?run.target_pct:100}
                onChange={function(e){updateGoal('target_pct', parseInt(e.target.value,10)||100);}}
                style={{width:54,padding:'3px 6px',fontSize:11,border:'1px solid '+G200,borderRadius:5,background:'white'}}/>
              <span style={{color:G600}}>%</span>
              {run.target_date&&<button onClick={function(){updateGoal('target_date',null);}} title='Zieldatum löschen'
                style={{padding:'2px 7px',fontSize:10,border:'1px solid '+G200,background:'white',color:G400,cursor:'pointer',borderRadius:4}}>✕</button>}
            </div>
          </div>;
        })}
      </div>)}
      {tab==='progress'&&(<div>
        {allUsers.length===0&&<div style={{textAlign:'center',color:G400,padding:20,fontSize:13}}>Keine Spieler gefunden.</div>}
        {allUsers.map(function(u){
          return <div key={u.id} style={{marginBottom:10,padding:'10px 12px',borderRadius:10,border:'1px solid '+G200,background:'white'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{fontWeight:'bold',fontSize:13,color:G900}}>{u.name}</span>
              <span style={{fontSize:11,color:G400,marginLeft:'auto'}}>{u.total_score||0} Pkt</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              {runs.map(function(run){
                var prog = getProgData(u.id, run.id);
                var pct = prog ? lsPercent(prog) : null;
                var pots = prog ? (prog.pots||{}) : {};
                var p1=(pots[1]||[]).length,p2=(pots[2]||[]).length,p3=(pots[3]||[]).length,p4=(pots[4]||[]).length,p5=(pots[5]||[]).length,p6=(pots[6]||[]).length;
                var wc = prog ? (p1+p2+p3+p4+p5+p6) : getWordCount(run);
                var expandKey = u.id+'__'+run.id;
                var isExpanded = expanded[expandKey];
                var allRunWords = [];
                [1,2,3,4,5,6].forEach(function(pot){
                  (pots[pot]||[]).forEach(function(w){
                    allRunWords.push({word:w.word,clue:w.clue,pot:pot,correct:w.correct||0,wrong:w.wrong||0,ps:w.ps||{}});
                  });
                });
                allRunWords.sort(function(a,b){return a.word.localeCompare(b.word);});
                return <div key={run.id} style={{padding:'8px 10px',borderRadius:8,border:'1px solid '+(prog?T+'33':G200),background:prog?TL:'white',marginBottom:4}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:prog?4:0,cursor:prog?'pointer':'default'}}
                    onClick={function(){if(prog)toggle(expandKey);}}>
                    <span style={{fontSize:13}}>{run.icon||'🎯'}</span>
                    <span style={{fontWeight:'bold',fontSize:12,color:G900,flex:1}}>{run.name}</span>
                    {prog
                      ? <span style={{fontSize:12,fontWeight:'bold',color:T}}>{pct}% · {p6}/{wc} gelernt</span>
                      : <span style={{fontSize:11,color:G400}}>noch nicht gespielt</span>
                    }
                    {prog&&<span style={{fontSize:10,color:G400,marginLeft:2}}>{isExpanded?'▲':'▼'}</span>}
                  </div>
                  {prog&&<div>
                    <div style={{height:4,background:G200,borderRadius:2,overflow:'hidden',marginBottom:4}}>
                      <div style={{height:'100%',width:(pct||0)+'%',background:T,borderRadius:2}}/>
                    </div>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {[[1,RE,'T1',p1],[2,'#f97316','T2',p2],[3,AM,'T3',p3],[4,T,'T4',p4],[5,'#7c3aed','T5',p5],[6,GR,'Gel.',p6]].map(function(pt){
                        return pt[3]>0 ? <span key={pt[0]} style={{fontSize:10,padding:'1px 5px',borderRadius:10,background:pt[1]+'18',color:pt[1],fontWeight:'bold'}}>{pt[2]}: {pt[3]}</span> : null;
                      })}
                      <span style={{fontSize:10,color:GR,marginLeft:'auto',fontWeight:'bold'}}>✓ {prog.totalCorrect||0}</span>
                      <span style={{fontSize:10,color:RE,fontWeight:'bold'}}>✗ {prog.totalWrong||0}</span>
                    </div>
                  </div>}
                  {prog&&isExpanded&&(
                    <div style={{borderTop:'1px solid '+G200,marginTop:5,paddingTop:5,maxHeight:260,overflowY:'auto'}}>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 34px auto',gap:'2px 6px',fontSize:10,color:G400,padding:'0 2px 4px 2px',fontWeight:'bold',borderBottom:'1px solid '+G100,marginBottom:3}}>
                        <span>Englisch</span><span>Deutsch</span><span>Topf</span><span>Verlauf</span>
                      </div>
                      {allRunWords.map(function(w,wi){
                        var potColor = [RE,'#f97316',AM,T,'#7c3aed',GR][w.pot-1]||G400;
                        var psKeys=[1,2,3,4,5,6].filter(function(p){return w.ps[p]&&((w.ps[p].c||0)+(w.ps[p].w||0))>0;});
                        return <div key={wi} style={{display:'grid',gridTemplateColumns:'1fr 1fr 34px auto',gap:'2px 6px',padding:'3px 2px',borderRadius:4,background:wi%2===0?G50:'white',fontSize:11,alignItems:'center'}}>
                          <span style={{fontWeight:'bold',color:w.pot===6?GR:G900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.word}</span>
                          <span style={{color:G600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.clue}</span>
                          <span style={{fontSize:9,padding:'1px 3px',borderRadius:6,background:potColor+'20',color:potColor,fontWeight:'bold',textAlign:'center'}}>{w.pot===6?'Gel.':'T'+w.pot}</span>
                          <span style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                            {psKeys.length===0
                              ? <span style={{fontSize:9,color:G400}}>—</span>
                              : psKeys.map(function(p){
                                  var s=w.ps[p]; var pc=POT_COL[p]||GR;
                                  return <span key={p} style={{fontSize:9,padding:'0 3px',borderRadius:4,background:pc+'15',color:pc,fontWeight:'bold',whiteSpace:'nowrap'}}>
                                    T{p}{s.c>0?' '+s.c+'✓':''}{s.w>0?' '+s.w+'✗':''}
                                  </span>;
                                })
                            }
                          </span>
                        </div>;
                      })}
                    </div>
                  )}
                </div>;
              })}
            </div>
          </div>;
        })}
      </div>)}
      {tab==='time'&&(<div>
        {allUsers.length===0&&<div style={{textAlign:'center',color:G400,padding:20,fontSize:13}}>Keine Spieler gefunden.</div>}
        {allUsers.map(function(u){
          var totalSec = secondsForPlayerTotal(u.id);
          return <div key={u.id} style={{marginBottom:10,padding:'10px 12px',borderRadius:10,border:'1px solid '+G200,background:'white'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{fontWeight:'bold',fontSize:13,color:G900}}>{u.name}</span>
              <span style={{fontSize:11,color:T,marginLeft:'auto',fontWeight:'bold'}}>⏱ {fmtMin(totalSec)} insg.</span>
            </div>
            {runs.filter(function(r){return secondsForPlayerRun(u.id,r.id)>0 || allProgress.some(function(p){return p.player_id===u.id&&p.run_id===r.id;});}).length===0
              ? <div style={{fontSize:11,color:G400,fontStyle:'italic',textAlign:'center',padding:8}}>Noch keine Aktivität</div>
              : runs.map(function(run){
                var sec = secondsForPlayerRun(u.id, run.id);
                var prog = getProgData(u.id, run.id);
                if(sec===0 && !prog) return null;
                var pct = prog ? lsPercent(prog) : 0;
                var pacing = lsRunPacing(pct, run.target_pct, run.target_date, sec);
                var chartKey = 'tch__'+u.id+'__'+run.id;
                var chartOpen = expanded[chartKey];
                var runSessions = progressSessionsFor(u.id, run.id);
                return <div key={run.id} style={{borderRadius:7,background:G50,marginBottom:4}}>
                  <div onClick={function(){toggle(chartKey);}} style={{padding:'6px 9px',fontSize:11,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',cursor:'pointer'}}>
                    <span style={{fontSize:13}}>{run.icon||'🎯'}</span>
                    <span style={{flex:'1 1 120px',fontWeight:'bold',color:G900}}>{run.name}</span>
                    <span style={{color:G600}}>⏱ {fmtMin(sec)}</span>
                    <span style={{color:T,fontWeight:'bold'}}>{pct}%</span>
                    {pacing && pacing.requiredMinPerDay!=null && <span style={{padding:'2px 6px',borderRadius:5,background:pacing.status==='unrealistic'||pacing.status==='overdue'?'#fee2e2':pacing.status==='hard'?'#fed7aa':pacing.status==='ok'?'#fef3c7':'#d1fae5',color:pacing.status==='unrealistic'||pacing.status==='overdue'?'#991b1b':pacing.status==='hard'?'#9a3412':pacing.status==='ok'?'#92400e':'#065f46',fontWeight:'bold'}}>→ {pacing.requiredMinPerDay}m/T · {pacing.daysLeft}T</span>}
                    {pacing && pacing.status==='done' && <span style={{padding:'2px 6px',borderRadius:5,background:'#d1fae5',color:'#065f46',fontWeight:'bold'}}>✅ Ziel</span>}
                    <span style={{fontSize:10,color:G400}}>{chartOpen?'▲':'📊▼'}</span>
                  </div>
                  {chartOpen && <div style={{padding:'4px 9px 9px'}}><DailyLearnChart sessions={runSessions} run={run} pacing={pacing}/></div>}
                </div>;
              })}
          </div>;
        })}
      </div>)}
      {tab==='disputes'&&(<div>
        {allDisputes.length===0&&<div style={{textAlign:'center',color:G400,padding:20,fontSize:13}}>Keine offenen Anfragen.</div>}
        {allDisputes.map(function(d){
          var isUnimp = d.dispute_type==='unimportant';
          return <div key={d.id} style={{marginBottom:8,padding:'10px 12px',borderRadius:10,border:'2px solid '+(isUnimp?G200:'#7c3aed44'),background:'white'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:isUnimp?G100:'#f3e8ff',color:isUnimp?G600:'#7c3aed',fontWeight:'bold'}}>{isUnimp?'🔇 Unwichtig':'❓ Anfechtung'}</span>
              <span style={{fontSize:11,color:G400}}>{d.player_name} · Topf {d.pot}</span>
            </div>
            <div style={{fontSize:14,fontWeight:'bold',color:G900}}>{d.word} <span style={{color:G400,fontWeight:'normal',fontSize:12}}>({d.clue})</span></div>
            {!isUnimp&&d.typed_answer&&<div style={{fontSize:11,color:G600,marginTop:2}}>Eingabe: <em>{d.typed_answer}</em></div>}
            <div style={{display:'flex',gap:6,marginTop:8}}>
              <button onClick={function(){
                if(!confirm(isUnimp?'Wort aus Run entfernen?':'Anfrage als korrekt akzeptieren?')) return;
                sbPatch('word_disputes',{status:'accepted',resolved_at:new Date().toISOString()},'id=eq.'+d.id).then(function(){
                  if(isUnimp){
                    sbGet('ls_runs','id=eq.'+d.run_id+'&select=words').then(function(rows){
                      if(!rows||!rows[0]) return;
                      var w=rows[0].words; try{if(typeof w==='string')w=JSON.parse(w);}catch(e){w=[];}
                      var f=w.filter(function(x){return (x.word||'').toLowerCase()!==d.word.toLowerCase();});
                      sbPatch('ls_runs',{words:JSON.stringify(f),word_count:f.length},'id=eq.'+d.run_id);
                    }).catch(function(){});
                  }
                  setAllDisputes(function(prev){return prev.filter(function(x){return x.id!==d.id;});});
                }).catch(function(){});
              }} style={BtnStyle(GR,'white',{flex:1,padding:'6px',fontSize:11})}>✓ Akzeptieren</button>
              <button onClick={function(){
                sbPatch('word_disputes',{status:'rejected',resolved_at:new Date().toISOString()},'id=eq.'+d.id).then(function(){
                  setAllDisputes(function(prev){return prev.filter(function(x){return x.id!==d.id;});});
                }).catch(function(){});
              }} style={BtnStyle(RE,'white',{flex:1,padding:'6px',fontSize:11})}>✕ Ablehnen</button>
            </div>
          </div>;
        })}
      </div>)}
    </div>
  );
}

function CategoryPicker({ allCategories, selected, onChange }) {
  return(
    <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
      {(allCategories||[]).map(function(cat){
        var isSel=(selected||[]).indexOf(cat.id)>=0;
        return <button key={cat.id} onClick={function(){ onChange(isSel?(selected||[]).filter(function(id){return id!==cat.id;}):(selected||[]).concat([cat.id])); }}
          style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:20,border:'1.5px solid '+(isSel?T:G200),background:isSel?TL:'white',cursor:'pointer',fontSize:11,color:isSel?T:G600,fontWeight:isSel?'bold':'normal',touchAction:'manipulation'}}>
          <span style={{fontSize:13}}>{cat.icon}</span>{cat.name}
        </button>;
      })}
    </div>
  );
}

function ApiKeyManager({ onClose }) {
  var [key, setKey] = useState('');
  var [saved, setSaved] = useState('');
  var [provider, setProvider] = useState(localStorage.getItem('vision_provider')||'anthropic');
  var [ollamaUrl, setOllamaUrl] = useState(localStorage.getItem('ollama_url')||'http://localhost:11434');
  var [ollamaModel, setOllamaModel] = useState(localStorage.getItem('ollama_model')||'qwen2.5vl:72b');
  var [testStatus, setTestStatus] = useState('');
  useEffect(function(){ var k=localStorage.getItem('claude_api_key'); if(k) setSaved(k); },[]);
  function save(){ if(key.trim()){localStorage.setItem('claude_api_key',key.trim());setSaved(key.trim());setKey('');} }
  function remove(){ localStorage.removeItem('claude_api_key'); setSaved(''); setKey(''); }
  function selectProvider(p){ setProvider(p); localStorage.setItem('vision_provider',p); }
  function saveOllama(){ localStorage.setItem('ollama_url',ollamaUrl.replace(/\/$/,'')); localStorage.setItem('ollama_model',ollamaModel); setTestStatus('💾 Gespeichert'); setTimeout(function(){setTestStatus('');},1500); }
  function testOllama(){
    setTestStatus('⏳ Teste…');
    fetch(ollamaUrl.replace(/\/$/,'')+'/api/tags').then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    }).then(function(d){
      var models=(d.models||[]).map(function(m){return m.name;});
      var has=models.some(function(m){return m===ollamaModel||m.split(':')[0]===ollamaModel.split(':')[0];});
      setTestStatus(has?('✅ Verbunden — '+models.length+' Modelle, '+ollamaModel+' verfügbar'):('⚠️ Verbunden, aber Modell `'+ollamaModel+'` nicht gepullt. Verfügbar: '+(models.join(', ')||'keine')));
    }).catch(function(e){ setTestStatus('❌ Nicht erreichbar: '+e.message+' — läuft `ollama serve`? CORS via `OLLAMA_ORIGINS=*` setzen.'); });
  }
  return(
    <div style={{padding:8}}>
      <p style={{fontSize:12,color:G600,marginBottom:10,fontWeight:'bold'}}>🖼 Bildanalyse-Anbieter</p>
      <div style={{display:'flex',gap:6,marginBottom:10}}>
        <button onClick={function(){selectProvider('anthropic');}} style={Object.assign({},BtnStyle(provider==='anthropic'?T:G100, provider==='anthropic'?'white':G600,{flex:1,padding:'8px',fontSize:11}))}>☁️ Claude (Anthropic)</button>
        <button onClick={function(){selectProvider('ollama');}} style={Object.assign({},BtnStyle(provider==='ollama'?T:G100, provider==='ollama'?'white':G600,{flex:1,padding:'8px',fontSize:11}))}>🖥 Ollama (lokal)</button>
      </div>
      {provider==='anthropic'&&<div>
        <p style={{fontSize:11,color:G600,marginBottom:8}}>Anthropic API-Key (auch für Grammar Trainer + Auto-Kategorisierung):</p>
        {saved&&<div style={{padding:'8px 12px',background:'#d1fae5',borderRadius:8,marginBottom:8,fontSize:11,color:T,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>✓ Key gespeichert: {saved.slice(0,8)}…</span>
          <button onClick={remove} style={{border:'none',background:'none',color:RE,cursor:'pointer',fontSize:11}}>Entfernen</button>
        </div>}
        <div style={{display:'flex',gap:6}}>
          <input value={key} onChange={function(e){setKey(e.target.value);}} placeholder="sk-ant-…" type="password"
            style={{flex:1,padding:'10px',fontSize:14,border:'2px solid '+T,borderRadius:8,outline:'none'}}/>
          <button onClick={save} style={BtnStyle(T,'white',{padding:'10px 14px'})}>💾</button>
        </div>
      </div>}
      {provider==='ollama'&&<div>
        <p style={{fontSize:11,color:G600,marginBottom:8}}>Lokales Vision-Modell via <a href='https://ollama.com' target='_blank' rel='noopener' style={{color:T}}>Ollama</a>. Setup: <code style={{background:G100,padding:'1px 4px',borderRadius:3}}>brew install ollama</code> · <code style={{background:G100,padding:'1px 4px',borderRadius:3}}>ollama pull llama3.2-vision</code> · <code style={{background:G100,padding:'1px 4px',borderRadius:3}}>OLLAMA_ORIGINS=* ollama serve</code></p>
        <div style={{marginBottom:6}}>
          <label style={{fontSize:10,color:G400,fontWeight:'bold'}}>Endpoint:</label>
          <input value={ollamaUrl} onChange={function(e){setOllamaUrl(e.target.value);}}
            style={{width:'100%',padding:'7px',fontSize:12,border:'1px solid '+G200,borderRadius:6,marginTop:2,boxSizing:'border-box'}}/>
        </div>
        <div style={{marginBottom:6}}>
          <label style={{fontSize:10,color:G400,fontWeight:'bold'}}>Modell:</label>
          <input value={ollamaModel} onChange={function(e){setOllamaModel(e.target.value);}} placeholder='llama3.2-vision oder qwen2-vl'
            style={{width:'100%',padding:'7px',fontSize:12,border:'1px solid '+G200,borderRadius:6,marginTop:2,boxSizing:'border-box'}}/>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={testOllama} style={BtnStyle(G100,G600,{flex:1,padding:'7px',fontSize:11})}>🔌 Verbindung testen</button>
          <button onClick={saveOllama} style={BtnStyle(T,'white',{flex:1,padding:'7px',fontSize:11})}>💾 Speichern</button>
        </div>
        {testStatus&&<div style={{marginTop:8,padding:'6px 9px',borderRadius:6,fontSize:10,background:testStatus.indexOf('❌')>=0?'#fee2e2':testStatus.indexOf('⚠')>=0?'#fef3c7':'#d1fae5',color:testStatus.indexOf('❌')>=0?'#991b1b':testStatus.indexOf('⚠')>=0?'#92400e':'#065f46'}}>{testStatus}</div>}
        <div style={{marginTop:10,padding:'7px 10px',background:'#fef3c7',color:'#92400e',fontSize:10,borderRadius:6}}>⚠️ Lokale Vision-Modelle erkennen Bold-Stil weniger zuverlässig als Claude. ⭐-Markierungen ggf. nachpflegen.</div>
      </div>}
    </div>
  );
}

function VocabSearch({ chapters, onWordClick }) {
  var [query, setQuery] = useState('');
  var allWords = useMemo(function(){
    var w=[];
    chapters.filter(function(c){return c.parent_id;}).forEach(function(ch){
      (ch.words||[]).forEach(function(ww){ w.push(Object.assign({},ww,{chapId:ch.id,chapTitle:ch.title,chapColor:ch.color})); });
    });
    return w;
  },[chapters]);
  var results = useMemo(function(){
    if(!query.trim()) return [];
    var q=query.toLowerCase();
    return allWords.filter(function(w){ return (w.word||'').toLowerCase().includes(q)||(w.clue||'').toLowerCase().includes(q); }).slice(0,20);
  },[query,allWords]);
  return(
    <div>
      <input value={query} onChange={function(e){setQuery(e.target.value);}} placeholder="Vokabel suchen…"
        style={{width:'100%',padding:'10px 12px',fontSize:16,border:'2px solid '+T,borderRadius:10,outline:'none',boxSizing:'border-box',marginBottom:8}}/>
      {results.map(function(w,i){ return <div key={i} onClick={function(){if(onWordClick)onWordClick(w);}} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',marginBottom:3,borderRadius:8,background:'white',border:'1px solid '+G200,cursor:onWordClick?'pointer':'default'}}>
        <span style={{fontWeight:'bold',fontSize:13}}>{w.word}</span>
        <span style={{fontSize:11,color:G400}}>{w.clue}</span>
        <span style={{fontSize:10,color:w.chapColor,fontWeight:'bold'}}>{w.chapTitle}</span>
      </div>; })}
    </div>
  );
}

function UploadPreview({ fileData, chapters, onConfirm, onCancel }) {
  var [chapterId, setChapterId] = useState(chapters.filter(function(c){return c.parent_id;})[0]&&chapters.filter(function(c){return c.parent_id;})[0].id||'');
  var [preview, setPreview] = useState([]);
  var [mode, setMode] = useState('append');
  var [dupReport, setDupReport] = useState(null);
  useEffect(function(){
    if(!fileData) return;
    var lines=(fileData||'').split('\n').filter(function(l){return l.trim();});
    var parsed=lines.map(function(line){
      var parts=line.split(/\t|,/);
      return{word:(parts[0]||'').trim(),clue:(parts[1]||'').trim(),important:parts[2]?parts[2].trim()==='1':false};
    }).filter(function(r){return r.word&&r.clue;});
    setPreview(parsed);
  },[fileData]);
  useEffect(function(){
    if(!chapterId||!preview.length) return;
    var ch=chapters.find(function(c){return c.id===chapterId;});
    if(!ch) return;
    var existing=(ch.words||[]).map(function(w){return normWordKey(w.word);});
    var dups=preview.filter(function(p){return existing.indexOf(normWordKey(p.word))>=0;});
    setDupReport(dups.length>0?dups:null);
  },[chapterId,preview]);
  var childChapters=chapters.filter(function(c){return c.parent_id;});
  return(
    <div style={{padding:8}}>
      <div style={{marginBottom:10}}>
        <label style={{fontSize:12,color:G600,display:'block',marginBottom:4}}>Ziel-Kapitel:</label>
        <select value={chapterId} onChange={function(e){setChapterId(e.target.value);}}
          style={{width:'100%',padding:'8px',fontSize:14,border:'2px solid '+T,borderRadius:8,outline:'none'}}>
          {childChapters.map(function(c){return <option key={c.id} value={c.id}>{c.icon} {c.title}</option>;})}
        </select>
      </div>
      <div style={{marginBottom:10}}>
        <label style={{fontSize:12,color:G600,display:'block',marginBottom:4}}>Import-Modus:</label>
        <div style={{display:'flex',gap:6}}>
          {[['append','Ergänzen'],['replace','Ersetzen']].map(function(m){return <button key={m[0]} onClick={function(){setMode(m[0]);}} style={{flex:1,padding:'6px',borderRadius:6,border:'2px solid '+(mode===m[0]?T:G200),background:mode===m[0]?TL:'white',cursor:'pointer',fontSize:11,fontWeight:'bold',color:mode===m[0]?T:G600}}>{m[1]}</button>;})}
        </div>
      </div>
      {dupReport&&<div style={{padding:'8px 10px',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,marginBottom:8,fontSize:11,color:'#92400e'}}>⚠️ {dupReport.length} Duplikat(e): {dupReport.slice(0,3).map(function(d){return d.word;}).join(', ')}{dupReport.length>3?'…':''}</div>}
      <div style={{fontWeight:'bold',fontSize:12,color:G600,marginBottom:6}}>Vorschau ({preview.length} Einträge):</div>
      <div style={{maxHeight:180,overflowY:'auto',border:'1px solid '+G200,borderRadius:8,padding:'4px 8px',marginBottom:10}}>
        {preview.map(function(r,i){return <div key={i} style={{display:'flex',gap:8,padding:'3px 0',borderBottom:'1px solid '+G100,fontSize:11}}>
          {r.important&&<span>⭐</span>}<span style={{fontWeight:'bold'}}>{r.word}</span><span style={{color:G400}}>{r.clue}</span>
        </div>;})}
      </div>
      <div style={{display:'flex',gap:6}}>
        <button onClick={function(){onConfirm(chapterId,preview,mode);}} style={BtnStyle(T,'white',{flex:1,padding:'10px'})}>✓ Importieren</button>
        <button onClick={onCancel} style={BtnStyle(G100,G600,{flex:1,padding:'10px'})}>Abbrechen</button>
      </div>
    </div>
  );
}

function QuizScoringAdmin() {
  var [sc, setSc] = useState({correct:10,win:50,loss:-50,draw:30,grammar_correct:10});
  var [loaded, setLoaded] = useState(false);
  var [saving, setSaving] = useState(false);
  var [msg, setMsg] = useState('');
  useEffect(function(){
    sbGet('settings','key=eq.quiz_scoring&select=value').then(function(d){
      if(Array.isArray(d)&&d.length>0){try{var s=JSON.parse(d[0].value);if(s)setSc(s);}catch(e){}}
      setLoaded(true);
    }).catch(function(){setLoaded(true);});
  },[]);
  function save(){
    setSaving(true);
    var body={key:'quiz_scoring',value:JSON.stringify(sc)};
    sbGet('settings','key=eq.quiz_scoring&select=id').then(function(d){
      var p=d&&d.length>0 ? sbPatch('settings',{value:body.value},'key=eq.quiz_scoring') : sbPost('settings',body);
      Promise.resolve(p).then(function(){setSaving(false);setMsg('Gespeichert!');setTimeout(function(){setMsg('');},2500);});
    }).catch(function(){setSaving(false);});
  }
  if(!loaded) return <div style={{color:G400,fontSize:12,padding:12}}>Laden...</div>;
  function Field(label, key, hint){
    return <div style={{marginBottom:10}}>
      <label style={{fontSize:12,fontWeight:'bold',color:G600,display:'block',marginBottom:3}}>{label}</label>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <input type='number' value={sc[key]} onChange={function(e){setSc(function(prev){var n=Object.assign({},prev);n[key]=parseInt(e.target.value)||0;return n;});}} style={{width:80,padding:'7px 10px',fontSize:14,border:'1.5px solid '+G200,borderRadius:7,outline:'none'}}/>
        <span style={{fontSize:11,color:G400}}>{hint}</span>
      </div>
    </div>;
  }
  return <div>
    <div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:4}}>Quiz-Duell Punktevergabe</div>
    <div style={{fontSize:11,color:G400,marginBottom:10}}>Punkte werden zur Gesamtpunktzahl des Spielers addiert.</div>
    {Field('Richtige Antwort (Quiz)','correct','Punkte pro richtig beantworteter Frage im Duell')}
    {Field('Sieg-Bonus','win','Zusatzpunkte für den Gewinner')}
    {Field('Niederlage','loss','Punkte-Abzug für den Verlierer (negativ eingeben)')}
    {Field('Unentschieden','draw','Punkte für beide bei Gleichstand')}
    <div style={{marginTop:12,marginBottom:4,borderTop:'1px solid '+G200,paddingTop:12,fontWeight:'bold',fontSize:12,color:G600}}>Grammatik-Trainer</div>
    {Field('Richtige Antwort (Grammatik)','grammar_correct','Punkte pro richtig beantworteter Grammatikfrage')}
    {msg&&<div style={{padding:'6px 10px',background:'#d1fae5',borderRadius:7,fontSize:11,color:T,marginBottom:8}}>{msg}</div>}
    <button onClick={save} disabled={saving} style={BtnStyle(T,'white',{padding:'9px 20px',fontSize:12})}>{saving?'Speichern...':'Speichern'}</button>
  </div>;
}

function VocabCheckAdmin({ chapters, setChapters }) {
  var [selChId, setSelChId] = useState('');
  var [results, setResults] = useState(null);
  var [loading, setLoading] = useState(false);
  var [msg, setMsg] = useState('');
  var [editingWord, setEditingWord] = useState(null);
  var [saving, setSaving] = useState(false);
  var childChaps = chapters.filter(function(c){return c.parent_id;});

  function runCheck(){
    var ch = childChaps.find(function(c){return c.id===selChId;});
    if(!ch){setMsg('Bitte Kapitel wählen');return;}
    var words = safeWords(ch.words);
    if(!words.length){setMsg('Keine Vokabeln in diesem Kapitel');return;}
    var batches=[];
    for(var i=0;i<words.length;i+=20){batches.push(words.slice(i,i+20));}
    setLoading(true); setResults(null); setMsg('Prüfe '+words.length+' Vokabeln…');
    sbGet('settings','key=eq.anthropic_key').then(function(d){
      var key=(d&&d[0]&&d[0].value)||localStorage.getItem('claude_api_key')||'';
      if(!key){setMsg('Kein API-Key hinterlegt (Admin → 🔑)');setLoading(false);return;}
      function processBatch(idx,accumulated){
        if(idx>=batches.length){
          setResults(accumulated); setLoading(false);
          var bad=accumulated.filter(function(r){return !r.ok;}).length;
          setMsg(bad===0?'✅ Alle '+accumulated.length+' Vokabeln korrekt!':'⚠️ '+bad+' mögliche Fehler gefunden');
          return;
        }
        setMsg('Prüfe Batch '+(idx+1)+'/'+batches.length+'…');
        var pairs=batches[idx].map(function(w){return w.word+' = '+w.clue;}).join('\n');
        fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:4096,messages:[{role:'user',content:
            'Du bist ein Englisch-Lehrer. Prüfe diese englisch-deutschen Vokabelpaare auf korrekte Übersetzung.\n\nVokabeln:\n'+pairs+'\n\nAntworte NUR mit JSON-Array:\n[{"word":"...","clue":"...","ok":true,"note":""},{"word":"...","clue":"...","ok":false,"note":"Korrekt wäre: spielen"}]\n\nok:true wenn die Übersetzung stimmt (auch Synonyme oder leichte Abweichungen sind ok). ok:false nur bei klaren Fehlern. note nur bei ok:false befüllen.'
          }]})
        }).then(function(r){return r.json();}).then(function(data){
          var txt=(data.content||[]).map(function(b){return b.text||'';}).join('').trim().replace(/```json|```/g,'').trim();
          var parsed;
          try{ parsed=JSON.parse(txt); }catch(e){
            setMsg('Fehler in Batch '+(idx+1)+': '+e.message);
            setLoading(false); return;
          }
          processBatch(idx+1, accumulated.concat(parsed));
        }).catch(function(e){setMsg('Fehler: '+e.message);setLoading(false);});
      }
      processBatch(0,[]);
    }).catch(function(){setMsg('Fehler beim Laden des API-Keys');setLoading(false);});
  }

  return <div>
    <div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:4}}>🔍 Vokabel-Übersetzungsprüfung</div>
    <div style={{fontSize:11,color:G400,marginBottom:10}}>KI prüft ob englisch-deutsche Übersetzungen korrekt sind</div>
    <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
      <select value={selChId} onChange={function(e){setSelChId(e.target.value);setResults(null);setMsg('');}}
        style={{flex:1,minWidth:0,padding:'7px 8px',fontSize:13,border:'1.5px solid '+T,borderRadius:8,outline:'none',background:'white'}}>
        <option value=''>-- Kapitel wählen --</option>
        {childChaps.map(function(c){
          return <option key={c.id} value={c.id}>{c.icon} {c.title} ({safeWords(c.words).length} V.)</option>;
        })}
      </select>
      <button onClick={runCheck} disabled={loading||!selChId} style={BtnStyle(T,'white',{padding:'7px 14px',fontSize:13,opacity:(!selChId||loading)?0.5:1,touchAction:'manipulation'})}>
        {loading?'⏳ Prüfe…':'🔍 Prüfen'}
      </button>
    </div>
    {msg&&<div style={{fontSize:12,padding:'6px 10px',borderRadius:6,marginBottom:8,
      background:msg.startsWith('✅')?'#d1fae5':msg.startsWith('⚠️')?'#fff7ed':msg.startsWith('Fehler')||msg.startsWith('Kein')?'#fef2f2':'#eff6ff',
      color:msg.startsWith('✅')?'#065f46':msg.startsWith('⚠️')?'#92400e':msg.startsWith('Fehler')||msg.startsWith('Kein')?RE:T}}>{msg}</div>}
    {results&&results.length>0&&<div style={{maxHeight:400,overflowY:'auto',border:'1px solid '+G200,borderRadius:8}}>
      {results.map(function(r,i){
        var isEditing=editingWord&&editingWord.orig===r.word;
        var ch=chapters.find(function(c){return c.id===selChId;});
        return <div key={i} style={{borderBottom:'1px solid '+G100,background:r.ok?'white':'#fff7ed'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:8,padding:'7px 10px'}}>
            <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{r.ok?'✅':'⚠️'}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:'bold',color:G900}}>{r.word} <span style={{fontWeight:'normal',color:G400}}>= {r.clue}</span></div>
              {!r.ok&&r.note&&<div style={{fontSize:11,color:'#92400e',marginTop:2}}>{r.note}</div>}
            </div>
            {!r.ok&&ch&&<button onClick={function(){
              var ws=safeWords(ch.words);
              var idx=ws.findIndex(function(w){return w.word===r.word;});
              if(idx<0) return;
              setEditingWord({orig:r.word,w:Object.assign({},ws[idx]),idx:idx});
            }} style={BtnStyle(AM,'white',{padding:'3px 8px',fontSize:10,flexShrink:0})}>✏️ Bearbeiten</button>}
          </div>
          {isEditing&&<div style={{padding:'8px 10px',background:'#fffbeb',borderTop:'1px solid '+AM+'44'}}>
            <div style={{display:'flex',gap:5,marginBottom:5}}>
              <input value={editingWord.w.word||''} onChange={function(e){setEditingWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{word:e.target.value})});});}}
                style={{flex:1,padding:'5px',fontSize:12,border:'1px solid '+G200,borderRadius:5,fontSize:16}} placeholder="EN"/>
              <input value={editingWord.w.clue||''} onChange={function(e){setEditingWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{clue:e.target.value})});});}}
                style={{flex:1,padding:'5px',fontSize:12,border:'1px solid '+G200,borderRadius:5,fontSize:16}} placeholder="DE"/>
            </div>
            <div style={{display:'flex',gap:5}}>
              <button onClick={function(){
                var ws=safeWords(ch.words).slice();
                ws[editingWord.idx]=editingWord.w;
                saveChapterWords(ch,ws,chapters,setChapters,setSaving,setMsg);
                setResults(function(prev){return prev.map(function(x,j){return j===i?Object.assign({},x,{word:editingWord.w.word,clue:editingWord.w.clue,ok:true,note:''}):x;});});
                setEditingWord(null);
              }} disabled={saving} style={BtnStyle(T,'white',{flex:1,padding:'5px',fontSize:11})}>✓ Speichern</button>
              <button onClick={function(){setEditingWord(null);}} style={BtnStyle(G100,G600,{flex:1,padding:'5px',fontSize:11})}>✕</button>
            </div>
          </div>}
        </div>;
      })}
    </div>}
  </div>;
}

function AdminDash({ player, chapters, scope, setChapters, allUsers, setAllUsers, allCategories, setAllCategories, onDone }) {
  var [tab, setTab] = useState('chapters');
  var [saving, setSaving] = useState(false);
  var [msg, setMsg] = useState('');
  var [editCh, setEditCh] = useState(null);
  var [editWord, setEditWord] = useState(null);
  var [editChIdx, setEditChIdx] = useState(null);
  var [uploadData, setUploadData] = useState(null);
  var [showUpload, setShowUpload] = useState(false);
  var [newChForm, setNewChForm] = useState({title:'',color:T,icon:'📖',parent_id:'',sentences:[]});
  var [showNewCh, setShowNewCh] = useState(false);
  var [expandedCh, setExpandedCh] = useState({});
  var [showApiKey, setShowApiKey] = useState(false);
  var [showCreateRun, setShowCreateRun] = useState(false);
  var [autoTyping, setAutoTyping] = useState({});  // chapterId -> 'loading'|'done'|'error'
  var [dupWords, setDupWords] = useState(null);
  var [dupLoading, setDupLoading] = useState(false);
  var [showNewUser, setShowNewUser] = useState(false);
  var [newUserName, setNewUserName] = useState('');
  var [newUserPw, setNewUserPw] = useState('');
  var [newUserErr, setNewUserErr] = useState('');
  var [expandedUserId, setExpandedUserId] = useState(null);
  var [userProgress, setUserProgress] = useState({});
  var [userRuns, setUserRuns] = useState({});
  var [userLearnSessions, setUserLearnSessions] = useState({});
  var [userRepeatRuns, setUserRepeatRuns] = useState({});
  var [expandedAdminTest, setExpandedAdminTest] = useState(null);
  var [expandedLsRun, setExpandedLsRun] = useState(null);
  var [vocabSort, setVocabSort] = useState('seq');
  var [showSentences, setShowSentences] = useState({}); // chapterId -> bool
  var [editSent, setEditSent] = useState(null); // {chId, idx, s, translating}
  var [expandedSentWord, setExpandedSentWord] = useState(null); // 'chId|word'
  function sortVocab(words){
    var arr = safeWords(words).slice();
    if(vocabSort==='abc'){
      arr.sort(function(a,b){return (a.word||'').toLowerCase().localeCompare((b.word||'').toLowerCase());});
    } else {
      arr.sort(function(a,b){
        var pa = a.book_page!=null ? a.book_page : 99999;
        var pb = b.book_page!=null ? b.book_page : 99999;
        if(pa!==pb) return pa-pb;
        var sa = a.seq!=null ? a.seq : 99999;
        var sb = b.seq!=null ? b.seq : 99999;
        if(sa!==sb) return sa-sb;
        return (a.word||'').localeCompare(b.word||'');
      });
    }
    return arr;
  }
  function loadUserData(userId){
    var UUID2=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!UUID2.test(userId)) return;
    if(userProgress[userId]) return;
    sbGet('ls_progress','player_id=eq.'+userId+'&select=run_id,data').then(function(rows){
      setUserProgress(function(prev){var n=Object.assign({},prev);n[userId]=Array.isArray(rows)?rows:[];return n;});
    }).catch(function(){});
    sbGet('ls_runs','or=(is_admin_run.eq.true,player_id.eq.'+userId+')&select=*').then(function(rows){
      setUserRuns(function(prev){var n=Object.assign({},prev);n[userId]=Array.isArray(rows)?rows:[];return n;});
    }).catch(function(){});
    sbGet('learn_sessions','player_id=eq.'+userId+'&select=game,run_id,active_seconds,correct_count,wrong_count,started_at&order=started_at.desc&limit=1000').then(function(rows){
      setUserLearnSessions(function(prev){var n=Object.assign({},prev);n[userId]=Array.isArray(rows)?rows:[];return n;});
    }).catch(function(){});
    sbGet('repeat_runs','player_id=eq.'+userId+'&select=*&order=created_at.desc&limit=30').then(function(rows){
      setUserRepeatRuns(function(prev){var n=Object.assign({},prev);n[userId]=Array.isArray(rows)?rows:[];return n;});
    }).catch(function(){});
  }
  var [showDup, setShowDup] = useState(false);
  var fileRef = useRef();
  var imgRef = useRef();
  var [imgLoading, setImgLoading] = useState(false);
  var [imgMsg, setImgMsg] = useState('');
  var [imgDraft, setImgDraft] = useState(null);
  var [imgTargetCh, setImgTargetCh] = useState('');
  var [imgMode, setImgMode] = useState('existing');
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function toggleCh(id){ setExpandedCh(function(prev){var n=Object.assign({},prev);n[id]=!n[id];return n;}); }

  function doSaveWord(chapterId, wordObj, wordIdx) {
    var ch = chapters.find(function(c){return c.id===chapterId;});
    if(!ch) return;
    var newWords = ch.words.slice();
    if(wordIdx!=null) newWords[wordIdx]=wordObj; else newWords=newWords.concat([wordObj]);
    saveChapterWords(ch, newWords, chapters, setChapters, setSaving, setMsg);
    setEditWord(null); setEditCh(null);
  }

  function toggleImportant(chapterId, wordIdx){
    var ch = chapters.find(function(c){return c.id===chapterId;});
    if(!ch) return;
    var ws = safeWords(ch.words).slice();
    if(wordIdx<0 || wordIdx>=ws.length) return;
    ws[wordIdx] = Object.assign({}, ws[wordIdx], {important: !ws[wordIdx].important});
    saveChapterWords(ch, ws, chapters, setChapters, setSaving, setMsg);
  }

  function reorderVocab(chapterId, sourceWord, targetWord, dropPosition){
    var ch = chapters.find(function(c){return c.id===chapterId;});
    if(!ch) return;
    var sorted = sortVocab(ch.words);
    var srcIdx = sorted.findIndex(function(w){return w===sourceWord;});
    var tgtIdx = sorted.findIndex(function(w){return w===targetWord;});
    if(srcIdx<0 || tgtIdx<0 || srcIdx===tgtIdx) return;
    var insertIdx = dropPosition==='after' ? tgtIdx+1 : tgtIdx;
    var moved = sorted[srcIdx];
    sorted.splice(srcIdx, 1);
    if(srcIdx < insertIdx) insertIdx--;
    sorted.splice(insertIdx, 0, moved);
    var neighbor = sorted[insertIdx-1] || sorted[insertIdx+1];
    if(neighbor && neighbor.book_page!=null && (moved.book_page==null || moved.book_page!==neighbor.book_page)){
      moved.book_page = neighbor.book_page;
    }
    sorted.forEach(function(w,i){ w.seq = i+1; });
    saveChapterWords(ch, sorted, chapters, setChapters, setSaving, setMsg);
  }
  var [dragSrc, setDragSrc] = useState(null);

  function doSaveSentence(chapterId, sentObj, sentIdx){
    var ch = chapters.find(function(c){return c.id===chapterId;});
    if(!ch) return;
    var arr = (ch.sentences||[]).slice();
    if(sentIdx!=null) arr[sentIdx]=sentObj; else arr=arr.concat([sentObj]);
    saveChapterSentences(ch, arr, chapters, setChapters, setSaving, setMsg);
    setEditSent(null);
  }
  function deleteSentence(chapterId, sentIdx){
    if(!confirm('Satz löschen?')) return;
    var ch = chapters.find(function(c){return c.id===chapterId;});
    if(!ch) return;
    var arr = (ch.sentences||[]).filter(function(_,i){return i!==sentIdx;});
    saveChapterSentences(ch, arr, chapters, setChapters, setSaving, setMsg);
  }
  function autoTranslateInEditor(){
    if(!editSent||!editSent.s.text||!editSent.s.text.trim()){ setMsg('Bitte zuerst englischen Satz eingeben'); return; }
    setEditSent(function(es){return Object.assign({},es,{translating:true});});
    translateSentenceEN2DE(editSent.s.text.trim()).then(function(de){
      setEditSent(function(es){
        if(!es) return es;
        return Object.assign({},es,{s:Object.assign({},es.s,{translation:de}),translating:false});
      });
      setMsg('✓ Übersetzt');
    }).catch(function(e){
      setEditSent(function(es){return es?Object.assign({},es,{translating:false}):es;});
      setMsg('Fehler: '+(e&&e.message||'Übersetzung fehlgeschlagen'));
    });
  }
  function saveSentenceWithAutoTranslate(){
    if(!editSent) return;
    var s = editSent.s; var chId = editSent.chId; var idx = editSent.idx;
    if(!s.text||!s.text.trim()){ setMsg('Bitte englischen Satz eingeben'); return; }
    var clean = {text:s.text.trim(), translation:(s.translation||'').trim(), wordRef:(s.wordRef||'').trim()||null, important:!!s.important};
    if(clean.translation){ doSaveSentence(chId, clean, idx); return; }
    setEditSent(function(es){return Object.assign({},es,{translating:true});});
    translateSentenceEN2DE(clean.text).then(function(de){
      doSaveSentence(chId, Object.assign({},clean,{translation:de}), idx);
    }).catch(function(e){
      setEditSent(function(es){return es?Object.assign({},es,{translating:false}):es;});
      setMsg('Fehler bei Übersetzung: '+(e&&e.message||'unbekannt'));
    });
  }

  function deleteWord(chapterId, wordIdx) {
    if(!confirm('Wort löschen? Es wird auch aus allen Leiterspiel-Runs entfernt.')) return;
    var ch = chapters.find(function(c){return c.id===chapterId;});
    if(!ch) return;
    var ws = safeWords(ch.words);
    var deletedWord = ws[wordIdx];
    var newWords = ws.filter(function(_,i){return i!==wordIdx;});
    saveChapterWords(ch, newWords, chapters, setChapters, setSaving, setMsg);
    if(!deletedWord||!deletedWord.word) return;
    var delKey = normWordKey(deletedWord.word);
    sbGet('ls_runs','select=id,name,words').then(function(runs){
      if(!Array.isArray(runs)) return;
      var affected = 0;
      runs.forEach(function(run){
        var rw = run.words; if(typeof rw==='string'){try{rw=JSON.parse(rw||'[]');}catch(e){rw=[];}}
        if(!Array.isArray(rw)) return;
        var filtered = rw.filter(function(rwx){return normWordKey(rwx.word)!==delKey;});
        if(filtered.length !== rw.length){
          sbPatch('ls_runs',{words:JSON.stringify(filtered),word_count:filtered.length},'id=eq.'+run.id);
          affected++;
        }
      });
      if(affected>0) setMsg('✓ Aus '+affected+' Run'+(affected===1?'':'s')+' entfernt');
    }).catch(function(){});
  }

  function saveChapter(form) {
    setSaving(true);
    var isNew = !form.id;
    if(isNew){
      var newId='ch_'+Date.now();
      // Klasse/Sprache vom Elternkapitel erben, sonst die gerade gewählte Auswahl —
      // ohne diese Felder wäre das Kapitel in keiner Ansicht sichtbar.
      var parentCh=(chapters||[]).find(function(c){return c.id===form.parent_id;});
      var newGrade=parentCh?chGrade(parentCh):(scope?scope.grade:5);
      var newLang=parentCh?(parentCh.language||(scope?scope.language:'en')):(scope?scope.language:'en');
      var body={id:newId,title:form.title,color:form.color,icon:form.icon,parent_id:form.parent_id||null,words:form.words||[],sentences:form.sentences||[],grade:newGrade,language:form.parent_id?newLang:null};
      sbPost('chapters',body).then(function(res){
        if(res && !res._err){
          var finalId=(res&&res.id)||newId;
          setChapters(function(prev){return prev.concat([Object.assign({},body,{id:finalId})]);});
          setMsg('✓ Gespeichert'); setShowNewCh(false); setEditCh(null);
        } else {
          setMsg('Fehler: '+((res&&res.msg)||'unbekannt'));
        }
        setSaving(false);
      });
    } else {
      var upd={title:form.title,color:form.color,icon:form.icon};
      sbPatch('chapters',upd,'id=eq.'+form.id).then(function(ok){
        if(ok){
          setChapters(function(prev){return prev.map(function(c){return c.id===form.id?Object.assign({},c,upd):c;});});
          setMsg('✓ Gespeichert'); setEditCh(null);
        } else {
          setMsg('Fehler beim Speichern');
        }
        setSaving(false);
      });
    }
  }

  function autoTypeChapter(ch) {
    var words = safeWords(ch.words);
    // Step 1: apply quick rules
    var updated = words.map(function(w){
      if(w.type) return w;
      var detected = quickDetectType(w.word, w.clue);
      return detected ? Object.assign({},w,{type:detected}) : w;
    });
    var stillMissing = updated.filter(function(w){return !w.type;});
    setAutoTyping(function(p){return Object.assign({},p,{[ch.id]:'loading'});});
    function finish(finalWords) {
      saveChapterWords(ch, finalWords, chapters, setChapters, setSaving, setMsg);
      setAutoTyping(function(p){return Object.assign({},p,{[ch.id]:'done'});});
      setTimeout(function(){setAutoTyping(function(p){var n=Object.assign({},p);delete n[ch.id];return n;});},3000);
    }
    if(!stillMissing.length){ finish(updated); return; }
    sbGet('settings','key=eq.anthropic_key').then(function(kd){
      var apiKey=(kd&&kd[0]&&kd[0].value)||localStorage.getItem('claude_api_key')||'';
      if(!apiKey){
        // No API key: use 'other' as fallback
        var fallback=updated.map(function(w){return w.type?w:Object.assign({},w,{type:'other'});});
        finish(fallback);
        return;
      }
      aiCategorizeWords(stillMissing, apiKey).then(function(map){
        var final=updated.map(function(w){
          if(w.type) return w;
          var t=map[w.word]||map[(w.word||'').toLowerCase()];
          var valid=['verb','noun','adjective','phrase','other'];
          return Object.assign({},w,{type:(valid.indexOf(t)>=0?t:'other')});
        });
        finish(final);
      }).catch(function(){
        setAutoTyping(function(p){return Object.assign({},p,{[ch.id]:'error'});});
      });
    });
  }

  function deleteChapter(ch) {
    if(!confirm('Kapitel "'+ch.title+'" und alle enthaltenen Vokabeln löschen?')) return;
    // collect all descendants so FK constraints don't block deletion
    var childIds = chapters.filter(function(c){return c.parent_id===ch.id;}).map(function(c){return c.id;});
    var grandIds = chapters.filter(function(c){return childIds.indexOf(c.parent_id)>-1;}).map(function(c){return c.id;});
    var allChildIds = childIds.concat(grandIds);
    Promise.all(allChildIds.map(function(id){return sbDel('chapters','id=eq.'+id);}))
      .then(function(){return sbDel('chapters','id=eq.'+ch.id);})
      .then(function(){
        var gone=allChildIds.concat([ch.id]);
        setChapters(function(prev){return prev.filter(function(c){return gone.indexOf(c.id)<0;});});
      })
      .catch(function(){alert('Löschen fehlgeschlagen – möglicherweise gibt es noch abhängige Daten.');});
  }

  function handleFileUpload(e) {
    var file=e.target.files&&e.target.files[0];
    if(!file) return;
    var reader=new FileReader();
    reader.onload=function(ev){ setUploadData(ev.target.result); setShowUpload(true); };
    reader.readAsText(file);
  }

  function doImport(chapterId, words, mode) {
    var ch = chapters.find(function(c){return c.id===chapterId;});
    if(!ch) return;
    var base = mode==='replace'?[]:ch.words.slice();
    var existing = base.map(function(w){return normWordKey(w.word);});
    var toAdd = words.filter(function(w){return existing.indexOf(normWordKey(w.word))<0;});
    var newWords = base.concat(toAdd);
    saveChapterWords(ch, newWords, chapters, setChapters, setSaving, setMsg);
    setShowUpload(false);
  }

  function uploadImg(file) {
    if(!file) return;
    setImgLoading(true); setImgMsg('Bild wird analysiert…'); setImgDraft(null);
    var reader=new FileReader();
    reader.onload=function(){
      var b64=reader.result.split(',')[1];
      var prompt='You are extracting vocabulary entries from a German/English school-book page (Camden Town / Notting Hill Gate or similar).\n\nEACH ENTRY is one English word/phrase with its German translation. Entries are usually separated by horizontal lines and contain a phonetic transcription /.../ between English and German.\n\nFor EACH entry, decide if the English headword is printed in BOLD type — meaning visually heavier/thicker stroke than the surrounding entries on the SAME page. Compare against the lighter (regular) entries on the page; bold entries usually mark the words students must learn for the unit.\n\nIMPORTANT RULES:\n- Verbs MUST be prefixed with "to ": e.g. "to play", "to sing", never just "play".\n- If unsure about bold vs. regular: prefer bold=true when the stroke is even slightly heavier than the page baseline.\n- Look at the WHOLE page first to establish what "regular weight" looks like, then mark each word relative to that.\n- type values: "verb" | "noun" | "adjective" | "phrase" | "other"\n\nReturn ONLY JSON, no markdown fences, no commentary:\n{"words":[{"word":"to play","clue":"spielen","important":true,"type":"verb"},{"word":"birthday","clue":"Geburtstag","important":false,"type":"noun"}]}\n\nIf you cannot read a part of the page, omit those entries — do not guess words you cannot see.';
      var provider=localStorage.getItem('vision_provider')||'anthropic';
      var defaultOllamaUrl = (location.protocol==='https:') ? (SB_URL.replace(/\/$/,'')+'/ollama') : 'http://localhost:11434';
      var ollamaUrl=(localStorage.getItem('ollama_url')||defaultOllamaUrl).replace(/\/$/,'');
      var ollamaModel=localStorage.getItem('ollama_model')||'qwen2.5vl:72b';
      var done=function(words){ setImgDraft(words||[]); setImgMsg('✅ '+(words||[]).length+' Vokabeln erkannt'); setImgLoading(false); };
      var fail=function(msg){ setImgMsg('Fehler: '+msg); setImgLoading(false); };
      function extractJson(text){
        var t=String(text||'').trim().replace(/```json|```/g,'').trim();
        try{ return JSON.parse(t); }catch(e){
          var m=t.match(/\{[\s\S]*\}/);
          if(m){ try{ return JSON.parse(m[0]); }catch(e2){} }
          throw new Error('Modell-Antwort ist kein gültiges JSON: '+t.slice(0,150));
        }
      }
      if(provider==='ollama'){
        fetch(ollamaUrl+'/api/chat',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({model:ollamaModel, stream:false, format:'json',
            messages:[{role:'user', content:prompt, images:[b64]}]
          })
        }).then(function(r){ if(!r.ok) throw new Error('Ollama HTTP '+r.status); return r.json(); })
        .then(function(d){
          var content=(d&&d.message&&d.message.content)||'';
          var parsed=extractJson(content);
          done(parsed.words||[]);
        }).catch(function(e){ fail('Ollama: '+e.message+' — läuft `ollama serve`? Modell `'+ollamaModel+'` gepullt? CORS via OLLAMA_ORIGINS=*'); });
        return;
      }
      sbGet('settings','key=eq.anthropic_key').then(function(d){
        var key=(d&&d[0]&&d[0].value)||localStorage.getItem('claude_api_key')||'';
        if(!key){setImgMsg('Kein API-Key hinterlegt. Wechsle unter 🔑 API-Key auf "Ollama" oder hinterlege einen Anthropic-Key.');setImgLoading(false);return;}
        fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:8000,messages:[{role:'user',content:[
            {type:'image',source:{type:'base64',media_type:file.type,data:b64}},
            {type:'text',text:prompt}
          ]}]})
        }).then(function(r){return r.json();}).then(function(d){
          var txt=(d.content||[]).map(function(b){return b.text||'';}).join('');
          done(extractJson(txt).words||[]);
        }).catch(function(e){ fail(e.message); });
      });
    };
    reader.readAsDataURL(file);
  }

  function doImportOcr(words) {
    if(!imgTargetCh){setImgMsg('Bitte Themenbereich auswählen');return;}
    var ch=chapters.find(function(c){return c.id===imgTargetCh;});
    if(!ch) return;
    var existing=safeWords(ch.words).map(function(w){return normWordKey(w.word);});
    var toAdd=words.filter(function(w){return existing.indexOf(normWordKey(w.word))<0;});
    saveChapterWords(ch,safeWords(ch.words).concat(toAdd),chapters,setChapters,setSaving,setMsg);
    setImgDraft(null); setImgMsg('✅ '+toAdd.length+' Vokabeln importiert');
  }

  function findDuplicates() {
    setDupLoading(true); setShowDup(true);
    var wordMap={};
    chapters.filter(function(c){return c.parent_id;}).forEach(function(ch){
      (ch.words||[]).forEach(function(w){
        var key=normWordKey(w.word);
        if(!wordMap[key]) wordMap[key]=[];
        wordMap[key].push({word:w.word,clue:w.clue,chapId:ch.id,chapTitle:ch.title,chapColor:ch.color});
      });
    });
    var dups=Object.values(wordMap).filter(function(v){return v.length>1;});
    setDupWords(dups); setDupLoading(false);
  }

  function mergeDup(key, keepIdx, entries) {
    var toRemove = entries.filter(function(_,i){return i!==keepIdx;});
    toRemove.forEach(function(entry){
      var ch=chapters.find(function(c){return c.id===entry.chapId;});
      if(!ch) return;
      var newWords=safeWords(ch.words).filter(function(w){return normWordKey(w.word)!==normWordKey(entry.word);});
      saveChapterWords(ch,newWords,chapters,setChapters,setSaving,setMsg);
    });
    setDupWords(function(prev){return prev?prev.filter(function(v){return normWordKey(v[0].word)!==key;}):prev;});
  }

  var topLevelChapters = chapters.filter(function(c){return !c.parent_id;}).slice().sort(naturalSort);
  var childChapters = chapters.filter(function(c){return c.parent_id;});

  if(showUpload) return <UploadPreview fileData={uploadData} chapters={chapters} onConfirm={doImport} onCancel={function(){setShowUpload(false);}}/>;

  if(showDup) return(
    <div style={{padding:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <button onClick={function(){setShowDup(false);}} style={BtnStyle(G100,G600,{padding:'5px 10px',fontSize:11})}>← Zurück</button>
        <span style={{fontWeight:'bold',fontSize:14,color:G900}}>Duplikate</span>
      </div>
      {dupLoading&&<div style={{textAlign:'center',padding:30,color:G400}}>Suche…</div>}
      {!dupLoading&&dupWords&&dupWords.length===0&&<div style={{textAlign:'center',padding:30,color:GR,fontSize:14}}>✓ Keine Duplikate gefunden!</div>}
      {!dupLoading&&(dupWords||[]).map(function(entries,di){
        var key=normWordKey(entries[0].word);
        return <div key={di} style={{marginBottom:10,padding:'10px 12px',borderRadius:10,border:'1px solid '+AM+'66',background:'#fffbeb'}}>
          <div style={{fontWeight:'bold',fontSize:13,color:AM,marginBottom:6}}>"{entries[0].word}" ({entries.length}x)</div>
          {entries.map(function(entry,ei){
            return <div key={ei} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 0',borderBottom:'1px solid '+G100}}>
              <span style={{fontSize:11,color:entry.chapColor,fontWeight:'bold',flex:1}}>{entry.chapTitle}</span>
              <span style={{fontSize:11,color:G400}}>{entry.clue}</span>
              <button onClick={function(){mergeDup(key,ei,entries);}} style={{padding:'3px 8px',borderRadius:6,border:'none',background:T,color:'white',cursor:'pointer',fontSize:10,flexShrink:0}}>✓ Behalten</button>
            </div>;
          })}
        </div>;
      })}
    </div>
  );

  return(
    <div>
      <div style={{display:'flex',gap:3,marginBottom:12,overflowX:'auto',paddingBottom:2}}>
        {[['chapters','📚 Kap.'],['words','📝 Vok.'],['leiterspiel','🪜 LS'],['users','👥 User'],['grammar','✏️ Gram.'],['quiz','🎯 Quiz'],['vocabcheck','🔍 Prüfen'],['klassenarbeit','📋 KA']].map(function(t){
          return <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{padding:'7px 10px',borderRadius:8,border:'none',background:tab===t[0]?T:G100,color:tab===t[0]?'white':G600,fontWeight:'bold',fontSize:11,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>{t[1]}</button>;
        })}
      </div>
      {msg&&<div style={{padding:'6px 10px',background:'#d1fae5',borderRadius:7,fontSize:11,color:T,marginBottom:8}}>{msg}</div>}

      {tab==='chapters'&&(<div>
        <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8,padding:'6px 10px',background:G50,borderRadius:8}}>
          <span style={{fontSize:11,color:G600,fontWeight:'bold'}}>Vokabel-Sortierung:</span>
          <button onClick={function(){setVocabSort('seq');}} style={Object.assign({},BtnStyle(vocabSort==='seq'?T:G100, vocabSort==='seq'?'white':G600,{padding:'4px 10px',fontSize:11}))}>📖 Buchreihenfolge</button>
          <button onClick={function(){setVocabSort('abc');}} style={Object.assign({},BtnStyle(vocabSort==='abc'?T:G100, vocabSort==='abc'?'white':G600,{padding:'4px 10px',fontSize:11}))}>🔤 A-Z</button>
        </div>
        <div style={{marginBottom:14,padding:12,background:G50,borderRadius:12,border:'2px dashed '+G200}}>
          <div style={{fontWeight:'bold',fontSize:13,color:T,marginBottom:8}}>📷 Schulbuch-Seite per Bild importieren</div>
          <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
            <select value={imgTargetCh} onChange={function(e){setImgTargetCh(e.target.value);}}
              style={{flex:1,minWidth:0,padding:'7px 8px',fontSize:13,border:'1.5px solid '+T,borderRadius:8,outline:'none',background:'white'}}>
              <option value=''>-- Themenbereich auswählen --</option>
              {childChapters.map(function(c){
                var par=topLevelChapters.find(function(p){return p.id===c.parent_id;});
                return <option key={c.id} value={c.id}>{par?par.icon+' '+par.title+' > ':''}{c.icon} {c.title}</option>;
              })}
            </select>
            <input ref={imgRef} type='file' accept='image/*' style={{display:'none'}} onChange={function(e){if(e.target.files[0])uploadImg(e.target.files[0]);e.target.value='';}}/>
            <button onClick={function(){imgRef.current&&imgRef.current.click();}} disabled={imgLoading}
              style={{padding:'7px 14px',borderRadius:8,border:'none',background:T,color:'white',fontWeight:'bold',fontSize:13,cursor:'pointer',opacity:imgLoading?0.6:1,touchAction:'manipulation'}}>
              {imgLoading?'⏳ Analysiere…':'📷 Bild hochladen'}
            </button>
          </div>
          {imgMsg&&<div style={{fontSize:12,padding:'6px 10px',borderRadius:6,marginBottom:8,
            background:imgMsg.startsWith('✅')?'#d1fae5':imgMsg.startsWith('Fehler')||imgMsg.startsWith('Kein')?'#fef2f2':'#eff6ff',
            color:imgMsg.startsWith('✅')?'#065f46':imgMsg.startsWith('Fehler')||imgMsg.startsWith('Kein')?RE:T}}>{imgMsg}</div>}
          {imgDraft&&imgDraft.length>0&&(
            <div>
              <div style={{maxHeight:160,overflowY:'auto',border:'1px solid '+G200,borderRadius:8,marginBottom:8}}>
                {imgDraft.map(function(w,i){return <div key={i} style={{display:'flex',gap:8,padding:'4px 10px',borderBottom:'1px solid '+G100,fontSize:11,background:i%2===0?'white':G50}}>
                  {w.important&&<span>⭐</span>}<span style={{fontWeight:'bold',flex:1}}>{w.word}</span><span style={{color:G400}}>{w.clue}</span>
                </div>;})}
              </div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={function(){doImportOcr(imgDraft);}} style={{flex:1,padding:'8px',borderRadius:8,border:'none',background:T,color:'white',fontWeight:'bold',fontSize:12,cursor:'pointer'}}>✓ Importieren</button>
                <button onClick={function(){setImgDraft(null);setImgMsg('');}} style={{padding:'8px 12px',borderRadius:8,border:'none',background:G100,color:G600,fontSize:12,cursor:'pointer'}}>✕</button>
              </div>
            </div>
          )}
        </div>
        {topLevelChapters.map(function(kap){
          var kids=childChapters.filter(function(c){return c.parent_id===kap.id;}).slice().sort(naturalSort);
          var open=expandedCh[kap.id];
          return <div key={kap.id} style={{marginBottom:8,border:'2px solid '+(open?kap.color||T:G200),borderRadius:12,overflow:'hidden'}}>
            <div onClick={function(){toggleCh(kap.id);}} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',background:open?(kap.color||T)+'15':'white',cursor:'pointer'}}>
              <span style={{fontSize:20}}>{kap.icon}</span>
              <span style={{flex:1,fontWeight:'bold',fontSize:13,color:kap.color||T}}>{kap.title}</span>
              {kap.id&&!kap.is_builtin&&<button onClick={function(e){e.stopPropagation();deleteChapter(kap);}} style={{padding:'2px 8px',fontSize:10,border:'1px solid '+RE,background:'white',color:RE,cursor:'pointer',borderRadius:5}}>🗑</button>}
              <span style={{color:G400,fontSize:11}}>{open?'▲':'▼'}</span>
            </div>
            {open&&<div style={{borderTop:'1px solid '+G100}}>
              {kids.map(function(ch){
                var chOpen=expandedCh[ch.id];
                var grandkids=childChapters.filter(function(c){return c.parent_id===ch.id;}).slice().sort(naturalSort);
                var hasGrandkids=grandkids.length>0;
                return <div key={ch.id} style={{borderBottom:'1px solid '+G100}}>
                  <div onClick={function(){toggleCh(ch.id);}} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px 7px 18px',cursor:'pointer',background:chOpen?ch.color+'10':'#fafafa'}}>
                    <span style={{fontSize:15}}>{ch.icon}</span>
                    <span style={{flex:1,fontWeight:'bold',fontSize:12,color:ch.color}}>{ch.title}</span>
                    {hasGrandkids?<span style={{fontSize:10,color:G400}}>{grandkids.length} Bereiche</span>:<span style={{fontSize:10,color:G400}}>{(ch.words||[]).length} V</span>}
                    {!hasGrandkids&&(function(){
                      var noType=safeWords(ch.words).filter(function(w){return !w.type;}).length;
                      var st=autoTyping[ch.id];
                      if(st==='done') return <span style={{fontSize:9,color:GR,fontWeight:'bold',flexShrink:0}}>✓ Typen</span>;
                      if(st==='loading') return <span style={{fontSize:9,color:G400,flexShrink:0}}>🤖…</span>;
                      if(noType>0) return <button onClick={function(e){e.stopPropagation();autoTypeChapter(ch);}} style={{padding:'2px 6px',fontSize:9,border:'1px solid #7c3aed',background:'white',color:'#7c3aed',cursor:'pointer',borderRadius:5,flexShrink:0,fontWeight:'bold'}} title={''+noType+' ohne Typ'}>🤖 {noType}</button>;
                      return null;
                    })()}
                    <button onClick={function(e){e.stopPropagation();setEditCh(ch);}} style={{padding:'2px 7px',fontSize:10,border:'1px solid '+T,background:'white',color:T,cursor:'pointer',borderRadius:5,marginLeft:2}}>✏️</button>
                    {ch.id&&!ch.is_builtin&&<button onClick={function(e){e.stopPropagation();deleteChapter(ch);}} style={{padding:'2px 7px',fontSize:10,border:'1px solid '+RE,background:'white',color:RE,cursor:'pointer',borderRadius:5}}>🗑</button>}
                    <span style={{color:G400,fontSize:10,marginLeft:2}}>{chOpen?'▲':'▼'}</span>
                  </div>
                  {chOpen&&hasGrandkids&&<div style={{padding:'4px 0',background:'#f9fafb'}}>
                    {grandkids.map(function(gk){
                      var gkOpen=expandedCh[gk.id];
                      return <div key={gk.id} style={{marginLeft:18,borderTop:'1px solid '+G100}}>
                        <div onClick={function(){toggleCh(gk.id);}} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px 6px 14px',cursor:'pointer',background:gkOpen?gk.color+'10':'white'}}>
                          <span style={{fontSize:13}}>{gk.icon}</span>
                          <span style={{flex:1,fontWeight:'bold',fontSize:11,color:gk.color}}>{gk.title}</span>
                          <span style={{fontSize:9,color:G400}}>{(gk.words||[]).length} V</span>
                          <button onClick={function(e){e.stopPropagation();setEditCh(gk);}} style={{padding:'1px 6px',fontSize:9,border:'1px solid '+T,background:'white',color:T,cursor:'pointer',borderRadius:4}}>✏️</button>
                          {gk.id&&!gk.is_builtin&&<button onClick={function(e){e.stopPropagation();deleteChapter(gk);}} style={{padding:'1px 6px',fontSize:9,border:'1px solid '+RE,background:'white',color:RE,cursor:'pointer',borderRadius:4}}>🗑</button>}
                          <span style={{color:G400,fontSize:9}}>{gkOpen?'▲':'▼'}</span>
                        </div>
                        {gkOpen&&<div style={{padding:'4px 14px 8px',background:'#fafafa'}}>
                          {sortVocab(gk.words).map(function(w,wi){
                            var ws=safeWords(gk.words); var realIdx=ws.indexOf(w);
                            var typeColors={verb:'#7c3aed',noun:'#0369a1',adjective:'#b45309',phrase:'#15803d',other:G600};
                            var typeLabels={verb:'V',noun:'N',adjective:'Adj',phrase:'Ph',other:'?'};
                            var tc=typeColors[w.type]||G400; var tl=typeLabels[w.type]||'';
                            var canDrag = vocabSort==='seq';
                            var isDragOver = dragSrc && dragSrc.chId===gk.id && dragSrc.word!==w;
                            var sentsForWord = (gk.sentences||[]).map(function(ss,si){return {s:ss,si:si};}).filter(function(x){return x.s.wordRef===w.word;});
                            var sentKey = gk.id+'|'+w.word;
                            var sentOpen = expandedSentWord===sentKey;
                            return <div key={wi}>
                              <div
                                draggable={canDrag}
                                onDragStart={canDrag?function(e){setDragSrc({chId:gk.id,word:w}); e.dataTransfer.effectAllowed='move';}:null}
                                onDragOver={isDragOver?function(e){e.preventDefault(); e.dataTransfer.dropEffect='move';}:null}
                                onDrop={isDragOver?function(e){
                                  e.preventDefault();
                                  var rect=e.currentTarget.getBoundingClientRect();
                                  var pos=(e.clientY-rect.top) < rect.height/2 ? 'before' : 'after';
                                  reorderVocab(gk.id, dragSrc.word, w, pos);
                                  setDragSrc(null);
                                }:null}
                                onDragEnd={canDrag?function(){setDragSrc(null);}:null}
                                style={{display:'flex',alignItems:'center',gap:5,padding:'4px 2px',borderBottom:sentOpen?'none':'1px solid '+G100,fontSize:10,cursor:canDrag?'grab':'default',background:dragSrc&&dragSrc.word===w?TL:'transparent'}}>
                                {canDrag&&<span style={{color:G400,fontSize:9,cursor:'grab',flexShrink:0,userSelect:'none'}}>⋮⋮</span>}
                                <button onClick={function(){toggleImportant(gk.id,realIdx);}} title={w.important?'wichtig (klicken um zu entfernen)':'unwichtig (klicken um wichtig zu markieren)'} style={{padding:'1px 4px',fontSize:11,border:'none',background:'transparent',cursor:'pointer',flexShrink:0,color:w.important?AM:G200}}>{w.important?'⭐':'☆'}</button>
                                <div style={{flex:1,minWidth:0,display:'flex',gap:5,alignItems:'baseline',overflow:'hidden'}} title={w.word+' → '+w.clue}>
                                  <span style={{fontWeight:'bold',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:1}}>{w.word}</span>
                                  <span style={{color:G400,fontSize:9,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:1}}>{w.clue}</span>
                                </div>
                                {w.book_page&&<span style={{fontSize:8,color:G400,flexShrink:0}}>S.{w.book_page}</span>}
                                {w.type&&<span style={{fontSize:8,padding:'1px 4px',borderRadius:8,background:tc+'18',color:tc,fontWeight:'bold',flexShrink:0,border:'1px solid '+tc+'44'}}>{tl}</span>}
                                {sentsForWord.length>0&&<button onClick={function(e){e.stopPropagation();setExpandedSentWord(sentOpen?null:sentKey);}} title={sentsForWord.length+' verlinkte Satz/Sätze'} style={{padding:'1px 4px',fontSize:8,border:'1px solid #a855f7',background:sentOpen?'#a855f7':'white',color:sentOpen?'white':'#7c3aed',cursor:'pointer',borderRadius:4,flexShrink:0,fontWeight:'bold'}}>💬{sentsForWord.length}</button>}
                                <button onClick={function(){setEditWord({w:Object.assign({},w),chId:gk.id,idx:realIdx});}} style={{padding:'1px 5px',fontSize:8,border:'1px solid '+T,background:'white',color:T,cursor:'pointer',borderRadius:4,flexShrink:0}}>✏</button>
                                <button onClick={function(){deleteWord(gk.id,realIdx);}} style={{padding:'1px 5px',fontSize:8,border:'1px solid '+RE,background:'white',color:RE,cursor:'pointer',borderRadius:4,flexShrink:0}}>✕</button>
                              </div>
                              {sentOpen&&<div style={{padding:'3px 6px 6px 22px',background:'#faf5ff',borderBottom:'1px solid '+G100}}>
                                {sentsForWord.map(function(x){
                                  return <div key={x.si} style={{padding:'3px 5px',marginBottom:2,borderRadius:4,border:'1px solid #e9d5ff',background:'white',fontSize:9}}>
                                    <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                                      <span style={{flex:1,fontWeight:'bold',color:G900}}>{x.s.important?'⭐ ':''}{x.s.text}</span>
                                      <button onClick={function(){setShowSentences(function(p){var n=Object.assign({},p);n[gk.id]=true;return n;});setEditSent({chId:gk.id,idx:x.si,s:Object.assign({important:false,wordRef:''},x.s),translating:false});}} style={{padding:'0 4px',fontSize:7,border:'1px solid '+T,background:'white',color:T,cursor:'pointer',borderRadius:3,flexShrink:0}}>✏</button>
                                      <button onClick={function(){deleteSentence(gk.id,x.si);}} style={{padding:'0 4px',fontSize:7,border:'1px solid '+RE,background:'white',color:RE,cursor:'pointer',borderRadius:3,flexShrink:0}}>✕</button>
                                    </div>
                                    <div style={{color:G400,marginTop:1,fontStyle:'italic'}}>{x.s.translation}</div>
                                  </div>;
                                })}
                              </div>}
                            </div>;
                          })}
                          {editWord&&editWord.chId===gk.id&&(<div style={{padding:6,background:'white',borderRadius:8,border:'1px solid '+T,marginTop:4}}>
                            <div style={{display:'flex',gap:5,marginBottom:4}}>
                              <input value={editWord.w.word||''} onChange={function(e){setEditWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{word:e.target.value})});});}} style={{flex:1,padding:'4px',fontSize:11,border:'1px solid '+G200,borderRadius:4}} placeholder="EN"/>
                              <input value={editWord.w.clue||''} onChange={function(e){setEditWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{clue:e.target.value})});});}} style={{flex:1,padding:'4px',fontSize:11,border:'1px solid '+G200,borderRadius:4}} placeholder="DE"/>
                              <div onClick={function(){setEditWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{important:!ew.w.important})});});}} style={{width:24,height:24,borderRadius:5,border:'2px solid '+(editWord.w.important?AM:G200),background:editWord.w.important?AM:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}><span style={{fontSize:11}}>{editWord.w.important?'⭐':'☆'}</span></div>
                            </div>
                            <div style={{display:'flex',gap:5}}>
                              <button onClick={function(){doSaveWord(editWord.chId,editWord.w,editWord.idx);}} style={BtnStyle(T,'white',{flex:1,padding:'4px',fontSize:9})}>✓ Speichern</button>
                              <button onClick={function(){setEditWord(null);}} style={BtnStyle(G100,G600,{flex:1,padding:'4px',fontSize:9})}>✕</button>
                            </div>
                          </div>)}
                          <button onClick={function(){setEditWord({w:{word:'',clue:'',important:false},chId:gk.id,idx:null});}} style={{width:'100%',padding:'4px',marginTop:4,borderRadius:5,border:'1px dashed '+T,background:TL,color:T,cursor:'pointer',fontSize:10,fontWeight:'bold'}}>+ Vokabel</button>
                        </div>}
                      </div>;
                    })}
                    <button onClick={function(){setShowNewCh(true);setNewChForm({title:'',color:T,icon:'📖',parent_id:ch.id,words:[],sentences:[]});}} style={{width:'100%',margin:'4px 18px',padding:'5px',borderRadius:6,border:'1px dashed '+T,background:TL,color:T,cursor:'pointer',fontSize:10,fontWeight:'bold'}}>+ Themenbereich zu {ch.title}</button>
                  </div>}
                  {chOpen&&!hasGrandkids&&<div style={{padding:'6px 18px 10px',background:'#f9fafb'}}>
                    {editCh&&editCh.id===ch.id&&(<div style={{padding:10,background:'white',borderRadius:8,border:'1px solid '+T,marginBottom:8}}>
                      <div style={{display:'flex',gap:6,marginBottom:6}}>
                        <input value={editCh.icon||''} onChange={function(e){setEditCh(function(c){return Object.assign({},c,{icon:e.target.value});});}} style={{width:40,padding:'6px',fontSize:14,border:'1px solid '+G200,borderRadius:6,textAlign:'center'}} placeholder="Icon"/>
                        <input value={editCh.title||''} onChange={function(e){setEditCh(function(c){return Object.assign({},c,{title:e.target.value});});}} style={{flex:1,padding:'6px',fontSize:13,border:'1px solid '+G200,borderRadius:6}} placeholder="Titel"/>
                        <input value={editCh.color||''} onChange={function(e){setEditCh(function(c){return Object.assign({},c,{color:e.target.value});});}} type="color" style={{width:36,height:30,padding:2,border:'1px solid '+G200,borderRadius:6,cursor:'pointer'}}/>
                      </div>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={function(){saveChapter(editCh);}} style={BtnStyle(T,'white',{flex:1,padding:'6px',fontSize:11})}>✓ OK</button>
                        <button onClick={function(){setEditCh(null);}} style={BtnStyle(G100,G600,{flex:1,padding:'6px',fontSize:11})}>Abbrechen</button>
                      </div>
                    </div>)}
                    {sortVocab(ch.words).map(function(w,wi){
                      var ws=safeWords(ch.words); var realIdx=ws.indexOf(w);
                      var typeColors={verb:'#7c3aed',noun:'#0369a1',adjective:'#b45309',phrase:'#15803d',other:G600};
                      var typeLabels={verb:'V',noun:'N',adjective:'Adj',phrase:'Ph',other:'?'};
                      var tc=typeColors[w.type]||G400; var tl=typeLabels[w.type]||'';
                      var canDrag = vocabSort==='seq';
                      var isDragOver = dragSrc && dragSrc.chId===ch.id && dragSrc.word!==w;
                      var sentsForWord = (ch.sentences||[]).map(function(ss,si){return {s:ss,si:si};}).filter(function(x){return x.s.wordRef===w.word;});
                      var sentKey = ch.id+'|'+w.word;
                      var sentOpen = expandedSentWord===sentKey;
                      return <div key={wi}>
                        <div
                          draggable={canDrag}
                          onDragStart={canDrag?function(e){setDragSrc({chId:ch.id,word:w}); e.dataTransfer.effectAllowed='move';}:null}
                          onDragOver={isDragOver?function(e){e.preventDefault(); e.dataTransfer.dropEffect='move';}:null}
                          onDrop={isDragOver?function(e){
                            e.preventDefault();
                            var rect=e.currentTarget.getBoundingClientRect();
                            var pos=(e.clientY-rect.top) < rect.height/2 ? 'before' : 'after';
                            reorderVocab(ch.id, dragSrc.word, w, pos);
                            setDragSrc(null);
                          }:null}
                          onDragEnd={canDrag?function(){setDragSrc(null);}:null}
                          style={{display:'flex',alignItems:'center',gap:5,padding:'5px 2px',borderBottom:sentOpen?'none':'1px solid '+G100,fontSize:11,cursor:canDrag?'grab':'default',background:dragSrc&&dragSrc.word===w?TL:'transparent'}}>
                          {canDrag&&<span style={{color:G400,fontSize:11,cursor:'grab',flexShrink:0,userSelect:'none'}}>⋮⋮</span>}
                          <button onClick={function(){toggleImportant(ch.id,realIdx);}} title={w.important?'wichtig (klicken um zu entfernen)':'unwichtig (klicken um wichtig zu markieren)'} style={{padding:'1px 5px',fontSize:13,border:'none',background:'transparent',cursor:'pointer',flexShrink:0,color:w.important?AM:G200}}>{w.important?'⭐':'☆'}</button>
                          <div style={{flex:1,minWidth:0,display:'flex',gap:6,alignItems:'baseline',overflow:'hidden'}} title={w.word+' → '+w.clue}>
                            <span style={{fontWeight:'bold',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:1}}>{w.word}</span>
                            <span style={{color:G400,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:1}}>{w.clue}</span>
                          </div>
                          {w.book_page&&<span style={{fontSize:9,color:G400,flexShrink:0}}>S.{w.book_page}</span>}
                          {w.type&&<span style={{fontSize:8,padding:'1px 5px',borderRadius:10,background:tc+'18',color:tc,fontWeight:'bold',flexShrink:0,border:'1px solid '+tc+'44'}}>{tl}</span>}
                          {sentsForWord.length>0&&<button onClick={function(e){e.stopPropagation();setExpandedSentWord(sentOpen?null:sentKey);}} title={sentsForWord.length+' verlinkte Satz/Sätze'} style={{padding:'1px 5px',fontSize:9,border:'1px solid #a855f7',background:sentOpen?'#a855f7':'white',color:sentOpen?'white':'#7c3aed',cursor:'pointer',borderRadius:4,flexShrink:0,fontWeight:'bold'}}>💬{sentsForWord.length}</button>}
                          <button onClick={function(){setEditWord({w:Object.assign({},w),chId:ch.id,idx:realIdx});}} style={{padding:'2px 6px',fontSize:9,border:'1px solid '+T,background:'white',color:T,cursor:'pointer',borderRadius:4,flexShrink:0}}>✏</button>
                          <button onClick={function(){deleteWord(ch.id,realIdx);}} style={{padding:'2px 6px',fontSize:9,border:'1px solid '+RE,background:'white',color:RE,cursor:'pointer',borderRadius:4,flexShrink:0}}>✕</button>
                        </div>
                        {sentOpen&&<div style={{padding:'4px 8px 8px 26px',background:'#faf5ff',borderBottom:'1px solid '+G100}}>
                          {sentsForWord.map(function(x){
                            return <div key={x.si} style={{padding:'4px 6px',marginBottom:3,borderRadius:5,border:'1px solid #e9d5ff',background:'white',fontSize:10}}>
                              <div style={{display:'flex',alignItems:'baseline',gap:5}}>
                                <span style={{flex:1,fontWeight:'bold',color:G900}}>{x.s.important?'⭐ ':''}{x.s.text}</span>
                                <button onClick={function(){setShowSentences(function(p){var n=Object.assign({},p);n[ch.id]=true;return n;});setEditSent({chId:ch.id,idx:x.si,s:Object.assign({important:false,wordRef:''},x.s),translating:false});}} style={{padding:'1px 5px',fontSize:8,border:'1px solid '+T,background:'white',color:T,cursor:'pointer',borderRadius:3,flexShrink:0}}>✏</button>
                                <button onClick={function(){deleteSentence(ch.id,x.si);}} style={{padding:'1px 5px',fontSize:8,border:'1px solid '+RE,background:'white',color:RE,cursor:'pointer',borderRadius:3,flexShrink:0}}>✕</button>
                              </div>
                              <div style={{color:G400,marginTop:1,fontStyle:'italic'}}>{x.s.translation}</div>
                            </div>;
                          })}
                        </div>}
                      </div>;
                    })}
                    {editWord&&editWord.chId===ch.id&&(<div style={{padding:8,background:'white',borderRadius:8,border:'1px solid '+T,marginTop:6}}>
                      <div style={{display:'flex',gap:5,marginBottom:5}}>
                        <input value={editWord.w.word||''} onChange={function(e){setEditWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{word:e.target.value})});});}} style={{flex:1,padding:'5px',fontSize:12,border:'1px solid '+G200,borderRadius:5}} placeholder="EN (z.B. to play)"/>
                        <input value={editWord.w.clue||''} onChange={function(e){setEditWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{clue:e.target.value})});});}} style={{flex:1,padding:'5px',fontSize:12,border:'1px solid '+G200,borderRadius:5}} placeholder="DE"/>
                        <div onClick={function(){setEditWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{important:!ew.w.important})});});}} style={{width:28,height:28,borderRadius:6,border:'2px solid '+(editWord.w.important?AM:G200),background:editWord.w.important?AM:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
                          <span style={{fontSize:12}}>{editWord.w.important?'⭐':'☆'}</span>
                        </div>
                      </div>
                      <div style={{marginBottom:5}}>
                        <select value={editWord.w.type||'noun'} onChange={function(e){setEditWord(function(ew){return Object.assign({},ew,{w:Object.assign({},ew.w,{type:e.target.value})});});}}
                          style={{width:'100%',padding:'5px',fontSize:12,border:'1px solid '+G200,borderRadius:5,background:'white'}}>
                          <option value="verb">Verb (to ...)</option>
                          <option value="noun">Substantiv</option>
                          <option value="adjective">Adjektiv</option>
                          <option value="phrase">Phrase / Wendung</option>
                          <option value="other">Sonstiges</option>
                        </select>
                      </div>
                      <div style={{display:'flex',gap:5}}>
                        <button onClick={function(){doSaveWord(editWord.chId,editWord.w,editWord.idx);}} style={BtnStyle(T,'white',{flex:1,padding:'5px',fontSize:10})}>✓ Speichern</button>
                        <button onClick={function(){setEditWord(null);}} style={BtnStyle(G100,G600,{flex:1,padding:'5px',fontSize:10})}>✕</button>
                      </div>
                    </div>)}
                    <button onClick={function(){setEditWord({w:{word:'',clue:'',important:false},chId:ch.id,idx:null});}} style={{width:'100%',padding:'5px',marginTop:6,borderRadius:6,border:'1px dashed '+T,background:TL,color:T,cursor:'pointer',fontSize:11,fontWeight:'bold'}}>+ Vokabel hinzufügen</button>
                    <div style={{display:'flex',gap:5,marginTop:5}}>
                      <label style={{flex:1,padding:'5px',textAlign:'center',borderRadius:6,border:'1px dashed '+G400,background:G50,cursor:'pointer',fontSize:10,color:G600}}>
                        📁 CSV/TSV hochladen
                        <input type="file" accept=".csv,.tsv,.txt" ref={fileRef} onChange={handleFileUpload} style={{display:'none'}}/>
                      </label>
                    </div>
                    {(function(){
                      var sents = ch.sentences||[];
                      var open = !!showSentences[ch.id];
                      return <div style={{marginTop:8,borderTop:'1px solid '+G200,paddingTop:6}}>
                        <div onClick={function(){setShowSentences(function(p){var n=Object.assign({},p);n[ch.id]=!n[ch.id];return n;});}}
                          style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'4px 2px',fontSize:11,color:'#7c3aed',fontWeight:'bold'}}>
                          <span>💬 Sätze ({sents.length})</span>
                          <span style={{marginLeft:'auto',color:G400,fontSize:10}}>{open?'▲':'▼'}</span>
                        </div>
                        {open&&<div>
                          {sents.map(function(s,si){
                            return <div key={si} style={{padding:'5px 6px',marginBottom:3,borderRadius:6,border:'1px solid '+G200,background:'white',fontSize:11}}>
                              <div style={{display:'flex',gap:6,alignItems:'baseline'}}>
                                <span style={{flex:1,fontWeight:'bold',color:G900}}>{s.important?'⭐ ':''}{s.text}</span>
                                {s.wordRef&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:8,background:'#ede9fe',color:'#7c3aed',fontWeight:'bold',flexShrink:0}}>→ {s.wordRef}</span>}
                                <button onClick={function(){setEditSent({chId:ch.id,idx:si,s:Object.assign({important:false,wordRef:''},s),translating:false});}} style={{padding:'1px 6px',fontSize:9,border:'1px solid '+T,background:'white',color:T,cursor:'pointer',borderRadius:4,flexShrink:0}}>✏</button>
                                <button onClick={function(){deleteSentence(ch.id,si);}} style={{padding:'1px 6px',fontSize:9,border:'1px solid '+RE,background:'white',color:RE,cursor:'pointer',borderRadius:4,flexShrink:0}}>✕</button>
                              </div>
                              <div style={{fontSize:10,color:G400,marginTop:2,fontStyle:'italic'}}>{s.translation}</div>
                            </div>;
                          })}
                          {editSent&&editSent.chId===ch.id&&(<div style={{padding:8,background:'white',borderRadius:8,border:'1.5px solid #a855f7',marginTop:6}}>
                            <div style={{fontSize:10,color:'#7c3aed',fontWeight:'bold',marginBottom:5}}>{editSent.idx==null?'Neuer Satz':'Satz bearbeiten'}</div>
                            <textarea value={editSent.s.text||''} onChange={function(e){var v=e.target.value;setEditSent(function(es){return Object.assign({},es,{s:Object.assign({},es.s,{text:v})});});}}
                              placeholder="Englischer Satz" rows={2}
                              style={{width:'100%',padding:'6px',fontSize:12,border:'1px solid '+G200,borderRadius:5,resize:'vertical',boxSizing:'border-box',marginBottom:4}}/>
                            <div style={{display:'flex',gap:4,marginBottom:4}}>
                              <textarea value={editSent.s.translation||''} onChange={function(e){var v=e.target.value;setEditSent(function(es){return Object.assign({},es,{s:Object.assign({},es.s,{translation:v})});});}}
                                placeholder="Deutsche Übersetzung (leer = automatisch)" rows={2}
                                style={{flex:1,padding:'6px',fontSize:12,border:'1px solid '+G200,borderRadius:5,resize:'vertical',boxSizing:'border-box'}}/>
                              <button onClick={autoTranslateInEditor} disabled={editSent.translating||!editSent.s.text} title="Automatisch übersetzen"
                                style={BtnStyle('#a855f7','white',{padding:'4px 10px',fontSize:11,opacity:(editSent.translating||!editSent.s.text)?0.5:1})}>
                                {editSent.translating?'⏳':'🌐'}
                              </button>
                            </div>
                            <div style={{display:'flex',gap:4,marginBottom:5}}>
                              <select value={editSent.s.wordRef||''} onChange={function(e){var v=e.target.value;setEditSent(function(es){return Object.assign({},es,{s:Object.assign({},es.s,{wordRef:v})});});}}
                                style={{flex:1,padding:'5px',fontSize:11,border:'1px solid '+G200,borderRadius:5,background:'white'}}>
                                <option value="">— Vokabel zuweisen (für Test) —</option>
                                {sortVocab(ch.words).map(function(w,wi){
                                  return <option key={wi} value={w.word}>{w.word} ({w.clue})</option>;
                                })}
                              </select>
                              <div onClick={function(){setEditSent(function(es){return Object.assign({},es,{s:Object.assign({},es.s,{important:!es.s.important})});});}}
                                style={{width:28,height:28,borderRadius:5,border:'2px solid '+(editSent.s.important?AM:G200),background:editSent.s.important?AM:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
                                <span style={{fontSize:11}}>{editSent.s.important?'⭐':'☆'}</span>
                              </div>
                            </div>
                            <div style={{display:'flex',gap:5}}>
                              <button onClick={saveSentenceWithAutoTranslate} disabled={editSent.translating||saving} style={BtnStyle('#a855f7','white',{flex:1,padding:'5px',fontSize:10,opacity:(editSent.translating||saving)?0.5:1})}>
                                {editSent.translating?'⏳ Übersetze…':saving?'⏳ Speichere…':'✓ Speichern'}
                              </button>
                              <button onClick={function(){setEditSent(null);}} style={BtnStyle(G100,G600,{flex:1,padding:'5px',fontSize:10})}>✕ Abbrechen</button>
                            </div>
                          </div>)}
                          <button onClick={function(){setEditSent({chId:ch.id,idx:null,s:{text:'',translation:'',wordRef:'',important:false},translating:false});}}
                            style={{width:'100%',padding:'5px',marginTop:6,borderRadius:6,border:'1px dashed #a855f7',background:'#faf5ff',color:'#7c3aed',cursor:'pointer',fontSize:11,fontWeight:'bold'}}>+ Satz hinzufügen</button>
                        </div>}
                      </div>;
                    })()}
                  </div>}
                </div>;
              })}
              <button onClick={function(){setShowNewCh(true);setNewChForm({title:'',color:T,icon:'📖',parent_id:kap.id,words:[],sentences:[]});}} style={{width:'100%',margin:'8px 0',padding:'7px',borderRadius:8,border:'1px dashed '+T,background:TL,color:T,cursor:'pointer',fontSize:11,fontWeight:'bold'}}>+ Themenbereich zu {kap.title}</button>
              {showNewCh&&newChForm.parent_id===kap.id&&(<div style={{margin:'8px 12px',padding:12,background:'white',borderRadius:10,border:'2px solid '+T}}>
                <div style={{fontWeight:'bold',fontSize:12,marginBottom:8}}>Neuer Themenbereich in {kap.title}</div>
                <div style={{display:'flex',gap:6,marginBottom:6}}>
                  <input value={newChForm.icon} onChange={function(e){setNewChForm(function(f){return Object.assign({},f,{icon:e.target.value});});}} style={{width:40,padding:'6px',fontSize:14,border:'1px solid '+G200,borderRadius:6,textAlign:'center'}} placeholder="Icon"/>
                  <input value={newChForm.title} onChange={function(e){setNewChForm(function(f){return Object.assign({},f,{title:e.target.value});});}} style={{flex:1,padding:'6px',fontSize:13,border:'1px solid '+G200,borderRadius:6}} placeholder="Titel"/>
                  <input value={newChForm.color} onChange={function(e){setNewChForm(function(f){return Object.assign({},f,{color:e.target.value});});}} type="color" style={{width:36,height:30,padding:2,border:'1px solid '+G200,borderRadius:6,cursor:'pointer'}}/>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={function(){saveChapter(newChForm);}} disabled={saving||!newChForm.title} style={BtnStyle(T,'white',{flex:1,padding:'7px',fontSize:11})}>{saving?'…':'✓ Erstellen'}</button>
                  <button onClick={function(){setShowNewCh(false);}} style={BtnStyle(G100,G600,{flex:1,padding:'7px',fontSize:11})}>Abbrechen</button>
                </div>
              </div>)}
            </div>}
          </div>;
        })}
        <button onClick={function(){
          var allChild=chapters.filter(function(c){return c.parent_id;});
          var missing=allChild.filter(function(c){return safeWords(c.words).some(function(w){return !w.type;});});
          if(!missing.length){setMsg('✓ Alle Vokabeln haben bereits einen Typ!');return;}
          missing.forEach(function(ch){autoTypeChapter(ch);});
          setMsg('🤖 Kategorisiere '+missing.length+' Themenbereiche…');
        }} style={BtnStyle('#7c3aed','white',{width:'100%',padding:'9px',marginTop:4,fontSize:12})}>🤖 Alle Vokabeln auto-kategorisieren</button>
        <button onClick={function(){setShowNewCh(true);setNewChForm({title:'',color:T,icon:'📗',parent_id:'',words:[],sentences:[]});}} style={BtnStyle(T,'white',{width:'100%',padding:'10px',marginTop:4})}>+ Neues Kapitel</button>
        {showNewCh&&!newChForm.parent_id&&(<div style={{padding:12,background:'white',borderRadius:10,border:'2px solid '+T,marginTop:8}}>
          <div style={{fontWeight:'bold',fontSize:12,marginBottom:8}}>{newChForm.parent_id?'Neuer Themenbereich':'Neues Kapitel'}</div>
          <div style={{display:'flex',gap:6,marginBottom:6}}>
            <input value={newChForm.icon} onChange={function(e){setNewChForm(function(f){return Object.assign({},f,{icon:e.target.value});});}} style={{width:40,padding:'6px',fontSize:14,border:'1px solid '+G200,borderRadius:6,textAlign:'center'}} placeholder="Icon"/>
            <input value={newChForm.title} onChange={function(e){setNewChForm(function(f){return Object.assign({},f,{title:e.target.value});});}} style={{flex:1,padding:'6px',fontSize:13,border:'1px solid '+G200,borderRadius:6}} placeholder="Titel"/>
            <input value={newChForm.color} onChange={function(e){setNewChForm(function(f){return Object.assign({},f,{color:e.target.value});});}} type="color" style={{width:36,height:30,padding:2,border:'1px solid '+G200,borderRadius:6,cursor:'pointer'}}/>
          </div>
          {!newChForm.parent_id&&(<div style={{marginBottom:6}}>
            <label style={{fontSize:11,color:G400}}>Übergeordnetes Kapitel:</label>
            <select value={newChForm.parent_id||''} onChange={function(e){setNewChForm(function(f){return Object.assign({},f,{parent_id:e.target.value||null});});}} style={{width:'100%',padding:'6px',fontSize:12,border:'1px solid '+G200,borderRadius:6,marginTop:3}}>
              <option value="">-- Kein Eltern (Top-Level) --</option>
              {topLevelChapters.map(function(k){return <option key={k.id} value={k.id}>{k.icon} {k.title}</option>;})}
            </select>
          </div>)}
          <div style={{display:'flex',gap:6}}>
            <button onClick={function(){saveChapter(newChForm);}} disabled={saving} style={BtnStyle(T,'white',{flex:1,padding:'7px',fontSize:11})}>{saving?'…':'✓ Erstellen'}</button>
            <button onClick={function(){setShowNewCh(false);}} style={BtnStyle(G100,G600,{flex:1,padding:'7px',fontSize:11})}>Abbrechen</button>
          </div>
        </div>)}
        <div style={{display:'flex',gap:6,marginTop:8}}>
          <button onClick={findDuplicates} style={BtnStyle(AM,'white',{flex:1,padding:'8px',fontSize:11})}>🔍 Duplikate suchen</button>
          <button onClick={function(){setShowApiKey(!showApiKey);}} style={BtnStyle(G100,G600,{flex:1,padding:'8px',fontSize:11})}>🔑 API-Key</button>
        </div>
        {showApiKey&&<ApiKeyManager onClose={function(){setShowApiKey(false);}}/>}
      </div>)}

      {tab==='words'&&(<div>
        <VocabSearch chapters={chapters} onWordClick={function(w){
          var ch=chapters.find(function(c){return c.id===w.chapId;});
          if(ch){ var idx=(ch.words||[]).findIndex(function(cw){return cw.word===w.word;}); setEditWord({w:Object.assign({},w),chId:w.chapId,idx:idx}); setTab('chapters'); var kid=chapters.filter(function(c){return c.parent_id;}); setExpandedCh(function(prev){ var n=Object.assign({},prev); n[w.chapId]=true; var p=ch.parent_id; if(p)n[p]=true; return n; }); }
        }}/>
      </div>)}

      {tab==='leiterspiel'&&(<div>
        {showCreateRun
          ? <div>
              <button onClick={function(){setShowCreateRun(false);}} style={{border:'none',background:'none',color:G400,fontSize:13,cursor:'pointer',marginBottom:10,padding:0}}>← Zurück</button>
              <LeitersSpielCreate player={player} chapters={chapters} onDone={function(){setShowCreateRun(false);}}/>
            </div>
          : <div>
              <button onClick={function(){setShowCreateRun(true);}} style={BtnStyle(T,'white',{width:'100%',padding:'10px',fontSize:13,marginBottom:10})}>➕ Neuen Run erstellen</button>
              <LeitersSpielAdminOverview chapters={chapters} scope={scope} player={player}/>
              <div style={{marginTop:10,borderTop:'1px solid '+G200,paddingTop:10}}>
                <div style={{fontWeight:'bold',fontSize:12,color:G600,marginBottom:6}}>Einstellungen</div>
                <LeitersSpielStreakSettings onDone={function(){}}/>
              </div>
            </div>
        }
      </div>)}

      {tab==='users'&&(<div>
        <AdminLernzeitOverview allUsers={allUsers.filter(function(u){return !u.is_admin;})}/>
        <button onClick={function(){setShowNewUser(!showNewUser);setNewUserErr('');setNewUserName('');setNewUserPw('');}} style={{width:'100%',padding:'9px',borderRadius:8,border:'2px dashed '+T,background:'white',color:T,fontWeight:'bold',fontSize:12,cursor:'pointer',marginBottom:10}}>+ Neuer Spieler</button>
        {showNewUser&&(<div style={{padding:'12px',borderRadius:10,border:'1px solid '+G200,background:'#f0fdf4',marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:'bold',color:T,marginBottom:8}}>Neuen Spieler anlegen</div>
          <input value={newUserName} onChange={function(e){setNewUserName(e.target.value);}} placeholder="Name" style={{width:'100%',padding:'8px 10px',fontSize:13,border:'1px solid '+G200,borderRadius:7,marginBottom:6,boxSizing:'border-box'}}/>
          <input value={newUserPw} onChange={function(e){setNewUserPw(e.target.value);}} placeholder="Passwort" type="password" style={{width:'100%',padding:'8px 10px',fontSize:13,border:'1px solid '+G200,borderRadius:7,marginBottom:6,boxSizing:'border-box'}}/>
          {newUserErr&&<div style={{fontSize:11,color:RE,marginBottom:6}}>{newUserErr}</div>}
          <button onClick={function(){
            if(!newUserName.trim()||!newUserPw.trim()){setNewUserErr('Name und Passwort eingeben');return;}
            if(newUserPw.length<4){setNewUserErr('Passwort mind. 4 Zeichen');return;}
            hashPw(newUserPw).then(function(hash){
              sbPost('players',{name:newUserName.trim(),password_hash:hash,total_score:0,total_correct:0,total_wrong:0,is_admin:false,is_active:true}).then(function(res){
                if(res&&res._err){setNewUserErr('Fehler: Name bereits vergeben?');return;}
                setAllUsers(function(prev){return prev.concat([res||{name:newUserName.trim(),id:Date.now(),total_score:0,total_correct:0,total_wrong:0,is_active:true}]);});
                setShowNewUser(false);setNewUserName('');setNewUserPw('');setMsg('Spieler angelegt!');setTimeout(function(){setMsg('');},3000);
              }).catch(function(){setNewUserErr('Verbindungsfehler');});
            });
          }} style={{width:'100%',padding:'8px',borderRadius:7,border:'none',background:T,color:'white',fontWeight:'bold',fontSize:12,cursor:'pointer'}}>Anlegen</button>
        </div>)}
        {(allUsers||[]).filter(function(u){return !u.is_admin;}).map(function(u){
          var isOpen = expandedUserId===u.id;
          return <div key={u.id} style={{marginBottom:6,borderRadius:10,border:'1px solid '+(isOpen?T:G200),background:'white',overflow:'hidden'}}>
            <div onClick={function(){var open=!isOpen; setExpandedUserId(open?u.id:null); if(open) loadUserData(u.id);}} style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <span style={{fontSize:18}}>👤</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:'bold',fontSize:13}}>{u.name}</div>
                <div style={{fontSize:10,color:G400}}>Punkte: {u.total_score||0} · Richtig: {u.total_correct||0} · Falsch: {u.total_wrong||0}</div>
              </div>
              <button onClick={function(e){
                e.stopPropagation();
                var active=u.is_active!==false;
                sbPatch('players',{is_active:!active},'id=eq.'+u.id).then(function(){
                  setAllUsers(function(prev){return prev.map(function(x){return x.id===u.id?Object.assign({},x,{is_active:!active}):x;});});
                });
              }} style={{padding:'4px 10px',borderRadius:6,border:'1px solid '+G200,background:u.is_active!==false?GR:RE,color:'white',cursor:'pointer',fontSize:10,fontWeight:'bold'}}>
                {u.is_active!==false?'Aktiv':'Inaktiv'}
              </button>
              <span style={{fontSize:11,color:G400}}>{isOpen?'▲':'📊▼'}</span>
            </div>
            {isOpen && (function(){
              var rows = userProgress[u.id];
              var runs = userRuns[u.id]||[];
              var learnSess = userLearnSessions[u.id];
              if(!rows || !learnSess) return <div style={{padding:'8px 12px',fontSize:11,color:G400}}>Lade…</div>;

              // ── Lernzeit-Chart ──────────────────────────────────
              // Prefer learn_sessions (covers all activity); fall back to ls_progress sessions
              var chartSessions;
              if(learnSess.length>0){
                chartSessions = learnSess.filter(function(s){return s.started_at&&s.active_seconds>0;})
                  .map(function(s){return {d:String(s.started_at).slice(0,10),dur:s.active_seconds};});
              } else {
                chartSessions = [];
                rows.forEach(function(r){var d=parseData(r.data);(d.sessions||[]).forEach(function(s){chartSessions.push(s);});});
              }
              var totalSollMin = 0;
              rows.forEach(function(r){
                var d=parseData(r.data), run=runs.find(function(rn){return rn.id===r.run_id;});
                if(run&&run.target_date){
                  var pct=lsPercent(d,DEFAULT_STREAK);
                  var spentSec=(d.sessions||[]).reduce(function(s,sess){return s+(sess.dur||0);},0);
                  var pacing=lsRunPacing(pct,run.target_pct,run.target_date,spentSec);
                  if(pacing&&pacing.requiredMinPerDay) totalSollMin+=pacing.requiredMinPerDay;
                }
              });
              var nearestTarget=runs.filter(function(r){return r.target_date;}).map(function(r){return r.target_date;}).sort()[0];

              // ── Leiterspiel-Status ──────────────────────────────
              var lsStatus = rows.map(function(r){
                var d=parseData(r.data), run=runs.find(function(rn){return rn.id===r.run_id;});
                if(!run) return null;
                var pct=lsPercent(d,DEFAULT_STREAK);
                var sess=d.sessions||[];
                var totalMin=Math.round(sess.reduce(function(s,x){return s+(x.dur||0);},0)/60);
                var lastD=sess.length>0?sess[sess.length-1].d:null;
                var potPct=Math.round(pct);
                return {run,pct:potPct,totalMin,lastD,words:run.word_count||0,pots:d.pots||{}};
              }).filter(Boolean);

              // ── Test-Historie ───────────────────────────────────
              var runsWithTests = rows.map(function(r){
                var d=parseData(r.data), tests=Array.isArray(d.tests)?d.tests:[];
                if(tests.length===0) return null;
                var run=runs.find(function(rn){return rn.id===r.run_id;});
                return {run_id:r.run_id,runName:(run&&run.name)||r.run_id,runIcon:(run&&run.icon)||'🎯',tests:tests};
              }).filter(Boolean);

              var hasAny = chartSessions.length>0||lsStatus.length>0||runsWithTests.length>0||(userRepeatRuns[u.id]||[]).length>0;
              if(!hasAny) return <div style={{padding:'8px 12px',fontSize:11,color:G400,fontStyle:'italic'}}>Noch keine Aktivität.</div>;

              var SectionHead = function(p){ return <div style={{fontSize:10,fontWeight:'bold',color:G600,marginBottom:6,textTransform:'uppercase',letterSpacing:1,marginTop:p.mt?10:0}}>{p.children}</div>; };

              return <div style={{padding:'10px 12px',background:G50,borderTop:'1px solid '+G200}}>

                {/* Lernzeit-Grafik */}
                {chartSessions.length>0&&<div>
                  <SectionHead>📈 Lernzeit (letzte 30 Tage)</SectionHead>
                  <LernVerlaufChart sessions={chartSessions} requiredMinPerDay={totalSollMin||null} targetDate={nearestTarget}/>
                </div>}

                {/* Fortschritt je Leiterspiel inkl. Zuwachs der letzten 7 Tage */}
                {rows.length>0&&<div style={{marginTop:10}}>
                  <SectionHead>🪜 Fortschritt je Leiterspiel</SectionHead>
                  <LeiterspielFortschritt progressRows={rows} runs={runs}/>
                </div>}

                {/* Tag für Tag: Zeit, Antworten, gelernte Vokabeln */}
                {learnSess.length>0&&<div style={{marginTop:10}}>
                  <TagesDetail sessions={learnSess} progressRows={rows} runs={runs}/>
                </div>}

                {/* Aufschlüsselung nach Spiel */}
                {learnSess.length>0&&<div style={{marginTop:10}}>
                  <SectionHead>🎮 Was gelernt wurde</SectionHead>
                  <GameBreakdown sessions={learnSess}/>
                </div>}

                {/* Wiederholungs-Läufe */}
                {(userRepeatRuns[u.id]||[]).length>0&&<div style={{marginTop:10}}>
                  <SectionHead>🔁 Wiederholung (Punkte pro Lauf)</SectionHead>
                  <RepeatRunHistory runs={userRepeatRuns[u.id]}/>
                </div>}

                {/* Leiterspiel-Status */}
                {lsStatus.length>0&&<div>
                  <SectionHead mt>🪜 Leiterspiel-Status</SectionHead>
                  {lsStatus.map(function(ls){
                    var col=ls.pct>=80?T:ls.pct>=40?AM:RE;
                    var lsKey=u.id+'|'+ls.run.id;
                    var isOpen=expandedLsRun===lsKey;
                    var POT_COLORS={1:'#fee2e2',2:'#ffedd5',3:'#fef9c3',4:'#dcfce7',5:'#d1fae5',6:'#ccfbf1'};
                    var POT_LABELS={1:'Topf 1',2:'Topf 2',3:'Topf 3',4:'Topf 4',5:'Topf 5',6:'Gelernt ✓'};
                    return <div key={ls.run.id} style={{background:'white',borderRadius:8,border:'1px solid '+G200,marginBottom:6,overflow:'hidden'}}>
                      <div onClick={function(){setExpandedLsRun(isOpen?null:lsKey);}} style={{padding:'8px 10px',cursor:'pointer'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                          <span style={{fontSize:18}}>{ls.run.icon||'🪜'}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:'bold',fontSize:12,color:G900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ls.run.name}</div>
                            <div style={{fontSize:10,color:G400}}>{ls.words} Vokabeln · {ls.totalMin} Min gelernt{ls.lastD?' · zuletzt '+ls.lastD.slice(5).replace('-','.'):''}  </div>
                          </div>
                          <div style={{textAlign:'right',flexShrink:0,display:'flex',alignItems:'center',gap:6}}>
                            <div>
                              <div style={{fontWeight:'bold',fontSize:14,color:col}}>{ls.pct}%</div>
                              <div style={{fontSize:9,color:G400}}>Fortschritt</div>
                            </div>
                            <span style={{fontSize:10,color:G400}}>{isOpen?'▲':'▼'}</span>
                          </div>
                        </div>
                        <div style={{height:6,background:G200,borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%',width:ls.pct+'%',background:col,borderRadius:3,transition:'width 0.3s'}}/>
                        </div>
                      </div>
                      {isOpen&&<div style={{borderTop:'1px solid '+G200,padding:'8px 10px'}}>
                        {[1,2,3,4,5,6].map(function(pot){
                          var words=ls.pots[pot]||[];
                          if(words.length===0) return null;
                          return <div key={pot} style={{marginBottom:6}}>
                            <div style={{fontSize:10,fontWeight:'bold',color:G600,marginBottom:3,display:'flex',alignItems:'center',gap:4}}>
                              <span style={{background:POT_COLORS[pot],borderRadius:4,padding:'1px 6px'}}>{POT_LABELS[pot]}</span>
                              <span style={{color:G400,fontWeight:'normal'}}>({words.length})</span>
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:'3px 4px'}}>
                              {words.map(function(w,wi){
                                return <span key={wi} style={{fontSize:10,background:G50,border:'1px solid '+G200,borderRadius:4,padding:'2px 5px',color:G900,whiteSpace:'nowrap'}}>
                                  {w.word}<span style={{color:G400}}> {w.clue}</span>
                                </span>;
                              })}
                            </div>
                          </div>;
                        })}
                        {[1,2,3,4,5,6].every(function(p){return (ls.pots[p]||[]).length===0;})&&
                          <div style={{fontSize:10,color:G400,fontStyle:'italic'}}>Noch keine Topf-Daten geladen.</div>}
                      </div>}
                    </div>;
                  })}
                </div>}

                {/* Test-Historie */}
                {runsWithTests.length>0&&<div>
                  <SectionHead mt>📝 Test-Historie</SectionHead>
                  {runsWithTests.map(function(rt){
                    var len=rt.tests.length, sorted=rt.tests.slice().reverse();
                    return <div key={rt.run_id} style={{marginBottom:8,padding:'7px 9px',background:'white',borderRadius:8,border:'1px solid #e9d5ff'}}>
                      <div style={{fontSize:11,fontWeight:'bold',color:G900,marginBottom:4}}>{rt.runIcon} {rt.runName} <span style={{color:G400,fontWeight:'normal'}}>({len} Test{len===1?'':'s'})</span></div>
                      {sorted.map(function(t,i){
                        var realIdx=len-1-i, key=u.id+'|'+rt.run_id+'|'+realIdx, isTestOpen=expandedAdminTest===key;
                        var gColor=t.grade<=2?'#059669':t.grade<=4?'#7c3aed':'#dc2626';
                        var wrongs=(t.items||[]).filter(function(it){return !it.correct;}).length;
                        return <div key={realIdx} style={{borderTop:i>0?'1px solid '+G100:'none'}}>
                          <div onClick={function(){setExpandedAdminTest(isTestOpen?null:key);}}
                            style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',cursor:'pointer',fontSize:11}}>
                            <span style={{fontSize:16,fontWeight:'bold',color:gColor,minWidth:18,textAlign:'center'}}>{t.grade}</span>
                            <span style={{fontSize:10,color:G900,flex:1}}>{t.correct}/{t.total} richtig{wrongs>0?' · '+wrongs+' Fehler':''}</span>
                            <span style={{fontSize:9,color:G400,fontFamily:'monospace'}}>{fmtTestStamp(t)}</span>
                            <span style={{fontSize:9,color:G400}}>{isTestOpen?'▲':'▼'}</span>
                          </div>
                          {isTestOpen&&<div style={{padding:'2px 0 6px'}}>
                            {(t.items||[]).map(function(it,j){
                              var bg=it.correct?'#d1fae5':it.skipped?G50:'#fee2e2', icon=it.correct?'✓':it.skipped?'⏭':'✗';
                              if(it.kind==='sentence') return <div key={j} style={{padding:'4px 7px',marginBottom:3,borderRadius:5,background:bg,fontSize:10}}>
                                <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
                                  <span>{icon}</span>
                                  <span style={{fontSize:8,padding:'1px 4px',borderRadius:5,background:'#a855f7',color:'white',fontWeight:'bold'}}>💬 SATZ</span>
                                  {it.wordRef&&<span style={{fontSize:9,color:G400,marginLeft:'auto'}}>{it.wordRef}</span>}
                                </div>
                                <div style={{fontWeight:'bold',color:G900}}>{it.word}</div>
                                <div style={{color:G600,fontStyle:'italic'}}>{it.clue}</div>
                                {!it.correct&&!it.skipped&&it.typed&&<div style={{color:'#991b1b',marginTop:2}}>Antwort: <span style={{textDecoration:'line-through'}}>{it.typed}</span></div>}
                              </div>;
                              return <div key={j} style={{display:'flex',alignItems:'center',gap:5,padding:'3px 7px',marginBottom:2,borderRadius:5,background:bg,fontSize:10}}>
                                <span>{icon}</span>
                                <span style={{fontWeight:'bold',color:G900}}>{it.word}</span>
                                <span style={{color:G600,fontSize:9}}>{it.clue}</span>
                                {!it.correct&&!it.skipped&&it.typed&&<span style={{marginLeft:'auto',color:'#991b1b',fontSize:9,textDecoration:'line-through'}}>{it.typed}</span>}
                              </div>;
                            })}
                          </div>}
                        </div>;
                      })}
                    </div>;
                  })}
                </div>}
              </div>;
            })()}
          </div>;
        })}
      </div>)}

      {tab==='quiz'&&(<div>
        <QuizScoringAdmin/>
      </div>)}

      {tab==='grammar'&&(<div>
        <GrammarAdmin player={player} chapters={chapters}/>
      </div>)}

      {tab==='vocabcheck'&&(<div>
        <VocabCheckAdmin chapters={chapters} setChapters={setChapters}/>
      </div>)}
      {tab==='klassenarbeit'&&(<div>
        <KlassenarbeitAdmin player={player} chapters={chapters} scope={scope}/>
      </div>)}
    </div>
  );
}

export { AdminLernzeitOverview, LeitersSpielAdminOverview, CategoryPicker, ApiKeyManager, VocabSearch, UploadPreview, QuizScoringAdmin, VocabCheckAdmin, AdminDash };
