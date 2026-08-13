import { sbGet, sbPatch, sbPost } from '../core/api.js';
import { HW_POST, SB_URL } from '../core/config.js';
import { ANSWER_TALLY, REVIEW_DEFAULT, answersSinceReview, countDue6, lsGetRunsForPlayer, reviewLockState } from '../core/leitner.js';
import { useCallback, useEffect, useMemo, useRef, useState } from '../core/react.js';
import { defaultScope, inScope, langFlag, langLabel, listScopes, loadScope, sameScope, saveScope, scopeText } from '../core/scope.js';
import { BUILTIN } from '../core/store.js';
import { dayGoalHint, dayGoalState } from '../core/goal.js';
import { BtnStyle, G100, G200, G400, G600, G900, T, TD, screenGame } from '../core/theme.js';
import { normWordKey, parseData } from '../core/words.js';
import { GoalTracker, LoginScreen, RegisterScreen } from '../ui/auth.jsx';
import { LeitersSpielCreate, LeitersSpielMenu, LeitersSpielSession } from '../ui/leiterspiel.jsx';
import { Leaderboard, MeineLernuebersicht, RepeatHistorySelf, Scoreboard, Stats } from '../ui/progress.jsx';
import { Tagesaufgaben } from '../ui/quests.jsx';
import { SentenceLearner, VokabelTrainer, WorkoutSession, WorkoutSetup } from '../ui/trainer.jsx';
import { WiederholungMode } from '../ui/wiederholung.jsx';

// Selten gebrauchte Bereiche werden erst beim Öffnen geladen — das hält den
// Start der App klein. Jeder Eintrag wird zu einem eigenen Paket in dist/.
const AdminDash = React.lazy(function(){ return import('../ui/admin.jsx').then(function(m){ return {default:m.AdminDash}; }); });
const BrowseChapter = React.lazy(function(){ return import('../ui/browse.jsx').then(function(m){ return {default:m.BrowseChapter}; }); });
const WordSelector = React.lazy(function(){ return import('../ui/browse.jsx').then(function(m){ return {default:m.WordSelector}; }); });
const CrosswordGame = React.lazy(function(){ return import('../ui/crossword.jsx').then(function(m){ return {default:m.CrosswordGame}; }); });
const GrammarGame = React.lazy(function(){ return import('../ui/grammar.jsx').then(function(m){ return {default:m.GrammarGame}; }); });
const KlassenarbeitPlayer = React.lazy(function(){ return import('../ui/klassenarbeit.jsx').then(function(m){ return {default:m.KlassenarbeitPlayer}; }); });
const KlassenarbeitTest = React.lazy(function(){ return import('../ui/klassenarbeit.jsx').then(function(m){ return {default:m.KlassenarbeitTest}; }); });
const QuizDuel = React.lazy(function(){ return import('../ui/quiz.jsx').then(function(m){ return {default:m.QuizDuel}; }); });
const QuizDuelMenu = React.lazy(function(){ return import('../ui/quiz.jsx').then(function(m){ return {default:m.QuizDuelMenu}; }); });
const QuizSolo = React.lazy(function(){ return import('../ui/quiz.jsx').then(function(m){ return {default:m.QuizSolo}; }); });

