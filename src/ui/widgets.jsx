import { useEffect, useMemo, useState } from '../core/react.js';
import { AM, BtnStyle, G100, G200, G400, G50, G600, G900, GR, RE, T } from '../core/theme.js';
import { dayKey, shuffleArr } from '../core/util.js';
import { buildT2Layout } from '../core/words.js';

function T2LetterField({ word, onCorrect, onWrong }) {
  var layout = useMemo(function(){ return buildT2Layout(word); }, [word]);
  var initLetters = useMemo(function(){
    var real = layout.targetNoSpaces.split('').map(function(l,i){return{l:l,id:'t2_'+i,dummy:false};});
    return shuffleArr(real);
  },[word]);
  var [tiles, setTiles] = useState(initLetters);
  var [answer, setAnswer] = useState([]);
  var [checked, setChecked] = useState(false);
  var [correct, setCorrect] = useState(false);
  useEffect(function(){ setTiles(initLetters); setAnswer([]); setChecked(false); setCorrect(false); }, [word]);
  var complete = answer.length === layout.targetNoSpaces.length;
  function addLetter(tile){
    if(checked) return;
    setAnswer(function(a){ return a.concat([tile]); });
    setTiles(function(t){ return t.filter(function(x){ return x.id!==tile.id; }); });
  }
  function removeLast(){
    if(checked||answer.length===0) return;
    var last = answer[answer.length-1];
    setAnswer(function(a){ return a.slice(0,-1); });
    setTiles(function(t){ return t.concat([last]); });
  }
  function check(){
    var typed = answer.map(function(t){return t.l;}).join('');
    var ok = typed.toLowerCase() === layout.targetNoSpaces.toLowerCase();
    setChecked(true); setCorrect(ok);
    setTimeout(function(){ if(ok) onCorrect(); else onWrong(typed); }, ok?600:0);
  }
  var slotIdx = 0;
  var displayItems = layout.items.map(function(it,i){
    if(it.type==='space') return <span key={'sp'+i} style={{width:12,display:'inline-block'}}/>;
    if(it.type==='static') return <span key={'st'+i} style={{fontSize:13,color:G600,fontStyle:'italic',padding:'0 4px',whiteSpace:'nowrap'}}>{it.text}</span>;
    var thisIdx = slotIdx++;
    var filled = answer[thisIdx];
    var bg = checked ? (correct?'#d1fae5':'#fee2e2') : (filled?'white':G50);
    var bd = checked ? (correct?GR:RE) : (filled?T:G200);
    var col = checked ? (correct?'#065f46':'#991b1b') : (filled?T:G400);
    return <div key={'sl'+i} onClick={!checked && filled ? function(){removeLast();} : undefined}
      style={{width:32,height:36,borderRadius:8,background:bg,border:'2px solid '+bd,
        display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold',fontSize:16,
        color:col,cursor:(!checked && filled)?'pointer':'default'}}>
      {filled ? filled.l : (checked ? it.letter : '–')}
    </div>;
  });
  return(
    <div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4,alignItems:'center',justifyContent:'center',minHeight:44,padding:'8px',background:G50,borderRadius:10,marginBottom:8,border:'2px solid '+(checked?(correct?GR:RE):G200)}}>
        {displayItems}
      </div>
      {!checked&&(
        <div style={{display:'flex',flexWrap:'wrap',gap:5,justifyContent:'center',marginBottom:10}}>
          {tiles.map(function(t){ return <button key={t.id} onClick={function(){addLetter(t);}} style={{width:36,height:40,borderRadius:8,background:'white',border:'2px solid '+G200,fontWeight:'bold',fontSize:17,color:G900,cursor:'pointer',touchAction:'manipulation'}}>{t.l}</button>; })}
        </div>
      )}
      <div style={{display:'flex',gap:6,justifyContent:'center'}}>
        {!checked&&<button onClick={removeLast} disabled={answer.length===0} style={BtnStyle(G100,G600,{padding:'8px 14px',opacity:answer.length===0?0.4:1})}>← Zurück</button>}
        {!checked&&<button onClick={check} disabled={!complete} style={BtnStyle(T,'white',{padding:'8px 20px',opacity:complete?1:0.4})}>✓ Prüfen</button>}
        {checked&&correct&&<div style={{color:GR,fontWeight:'bold',fontSize:13,padding:'6px'}}>✓ Richtig!</div>}{checked&&!correct&&<div style={{color:RE,fontWeight:'bold',fontSize:13,padding:'6px'}}>✗ Falsch — kommt wieder</div>}
      </div>
    </div>
  );
}

