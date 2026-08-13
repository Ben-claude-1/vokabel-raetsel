import { hashPw, sbGet, sbPost } from '../core/api.js';
import { HG, SB_URL } from '../core/config.js';
import { useEffect, useState } from '../core/react.js';
import { BtnStyle, G200, G400, G600, G900, RE, T, dailyGoalSec } from '../core/theme.js';
import { buildByDay, calcStreakFromByDay, dayKey, getWeekDays, getWeekKey } from '../core/util.js';

function LoginScreen({ onLogin, onRegister }) {
  var [name, setName] = useState('');
  var [pw, setPw] = useState('');
  var [err, setErr] = useState('');
  var [loading, setLoading] = useState(false);
  function doLogin() {
    if(!name.trim()||!pw.trim()){setErr('Name und Passwort eingeben');return;}
    setLoading(true); setErr('');
    hashPw(pw).then(function(hash){
      // Direktes fetch statt sbGet: sbGet verschluckt jeden Fehler (Netz/TLS/HTTP)
      // zu [] -> würde fälschlich "Nutzer nicht gefunden" zeigen, obwohl der Server
      // nur nicht erreichbar ist (z. B. Tailscale-Funnel down). Hier trennen wir das.
      fetch(SB_URL+'/rest/v1/players?name=ilike.'+encodeURIComponent(name.trim())+'&select=*',
        {headers:HG, mode:'cors', credentials:'omit'})
      .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
      .then(function(d){
        var user=Array.isArray(d)&&d[0];
        if(!user){setErr('Nutzer nicht gefunden');setLoading(false);return;}
        if(user.is_active===false){setErr('Konto gesperrt. Bitte Admin kontaktieren.');setLoading(false);return;}
        if(user.password_hash===hash){
          onLogin(user); setLoading(false);
        } else {
          setErr('Falsches Passwort'); setLoading(false);
        }
      }).catch(function(){ setErr('Server nicht erreichbar – bitte später erneut versuchen'); setLoading(false); });
    }).catch(function(){ setErr('Fehler'); setLoading(false); });
  }
  return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0f766e,#134e4a)',padding:16}}>
      <div style={{background:'white',borderRadius:24,padding:32,width:'100%',maxWidth:380,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:48,marginBottom:8}}>🎓</div>
          <h1 style={{fontSize:22,fontWeight:'bold',color:G900,margin:0}}>Vokabel-Rätsel</h1>
          <p style={{fontSize:13,color:G400,margin:'4px 0 0'}}>Anmelden</p>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:12,color:G600,fontWeight:'bold',display:'block',marginBottom:4}}>Name</label>
          <input value={name} onChange={function(e){setName(e.target.value);}} onKeyDown={function(e){if(e.key==='Enter')doLogin();}}
            autoCapitalize="words" autoCorrect="off" autoComplete="username"
            placeholder="Dein Name"
            style={{width:'100%',padding:'12px 14px',fontSize:16,border:'2px solid '+G200,borderRadius:10,outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:G600,fontWeight:'bold',display:'block',marginBottom:4}}>Passwort</label>
          <input value={pw} onChange={function(e){setPw(e.target.value);}} onKeyDown={function(e){if(e.key==='Enter')doLogin();}}
            type="password" placeholder="Passwort" autoComplete="current-password"
            style={{width:'100%',padding:'12px 14px',fontSize:16,border:'2px solid '+G200,borderRadius:10,outline:'none',boxSizing:'border-box'}}/>
        </div>
        {err&&<div style={{padding:'8px 12px',background:'#fee2e2',borderRadius:8,color:RE,fontSize:12,marginBottom:12}}>{err}</div>}
        <button onClick={doLogin} disabled={loading} style={BtnStyle(T,'white',{width:'100%',padding:'13px',fontSize:15})}>
          {loading?'…':'→ Anmelden'}
        </button>
        {onRegister&&<div style={{textAlign:'center',marginTop:16}}>
          <span style={{fontSize:13,color:G400}}>Noch kein Konto? </span>
          <button onClick={onRegister} style={{border:'none',background:'none',color:T,fontSize:13,fontWeight:'bold',cursor:'pointer',padding:0}}>Registrieren</button>
        </div>}
      </div>
    </div>
  );
}

