import { sbGet } from '../core/api.js';
import { lsAnswersSince, lsDayStats, lsDeltaSince, lsGetRunsForPlayer, lsLearnedInRange, lsPercent } from '../core/leitner.js';
import { useEffect, useState } from '../core/react.js';
import { filterRunsByScope } from '../core/scope.js';
import { buildDayStats, dayCounts } from '../core/goal.js';
import { AM, G100, G200, G400, G50, G600, G900, GAME_META, RE, T, TD, TL, WD_LONG, gameOf } from '../core/theme.js';
import { dayKey, fmtDayShort, fmtDuration, shiftDay, weekdayOf } from '../core/util.js';
import { parseData } from '../core/words.js';
import { ProgressStats } from './trainer.jsx';
import { LernVerlaufChart } from './widgets.jsx';

function DailyLearnChart({ sessions, run, pacing }) {
  var [range, setRange] = useState('14');
  var byDay = {};
  var earliestSec = null;
  (sessions||[]).forEach(function(s){
    var k, sec, t;
    if(s.started_at){ k = String(s.started_at).slice(0,10); sec = s.active_seconds||0; t = new Date(s.started_at).getTime(); }
    else if(s.d){ k = s.d; sec = s.dur||0; t = (s.ts && new Date(s.ts).getTime()) || new Date(k+'T00:00:00').getTime(); }
    else return;
    byDay[k] = (byDay[k]||0) + sec;
    if(earliestSec===null || t<earliestSec) earliestSec = t;
  });
  var today = new Date(); today.setHours(0,0,0,0);
  var nDays;
  var endDate = today;
  if(range==='all'){
    nDays = earliestSec ? Math.max(7, Math.ceil((today-earliestSec)/86400000)+1) : 14;
  } else if(range==='target' && run && run.target_date){
    var td = new Date(run.target_date+'T00:00:00');
    var startMs = earliestSec || (td-86400000*30);
    var startDate = new Date(startMs); startDate.setHours(0,0,0,0);
    nDays = Math.max(7, Math.ceil((td-startDate)/86400000)+1);
    endDate = td;
  } else {
    nDays = parseInt(range,10) || 14;
  }
  var maxBars = 90;
  if(nDays>maxBars) nDays = maxBars;
  var rows = [];
  for(var i=nDays-1; i>=0; i--){
    var d = new Date(endDate); d.setDate(d.getDate()-i);
    var key = dayKey(d);
    var dayMs = d.getTime();
    rows.push({ key:key, label:d.getDate()+'.'+(d.getMonth()+1), min:Math.round((byDay[key]||0)/60), isToday:dayMs===today.getTime(), isFuture:dayMs>today.getTime() });
  }
  var required = pacing && pacing.requiredMinPerDay || 0;
  var dataMax = rows.reduce(function(m,r){return Math.max(m,r.min);},0);
  var maxMin = Math.max(dataMax, required, 20);
  var W=320, H=140, PAD_L=28, PAD_B=22, PAD_T=10, PAD_R=8;
  var chartW = W-PAD_L-PAD_R, chartH = H-PAD_T-PAD_B;
  var barW = chartW/rows.length;
  var yFor = function(v){ return PAD_T + chartH - (v/maxMin)*chartH; };
  var totalMin = rows.reduce(function(s,r){return s+r.min;},0);
  var pastDays = rows.filter(function(r){return !r.isFuture;}).length || 1;
  var avgMin = Math.round(totalMin/pastDays);
  var targetX = null;
  if(run && run.target_date){
    var ti = rows.findIndex(function(r){return r.key===run.target_date;});
    if(ti>=0) targetX = PAD_L + ti*barW + barW/2;
  }
  var labelEvery = Math.max(1, Math.ceil(nDays/8));
  var rangeBtns = [['7','7T'],['14','14T'],['30','30T'],['60','60T'],['90','90T'],['all','Alle'],['target','→Ziel']];
  return <div style={{padding:'8px 4px',background:'white',borderRadius:8,border:'1px solid '+G200,marginTop:6}}>
    <div style={{display:'flex',gap:3,padding:'0 6px 6px',flexWrap:'wrap'}}>
      {rangeBtns.map(function(b){
        var disabled = b[0]==='target' && !(run&&run.target_date);
        return <button key={b[0]} disabled={disabled} onClick={function(){setRange(b[0]);}}
          style={{padding:'3px 7px',fontSize:9,border:'1px solid '+(range===b[0]?T:G200),background:range===b[0]?T:'white',color:range===b[0]?'white':disabled?G200:G600,borderRadius:5,cursor:disabled?'not-allowed':'pointer',fontWeight:'bold'}}>{b[1]}</button>;
      })}
    </div>
    <div style={{fontSize:10,color:G600,padding:'0 8px 4px',display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
      <span><span style={{fontWeight:'bold'}}>📊 {nDays} Tage</span> · ⌀ {avgMin} Min/Tag · Σ {totalMin} Min</span>
      {required>0&&<span style={{color:'#9a3412'}}>Soll: {required} Min/Tag</span>}
    </div>
    <svg width={W} height={H} viewBox={'0 0 '+W+' '+H} style={{maxWidth:'100%',display:'block'}}>
      {[0.25,0.5,0.75,1].map(function(f,i){
        var v=Math.round(maxMin*f);
        return <g key={i}>
          <line x1={PAD_L} x2={W-PAD_R} y1={yFor(v)} y2={yFor(v)} stroke={G100} strokeDasharray='2 2'/>
          <text x={PAD_L-3} y={yFor(v)+3} fontSize='8' fill={G400} textAnchor='end'>{v}</text>
        </g>;
      })}
      {rows.map(function(r,i){
        var x = PAD_L + i*barW;
        var y = yFor(r.min);
        var h = chartH - (y-PAD_T);
        var fill = r.isToday?T:r.isFuture?G100:'#5eead4';
        return <g key={r.key}>
          {r.min>0 && <rect x={x+1} y={y} width={Math.max(1,barW-2)} height={Math.max(0,h)} fill={fill} rx='1'/>}
          {(i%labelEvery===0||r.isToday) && <text x={x+barW/2} y={H-PAD_B+10} fontSize='8' fill={r.isToday?T:G400} textAnchor='middle' fontWeight={r.isToday?'bold':'normal'}>{r.label}</text>}
          {r.min>0 && barW>16 && <text x={x+barW/2} y={y-2} fontSize='8' fill={G600} textAnchor='middle'>{r.min}</text>}
        </g>;
      })}
      {required>0 && yFor(required)>=PAD_T && <g>
        <line x1={PAD_L} x2={W-PAD_R} y1={yFor(required)} y2={yFor(required)} stroke='#dc2626' strokeWidth='1.5' strokeDasharray='4 3'/>
        <text x={W-PAD_R-2} y={yFor(required)-2} fontSize='8' fill='#dc2626' textAnchor='end' fontWeight='bold'>Soll {required}</text>
      </g>}
      {targetX!==null && <g>
        <line x1={targetX} x2={targetX} y1={PAD_T} y2={H-PAD_B} stroke='#7c3aed' strokeWidth='1.5' strokeDasharray='3 2'/>
        <text x={targetX} y={PAD_T+8} fontSize='8' fill='#7c3aed' textAnchor='middle' fontWeight='bold'>🎯 Ziel</text>
      </g>}
    </svg>
  </div>;
}

function GameBreakdown({ sessions, title }) {
  var byGame={};
  (sessions||[]).forEach(function(s){
    var sec=s.active_seconds||0; if(sec<=0) return;
    var g=gameOf(s);
    if(!byGame[g]) byGame[g]={sec:0,n:0};
    byGame[g].sec+=sec; byGame[g].n++;
  });
  var arr=Object.keys(byGame).map(function(k){return {key:k,sec:byGame[k].sec,n:byGame[k].n};});
  if(arr.length===0) return null;
  arr.sort(function(a,b){return b.sec-a.sec;});
  var total=arr.reduce(function(s,x){return s+x.sec;},0);
  var max=arr[0].sec||1;
  return <div>
    {title&&<div style={{fontSize:10,fontWeight:'bold',color:G600,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>{title}</div>}
    <div style={{background:'white',borderRadius:8,border:'1px solid '+G200,padding:'10px 12px'}}>
      {arr.map(function(x){
        var meta=GAME_META[x.key]||GAME_META.sonstiges;
        var pct=Math.round(x.sec/total*100);
        return <div key={x.key} style={{marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,marginBottom:3}}>
            <span style={{fontSize:14}}>{meta.icon}</span>
            <span style={{fontWeight:'bold',color:G900,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{meta.label}</span>
            <span style={{color:G600}}>{fmtDuration(x.sec)}</span>
            <span style={{color:G400,fontSize:9,width:30,textAlign:'right'}}>{pct}%</span>
          </div>
          <div style={{height:6,background:G100,borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',width:Math.round(x.sec/max*100)+'%',background:T,borderRadius:3}}/>
          </div>
        </div>;
      })}
      <div style={{borderTop:'1px solid '+G100,marginTop:4,paddingTop:8,fontSize:12,fontWeight:'bold',color:G900,display:'flex',justifyContent:'space-between'}}>
        <span>⏱️ Gesamt</span><span>{fmtDuration(total)}</span>
      </div>
    </div>
  </div>;
}

function LeiterspielFortschritt({ progressRows, runs, title }){
  var today = dayKey();
  var cutoff = shiftDay(today,-6);
  var list = (progressRows||[]).map(function(r){
    var run = (runs||[]).find(function(x){ return x.id===r.run_id; });
    if(!run) return null;
    var d = parseData(r.data);
    var pots = d.pots||{};
    var total = [1,2,3,4,5,6].reduce(function(s,p){ return s+((pots[p]||[]).length); },0);
    if(total===0) return null;
    var pct = Math.round(lsPercent(d));
    return {run:run, pct:pct, delta:lsDeltaSince(d, cutoff), total:total,
      learned:(pots[6]||[]).length, almost:(pots[5]||[]).length,
      answers:lsAnswersSince(d, cutoff), newLearned:lsLearnedInRange(d, cutoff)};
  }).filter(Boolean);
  if(list.length===0) return null;
  list.sort(function(a,b){ return b.pct-a.pct; });
  var sumLearned = list.reduce(function(s,x){ return s+x.learned; },0);
  var sumTotal = list.reduce(function(s,x){ return s+x.total; },0);
  var avg = Math.round(list.reduce(function(s,x){ return s+x.pct; },0)/list.length);
  // Zuwachs nur über die Runs mitteln, an denen in der Woche gearbeitet wurde.
  var active = list.filter(function(x){ return x.answers>0; });
  var avgDelta = active.length ? Math.round(active.reduce(function(s,x){ return s+x.delta; },0)/active.length) : 0;
  var weekAnswers = list.reduce(function(s,x){ return s+x.answers; },0);
  var newLearned = list.reduce(function(s,x){ return s+x.newLearned; },0);
  var Kpi = function(p){ return <div style={{flex:1,background:'white',borderRadius:10,border:'1px solid '+G200,padding:'10px 6px',textAlign:'center'}}>
    <div style={{fontSize:16,fontWeight:'bold',color:p.color||T}}>{p.value}</div>
    <div style={{fontSize:9,color:G400,marginTop:2}}>{p.label}</div>
  </div>; };
  return <div>
    {title&&<div style={{fontSize:10,fontWeight:'bold',color:G600,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>{title}</div>}
    <div style={{display:'flex',gap:6,marginBottom:8}}>
      <Kpi value={sumLearned+'/'+sumTotal} label="Vokabeln gelernt"/>
      <Kpi value={avg+'%'} label="Ø Fortschritt"/>
      <Kpi value={(avgDelta>0?'+':'')+avgDelta+'%'} label="7 Tage" color={avgDelta>0?T:avgDelta<0?RE:G400}/>
      <Kpi value={weekAnswers} label="Antw. (7 T.)" color={weekAnswers>0?T:G400}/>
    </div>
    <div style={{background:'white',borderRadius:10,border:'1px solid '+G200,padding:'8px 10px'}}>
      {list.map(function(x){
        var col = x.pct>=80?T:x.pct>=40?AM:RE;
        return <div key={x.run.id} style={{marginBottom:9}}>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,marginBottom:3}}>
            <span style={{fontSize:14}}>{x.run.icon||'🪜'}</span>
            <span style={{fontWeight:'bold',color:G900,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x.run.name}</span>
            {x.delta!==0&&<span style={{color:x.delta>0?T:RE,fontWeight:'bold',fontSize:10}}>{x.delta>0?'▲ +':'▼ '}{x.delta}%</span>}
            <span style={{color:col,fontWeight:'bold'}}>{x.pct}%</span>
          </div>
          <div style={{height:7,background:G100,borderRadius:4,overflow:'hidden',position:'relative'}}>
            <div style={{height:'100%',width:Math.max(0,x.pct-Math.max(0,x.delta))+'%',background:col,borderRadius:4,position:'absolute',left:0,top:0}}/>
            {x.delta>0&&<div style={{height:'100%',width:x.delta+'%',background:'#5eead4',position:'absolute',left:Math.max(0,x.pct-x.delta)+'%',top:0}}/>}
          </div>
          <div style={{fontSize:9,color:G400,marginTop:2}}>✅ {x.learned} gelernt · fast geschafft {x.almost} · von {x.total} Vokabeln
            {x.answers>0&&<span> · diese Woche {x.answers} Antworten{x.newLearned>0?', '+x.newLearned+' neu gelernt':''}</span>}</div>
        </div>;
      })}
      <div style={{fontSize:9,color:G400,borderTop:'1px solid '+G100,paddingTop:6}}>Heller Balken = Zuwachs der letzten 7 Tage.</div>
    </div>
  </div>;
}

function TagesLeiterspiel({ progressRows, runs, day }){
  var [openRun,setOpenRun] = useState(null);
  var list = (progressRows||[]).map(function(r){
    var run = (runs||[]).find(function(x){ return x.id===r.run_id; });
    var d = parseData(r.data);
    var st = lsDayStats(d, day);
    if(!st || (!st.ans && !(st.learned&&st.learned.length))) return null;
    return {run:run, id:r.run_id, st:st};
  }).filter(Boolean);
  if(list.length===0) return null;
  var totAns = list.reduce(function(s,x){ return s+(x.st.ans||0); },0);
  var totCor = list.reduce(function(s,x){ return s+(x.st.cor||0); },0);
  var totLearned = list.reduce(function(s,x){ return s+((x.st.learned||[]).length); },0);
  var totFirst = list.reduce(function(s,x){ return s+(x.st.first||0); },0);
  var totFirstCor = list.reduce(function(s,x){ return s+(x.st.firstCor||0); },0);
  var anyExact = list.some(function(x){ return x.st.exact; });
  return <div style={{marginTop:10}}>
    <div style={{fontSize:11,fontWeight:'bold',color:G600,marginBottom:6}}>🪜 Leiterspiel an diesem Tag</div>
    <div style={{display:'flex',gap:6,marginBottom:8}}>
      {[[totAns,'Antworten',T],[totCor,'richtig ✓',T],[totAns-totCor,'falsch ✗',RE],[totLearned,'neu gelernt',AM]].map(function(k,i){
        return <div key={i} style={{flex:1,background:'white',borderRadius:8,border:'1px solid '+G200,padding:'7px 4px',textAlign:'center'}}>
          <div style={{fontSize:15,fontWeight:'bold',color:k[2]}}>{k[0]}</div>
          <div style={{fontSize:9,color:G400}}>{k[1]}</div>
        </div>;
      })}
    </div>
    {totFirst>0&&<div style={{fontSize:10,color:G400,marginTop:-2,marginBottom:8}}>
      Beim <b style={{color:G600}}>ersten Versuch</b> des Tages (das zeigt, was wirklich hängengeblieben ist):
      <b style={{color:totFirstCor/totFirst>=0.7?T:AM}}> {totFirstCor}/{totFirst} richtig</b> = {Math.round(100*totFirstCor/totFirst)} %
    </div>}
    {list.map(function(x){
      var st = x.st;
      var delta = (st.p0!=null&&st.p1!=null) ? Math.round(st.p1-st.p0) : null;
      var words = st.words ? Object.keys(st.words).map(function(w){ return Object.assign({word:w}, st.words[w]); }) : [];
      words.sort(function(a,b){ return (b.f-b.c)-(a.f-a.c) || (b.c+b.f)-(a.c+a.f); });
      var isOpen = openRun===x.id;
      return <div key={x.id} style={{background:'white',borderRadius:8,border:'1px solid '+G200,padding:'8px 10px',marginBottom:6}}>
        <div onClick={words.length?function(){setOpenRun(isOpen?null:x.id);}:undefined}
          style={{display:'flex',alignItems:'center',gap:6,fontSize:11,cursor:words.length?'pointer':'default'}}>
          <span style={{fontSize:14}}>{(x.run&&x.run.icon)||'🪜'}</span>
          <span style={{fontWeight:'bold',color:G900,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(x.run&&x.run.name)||'Leiterspiel'}</span>
          {delta!=null&&<span style={{color:delta>0?T:delta<0?RE:G400,fontWeight:'bold'}}>{delta>0?'+':''}{delta}%</span>}
          {words.length>0&&<span style={{color:G400,fontSize:11}}>{isOpen?'▲':'▼'}</span>}
        </div>
        <div style={{fontSize:10,color:G400,marginTop:3}}>
          {st.ans} Antworten · ✓ {st.cor} · ✗ {st.ans-st.cor}
          {st.first>0&&<span> · Erstversuch {st.firstCor}/{st.first}</span>}
          {st.p1!=null&&<span> · Stand {Math.round(st.p1)}%</span>}
          {st.count&&<span> von {st.count} Wörtern</span>}
          {(st.learned&&st.learned.length>0)&&<span style={{color:AM,fontWeight:'bold'}}> · 🏆 {st.learned.length} neu gelernt</span>}
        </div>
        {(st.learned&&st.learned.length>0)&&<div style={{fontSize:10,color:G600,marginTop:3}}>
          {st.learned.map(function(w,i){ return <span key={i} style={{display:'inline-block',background:TL,color:TD,borderRadius:5,padding:'1px 5px',marginRight:4,marginTop:3}}>{w}</span>; })}
        </div>}
        {isOpen&&words.length>0&&<div style={{marginTop:7,borderTop:'1px solid '+G100,paddingTop:6}}>
          {words.map(function(w,i){
            return <div key={i} style={{padding:'3px 0',borderBottom:i<words.length-1?'1px solid '+G100:'none'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                <span style={{fontWeight:'bold',color:G900,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.word}</span>
                <span style={{color:G400,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.clue}</span>
                {w.c>0&&<span style={{color:T,fontWeight:'bold'}}>✓{w.c}</span>}
                {w.f>0&&<span style={{color:RE,fontWeight:'bold'}}>✗{w.f}</span>}
                {w.p!=null&&<span style={{color:G400,fontSize:9}}>{w.p===6?'gelernt':'Topf '+w.p}</span>}
              </div>
              {(w.f1!=null||w.g||w.t||w.s)&&<div style={{fontSize:9,color:G400,marginTop:1}}>
                {w.f1!=null&&<span style={{color:w.f1?T:RE}}>1. Versuch {w.f1?'richtig':'falsch'}</span>}
                {w.g?<span> · nach {w.g} Tag{w.g===1?'':'en'}</span>:null}
                {w.t?<span> · {(w.t/1000).toFixed(1)} s</span>:null}
                {w.s?<span> · {w.s}× „nicht gewusst"</span>:null}
              </div>}
            </div>;
          })}
        </div>}
      </div>;
    })}
    {!anyExact&&<div style={{fontSize:9,color:G400}}>Für diesen Tag liegen nur Tageszahlen vor — die einzelnen Vokabeln werden seit dem 4.8.2026 mitgeschrieben.</div>}
  </div>;
}

function TagesDetail({ sessions, progressRows, runs }) {
  var today = dayKey();
  var [sel,setSel] = useState(today);
  var withTime = (sessions||[]).filter(function(s){ return s.started_at && (s.active_seconds||0)>0; });
  var earliest = withTime.length
    ? withTime.map(function(s){return String(s.started_at).slice(0,10);}).reduce(function(a,b){return a<b?a:b;})
    : today;
  if(sel>today) sel=today; if(sel<earliest) sel=earliest;
  // Tageszahlen nach der Zielregel (Zeit je Bereich + echte Antworten).
  var dayStatsAll = buildDayStats(sessions||[]);
  var daySessions = (sessions||[]).filter(function(s){ return s.started_at && String(s.started_at).slice(0,10)===sel; });
  var daySec = daySessions.reduce(function(a,s){ return a+(s.active_seconds||0); },0);
  // Antworten des Tages: aus learn_sessions (alle Spiele). Für ältere Tage
  // ohne diese Zähler springt der Leiterspiel-Block darunter ein.
  var dayAns = daySessions.reduce(function(a,s){ return a+(s.correct_count||0)+(s.wrong_count||0); },0);
  var dayCor = daySessions.reduce(function(a,s){ return a+(s.correct_count||0); },0);
  var canPrev = sel>earliest, canNext = sel<today;
  var label = sel===today ? 'Heute' : sel===shiftDay(today,-1) ? 'Gestern' : WD_LONG[weekdayOf(sel)];
  var navBtn=function(dir,enabled){
    // Funktionaler Updater + Clamping: auch schnelle Doppel-Taps zählen sauber weiter.
    return <button disabled={!enabled} onClick={function(){ setSel(function(cur){ var n=shiftDay(cur,dir); return n>today?today:n<earliest?earliest:n; }); }}
      style={{width:34,height:34,borderRadius:9,border:'1px solid '+G200,background:enabled?'white':G50,color:enabled?T:G200,fontSize:16,fontWeight:'bold',cursor:enabled?'pointer':'default',touchAction:'manipulation',flexShrink:0}}>{dir<0?'‹':'›'}</button>;
  };
  return <div>
    <div style={{fontSize:10,fontWeight:'bold',color:G600,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>📅 Einzelne Tage durchblättern</div>
    <div style={{background:'white',borderRadius:10,border:'1px solid '+G200,padding:'10px 12px'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        {navBtn(-1,canPrev)}
        <div style={{flex:1,textAlign:'center'}}>
          <div style={{fontSize:14,fontWeight:'bold',color:G900}}>{label}</div>
          <div style={{fontSize:10,color:G400}}>{WD_LONG[weekdayOf(sel)].slice(0,2)} · {fmtDayShort(sel)}{sel.slice(0,4)!==today.slice(0,4)?' '+sel.slice(0,4):''}</div>
        </div>
        {navBtn(1,canNext)}
      </div>
      <div style={{display:'flex',gap:6,marginBottom:dayAns>0||daySec>0?12:2}}>
        <div style={{flex:1,textAlign:'center'}}>
          <span style={{fontSize:26,fontWeight:'bold',color:dayCounts(sel, dayStatsAll[sel])?T:daySec>0?'#d97706':G400}}>{Math.round(daySec/60)}</span>
          <span style={{fontSize:12,color:G600,marginLeft:4}}>Min</span>
        </div>
        {dayAns>0&&<div style={{flex:1,textAlign:'center'}}>
          <span style={{fontSize:26,fontWeight:'bold',color:T}}>{dayAns}</span>
          <span style={{fontSize:12,color:G600,marginLeft:4}}>Antworten</span>
          <div style={{fontSize:10,color:G400}}>✓ {dayCor} · ✗ {dayAns-dayCor}</div>
        </div>}
      </div>
      {daySec>0
        ? <GameBreakdown sessions={daySessions} title="Was an diesem Tag gelernt wurde"/>
        : <div style={{textAlign:'center',color:G400,fontSize:12,padding:'6px 0 10px'}}>An diesem Tag wurde nicht gelernt.</div>}
      <TagesLeiterspiel progressRows={progressRows} runs={runs} day={sel}/>
    </div>
  </div>;
}

function MeineLernuebersicht({ player, chapters, scope }) {
  var [sessions,setSessions]=useState(null);
  var [progressRows,setProgressRows]=useState([]);
  var [runs,setRuns]=useState([]);
  useEffect(function(){
    if(!player) return;
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!UUID.test(player.id)){ setSessions([]); return; }
    sbGet('learn_sessions','player_id=eq.'+player.id+'&select=game,run_id,language,active_seconds,correct_count,wrong_count,skipped_count,started_at&order=started_at.desc&limit=1000')
      .then(function(rows){ setSessions(Array.isArray(rows)?rows:[]); })
      .catch(function(){ setSessions([]); });
    sbGet('ls_progress','player_id=eq.'+player.id+'&select=run_id,data')
      .then(function(rows){ setProgressRows(Array.isArray(rows)?rows:[]); })
      .catch(function(){});
    lsGetRunsForPlayer(player.id)
      .then(function(rows){ setRuns(filterRunsByScope(rows||[], chapters||[], scope)); })
      .catch(function(){});
  },[player&&player.id, scope&&scope.grade, scope&&scope.language]);
  var runIds = {}; (runs||[]).forEach(function(r){ runIds[r.id]=1; });
  var scopedProgress = (progressRows||[]).filter(function(r){ return runIds[r.run_id]; });
  if(sessions===null) return <div style={{textAlign:'center',padding:20,color:G400,fontSize:12}}>Lade…</div>;
  var today=dayKey();
  var tagesStand = buildDayStats(sessions);
  var totalSec=0, todaySec=0, days={};
  sessions.forEach(function(s){
    var sec=s.active_seconds||0; totalSec+=sec;
    var k=s.started_at?String(s.started_at).slice(0,10):'';
    if(k===today) todaySec+=sec;
    if(k&&sec>0) days[k]=true;
  });
  var activeDays=Object.keys(days).length;
  var chartSessions=sessions.filter(function(s){return s.started_at&&s.active_seconds>0;})
    .map(function(s){return {d:String(s.started_at).slice(0,10),dur:s.active_seconds};});
  var Stat=function(p){ return <div style={{flex:1,background:'white',borderRadius:10,border:'1px solid '+G200,padding:'10px 6px',textAlign:'center'}}>
    <div style={{fontSize:16,fontWeight:'bold',color:p.color||T}}>{p.value}</div>
    <div style={{fontSize:9,color:G400,marginTop:2}}>{p.label}</div>
  </div>; };
  if(totalSec===0) return <div style={{textAlign:'center',padding:24,color:G400,fontSize:13}}>Noch keine Lernzeit erfasst — leg los! 💪</div>;
  return <div>
    <div style={{display:'flex',gap:6,marginBottom:12}}>
      <Stat value={fmtDuration(totalSec)} label="Gesamt gelernt"/>
      <Stat value={Math.round(todaySec/60)+' Min'} label="Heute" color={dayCounts(today, tagesStand[today])?T:'#d97706'}/>
      <Stat value={activeDays} label="Aktive Tage"/>
    </div>
    <LeiterspielFortschritt progressRows={scopedProgress} runs={runs} title="🪜 Dein Leiterspiel-Fortschritt"/>
    <div style={{height:12}}/>
    <BehaltensKurve progressRows={scopedProgress}/>
    <div style={{height:12}}/>
    <div style={{fontSize:10,fontWeight:'bold',color:G600,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>📈 Deine Lernzeit pro Tag</div>
    <LernVerlaufChart sessions={chartSessions}/>
    <div style={{height:12}}/>
    <TagesDetail sessions={sessions} progressRows={scopedProgress} runs={runs}/>
    <div style={{height:12}}/>
    <GameBreakdown sessions={sessions} title="🎮 Insgesamt gelernt"/>
  </div>;
}

// „Sitzt es wirklich?" — die einzige Zahl, die die Frage beantwortet, ob die
// App etwas bringt: Wie viel kann sie noch, wenn sie eine Vokabel eine Weile
// nicht gesehen hat?
//
// Grundlage sind die Erstversuche aus dem Tages-Log: `g` = Tage seit dem
// letzten Kontakt, `f1` = beim ersten Versuch des Tages richtig. Beides wird
// seit dem 04.08.2026 mitgeschrieben. Gezählt wird nur der erste Versuch —
// ein zweiter Anlauf am selben Tag würde die Quote schönen.
var BEHALTEN_KLASSEN = [
  {label:'am nächsten Tag', min:1, max:1},
  {label:'nach 2-3 Tagen', min:2, max:3},
  {label:'nach einer Woche', min:4, max:7},
  {label:'nach 2 Wochen', min:8, max:14},
  {label:'nach einem Monat', min:15, max:99999},
];

function behaltensKurve(progressRows){
  var klassen = BEHALTEN_KLASSEN.map(function(k){ return {label:k.label, n:0, ok:0}; });
  (progressRows||[]).forEach(function(row){
    var d = parseData(row.data);
    Object.keys(d.days||{}).forEach(function(tag){
      var w = (d.days[tag]||{}).w || {};
      Object.keys(w).forEach(function(wort){
        var rec = w[wort];
        if(rec==null || rec.g==null || rec.f1==null) return;
        for(var i=0;i<BEHALTEN_KLASSEN.length;i++){
          if(rec.g>=BEHALTEN_KLASSEN[i].min && rec.g<=BEHALTEN_KLASSEN[i].max){
            klassen[i].n++; if(rec.f1) klassen[i].ok++;
            break;
          }
        }
      });
    });
  });
  return klassen;
}

function BehaltensKurve({ progressRows }){
  var klassen = behaltensKurve(progressRows).filter(function(k){ return k.n>=5; });
  if(!klassen.length) return null;
  var gesamtN = klassen.reduce(function(s,k){ return s+k.n; }, 0);
  var bester = klassen.reduce(function(m,k){ return Math.max(m, Math.round(k.ok/k.n*100)); }, 0);
  return <div>
    <div style={{fontSize:10,fontWeight:'bold',color:G600,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>🧠 Sitzt es wirklich?</div>
    <div style={{background:'white',borderRadius:10,border:'1px solid '+G200,padding:'12px 12px 10px'}}>
      <div style={{fontSize:11,color:G600,marginBottom:10,lineHeight:1.5}}>
        So viel konntest du noch, <b>ohne die Vokabel vorher nochmal anzusehen</b> — je länger der Abstand, desto mehr sagt es aus.
      </div>
      {klassen.map(function(k,i){
        var pct = Math.round(k.ok/k.n*100);
        // Maßstab bewusst nicht bei 70 %: Gezählt werden auch Vokabeln, die
        // gerade erst gelernt werden — da ist die Hälfte beim ersten Versuch
        // ein normaler Wert. Eine Wand aus roten Balken wäre demotivierend und
        // sachlich irreführend.
        var farbe = pct>=60?T:pct>=40?AM:RE;
        return <div key={i} style={{marginBottom:9}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',fontSize:11,marginBottom:3}}>
            <span style={{color:G900}}>{k.label}</span>
            <span style={{fontWeight:'bold',color:farbe}}>{pct}%<span style={{color:G400,fontWeight:'normal',fontSize:10}}> · {k.n} Vokabeln</span></span>
          </div>
          <div style={{height:7,background:G100,borderRadius:4,overflow:'hidden'}}>
            <div style={{height:'100%',width:pct+'%',background:farbe,borderRadius:4,transition:'width .4s'}}/>
          </div>
        </div>;
      })}
      <div style={{background:TL,color:TD,borderRadius:8,padding:'8px 10px',fontSize:11,lineHeight:1.45,marginTop:2}}>
        {bester>=60
          ? '💪 Stark — mehr als die Hälfte sitzt auch nach einer Pause.'
          : 'Das sind Wörter, die du gerade erst lernst — da ist die Hälfte völlig normal. Die Zahl steigt, je öfter eine Vokabel mit Abstand wiederkommt.'}
      </div>
      <div style={{fontSize:10,color:G400,marginTop:8,lineHeight:1.4}}>
        Aus {gesamtN} Erstversuchen. Nur der <b>erste</b> Versuch am Tag zählt — sonst würde ein zweiter Anlauf die Zahl schönfärben.
      </div>
    </div>
  </div>;
}

function RepeatRunHistory({ runs, title }){
  var list = (runs||[]).filter(Boolean);
  if(list.length===0) return null;
  var ordered = list.slice().sort(function(a,b){return new Date(a.created_at||0)-new Date(b.created_at||0);});
  var show = ordered.slice(-20);
  var best = ordered.reduce(function(m,r){return Math.max(m,r.score||0);},0);
  var last = ordered[ordered.length-1];
  var prev = ordered.length>1?ordered[ordered.length-2]:null;
  var delta = prev?((last.score||0)-(prev.score||0)):null;
  var maxY = Math.max(200, best);
  var W=320,H=120,PADL=24,PADB=14,PADT=10,PADR=6;
  var cw=W-PADL-PADR, ch=H-PADT-PADB, bw=cw/show.length;
  function y(v){return PADT+ch-(v/maxY)*ch;}
  return <div>
    {title&&<div style={{fontSize:10,fontWeight:'bold',color:G600,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>{title}</div>}
    <div style={{background:'white',borderRadius:8,border:'1px solid '+G200,padding:'8px 10px'}}>
      <div style={{fontSize:11,color:G600,marginBottom:4,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:6}}>
        <span>{ordered.length} L{ordered.length===1?'auf':'äufe'} · Bestwert <b style={{color:T}}>{best}</b></span>
        {delta!==null && <span style={{color:delta>0?T:delta<0?RE:G400,fontWeight:'bold'}}>{delta>0?'▲ +'+delta:delta<0?'▼ '+delta:'± 0'} ggü. vorher</span>}
      </div>
      <svg width={W} height={H} viewBox={'0 0 '+W+' '+H} style={{maxWidth:'100%',display:'block'}}>
        {[0.5,1].map(function(f,i){var v=Math.round(maxY*f);return <g key={i}><line x1={PADL} x2={W-PADR} y1={y(v)} y2={y(v)} stroke={G100} strokeDasharray='2 2'/><text x={PADL-3} y={y(v)+3} fontSize='7' fill={G400} textAnchor='end'>{v}</text></g>;})}
        {show.map(function(r,i){
          var sc=r.score||0, x=PADL+i*bw, yy=y(sc), h=ch-(yy-PADT);
          var pct=r.max_score?sc/r.max_score:0;
          var fill=pct>=0.8?T:pct>=0.5?'#5eead4':AM;
          var isLast=i===show.length-1;
          return <g key={i}>
            <rect x={x+1} y={yy} width={Math.max(1,bw-2)} height={Math.max(0,h)} fill={isLast?TD:fill} rx='1'/>
            {bw>13 && sc>0 && <text x={x+bw/2} y={yy-2} fontSize='7' fill={G600} textAnchor='middle'>{sc}</text>}
          </g>;
        })}
      </svg>
    </div>
  </div>;
}

function RepeatHistorySelf({ player }){
  var [runs,setRuns]=useState(null);
  useEffect(function(){
    if(!player) return;
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!UUID.test(player.id)){ setRuns([]); return; }
    sbGet('repeat_runs','player_id=eq.'+player.id+'&select=*&order=created_at.desc&limit=30')
      .then(function(rows){ setRuns(Array.isArray(rows)?rows:[]); }).catch(function(){ setRuns([]); });
  },[player&&player.id]);
  if(!runs||runs.length===0) return null;
  return <div style={{marginTop:12}}>
    <RepeatRunHistory runs={runs} title="🔁 Wiederholung — Punkte pro Lauf"/>
  </div>;
}

function Leaderboard({ allUsers, player }) {
  var sorted = (allUsers||[]).slice().sort(function(a,b){return (b.total_score||0)-(a.total_score||0);});
  return(
    <div>
      {sorted.filter(function(u){return !u.is_admin;}).map(function(u,i){
        var isMe=u.id===player.id;
        return <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',marginBottom:5,borderRadius:10,background:isMe?TL:'white',border:'2px solid '+(isMe?T:G200)}}>
          <div style={{width:30,height:30,borderRadius:'50%',background:i===0?AM:i===1?G400:i===2?'#b45309':G100,color:i<3?'white':G600,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold',fontSize:14,flexShrink:0}}>
            {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:'bold',fontSize:13,color:isMe?T:G900}}>{u.name}{isMe?' (du)':''}</div>
            <div style={{fontSize:10,color:G400}}>✓ {u.total_correct||0} richtig · ✗ {u.total_wrong||0} falsch</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:18,fontWeight:'bold',color:isMe?T:G600}}>{u.total_score||0}</div>
            <div style={{fontSize:9,color:G400}}>Punkte</div>
          </div>
        </div>;
      })}
    </div>
  );
}

function Stats({ player, chapters }) {
  return(
    <div>
      <ProgressStats chapters={chapters} player={player} allCategories={[]}/>
    </div>
  );
}

function StickerCard({ num, unlocked, label, onOpen }) {
  var url = 'https://ben-claude-1.github.io/vokabel-raetsel/stickers/sticker_'+String(num).padStart(2,'0')+'.png';
  return (
    <div style={{textAlign:'center'}}>
      <div onClick={unlocked?onOpen:undefined} style={{borderRadius:10,overflow:'hidden',aspectRatio:'1',background:unlocked?TL:G100,border:'2px solid '+(unlocked?T:G200),position:'relative',cursor:unlocked?'pointer':'default'}}>
        <img src={url} style={{width:'100%',height:'100%',objectFit:'contain',filter:unlocked?'none':'grayscale(100%) opacity(0.5)'}} loading="lazy"/>
        {!unlocked&&<div style={{position:'absolute',top:0,left:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🔒</div>}
      </div>
      <div style={{fontSize:9,marginTop:2,color:unlocked?T:G400,fontWeight:unlocked?'bold':'normal'}}>{label}</div>
    </div>
  );
}

function Scoreboard({ player }) {
  var [streak, setStreak] = useState(null);
  var [vocab, setVocab] = useState(null);
  var [runs, setRuns] = useState(null);
  var [bigSticker, setBigSticker] = useState(null);

  useEffect(function() {
    if (!player) return;
    var pid = player.id;
    var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(pid)) { setStreak(0); setVocab(0); setRuns(0); return; }

    sbGet('learn_sessions','player_id=eq.'+pid+'&select=started_at&order=started_at.desc&limit=500')
      .then(function(rows) {
        if (!rows||!rows.length) { setStreak(0); return; }
        var days = {};
        rows.forEach(function(r) { if (r.started_at) days[r.started_at.slice(0,10)] = true; });
        var sorted = Object.keys(days).sort().reverse();
        var today = dayKey();
        var yest  = dayKey(Date.now()-86400000);
        if (sorted[0]!==today && sorted[0]!==yest) { setStreak(0); return; }
        var n = 1;
        for (var i = 1; i < sorted.length; i++) {
          if (Math.round((new Date(sorted[i-1])-new Date(sorted[i]))/86400000)===1) n++;
          else break;
        }
        setStreak(n);
      })
      .catch(function() { setStreak(0); });

    sbGet('ls_progress','player_id=eq.'+pid+'&select=run_id,data')
      .then(function(rows) {
        if (!rows||!rows.length) { setVocab(0); setRuns(0); return; }
        var words = {}, completedRuns = 0;
        rows.forEach(function(r) {
          var data = parseData(r.data);
          var pot6 = (data.pots&&(data.pots[6]||data.pots['6']))||[];
          pot6.forEach(function(w) { if (w.word) words[w.word] = true; });
          if (pot6.length>0) completedRuns++;
        });
        setVocab(Object.keys(words).length);
        setRuns(completedRuns);
      })
      .catch(function() { setVocab(0); setRuns(0); });
  }, [player.id]);

  var streakMs = [{v:7,n:1},{v:14,n:10},{v:30,n:7},{v:60,n:9},{v:90,n:18},{v:180,n:16},{v:365,n:30}];
  var vocabMs  = [{v:50,n:3},{v:100,n:31},{v:200,n:32},{v:300,n:33},{v:500,n:21},{v:750,n:17},{v:1000,n:35}];
  var runNums  = [6,20,23,26,29,36,37,38,39,40];

  if (streak===null||vocab===null||runs===null) return <div style={{padding:40,textAlign:'center',color:G400}}>Lade…</div>;

  var CATALOG_NAMES = {1:'Chick',2:'Cat',3:'Dog',4:'Donkey',5:'Hedgehog',6:'Turtle',7:'Cat',8:'Panda',9:'Giraffe',10:'Pig',11:'Koala',12:'Monkey',13:'Raccoon',14:'Mouse',15:'Rabbit',16:'Fox',17:'Zebra',18:'Bear',19:'Lion',20:'Otter',21:'Eagle',22:'Owl',23:'Shark',24:'Duck',25:'Bear',26:'Shark',27:'Squirrel',28:'Rooster',29:'Sloth',30:'Dog',31:'Bear',32:'Toucan',33:'Wolf',34:'Cardinal',35:'Buffalo',36:'Penguin',37:'Goat',38:'Tiger',39:'Bulldog',40:'Llama',41:'Chick',42:'Penguin',43:'Beaver',44:'Sloth',45:'Pig',46:'Elephant',47:'Tiger',48:'Crocodile',49:'Fox',50:'Panda'};
  var CATALOG_LABELS = {1:'GREAT!',2:'WELL DONE!',3:'AWESOME!',4:'YOU ROCK!',5:'STAR!',6:'WAY TO GO!',7:'EXCELLENT!',8:'GOOD JOB!',9:'KEEP IT UP!',10:'BRILLIANT!',11:'NICE WORK!',12:'YES!',13:'PERFECT!',14:'GOOD!',15:'KEEP SHINING!',16:'AMAZING!',17:'LOVE IT!',18:'YOU CAN DO IT!',19:'KING JOB!',20:'FANTASTIC!',21:"LET'S GO!",22:'SMART MOVE!',23:'WOOHOO!',24:'YOU GOT THIS!',25:'AWESOME WORK!',26:"KILLIN' IT!",27:'NICE!',28:'COCK-A-DOODLE-DOO!',29:'TAKE IT EASY!',30:'GOOD ONE!',31:'YOU DID IT!',32:'TOUCAN DO IT!',33:"DON'T GIVE UP!",34:'STAY FOCUSED!',35:'STRONG WORK!',36:"YOU'RE THE BEST!",37:'UNBEATABLE!',38:'TIGERIFIC!',39:'PAW-SOME!',40:'NO PROB-LLAMA!',41:'CHEEP CHEEP HOORAY!',42:'HIGH FIVE!',43:'KEEP GOING!',44:'HANG IN THERE!',45:'HOORAY!',46:'BIG EFFORT!',47:'SO PROUD OF YOU!',48:'CRUSHED IT!',49:'SUPER STAR!',50:'MISSION COMPLETE!'};

  return (
    <div style={{padding:'12px 14px'}}>
      {bigSticker&&<div onClick={function(){setBigSticker(null);}} style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.75)',zIndex:999,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,touchAction:'manipulation'}}>
        <img src={'https://ben-claude-1.github.io/vokabel-raetsel/stickers/sticker_'+String(bigSticker).padStart(2,'0')+'.png'} style={{width:'min(80vw,320px)',height:'min(80vw,320px)',objectFit:'contain',borderRadius:20,background:TL,padding:12}} onClick={function(e){e.stopPropagation();}}/>
        <div style={{color:'white',fontWeight:'bold',fontSize:18,marginTop:16}}>{CATALOG_NAMES[bigSticker]}</div>
        <div style={{color:'rgba(255,255,255,0.8)',fontSize:14,marginTop:4}}>{CATALOG_LABELS[bigSticker]}</div>
        <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginTop:20}}>Tippen zum Schließen</div>
      </div>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:20}}>
        <div style={{background:'white',borderRadius:12,padding:'12px 8px',textAlign:'center',border:'1px solid '+G200}}>
          <div style={{fontSize:24}}>🔥</div>
          <div style={{fontSize:20,fontWeight:'bold',color:T}}>{streak}</div>
          <div style={{fontSize:9,color:G400}}>Tage Streak</div>
        </div>
        <div style={{background:'white',borderRadius:12,padding:'12px 8px',textAlign:'center',border:'1px solid '+G200}}>
          <div style={{fontSize:24}}>📚</div>
          <div style={{fontSize:20,fontWeight:'bold',color:T}}>{vocab}</div>
          <div style={{fontSize:9,color:G400}}>Vokabeln</div>
        </div>
        <div style={{background:'white',borderRadius:12,padding:'12px 8px',textAlign:'center',border:'1px solid '+G200}}>
          <div style={{fontSize:24}}>🪜</div>
          <div style={{fontSize:20,fontWeight:'bold',color:T}}>{runs}</div>
          <div style={{fontSize:9,color:G400}}>Läufe</div>
        </div>
      </div>

      <div style={{marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:'bold',color:G600,marginBottom:8}}>🔥 Streak-Sticker · {streak} Tage</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
          {streakMs.map(function(m){return <StickerCard key={m.n} num={m.n} unlocked={streak>=m.v} label={m.v+'d'} onOpen={function(){setBigSticker(m.n);}}/>;})}</div>
      </div>

      <div style={{marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:'bold',color:G600,marginBottom:8}}>📚 Vokabel-Sticker · {vocab} Wörter</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
          {vocabMs.map(function(m){var l=m.v>=1000?(m.v/1000)+'k':''+m.v;return <StickerCard key={m.n} num={m.n} unlocked={vocab>=m.v} label={l} onOpen={function(){setBigSticker(m.n);}}/>;})}</div>
      </div>

      <div style={{marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:'bold',color:G600,marginBottom:8}}>🪜 Leiterspiel-Sticker · {runs} Läufe</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
          {runNums.map(function(num,idx){return <StickerCard key={num} num={num} unlocked={runs>idx} label={'#'+(idx+1)} onOpen={function(){setBigSticker(num);}}/>;})}</div>
      </div>
    </div>
  );
}

export { DailyLearnChart, GameBreakdown, LeiterspielFortschritt, TagesLeiterspiel, TagesDetail, MeineLernuebersicht, RepeatRunHistory, RepeatHistorySelf, Leaderboard, Stats, StickerCard, Scoreboard, BehaltensKurve, behaltensKurve };
