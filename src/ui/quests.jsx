import { sbGet } from '../core/api.js';
import { buildDayStats } from '../core/goal.js';
import { ALL_DONE_BONUS, loadClaimed, questState, saveClaimed } from '../core/quests.js';
import { useCallback, useEffect, useState } from '../core/react.js';
import { AM, BtnStyle, G100, G200, G400, G600, G900, GR, T, TD, TL } from '../core/theme.js';
import { dayKey } from '../core/util.js';

// Rohzahlen des Tages: Minuten, richtige Antworten und Überspringer je Bereich.
// Alles fällt beim Spielen ohnehin an — es wird nichts zusätzlich
// mitgeschrieben. `ls_runs` liefert die Sprache für ältere Sitzungen, die noch
// keine eigene Sprachspalte haben.
function ladeTagesstand(pid){
  var today = dayKey();
  return Promise.all([
    sbGet('learn_sessions','player_id=eq.'+pid+'&select=game,run_id,language,active_seconds,correct_count,wrong_count,skipped_count,credit_points,started_at'),
    sbGet('ls_runs','or=(is_admin_run.eq.true,player_id.eq.'+pid+')&select=id,language'),
  ]).then(function(res){
    var runLang = {};
    (Array.isArray(res[1])?res[1]:[]).forEach(function(r){ if(r && r.language) runLang[r.id] = r.language; });
    var stats = buildDayStats(Array.isArray(res[0])?res[0]:[], runLang);
    return stats[today] || {sec:0, secBy:{}, corBy:{}, ans:0, cor:0, skip:0};
  });
}

function Balken({ have, goal, done }){
  var pct = Math.min(100, Math.round(have/Math.max(1,goal)*100));
  return <div style={{height:6,background:G100,borderRadius:3,overflow:'hidden',marginTop:5}}>
    <div style={{height:'100%',width:pct+'%',background:done?GR:T,borderRadius:3,transition:'width .4s'}}/>
  </div>;
}

// Die Tagesaufgaben-Karte auf der Startseite.
function Tagesaufgaben({ player, reviewDue, onGo, onReward, refreshKey }){
  var [stand, setStand] = useState(null);
  var [claimed, setClaimed] = useState([]);
  var [holen, setHolen] = useState(false);
  var [jubel, setJubel] = useState(null);
  var pid = player && player.id;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var today = dayKey();

  var laden = useCallback(function(){
    if(!pid || !UUID.test(pid)) return;
    ladeTagesstand(pid).then(setStand).catch(function(){});
    loadClaimed(pid, today).then(setClaimed);
  }, [pid, today]);
  useEffect(function(){ laden(); }, [laden, refreshKey]);

  if(!pid || !UUID.test(pid) || !stand) return null;
  var st = questState(reviewDue, stand, claimed);
  var fertig = st.list.filter(function(q){ return q.done; }).length;

  function belohnungHolen(){
    if(holen || st.offeneBelohnung<=0) return;
    setHolen(true);
    var neu = claimed.slice();
    st.list.forEach(function(q){ if(q.done && neu.indexOf(q.key)<0) neu.push(q.key); });
    if(st.bonusOffen) neu.push('bonus');
    var punkte = st.offeneBelohnung;
    saveClaimed(pid, today, neu).then(function(ok){
      setHolen(false);
      if(!ok) return;
      setClaimed(neu);
      if(onReward) onReward(punkte);
      setJubel('+'+punkte+' Punkte!');
      setTimeout(function(){ setJubel(null); }, 2600);
    });
  }

  return <div style={{background:'white',borderRadius:16,padding:'14px 14px 12px',marginBottom:14,border:'1px solid '+G200,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
      <span style={{fontSize:18}}>🎯</span>
      <div style={{flex:1}}>
        <div style={{fontWeight:'bold',fontSize:13,color:G900}}>Deine 3 Aufgaben heute</div>
        <div style={{fontSize:10,color:G400}}>{fertig} von 3 geschafft{st.alleFertig?' — alles erledigt! 🎉':''}
          {st.gespart>0&&<span style={{color:GR,fontWeight:'bold'}}> · {st.gespart} Min gespart 🎉</span>}</div>
        {st.gespart>0&&<div style={{fontSize:9,color:G400}}>Schwere Vokabeln zählen mehr als Multiple Choice</div>}
      </div>
      {[0,1,2].map(function(i){
        var q = st.list[i];
        return <span key={i} style={{width:9,height:9,borderRadius:5,background:q&&q.done?GR:G200}}/>;
      })}
    </div>

    {st.list.map(function(q){
      return <button key={q.key} onClick={function(){ if(!q.done && onGo) onGo(q.screen, q.lang); }}
        style={{display:'flex',alignItems:'flex-start',gap:10,width:'100%',padding:'8px 6px',marginBottom:2,
          border:'none',background:'none',textAlign:'left',cursor:q.done?'default':'pointer',touchAction:'manipulation'}}>
        <span style={{fontSize:17,flexShrink:0,opacity:q.done?0.5:1}}>{q.done?'✅':q.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,color:q.done?G400:G900,fontWeight:q.done?'normal':'bold',
            textDecoration:q.done?'line-through':'none'}}>{q.text}</div>
          {!q.done&&<Balken have={q.have} goal={q.goal} done={q.done}/>}
          <div style={{fontSize:10,color:G400,marginTop:3}}>
            {q.done ? (q.claimed?'abgeholt':'geschafft') : q.have+' / '+q.goal+' Min'}
            {q.saved>0&&<span style={{color:GR,marginLeft:6}}>−{q.saved} Min gutgeschrieben</span>}
            <span style={{color:AM,fontWeight:'bold',marginLeft:6}}>+{q.pts}</span>
          </div>
        </div>
        {!q.done&&<span style={{color:G400,fontSize:13,alignSelf:'center'}}>›</span>}
      </button>;
    })}

    {st.bonusOffen&&<div style={{fontSize:10,color:AM,fontWeight:'bold',padding:'2px 6px'}}>
      🏅 Alle drei geschafft: +{ALL_DONE_BONUS} Bonus
    </div>}

    {/* Zeit allein reicht nicht: der Tag zählt erst mit echten Antworten. */}
    {st.tag.zeitFertig&&!st.tag.erfuellt&&<div style={{fontSize:10,color:'#92400e',background:'#fef3c7',borderRadius:8,padding:'6px 8px',marginTop:6}}>
      {!st.tag.genugAntworten
        ? 'Die Zeit steht — für den Streak fehlen noch ein paar beantwortete Vokabeln.'
        : 'Viel übersprungen heute — der Tag zählt erst, wenn die Hälfte davon echte Versuche sind.'}
    </div>}
    {!st.tag.zeitFertig&&st.tag.answers>0&&<div style={{fontSize:10,color:G400,padding:'2px 6px',marginTop:4}}>
      Heute: {st.tag.answers} Antworten{st.tag.skipped>0?' · '+st.tag.skipped+'× nicht gewusst':''}
    </div>}

    {st.offeneBelohnung>0&&<button onClick={belohnungHolen} disabled={holen}
      style={BtnStyle(AM,'white',{width:'100%',padding:'11px',marginTop:8,fontSize:14})}>
      {holen?'…':'🎁 '+st.offeneBelohnung+' Punkte abholen'}
    </button>}

    {jubel&&<div style={{marginTop:8,textAlign:'center',background:TL,color:TD,borderRadius:10,padding:'8px',fontSize:13,fontWeight:'bold'}}>{jubel}</div>}
  </div>;
}

export { Tagesaufgaben, ladeTagesstand };