function ScopeSwitcher({ scopes, scope, onChange, compact }) {
  var [open, setOpen] = useState(false);
  if(!scope) return null;
  var grades = []; scopes.forEach(function(s){ if(grades.indexOf(s.grade)<0) grades.push(s.grade); });
  grades.sort(function(a,b){return a-b;});
  var langsForGrade = scopes.filter(function(s){ return s.grade===scope.grade; }).map(function(s){ return s.language; });
  function pickGrade(g){
    var langs = scopes.filter(function(s){ return s.grade===g; }).map(function(s){ return s.language; });
    var lang = langs.indexOf(scope.language)>=0 ? scope.language : langs[0];
    onChange({grade:g, language:lang});
  }
  return(
    <React.Fragment>
      <button onClick={function(){setOpen(true);}} title="Klasse und Sprache wechseln"
        style={{background:'rgba(255,255,255,0.18)',border:'none',color:'white',padding:compact?'3px 8px':'4px 10px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:'bold',touchAction:'manipulation',flexShrink:0,whiteSpace:'nowrap'}}>
        {langFlag(scope.language)} Kl. {scope.grade} ▾
      </button>
      {open&&(
        <div onClick={function(){setOpen(false);}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={function(e){e.stopPropagation();}} style={{background:'white',borderRadius:16,padding:18,width:'100%',maxWidth:340,boxShadow:'0 8px 30px rgba(0,0,0,0.3)'}}>
            <div style={{fontWeight:'bold',fontSize:15,color:G900,marginBottom:3}}>Was möchtest du lernen?</div>
            <div style={{fontSize:11,color:G400,marginBottom:14}}>Leiterspiel, Quiz, Wiederholung &amp; Co. zeigen danach nur diese Auswahl.</div>

            <div style={{fontSize:11,fontWeight:'bold',color:G600,marginBottom:6}}>Klasse</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
              {grades.map(function(g){
                var act = g===scope.grade;
                return <button key={g} onClick={function(){pickGrade(g);}}
                  style={{padding:'8px 16px',borderRadius:20,fontSize:13,fontWeight:'bold',cursor:'pointer',touchAction:'manipulation',
                    background:act?T:'white',color:act?'white':G600,border:'2px solid '+(act?T:G200)}}>Klasse {g}</button>;
              })}
            </div>

            <div style={{fontSize:11,fontWeight:'bold',color:G600,marginBottom:6}}>Sprache</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
              {langsForGrade.map(function(l){
                var act = l===scope.language;
                return <button key={l} onClick={function(){onChange({grade:scope.grade, language:l});}}
                  style={{padding:'8px 16px',borderRadius:20,fontSize:13,fontWeight:'bold',cursor:'pointer',touchAction:'manipulation',
                    background:act?T:'white',color:act?'white':G600,border:'2px solid '+(act?T:G200)}}>{langFlag(l)} {langLabel(l)}</button>;
              })}
            </div>

            <button onClick={function(){setOpen(false);}} style={BtnStyle(T,'white',{width:'100%',padding:'10px'})}>Fertig</button>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

function Shell({ player, setPlayer, chapters, setChapters, allUsers, setAllUsers, allCategories, setAllCategories, onLogout }) {
  var isAdmin = !!(player && player.is_admin);
  var [screen, setScreen] = useState(isAdmin ? 'admin' : 'home');
  var [screenData, setScreenData] = useState(null);
  var [lsRun, setLsRun] = useState(null);
  var [lsStreak, setLsStreak] = useState(null);
  var [kaQuestions, setKaQuestions] = useState(null);
  var [onlineIds, setOnlineIds] = useState([]);
  var [quizScoring, setQuizScoring] = useState({correct:10,win:50,loss:-50,draw:30});
  var [goalInfo, setGoalInfo] = useState({current:0,best:0,todaySec:0});
  var [scope, setScopeState] = useState(loadScope());
  var allUsersRef = useRef(allUsers);
  allUsersRef.current = allUsers;

  // Pflicht-Wiederholung: Regel aus den Einstellungen + Stand des Kindes.
  var [reviewInfo, setReviewInfo] = useState({locked:false, policy:REVIEW_DEFAULT, poolSize:0, daysSince:null});
  var loadReview = useCallback(function(){
    var UUIDre=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!player || !UUIDre.test(player.id) || player.is_admin) return;
    Promise.all([
      sbGet('settings','key=eq.review_policy&select=value'),
      sbGet('repeat_runs','player_id=eq.'+player.id+'&select=created_at&order=created_at.desc&limit=1'),
      sbGet('ls_progress','player_id=eq.'+player.id+'&select=run_id,data'),
      lsGetRunsForPlayer(player.id)
    ]).then(function(res){
      var policy = (res[0]&&res[0][0]&&res[0][0].value) || null;
      var last = (res[1]&&res[1][0]&&res[1][0].created_at) || null;
      // Über alle Klassen und Sprachen: die Wiederholung prüft den gesamten
      // gelernten Bestand. Vorher zählte nur die gewählte Klasse — nach dem
      // Wechsel auf Klasse 6 war der Klasse-5-Wortschatz aus der Fälligkeit
      // verschwunden und wurde nie wieder abgefragt.
      var meineRuns = {};
      (Array.isArray(res[3])?res[3]:[]).forEach(function(r){ meineRuns[r.id]=1; });
      var mine = (Array.isArray(res[2])?res[2]:[]).filter(function(row){ return meineRuns[row.run_id]; })
        .map(function(row){ return parseData(row.data); });
      // Fällige Vokabeln und die Lernantworten seit dem letzten Lauf sind die
      // beiden Auslöser, die den Wechsel wirklich takten — die Zeit allein
      // kommt gegen einen wachsenden Bestand nicht an.
      var cnt = countDue6(mine);
      var st = reviewLockState(policy, last, cnt.pool,
        {dueCount:cnt.due, answersSince:answersSinceReview(mine, last)});
      setReviewInfo({locked:st.locked, policy:st.policy, poolSize:cnt.pool, daysSince:st.daysSince,
        reason:st.reason, dueCount:st.dueCount, answersSince:st.answersSince});
    }).catch(function(){});
  }, [player&&player.id]);
  useEffect(function(){ loadReview(); }, [loadReview]);

  var scopes = useMemo(function(){ return listScopes(chapters); }, [chapters]);
  // Sobald die Kapitel geladen sind: gespeicherte Auswahl prüfen, sonst Standard
  // (Klasse 6 / Englisch, falls vorhanden — sonst höchste verfügbare Klasse).
  useEffect(function(){
    if(!scopes.length) return;
    var valid = scope && scopes.some(function(s){ return sameScope(s, scope); });
    if(!valid) setScopeState(defaultScope(scopes));
  }, [scopes]);
  function setScope(sc){ setScopeState(sc); saveScope(sc); }

  // Sprachwechsel aus den Tagesaufgaben heraus: möglichst in derselben Klasse
  // bleiben, sonst die höchste Klasse nehmen, zu der es die Sprache gibt.
  function switchLang(lang){
    if(!lang || (scope && scope.language === lang)) return;
    var passend = scopes.filter(function(s){ return s.language === lang; });
    if(!passend.length) return;
    var gleicheKlasse = scope && passend.filter(function(s){ return s.grade === scope.grade; });
    setScope((gleicheKlasse && gleicheKlasse[0]) || passend[passend.length-1]);
  }

  useEffect(function(){
    if(!player) return;
    sbGet('settings','key=eq.quiz_scoring&select=value').then(function(d){
      if(Array.isArray(d)&&d.length>0){try{var s=JSON.parse(d[0].value);if(s)setQuizScoring(s);}catch(e){}}
    }).catch(function(){});
  },[player&&player.id]);

  useEffect(function(){
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!player||!UUID.test(player.id)) return;
    if(!(window.crypto && window.crypto.randomUUID)) return;
    var game = screenGame(screen);
    if(!game) return; // Menüs/Verwaltung nicht als Lernzeit tracken
    var runId = (lsRun&&lsRun.id&&UUID.test(lsRun.id))?lsRun.id:null;
    var sessionId = window.crypto.randomUUID();
    var startedAt = new Date().toISOString();
    var localSeconds=0, lastSavedSeconds=0, lastActivity=Date.now(), created=false;
    var IDLE_MS=120000, TICK_MS=1000, FLUSH_MS=15000;
    // Antworten dieser Session = Zuwachs des globalen Zählers seit Sessionstart.
    var baseOk=ANSWER_TALLY.ok, baseBad=ANSWER_TALLY.bad, baseSkip=ANSWER_TALLY.skip, baseCredit=ANSWER_TALLY.credit;
    function isActive(){ return document.visibilityState==='visible' && (Date.now()-lastActivity)<IDLE_MS; }
    // Jede Speicherung ist ein vollständiger Upsert (merge-duplicates auf der id).
    // Damit ist die Reihenfolge egal — kein "PATCH vor INSERT"-Verlust mehr, und
    // mit keepalive überlebt die letzte Speicherung auch das Schließen/Wegwischen der App.
    function flush(closing, keepalive){
      if(created && localSeconds===lastSavedSeconds && !closing) return;
      created=true; lastSavedSeconds=localSeconds;
      var row={ id:sessionId, player_id:player.id, run_id:runId, game:game, started_at:startedAt, active_seconds:localSeconds,
        grade:scope?scope.grade:null, language:scope?scope.language:null,
        correct_count:Math.max(0,ANSWER_TALLY.ok-baseOk), wrong_count:Math.max(0,ANSWER_TALLY.bad-baseBad),
        skipped_count:Math.max(0,ANSWER_TALLY.skip-baseSkip),
        credit_points:Math.max(0,ANSWER_TALLY.credit-baseCredit) };
      if(closing) row.ended_at=new Date().toISOString();
      try{
        fetch(SB_URL+'/rest/v1/learn_sessions',{
          method:'POST',
          headers:Object.assign({},HW_POST,{'Prefer':'resolution=merge-duplicates,return=minimal'}),
          body:JSON.stringify(row), mode:'cors', credentials:'omit', keepalive:!!keepalive
        }).catch(function(){});
      }catch(e){}
    }
    flush(false,false); // Zeile sofort anlegen (0 s), upsert-sicher
    function bump(){ lastActivity=Date.now(); }
    var evs=['click','keydown','touchstart','mousemove','scroll','pointerdown'];
    evs.forEach(function(ev){ document.addEventListener(ev,bump,{passive:true}); });
    var tickIv=setInterval(function(){ if(isActive()) localSeconds++; },TICK_MS);
    var flushIv=setInterval(function(){ flush(false,false); },FLUSH_MS);
    function onVis(){ if(document.visibilityState==='hidden') flush(false,true); }
    document.addEventListener('visibilitychange',onVis);
    function onUnload(){ flush(true,true); }
    window.addEventListener('beforeunload',onUnload);
    window.addEventListener('pagehide',onUnload);
    return function(){
      clearInterval(tickIv); clearInterval(flushIv);
      evs.forEach(function(ev){ document.removeEventListener(ev,bump); });
      document.removeEventListener('visibilitychange',onVis);
      window.removeEventListener('beforeunload',onUnload);
      window.removeEventListener('pagehide',onUnload);
      flush(true,true);
    };
    // Klasse/Sprache gehören zur Sitzung — ein Wechsel schließt die laufende ab
    // und beginnt eine neue, damit die Lernzeit sauber der Sprache zufällt.
  },[player&&player.id, lsRun&&lsRun.id, screen, scope&&scope.grade, scope&&scope.language]);

  useEffect(function(){
    if(!player) return;
    var pid = String(player.id);
    function sendHeartbeat(){
      sbGet('settings','key=eq.presence_'+pid+'&select=key').then(function(d){
        if(Array.isArray(d)&&d.length>0){
          sbPatch('settings',{value:new Date().toISOString()},'key=eq.presence_'+pid).catch(function(){});
        } else {
          sbPost('settings',{key:'presence_'+pid,value:new Date().toISOString()}).catch(function(){});
        }
      }).catch(function(){});
    }
    function loadPresence(){
      var users = allUsersRef.current||[];
      if(!users.length) return;
      var cutoff = Date.now()-90000;
      Promise.all(users.map(function(u){
        return sbGet('settings','key=eq.presence_'+u.id+'&select=key,value').then(function(d){
          if(!d||!d.length) return null;
          try{ if(new Date(d[0].value).getTime()>cutoff) return u.id; }catch(e){}
          return null;
        }).catch(function(){ return null; });
      })).then(function(results){
        setOnlineIds(results.filter(Boolean));
      });
    }
    sendHeartbeat();
    loadPresence();
    var hb = setInterval(function(){ sendHeartbeat(); loadPresence(); }, 30000);
    return function(){ clearInterval(hb); };
  },[player&&player.id]);

  // Zählt jeden Wechsel zurück auf die Startseite. Die Tagesaufgaben laden
  // daraufhin neu, damit ein gerade erfülltes Ziel sofort abhakbar ist.
  var [homeVisits, setHomeVisits] = useState(0);
  function go(s, data) {
    setScreen(s); setScreenData(data||null);
    if(s==='home') setHomeVisits(function(n){ return n+1; });
  }

  // Einzige Stelle, die Punkte gutschreibt — die Spiele rufen nur noch hier an.
  // Der Zwischenstand liegt in scoreRef, weil `player` bei zwei Antworten kurz
  // hintereinander noch den alten Wert hätte: beide Schreibvorgänge würden dann
  // von derselben Basis rechnen und der erste ginge verloren.
  var scoreRef = useRef(0);
  useEffect(function(){ scoreRef.current = (player&&player.total_score)||0; },[player&&player.id]);

  function handleUpdateScore(pts) {
    if(!player||!pts) return;
    var next = (scoreRef.current||0) + pts;
    scoreRef.current = next;
    setPlayer(function(p){return Object.assign({},p,{total_score:next});});
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(UUID.test(player.id)){
      sbPatch('players',{total_score:next},'id=eq.'+player.id);
      setAllUsers(function(prev){return prev.map(function(u){return u.id===player.id?Object.assign({},u,{total_score:next}):u;});});
    }
  }

  var tabs = isAdmin
    ? [{id:'admin', label:'⚙️', title:'Admin'}]
    : [
        {id:'home',       label:'🏠', title:'Home'},
        {id:'learn',      label:'📚', title:'Lernen'},
        {id:'games',      label:'🎮', title:'Spiele'},
        {id:'progress',   label:'📊', title:'Fortschritt'},
        {id:'scoreboard', label:'🏆', title:'Sticker'},
      ];

  // scopeTree = alle Kapitel der gewählten Klasse/Sprache (inkl. Sprachknoten),
  // childChapters = davon die Blätter, also die eigentlichen Themen mit Wörtern.
  var scopeTree = useMemo(function(){
    return chapters.filter(function(c){ return c.language && inScope(c, scope); });
  }, [chapters, scope]);
  var childChapters = useMemo(function(){
    var hasKid = {};
    chapters.forEach(function(c){ if(c.parent_id) hasKid[c.parent_id] = 1; });
    return scopeTree.filter(function(c){ return !hasKid[c.id]; });
  }, [chapters, scopeTree]);
  var isEnglish = !scope || scope.language === 'en';

  function renderContent() {
    if(screen==='vocab_trainer'&&screenData) return <VokabelTrainer words={screenData} player={player} onDone={function(){go('learn');}} title="Vokabeln"/>;
    if(screen==='workout'&&screenData) return <WorkoutSession words={screenData.words} player={player} progressMap={screenData.progressMap} onDone={function(){go('learn');}}/>;
    if(screen==='sentence_learner') return <SentenceLearner chapters={childChapters} player={player} onDone={function(){go('learn');}}/>;
    if(screen==='quiz_solo'){var gwSolo=[];childChapters.forEach(function(ch){(ch.words||[]).forEach(function(w){gwSolo.push(Object.assign({},w));});});return <QuizSolo chapters={screenData&&screenData.chapters||childChapters} globalWords={gwSolo} onDone={function(){go('quiz_duel_menu');}}/>;}
    if(screen==='quiz_duel'){var gwDuel=[];childChapters.forEach(function(ch){(ch.words||[]).forEach(function(w){gwDuel.push(Object.assign({},w));});});var duelChs=screenData&&screenData.chapters||childChapters;return <QuizDuel chapters={duelChs} allChapters={childChapters} globalWords={gwDuel} player={player} allUsers={allUsers} setAllUsers={setAllUsers} setPlayer={setPlayer} allCategories={allCategories} onlineIds={onlineIds} quizScoring={quizScoring} onDone={function(){go('quiz_duel_menu');}}/>;}
    if(screen==='quiz_duel_menu') return <QuizDuelMenu chapters={scopeTree} allChapters={childChapters} player={player} allUsers={allUsers} allCategories={allCategories} onlineIds={onlineIds} quizScoring={quizScoring} setQuizScoring={setQuizScoring} onDone={function(){go('games');}}/>;

    if(screen==='puzzle') return <div style={{padding:8}}><BrowseChapter ch={screenData||childChapters[0]}/></div>;
    if(screen==='crossword') return <CrosswordGame chapters={scopeTree} onDone={function(){go('games');}}/>;
    if(screen==='leiterspiel_menu') return <LeitersSpielMenu player={player} chapters={chapters} scope={scope} allUsers={allUsers}
      reviewInfo={reviewInfo} onReview={function(){go('wiederholung');}}
      onStart={function(run,streak){setLsRun(run);setLsStreak(streak);go('leiterspiel_play');}}
      onDone={function(){go('games');}}/>;
    if(screen==='leiterspiel_play'&&lsRun) return <LeitersSpielSession run={lsRun} player={player} chapters={chapters} streak={lsStreak} onUpdateScore={handleUpdateScore} onDone={function(){go('leiterspiel_menu');}}/>;
    if(screen==='leiterspiel_create') return <LeitersSpielCreate player={player} chapters={scopeTree} scope={scope} onDone={function(){go('games');}}/>;
    if(screen==='grammar') return <GrammarGame player={player} setPlayer={setPlayer} onDone={function(){go('games');}}/>;
    if(screen==='wiederholung') return <WiederholungMode player={player} chapters={chapters}
      mandatory={reviewInfo.locked} policy={reviewInfo.policy}
      onCompleted={loadReview} onDone={function(fromLock){ loadReview(); go(fromLock===true?'leiterspiel_menu':'home'); }}/>;
    if(screen==='klassenarbeit_player') return <KlassenarbeitPlayer player={player} chapters={chapters} scope={scope} onStart={function(qs){setKaQuestions(qs);go('klassenarbeit_play');}} onDone={function(){go('games');}}/>;
    if(screen==='klassenarbeit_play'&&kaQuestions) return <KlassenarbeitTest player={player} questions={kaQuestions} onDone={function(){go('klassenarbeit_player');}}/>;
    if(screen==='admin') return <AdminDash player={player} chapters={chapters} scope={scope} setChapters={setChapters} allUsers={allUsers} setAllUsers={setAllUsers} allCategories={allCategories} setAllCategories={setAllCategories} onDone={function(){go('home');}}/>;
    if(screen==='stats') return <Stats player={player} chapters={scopeTree}/>;
    if(screen==='leaderboard') return <Leaderboard allUsers={allUsers} player={player}/>;
    if(screen==='browse') return <div style={{padding:8}}>{childChapters.map(function(ch){return <BrowseChapter key={ch.id} ch={ch}/>;})}</div>;
    if(screen==='word_select_trainer') return <WordSelector chapters={childChapters} onStart={function(ws){go('vocab_trainer',ws);}} mode="trainer"/>;
    if(screen==='workout_setup') return <WorkoutSetup chapters={childChapters} player={player} onStart={function(words,pm){go('workout',{words:words,progressMap:pm});}}/>;
    return null;
  }

  // Nachgeladene Bereiche brauchen einen Platzhalter, solange ihr Paket lädt.
  var inner = <React.Suspense fallback={<div style={{textAlign:'center',padding:40,color:'#9ca3af',fontSize:13}}>Lade…</div>}>{renderContent()}</React.Suspense>;

  var screenTitles = {
    home:'🏠 Start',learn:'📚 Lernen',games:'🎮 Spiele',progress:'📊 Fortschritt',admin:'⚙️ Admin',
    vocab_trainer:'📝 Vokabeltrainer',workout:'🏋️ Workout',workout_setup:'🏋️ Workout',sentence_learner:'💬 Sätze',
    quiz_solo:'🎯 Quiz Solo',quiz_duel:'⚔️ Quiz Duell',quiz_duel_menu:'🎯 Quiz',crossword:'🧩 Kreuzworträtsel',browse:'📖 Vokabeln',
    leiterspiel_menu:'🪜 Leiterspiel',leiterspiel_play:'🪜 Leiterspiel',leiterspiel_create:'➕ Run erstellen',
    grammar:'✏️ Grammar Trainer',stats:'📊 Mein Fortschritt',leaderboard:'🏆 Gesamtrangliste',word_select_trainer:'📝 Trainer',
    scoreboard:'🏆 Meine Sticker',klassenarbeit_player:'📋 Klassenarbeit',klassenarbeit_play:'📋 Klassenarbeit',
    wiederholung:'🔁 Wiederholung'
  };

  var mainScreens = isAdmin
    ? ['admin']
    : ['home','learn','games','progress','scoreboard','admin'];
  var showBack = mainScreens.indexOf(screen)<0;

  if(inner===null||mainScreens.indexOf(screen)>=0){
    return(
      <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',display:'flex',flexDirection:'column',background:'white'}}>
        <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',padding:'12px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <span style={{fontSize:20}}>🎓</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:'bold',fontSize:15,color:'white'}}>Vokabel-Rätsel</div>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.7)'}}>{player&&player.name} · {player&&(player.total_score||0)} Pkt{scope?' · '+scopeText(scope):''}</div>
          </div>
          <ScopeSwitcher scopes={scopes} scope={scope} onChange={setScope}/>
          <button onClick={onLogout} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'white',padding:'4px 10px',borderRadius:8,cursor:'pointer',fontSize:11,touchAction:'manipulation'}}>Abmelden</button>
        </div>

        {!isAdmin&&<GoalTracker player={player} onInfo={setGoalInfo}/>}
        <div style={{flex:1,overflowY:'auto',padding:'12px 10px 70px'}}>
          {screen==='home'&&(<div>
            <div style={{background:'linear-gradient(135deg,'+T+'22,'+T+'08)',borderRadius:16,padding:16,marginBottom:14,border:'1px solid '+T+'22'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                <div style={{fontWeight:'bold',fontSize:14,color:T}}>Hallo, {player&&player.name}! 👋</div>
                {goalInfo.current>0&&<span style={{fontSize:13,fontWeight:'bold',color:'#d97706'}}>🔥 {goalInfo.current}</span>}
              </div>
              {goalInfo.todaySec>0
                ? <div style={{fontSize:12,color:G600}}>{Math.round(goalInfo.todaySec/60)} Min heute · {dayGoalHint(dayGoalState(goalInfo.tag))}</div>
                : <div style={{fontSize:12,color:G600}}>Heute noch nichts gelernt — los geht's! 💪</div>
              }
              {goalInfo.current>0&&<div style={{fontSize:10,color:G400,marginTop:4}}>Streak: {goalInfo.current} Tag{goalInfo.current!==1?'e':''} · Bestwert: {goalInfo.best} Tag{goalInfo.best!==1?'e':''}</div>}
            </div>
            <Tagesaufgaben player={player}
              reviewDue={reviewInfo.locked} refreshKey={homeVisits}
              onGo={function(s, lang){ if(lang) switchLang(lang); go(s); }} onReward={handleUpdateScore}/>
            {[
              {icon:'🔁',title:'Wiederholung'+(reviewInfo.locked?' 🔔':''),sub:reviewInfo.locked?'Jetzt fällig — Leiterspiel ist bis dahin gesperrt':'Gelerntes festigen · Punkte pro Lauf',action:function(){go('wiederholung');}},
              {icon:'🏋️',title:'Workout',sub:'Schwache Vokabeln trainieren',action:function(){go('workout_setup');}},
              {icon:'🪜',title:'Leiterspiel'+(reviewInfo.locked?' 🔒':''),sub:reviewInfo.locked?'Gesperrt — erst die Wiederholung machen':'Topf-System mit Fortschritt',action:function(){go('leiterspiel_menu');}},
              {icon:'🎯',title:'Quiz',sub:'Solo oder Duell spielen',action:function(){go('quiz_duel_menu');}},
              {icon:'🧩',title:'Kreuzworträtsel',sub:'Vokabeln im Rätsel lösen',action:function(){go('crossword');}},
              ...(isEnglish?[{icon:'✏️',title:'Grammar Trainer',sub:'Englische Grammatik üben',action:function(){go('grammar');}}]:[]),
              {icon:'📋',title:'Klassenarbeit',sub:'Vorbereitung auf die Klassenarbeit',action:function(){go('klassenarbeit_player');}},
              {icon:'🏆',title:'Gesamtrangliste',sub:'Punkte aus allen Spielen',action:function(){go('leaderboard');}},
            ].map(function(item,i){
              return <button key={i} onClick={item.action} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'12px 14px',marginBottom:7,borderRadius:12,border:'1px solid '+G200,background:'white',cursor:'pointer',textAlign:'left',touchAction:'manipulation',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                <span style={{fontSize:24,flexShrink:0}}>{item.icon}</span>
                <div><div style={{fontWeight:'bold',fontSize:13,color:G900}}>{item.title}</div><div style={{fontSize:11,color:G400}}>{item.sub}</div></div>
                <span style={{marginLeft:'auto',color:G400,fontSize:14}}>›</span>
              </button>;
            })}
          </div>)}

          {screen==='learn'&&(<div>
            {[
              {icon:'📝',title:'Vokabeltrainer',sub:'Alle Vokabeln üben',action:function(){go('word_select_trainer');}},
              {icon:'💬',title:'Sätze lernen',sub:'Sätze übersetzen',action:function(){go('sentence_learner');}},
              {icon:'📖',title:'Vokabeln durchblättern',sub:'Alle Wörter anschauen',action:function(){go('browse');}},
            ].map(function(item,i){
              return <button key={i} onClick={item.action} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'12px 14px',marginBottom:7,borderRadius:12,border:'1px solid '+G200,background:'white',cursor:'pointer',textAlign:'left',touchAction:'manipulation'}}>
                <span style={{fontSize:22,flexShrink:0}}>{item.icon}</span>
                <div><div style={{fontWeight:'bold',fontSize:13}}>{item.title}</div><div style={{fontSize:11,color:G400}}>{item.sub}</div></div>
                <span style={{marginLeft:'auto',color:G400,fontSize:14}}>›</span>
              </button>;
            })}
          </div>)}

          {screen==='games'&&(<div>
            {[
              {icon:'🔁',title:'Wiederholung'+(reviewInfo.locked?' 🔔':''),sub:reviewInfo.locked?'Jetzt fällig — Leiterspiel ist bis dahin gesperrt':'Gelerntes festigen · Punkte pro Lauf',action:function(){go('wiederholung');}},
              {icon:'🎯',title:'Quiz',sub:'Solo oder Duell - Kapitel auswaehlen',action:function(){go('quiz_duel_menu');}},
              {icon:'🧩',title:'Kreuzworträtsel',sub:'Vokabeln im Rätsel lösen',action:function(){go('crossword');}},
              {icon:'🪜',title:'Leiterspiel',sub:'Topf-System Spiel',action:function(){go('leiterspiel_menu');}},
              ...(isEnglish?[{icon:'✏️',title:'Grammar Trainer',sub:'Grammatik mit KI-Feedback',action:function(){go('grammar');}}]:[]),
              {icon:'📋',title:'Klassenarbeit',sub:'Vorbereitung auf die Klassenarbeit',action:function(){go('klassenarbeit_player');}},
              ...(isAdmin?[{icon:'➕',title:'Run erstellen',sub:'Neuen Leiterspiel-Run erstellen',action:function(){go('leiterspiel_create');}}]:[]),
            ].map(function(item,i){
              return <button key={i} onClick={item.action} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'12px 14px',marginBottom:7,borderRadius:12,border:'1px solid '+G200,background:'white',cursor:'pointer',textAlign:'left',touchAction:'manipulation'}}>
                <span style={{fontSize:22,flexShrink:0}}>{item.icon}</span>
                <div><div style={{fontWeight:'bold',fontSize:13}}>{item.title}</div><div style={{fontSize:11,color:G400}}>{item.sub}</div></div>
                <span style={{marginLeft:'auto',color:G400,fontSize:14}}>›</span>
              </button>;
            })}
          </div>)}

          {screen==='progress'&&(<div>
            <MeineLernuebersicht player={player} chapters={chapters} scope={scope}/>
            <RepeatHistorySelf player={player}/>
            <div style={{borderTop:'1px solid '+G200,margin:'16px 0 12px'}}/>
            <div style={{display:'flex',gap:6,marginBottom:12}}>
              <button onClick={function(){go('stats');}} style={BtnStyle(T,'white',{flex:1,padding:'10px',fontSize:12})}>📊 Leiterspiel-Fortschritt</button>
              <button onClick={function(){go('leaderboard');}} style={BtnStyle(G100,G600,{flex:1,padding:'10px',fontSize:12})}>🏆 Rangliste</button>
            </div>
            <Stats player={player} chapters={scopeTree}/>
          </div>)}

          {screen==='scoreboard'&&<Scoreboard player={player}/>}

          {screen==='admin'&&<AdminDash player={player} chapters={chapters} scope={scope} setChapters={setChapters} allUsers={allUsers} setAllUsers={setAllUsers} allCategories={allCategories} setAllCategories={setAllCategories} onDone={function(){go('home');}}/>}
        </div>

        <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,background:'white',borderTop:'1px solid '+G200,display:'flex',zIndex:100}}>
          {tabs.map(function(tab){
            var active=screen===tab.id;
            return <button key={tab.id} onClick={function(){setScreen(tab.id);setScreenData(null);}} style={{flex:1,padding:'8px 4px 10px',border:'none',background:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,touchAction:'manipulation'}}>
              <span style={{fontSize:20}}>{tab.label}</span>
              <span style={{fontSize:9,fontWeight:active?'bold':'normal',color:active?T:G400}}>{tab.title}</span>
            </button>;
          })}
        </div>
      </div>
    );
  }

  return(
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',display:'flex',flexDirection:'column',background:'white'}}>
      <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',padding:'12px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        {showBack&&<button onClick={function(){
          var backMap={vocab_trainer:'learn',workout:'learn',workout_setup:'learn',sentence_learner:'learn',
            word_select_trainer:'learn',quiz_solo:'quiz_duel_menu',quiz_duel:'quiz_duel_menu',quiz_duel_menu:'games',crossword:'games',
            leiterspiel_menu:'games',leiterspiel_play:'leiterspiel_menu',leiterspiel_create:'games',
            grammar:'games',klassenarbeit_player:'games',klassenarbeit_play:'klassenarbeit_player',
            stats:'progress',leaderboard:'home',browse:'learn',puzzle:'learn'};
          var dest=backMap[screen]||'home';
          go(dest);
        }} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'white',padding:'5px 10px',borderRadius:8,cursor:'pointer',fontSize:14,touchAction:'manipulation',flexShrink:0}}>←</button>}
        <div style={{flex:1}}>
          <div style={{fontWeight:'bold',fontSize:14,color:'white'}}>{screenTitles[screen]||screen}</div>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.7)'}}>{player&&player.name}{scope?' · '+scopeText(scope):''}</div>
        </div>
        <ScopeSwitcher scopes={scopes} scope={scope} onChange={setScope} compact/>
        <div style={{fontSize:11,color:'rgba(255,255,255,0.8)',fontWeight:'bold'}}>{player&&(player.total_score||0)} Pkt</div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'10px 10px 20px'}}>
        {inner}
      </div>
    </div>
  );
}