function GradeDisplay({ grade, pct }) {
  var gradeBg={A:GR,B:'#3b82f6',C:AM,D:'#f97316',F:RE};
  var bg=gradeBg[grade]||G400;
  return(
    <div style={{display:'inline-flex',flexDirection:'column',alignItems:'center',gap:4,padding:'12px 20px',borderRadius:16,background:bg+'18',border:'2px solid '+bg}}>
      <div style={{fontSize:40,fontWeight:'bold',color:bg}}>{grade}</div>
      <div style={{fontSize:13,color:G600}}>{pct}%</div>
    </div>
  );
}

function CelebrationPopup({ msg, onClose }) {
  return(
    <div style={{position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.4)'}} onClick={onClose}>
      <div style={{background:'white',borderRadius:24,padding:'40px 32px',textAlign:'center',maxWidth:300,margin:16,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{fontSize:60,marginBottom:12}}>🎉</div>
        <div style={{fontSize:20,fontWeight:'bold',color:T,marginBottom:8}}>{msg||'Super gemacht!'}</div>
        <button onClick={onClose} style={BtnStyle(T,'white',{marginTop:12,width:'100%',padding:'12px'})}>Weiter</button>
      </div>
    </div>
  );
}

function LernVerlaufChart({ sessions, todayExtraSec, requiredMinPerDay, targetDate, title }) {
  var today = dayKey();
  var byDate = {};
  (sessions||[]).forEach(function(s){
    if(!byDate[s.d]) byDate[s.d]={dur:0};
    byDate[s.d].dur+=(s.dur||0);
  });
  var days = [];
  for(var i=29;i>=0;i--){
    var dt=new Date(); dt.setDate(dt.getDate()-i);
    var k=dayKey(dt);
    days.push({k:k, dur:byDate[k]?byDate[k].dur:0, isToday:i===0});
  }
  var todayDur=(byDate[today]?byDate[today].dur:0)+(todayExtraSec||0);
  days[days.length-1].dur = todayDur;
  var todayMin = Math.round(todayDur/60);
  var maxMin = days.reduce(function(m,d){return Math.max(m, Math.round(d.dur/60));},0);
  var soll = requiredMinPerDay||0;
  var yMax = Math.max(maxMin, soll, 30);
  var totalMin = days.reduce(function(s,d){return s+Math.round(d.dur/60);},0);
  var avgMin = Math.round(totalMin/30);
  // Anzahl Lerntage / freie Tage + aktuelle Serie (aufeinanderfolgende Lerntage bis heute/gestern)
  var learnedDays = days.filter(function(d){return d.dur>0;}).length;
  var streak = 0;
  for(var si=days.length-1; si>=0; si--){ if(days[si].dur>0){ streak++; } else if(si===days.length-1){ continue; /* heute noch 0 → zählt nicht als Abbruch */ } else { break; } }
  function wdOf(k){ var p=k.split('-'); return new Date(+p[0],+p[1]-1,+p[2]).getDay(); } // 0=So..6=Sa
  var C_NONE='#cbd5e1'; // Grau für Tage ohne Lernen (deutlich sichtbarer Punkt)
  var W=320,H=150,pL=28,pB=30,pR=6,pT=10;
  var cW=W-pL-pR, cH=H-pB-pT;
  var slot=cW/30, bW=Math.max(3,slot-2);
  var baseY=pT+cH;
  var yFor = function(v){ return pT+cH-(v/yMax)*cH; };
  return(
    <div style={{background:G50,borderRadius:10,padding:'8px 8px 4px 8px',marginBottom:8}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <span style={{fontSize:11,fontWeight:'bold',color:G900}}>{title||'Lernverlauf'}</span>
        <span style={{fontSize:10,color:G400}}>letzte 30 Tage · ⌀ {avgMin} Min/Tag</span>
      </div>
      <svg width="100%" viewBox={'0 0 '+W+' '+H} style={{display:'block'}}>
        {/* Wochenend-Tönung + Tages-Slots: jeder Tag ist ein sichtbarer Bereich */}
        {days.map(function(day,i){
          var x=pL+i*slot; var w=wdOf(day.k); var wknd=(w===0||w===6);
          return <g key={'bg'+day.k}>
            {wknd&&<rect x={x} y={pT} width={slot} height={cH} fill="#0f172a" opacity={0.05}/>}
            {w===1&&i>0&&<line x1={x} x2={x} y1={pT} y2={baseY} stroke={G200} strokeWidth={0.5}/>}
          </g>;
        })}
        {[0,0.5,1].map(function(f,i){
          var v=Math.round(yMax*f);
          var y=yFor(v);
          return <g key={i}>
            <text x={pL-3} y={y+3} fontSize={7} fill={G400} textAnchor="end">{v}m</text>
            <line x1={pL} y1={y} x2={W-pR} y2={y} stroke={G200} strokeWidth={0.5}/>
          </g>;
        })}
        <line x1={pL} y1={baseY} x2={W-pR} y2={baseY} stroke={G400} strokeWidth={0.75}/>
        {days.map(function(day,i){
          var x=pL+i*slot, cx=x+slot/2;
          var dMin=Math.round(day.dur/60);
          var w=wdOf(day.k);
          // Datum an jedem Montag + heute; sonst kein Label (sonst zu voll)
          var lbl=day.isToday?'Heute':((w===1&&i<days.length-3)?((+day.k.slice(8))+'.'+(+day.k.slice(5,7))+'.'):null);
          var labelEl=lbl?<text x={cx} y={H-16} fontSize={7} fill={day.isToday?T:G600} textAnchor="middle" fontWeight={day.isToday?'bold':'normal'}>{lbl}</text>:null;
          var wdEl=<text x={cx} y={H-6} fontSize={6} fill={day.isToday?T:G400} textAnchor="middle" fontWeight={day.isToday?'bold':'normal'}>{'MDMDFSS'[(w+6)%7]}</text>;
          if(dMin<=0){
            // Tag OHNE Lernen: klar erkennbarer grauer Punkt an der Grundlinie
            return <g key={day.k}>
              {day.isToday&&<rect x={x} y={pT} width={slot} height={cH} fill={T} opacity={0.10} rx={1}/>}
              <circle cx={cx} cy={baseY-2} r={1.6} fill={C_NONE}/>
              {labelEl}{wdEl}
            </g>;
          }
          var y=yFor(dMin);
          var col=day.dur>=900?GR:day.dur>=300?AM:'#5eead4';
          return <g key={day.k}>
            {day.isToday&&<rect x={x} y={pT} width={slot} height={cH} fill={T} opacity={0.10} rx={1}/>}
            <rect x={cx-bW/2} y={y} width={bW} height={Math.max(3,baseY-y)} fill={col} rx={1}/>
            {labelEl}{wdEl}
          </g>;
        })}
        {soll>0 && <g>
          <line x1={pL} x2={W-pR} y1={yFor(soll)} y2={yFor(soll)} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3"/>
          <text x={W-pR-2} y={yFor(soll)-2} fontSize={8} fill="#dc2626" textAnchor="end" fontWeight="bold">Soll {soll}m{targetDate?' bis '+targetDate.slice(5):''}</text>
        </g>}
      </svg>
      <div style={{marginTop:4,display:'flex',justifyContent:'space-between',fontSize:10,color:G600}}>
        <span>Heute: <span style={{fontWeight:'bold',color:todayMin>=15?GR:todayMin>=5?AM:G600}}>{todayMin} Min</span></span>
        <span>Gelernt: <span style={{fontWeight:'bold',color:G900}}>{learnedDays}</span>/30 Tage{streak>1?<span style={{color:AM}}> · 🔥 {streak}</span>:null}</span>
        <span>Σ 30T: <span style={{fontWeight:'bold'}}>{totalMin} Min</span></span>
      </div>
      <div style={{display:'flex',gap:8,fontSize:9,color:G400,marginTop:4,justifyContent:'center',flexWrap:'wrap'}}>
        <span><span style={{color:GR}}>&#9632;</span> ≥15 Min</span>
        <span><span style={{color:AM}}>&#9632;</span> 5-14 Min</span>
        <span><span style={{color:'#5eead4'}}>&#9632;</span> &lt;5 Min</span>
        <span><span style={{color:C_NONE}}>&#9679;</span> kein Lernen</span>
      </div>
    </div>
  );
}

export { T2LetterField, GradeDisplay, CelebrationPopup, LernVerlaufChart };