function RegisterScreen({ onRegister, onBack }) {
  var [name, setName] = useState('');
  var [pw, setPw] = useState('');
  var [pw2, setPw2] = useState('');
  var [err, setErr] = useState('');
  var [loading, setLoading] = useState(false);
  function doRegister() {
    if(!name.trim()||!pw.trim()){setErr('Name und Passwort eingeben');return;}
    if(pw!==pw2){setErr('Passwörter stimmen nicht überein');return;}
    if(pw.length<4){setErr('Passwort mind. 4 Zeichen');return;}
    setLoading(true); setErr('');
    hashPw(pw).then(function(hash){
      sbPost('players',{name:name.trim(),password_hash:hash,total_score:0,total_correct:0,total_wrong:0,is_admin:false}).then(function(res){
        if(res&&res._err){setErr('Fehler beim Registrieren');setLoading(false);return;}
        onRegister(res||{name:name.trim(),id:null});
        setLoading(false);
      }).catch(function(){ setErr('Verbindungsfehler'); setLoading(false); });
    }).catch(function(){ setErr('Fehler'); setLoading(false); });
  }
  return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0f766e,#134e4a)',padding:16}}>
      <div style={{background:'white',borderRadius:24,padding:32,width:'100%',maxWidth:380,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <button onClick={onBack} style={{border:'none',background:'none',color:G400,fontSize:13,cursor:'pointer',marginBottom:16,padding:0}}>← Zurück</button>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:6}}>👤</div>
          <h1 style={{fontSize:20,fontWeight:'bold',color:G900,margin:0}}>Registrieren</h1>
        </div>
        {[['Name','text',name,setName,'Dein Name'],['Passwort','password',pw,setPw,'Passwort'],['Wiederholen','password',pw2,setPw2,'Passwort wiederholen']].map(function(f,i){
          return <div key={i} style={{marginBottom:10}}>
            <label style={{fontSize:12,color:G600,fontWeight:'bold',display:'block',marginBottom:3}}>{f[0]}</label>
            <input value={f[2]} onChange={function(e){f[3](e.target.value);}} type={f[1]} placeholder={f[4]}
              style={{width:'100%',padding:'11px 12px',fontSize:16,border:'2px solid '+G200,borderRadius:10,outline:'none',boxSizing:'border-box'}}/>
          </div>;
        })}
        {err&&<div style={{padding:'8px 12px',background:'#fee2e2',borderRadius:8,color:RE,fontSize:12,marginBottom:10}}>{err}</div>}
        <button onClick={doRegister} disabled={loading} style={BtnStyle(T,'white',{width:'100%',padding:'12px',fontSize:15,marginTop:4})}>{loading?'…':'Registrieren'}</button>
      </div>
    </div>
  );
}

function GoalToast({ msg, emoji, onClose }) {
  useEffect(function(){ var t=setTimeout(onClose,5000); return function(){clearTimeout(t);}; },[]);
  return (
    <div onClick={onClose} style={{position:'fixed',bottom:76,left:'50%',transform:'translateX(-50%)',
      background:'linear-gradient(135deg,#059669,#10b981)',color:'white',borderRadius:20,
      padding:'14px 20px',boxShadow:'0 4px 24px rgba(5,150,105,0.4)',zIndex:9999,
      textAlign:'center',maxWidth:300,width:'88%',cursor:'pointer'}}>
      <div style={{fontSize:30,marginBottom:4}}>{emoji}</div>
      <div style={{fontWeight:'bold',fontSize:14,lineHeight:1.3}}>{msg}</div>
      <div style={{fontSize:9,color:'rgba(255,255,255,0.7)',marginTop:5}}>Tippe zum Schließen</div>
    </div>
  );
}

function GoalTracker({ player, onInfo }) {
  var [toasts, setToasts] = useState([]);
  var streakKey = 'goal_streak_'+(player&&player.id||'x');
  var shownKey  = 'goal_shown_' +(player&&player.id||'x');

  function check() {
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!player||!player.id||!UUID.test(player.id)) return;
    sbGet('learn_sessions','player_id=eq.'+player.id+'&select=active_seconds,started_at').then(function(sessions){
      if(!Array.isArray(sessions)) return;
      var byDay = buildByDay(sessions);
      var today = dayKey();
      var todaySec = byDay[today]||0;
      var weekDays = getWeekDays();
      var weekGoalDays = weekDays.filter(function(k){return (byDay[k]||0)>=dailyGoalSec(k);}).length;
      var streak = calcStreakFromByDay(byDay);
      var stored={}; try{stored=JSON.parse(localStorage.getItem(streakKey)||'{}');}catch(e){}
      var shown={};  try{shown =JSON.parse(localStorage.getItem(shownKey)||'{}');}catch(e){}
      var best = Math.max(stored.best||0, streak);
      var newToasts=[];
      if(todaySec>=dailyGoalSec(today) && shown.dailyDate!==today){
        shown.dailyDate=today;
        newToasts.push({id:'daily',emoji:'🎯',msg:'Super gemacht! Dein Tagesziel hast du erreicht!'});
      }
      var weekKey=getWeekKey();
      if(weekGoalDays>=5 && shown.weekKey!==weekKey){
        shown.weekKey=weekKey;
        newToasts.push({id:'weekly',emoji:'🏆',msg:'Glückwunsch, dein Wochenziel hast du erreicht!'});
      }
      if(streak>(stored.best||0) && streak>1 && shown.streakRecord!==String(streak)){
        shown.streakRecord=String(streak);
        newToasts.push({id:'streak',emoji:'🔥',msg:'Super, du hast deine alte Streak gebrochen! '+streak+' Tage am Stück!'});
      }
      localStorage.setItem(streakKey,JSON.stringify({current:streak,best:best}));
      localStorage.setItem(shownKey, JSON.stringify(shown));
      if(onInfo) onInfo({current:streak,best:best,todaySec:todaySec});
      if(newToasts.length>0) setToasts(function(prev){
        return prev.concat(newToasts.filter(function(n){return !prev.find(function(p){return p.id===n.id;});}));
      });
    }).catch(function(){});
  }

  useEffect(function(){
    check();
    var iv=setInterval(check,60000);
    return function(){clearInterval(iv);};
  },[player&&player.id]);

  function dismiss(id){ setToasts(function(t){return t.filter(function(x){return x.id!==id;});}); }
  return <div>{toasts.map(function(t){return <GoalToast key={t.id} emoji={t.emoji} msg={t.msg} onClose={function(){dismiss(t.id);}}/>;})}</div>;
}

export { LoginScreen, RegisterScreen, GoalToast, GoalTracker };