function App() {
  var [player, setPlayer] = useState(null);
  var [chapters, setChapters] = useState(BUILTIN);
  var [allUsers, setAllUsers] = useState([]);
  var [allCategories, setAllCategories] = useState([]);
  var [loading, setLoading] = useState(false);
  var [showRegister, setShowRegister] = useState(false);

  function handleLogin(user) {
    setPlayer(user);
    setLoading(true);
    var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var p1 = sbGet('chapters','select=id,parent_id,title,color,icon,words,sentences,is_builtin,grade,language').then(function(d){
      if(Array.isArray(d)&&d.length>0){
        var merged=BUILTIN.slice();
        d.forEach(function(remote){
          var bi=merged.findIndex(function(b){return b.id===remote.id;});
          if(bi>=0) merged[bi]=Object.assign({},merged[bi],remote);
          else merged.push(remote);
        });
        setChapters(merged);
      }
    });
    var p2 = sbGet('players','select=id,name,total_score,total_correct,total_wrong,is_admin,is_active').then(function(d){
      if(Array.isArray(d)&&d.length>0) setAllUsers(d);
    });
    var p3 = sbGet('settings','key=eq.word_categories&select=value').then(function(d){
      if(Array.isArray(d)&&d.length>0){
        try{var cats=JSON.parse(d[0].value||'[]');if(Array.isArray(cats)&&cats.length>0)setAllCategories(cats);}catch(e){}
      }
    });
    if(!UUID.test(user.id)){
      p1; p2; p3;
      setLoading(false);
      return;
    }
    Promise.all([p1,p2,p3]).then(function(){ setLoading(false); }).catch(function(){ setLoading(false); });
  }

  function handleLogout() {
    setPlayer(null); setChapters(BUILTIN); setAllUsers([]); setAllCategories([]);
  }

  if(!player&&showRegister) return <RegisterScreen onRegister={function(u){handleLogin(u);setShowRegister(false);}} onBack={function(){setShowRegister(false);}}/>;
  if(!player) return <LoginScreen onLogin={handleLogin} onRegister={function(){setShowRegister(true);}}/>;
  if(loading) return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0f766e,#134e4a)'}}>
      <div style={{textAlign:'center',color:'white'}}><div style={{fontSize:48,marginBottom:16}}>🎓</div><div style={{fontSize:16}}>Lade Daten…</div></div>
    </div>
  );

  return <Shell player={player} setPlayer={setPlayer} chapters={chapters} setChapters={setChapters} allUsers={allUsers} setAllUsers={setAllUsers} allCategories={allCategories} setAllCategories={setAllCategories} onLogout={handleLogout}/>;
}

export { ScopeSwitcher, Shell, App };
