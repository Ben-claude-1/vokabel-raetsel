import { sbGet } from '../core/api.js';
import { lsToday } from '../core/leitner.js';
import { ALL_DONE_BONUS, loadClaimed, questState, saveClaimed } from '../core/quests.js';
import { useCallback, useEffect, useState } from '../core/react.js';
import { filterRunsByScope } from '../core/scope.js';
import { AM, BtnStyle, G100, G200, G400, G600, G900, GR, T, TD, TL } from '../core/theme.js';
import { dayKey } from '../core/util.js';
import { parseData } from '../core/words.js';

// Rohzahlen des Tages einsammeln. Alles davon fällt beim Spielen ohnehin an —
// es wird nichts zusätzlich mitgeschrieben.
function ladeTagesstand(pid, chapters, scope){
  var today = lsToday();
  return Promise.all([
    sbGet('ls_progress','player_id=eq.'+pid+'&select=run_id,data'),
    sbGet('learn_sessions','player_id=eq.'+pid+'&select=game,active_seconds,started_at'),
    sbGet('repeat_runs','player_id=eq.'+pid+'&select=created_at&order=created_at.desc&limit=20'),
    sbGet('ls_runs','or=(is_admin_run.eq.true,player_id.eq.'+pid+')&select=id,name,grade,language,words'),
  ]).then(function(res){
    var inScopeRun = {};
    filterRunsByScope(Array.isArray(res[3])?res[3]:[], chapters||[], scope)
      .forEach(function(r){ inScopeRun[r.id]=1; });

    var answers=0, firstOk=0, climbed=0;
    (Array.isArray(res[0])?res[0]:[]).forEach(function(row){
      if(!inScopeRun[row.run_id]) return;
      var d = parseData(row.data);
      var day = (d.days||{})[today];
      if(day){ answers += day.a||0; firstOk += day.c1||0; }
      // `pd` steht am Wort und hält fest, an welchem Tag es zuletzt eine Stufe
      // aufgestiegen ist — daraus ergibt sich „heute weitergebracht" ohne
      // zusätzliche Buchführung.
      [1,2,3,4,5,6].forEach(function(p){
        ((d.pots||{})[p]||[]).forEach(function(w){ if(w && w.pd===today) climbed++; });
      });
    });

    var minutes=0, games={};
    (Array.isArray(res[1])?res[1]:[]).forEach(function(s){
      if(!s || !s.started_at) return;
      if(dayKey(new Date(s.started_at)) !== today) return;
      minutes += (s.active_seconds||0);
      var g = s.game || 'sonstiges';
      games[g] = (games[g]||0) + 1;
    });
    minutes = Math.floor(minutes/60);

    var reviews = (Array.isArray(res[2])?res[2]:[]).filter(function(r){
      return r && r.created_at && dayKey(new Date(r.created_at)) === today;
    }).length;

    return {answers:answers, firstOk:firstOk, climbed:climbed, minutes:minutes, games:games, reviews:reviews};
  });
}

function Balken({ have, goal, done }){
  var pct = Math.min(100, Math.round(have/Math.max(1,goal)*100));
  return <div style={{height:6,background:G100,borderRadius:3,overflow:'hidden',marginTop:5}}>
    <div style={{height:'100%',width:pct+'%',background:done?GR:T,borderRadius:3,transition:'width .4s'}}/>
  </div>;
}

// Die Tagesaufgaben-Karte auf der Startseite.
function Tagesaufgaben({ player, chapters, scope, reviewDue, onGo, onReward, refreshKey }){
  var [stand, setStand] = useState(null);
  var [claimed, setClaimed] = useState([]);
  var [holen, setHolen] = useState(false);
  var [jubel, setJubel] = useState(null);
  var pid = player && player.id;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var today = dayKey();

  var laden = useCallback(function(){
    if(!pid || !UUID.test(pid)) return;
    ladeTagesstand(pid, chapters, scope).then(setStand).catch(function(){});
    loadClaimed(pid, today).then(setClaimed);
  }, [pid, chapters, scope&&scope.grade, scope&&scope.language, today]);
  useEffect(function(){ laden(); }, [laden, refreshKey]);

  if(!pid || !UUID.test(pid) || !stand) return null;
  var st = questState(today, reviewDue, stand, claimed);
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
        <div style={{fontSize:10,color:G400}}>{fertig} von 3 geschafft{st.alleFertig?' — alles erledigt! 🎉':''}</div>
      </div>
      {[0,1,2].map(function(i){
        var q = st.list[i];
        return <span key={i} style={{width:9,height:9,borderRadius:5,background:q&&q.done?GR:G200}}/>;
      })}
    </div>

    {st.list.map(function(q){
      return <button key={q.key} onClick={function(){ if(!q.done && onGo) onGo(q.screen); }}
        style={{display:'flex',alignItems:'flex-start',gap:10,width:'100%',padding:'8px 6px',marginBottom:2,
          border:'none',background:'none',textAlign:'left',cursor:q.done?'default':'pointer',touchAction:'manipulation'}}>
        <span style={{fontSize:17,flexShrink:0,opacity:q.done?0.5:1}}>{q.done?'✅':q.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,color:q.done?G400:G900,fontWeight:q.done?'normal':'bold',
            textDecoration:q.done?'line-through':'none'}}>{q.text}</div>
          {!q.done&&<Balken have={q.have} goal={q.goal} done={q.done}/>}
          <div style={{fontSize:10,color:G400,marginTop:3}}>
            {q.done ? (q.claimed?'abgeholt':'geschafft') : q.have+' / '+q.goal}
            <span style={{color:AM,fontWeight:'bold',marginLeft:6}}>+{q.pts}</span>
          </div>
        </div>
        {!q.done&&<span style={{color:G400,fontSize:13,alignSelf:'center'}}>›</span>}
      </button>;
    })}

    {st.bonusOffen&&<div style={{fontSize:10,color:AM,fontWeight:'bold',padding:'2px 6px'}}>
      🏅 Alle drei geschafft: +{ALL_DONE_BONUS} Bonus
    </div>}

    {st.offeneBelohnung>0&&<button onClick={belohnungHolen} disabled={holen}
      style={BtnStyle(AM,'white',{width:'100%',padding:'11px',marginTop:8,fontSize:14})}>
      {holen?'…':'🎁 '+st.offeneBelohnung+' Punkte abholen'}
    </button>}

    {jubel&&<div style={{marginTop:8,textAlign:'center',background:TL,color:TD,borderRadius:10,padding:'8px',fontSize:13,fontWeight:'bold'}}>{jubel}</div>}
  </div>;
}

export { Tagesaufgaben, ladeTagesstand };
