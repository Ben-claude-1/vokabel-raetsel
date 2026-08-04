import { sbGet, sbPatch, sbPost, sbSingle } from '../core/api.js';
import { useEffect, useMemo, useRef, useState } from '../core/react.js';
import { rootsOf } from '../core/scope.js';
import { AM, BtnStyle, G100, G200, G400, G50, G600, G900, GR, RE, T, TD, TL } from '../core/theme.js';
import { naturalSort } from '../core/util.js';
import { makeAllRounds, safeWords } from '../core/words.js';

function QuizSolo({ chapters, globalWords, onDone }) {
  var allRounds = useMemo(function(){ return makeAllRounds(chapters, globalWords); }, []);
  var [roundIdx, setRoundIdx] = useState(0);
  var [qIdx, setQIdx] = useState(0);
  var [chosen, setChosen] = useState(null);
  var [timeLeft, setTimeLeft] = useState(20);
  var [roundWins, setRoundWins] = useState([]);
  var [roundScore, setRoundScore] = useState(0);
  var [totalScore, setTotalScore] = useState(0);
  var [gameOver, setGameOver] = useState(false);
  var [roundOver, setRoundOver] = useState(false);
  var timerRef = useRef(null);
  var currentRound = allRounds[roundIdx] || [];
  var currentQ = currentRound[qIdx];
  function startTimer() {
    clearInterval(timerRef.current); setTimeLeft(20);
    timerRef.current = setInterval(function() {
      setTimeLeft(function(t) { if (t <= 1) { clearInterval(timerRef.current); handleAnswer(null); return 0; } return t - 1; });
    }, 1000);
  }
  useEffect(function() {
    if (!gameOver && !roundOver && !chosen) startTimer();
    return function() { clearInterval(timerRef.current); };
  }, [roundIdx, qIdx, roundOver, gameOver]);
  function handleAnswer(word) {
    clearInterval(timerRef.current);
    setChosen(word || "__none__");
    var correct = word === currentQ.correct.word;
    var pts = correct ? (timeLeft > 15 ? 15 : timeLeft > 8 ? 10 : 5) : 0;
    var newRoundScore = roundScore + (correct ? 1 : 0);
    setRoundScore(newRoundScore); setTotalScore(function(s) { return s + pts; });
    setTimeout(function() {
      if (qIdx + 1 >= currentRound.length) {
        var newWins = roundWins.concat([newRoundScore]);
        setRoundWins(newWins); setRoundScore(0); setChosen(null);
        if (roundIdx + 1 >= allRounds.length) setGameOver(true);
        else setRoundOver(true);
      } else { setQIdx(function(i) { return i + 1; }); setChosen(null); }
    }, 1200);
  }
  function nextRound() { setRoundIdx(function(i) { return i + 1; }); setQIdx(0); setRoundOver(false); setChosen(null); }
  if (!allRounds.length) return <div style={{textAlign:"center",padding:40,color:G400}}>Zu wenige Vokabeln.</div>;
  if (gameOver) {
    var won = roundWins.filter(function(s){ return s >= 2; }).length;
    return (
      <div style={{padding:"8px"}}>
        <div style={{background:"linear-gradient(135deg,"+T+","+TD+")",borderRadius:16,padding:"24px 20px",color:"white",textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:40,marginBottom:8}}>{won >= 4 ? "🏆" : won >= 3 ? "🥈" : "📚"}</div>
          <div style={{fontSize:28,fontWeight:"bold",marginBottom:4}}>{totalScore} Punkte</div>
          <div style={{fontSize:14,opacity:0.8}}>{won} von 6 Runden gewonnen</div>
        </div>
        <div style={{marginBottom:12}}>
          {roundWins.map(function(s, i) {
            var win = s >= 2;
            return (<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",marginBottom:4,borderRadius:8,background:win?"#f0fdf4":"#fef2f2",border:"1px solid "+(win?"#bbf7d0":"#fecaca")}}>
              <span style={{fontSize:16}}>{win ? "✓" : "✗"}</span>
              <span style={{fontSize:13,color:G600}}>Runde {i+1}</span>
              <span style={{marginLeft:"auto",fontWeight:"bold",color:win?T:RE}}>{s}/3 richtig</span>
            </div>);
          })}
        </div>
        <button onClick={onDone} style={BtnStyle(T,"#fff",{width:"100%",fontSize:15,padding:"12px"})}>← Zurück zum Menü</button>
      </div>
    );
  }
  if (roundOver) {
    var lastScore = roundWins[roundWins.length - 1] || 0;
    var roundWon = lastScore >= 2;
    return (
      <div style={{padding:"8px"}}>
        <div style={{textAlign:"center",padding:"32px 20px",background:roundWon?"#f0fdf4":"#fef2f2",borderRadius:16,marginBottom:16,border:"2px solid "+(roundWon?"#22c55e":RE)}}>
          <div style={{fontSize:40,marginBottom:8}}>{roundWon ? "🎉" : "😔"}</div>
          <div style={{fontSize:22,fontWeight:"bold",color:roundWon?T:RE,marginBottom:4}}>Runde {roundIdx+1} {roundWon?"gewonnen!":"verloren"}</div>
          <div style={{fontSize:14,color:G600}}>{lastScore}/3 Fragen richtig</div>
        </div>
        <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:16}}>
          {roundWins.map(function(s, i) { return <div key={i} style={{width:28,height:28,borderRadius:"50%",background:s>=2?T:RE,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:12,fontWeight:"bold"}}>{s}</div>; })}
          {Array(6-roundWins.length).fill(0).map(function(_,i){ return <div key={"e"+i} style={{width:28,height:28,borderRadius:"50%",background:G200}}></div>; })}
        </div>
        <button onClick={nextRound} style={BtnStyle(T,"#fff",{width:"100%",fontSize:15,padding:"12px"})}>Runde {roundIdx+2} starten →</button>
      </div>
    );
  }
  var letters = ["A","B","C","D"];
  var isEn2De = currentQ && currentQ.type === "en2de";
  var question = currentQ ? (isEn2De ? currentQ.correct.word : currentQ.correct.clue) : "";
  var questionLabel = isEn2De ? "Was bedeutet dieses englische Wort?" : "Wie heißt das auf Englisch?";
  return (
    <div style={{padding:"8px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{display:"flex",gap:4}}>
          {allRounds.map(function(_, i) {
            var active = i === roundIdx, done = i < roundIdx, win = done && roundWins[i] >= 2;
            return <div key={i} style={{width:24,height:24,borderRadius:"50%",background:active?T:done?(win?GR:RE):G200,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:10,fontWeight:"bold"}}>{done?(roundWins[i]>=2?"✓":"✗"):(i+1)}</div>;
          })}
        </div>
        <span style={{fontSize:11,color:G400,marginLeft:"auto"}}>Frage {qIdx+1}/3</span>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1,textAlign:"center",padding:"8px",background:TL,borderRadius:8}}><div style={{fontSize:10,color:G400}}>Punkte</div><div style={{fontSize:18,fontWeight:"bold",color:T}}>{totalScore}</div></div>
        <div style={{flex:1,textAlign:"center",padding:"8px",background:roundScore>=2?"#f0fdf4":G100,borderRadius:8}}><div style={{fontSize:10,color:G400}}>Diese Runde</div><div style={{fontSize:18,fontWeight:"bold",color:roundScore>=2?GR:G600}}>{roundScore}/3</div></div>
        <div style={{flex:1,textAlign:"center",padding:"8px",background:timeLeft<=5?"#fef2f2":G100,borderRadius:8}}><div style={{fontSize:10,color:G400}}>Zeit</div><div style={{fontSize:18,fontWeight:"bold",color:timeLeft<=5?RE:G600}}>{timeLeft}s</div></div>
      </div>
      {currentQ && (<div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
        <span style={{fontSize:14}}>{currentQ.correct.chapIcon}</span>
        <span style={{fontSize:11,fontWeight:"bold",color:currentQ.correct.chapColor}}>{currentQ.correct.chapTitle}</span>
        <span style={{marginLeft:"auto",fontSize:10,color:G400}}>Runde {roundIdx+1} · Frage {qIdx+1}</span>
      </div>)}
      <div style={{textAlign:"center",padding:"28px 20px",background:G50,borderRadius:16,marginBottom:12,border:"2px solid "+G200}}>
        <div style={{fontSize:11,color:G400,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>{questionLabel}</div>
        <div style={{fontSize:28,fontWeight:"bold",color:G900}}>{question}</div>
      </div>
      <div style={{height:4,background:G200,borderRadius:2,overflow:"hidden",marginBottom:12}}>
        <div style={{height:"100%",width:(timeLeft/20*100)+"%",background:timeLeft<=5?RE:T,borderRadius:2,transition:"width 1s linear"}}></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {currentQ && currentQ.answers.map(function(a, i) {
          var answerText = isEn2De ? a.clue : a.word;
          var isCorrect = a.word === currentQ.correct.word, isChosen = chosen && chosen === a.word;
          var bg = G50, border2 = "2px solid "+G200, col = G900;
          if (chosen) {
            if (isCorrect) { bg="#d1fae5"; border2="2px solid "+GR; col="#065f46"; }
            else if (isChosen) { bg="#fee2e2"; border2="2px solid "+RE; col="#991b1b"; }
          }
          return (
            <button key={i} onClick={function(){ if (!chosen) handleAnswer(a.word); }} disabled={!!chosen}
              style={{padding:"14px 10px",background:bg,border:border2,borderRadius:12,cursor:chosen?"default":"pointer",textAlign:"left",transition:"all .2s"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:24,height:24,borderRadius:"50%",background:chosen&&isCorrect?GR:chosen&&isChosen?RE:G200,color:chosen&&(isCorrect||isChosen)?"white":G600,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:"bold",flexShrink:0}}>{letters[i]}</span>
                <span style={{fontSize:13,fontWeight:"bold",color:col,lineHeight:1.3}}>{answerText}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuizDuelMenu({ chapters, allChapters, player, allUsers, allCategories, onlineIds, quizScoring, setQuizScoring, onDone }) {
  var [view, setView] = useState('menu');
  var [history, setHistory] = useState([]);
  var [histLoaded, setHistLoaded] = useState(false);
  function loadHistory(){
    if(histLoaded) return;
    sbGet('quiz_duels','or=(player1_id.eq.'+player.id+',player2_id.eq.'+player.id+')&status=eq.finished&select=id,player1_id,player1_name,player2_name,round_wins_p1,round_wins_p2,created_at&order=created_at.desc&limit=20').then(function(d){
      if(Array.isArray(d)) setHistory(d);
      setHistLoaded(true);
    }).catch(function(){setHistLoaded(true);});
  }
  var [sel, setSel] = useState({});
  var [cwFilter, setCwFilter] = useState('all');
  var [openCh, setOpenCh] = useState(null);
  var [openKap, setOpenKap] = useState({});
  var [pendingGames, setPendingGames] = useState([]);
  var [myGames, setMyGames] = useState([]);
  var [lbLoaded, setLbLoaded] = useState(false);
  var [lbData, setLbData] = useState([]);
  var [joinGameId, setJoinGameId] = useState(null);

  var leafChapters = (allChapters||chapters).filter(function(c){return c.parent_id;});
  var selTotal = Object.values(sel).reduce(function(s,set){return s+set.size;},0);
  var chaptersForGame = selTotal===0 ? leafChapters :
    leafChapters.map(function(ch){
      var ws=safeWords(ch.words); var s=sel[ch.id]||new Set();
      var filtered=[]; s.forEach(function(i){if(ws[i])filtered.push(ws[i]);});
      return Object.assign({},ch,{words:filtered});
    }).filter(function(ch){return ch.words.length>0;});
  var globalWords = [];
  leafChapters.forEach(function(ch){ safeWords(ch.words).forEach(function(w){ globalWords.push(Object.assign({},w,{chapId:ch.id})); }); });

  function qTogAll(ch){
    var ws=safeWords(ch.words);
    var fi=ws.filter(function(w){return cwFilter==='all'||w.important;});
    setSel(function(prev){
      var n=Object.assign({},prev); var cur=n[ch.id]||new Set();
      var allS=fi.every(function(w){return cur.has(ws.indexOf(w));});
      var next=new Set(cur);
      if(allS) fi.forEach(function(w){next.delete(ws.indexOf(w));});
      else fi.forEach(function(w){next.add(ws.indexOf(w));});
      n[ch.id]=next; return n;
    });
  }
  function qTogW(chId,idx){
    setSel(function(prev){var n=Object.assign({},prev);var cur=new Set(n[chId]||[]);if(cur.has(idx))cur.delete(idx);else cur.add(idx);n[chId]=cur;return n;});
  }

  function loadContinue(){
    setPendingGames([]); setMyGames([]);
    sbGet('quiz_duels','player2_id=eq.'+player.id+'&status=eq.waiting&select=id,code,player1_name,created_at&order=created_at.desc&limit=10').then(function(d){ if(Array.isArray(d)) setPendingGames(d); }).catch(function(){});
    sbGet('quiz_duels','player1_id=eq.'+player.id+'&status=neq.finished&select=id,code,player2_name,status,created_at&order=created_at.desc&limit=10').then(function(d){ if(Array.isArray(d)) setMyGames(d.filter(function(g){return g.status!=='waiting'||!g.player2_name;})); }).catch(function(){});
  }

  function loadLeaderboard(){
    if(lbLoaded) return;
    sbGet('quiz_duels','status=eq.finished&select=player1_id,player1_name,player2_id,player2_name,round_wins_p1,round_wins_p2').then(function(d){
      if(!Array.isArray(d)){setLbLoaded(true);return;}
      var scores={};
      d.forEach(function(g){
        var w1=(JSON.parse(g.round_wins_p1||'[]')).filter(function(s){return s>=2;}).length;
        var w2=(JSON.parse(g.round_wins_p2||'[]')).filter(function(s){return s>=2;}).length;
        var win1=w1>w2; var win2=w2>w1;
        if(g.player1_id){if(!scores[g.player1_id])scores[g.player1_id]={name:g.player1_name,wins:0,games:0};scores[g.player1_id].games++;if(win1)scores[g.player1_id].wins++;}
        if(g.player2_id){if(!scores[g.player2_id])scores[g.player2_id]={name:g.player2_name,wins:0,games:0};scores[g.player2_id].games++;if(win2)scores[g.player2_id].wins++;}
      });
      var arr=Object.keys(scores).map(function(id){return Object.assign({id:id},scores[id]);});
      arr.sort(function(a,b){return b.wins-a.wins||(b.games-a.games);});
      setLbData(arr); setLbLoaded(true);
    }).catch(function(){setLbLoaded(true);});
  }

  if(view==='playing_duel') return <QuizDuel chapters={chaptersForGame} allChapters={leafChapters} globalWords={globalWords} player={player} allUsers={allUsers} setAllUsers={setAllUsers} allCategories={allCategories} onlineIds={onlineIds} quizScoring={quizScoring} initialGameId={joinGameId} onDone={function(){setJoinGameId(null);setView('menu');}}/>;
  if(view==='playing_solo') return <QuizSolo chapters={chaptersForGame} globalWords={globalWords} onDone={function(){setView('menu');}}/>;

  if(view==='new') {
    var qTopLevel = rootsOf(chapters||[]).slice().sort(naturalSort);
    var qChildMap = {};
    leafChapters.forEach(function(c){
      if(!qChildMap[c.parent_id]) qChildMap[c.parent_id]=[];
      qChildMap[c.parent_id].push(c);
    });
    return <div style={{padding:8}}>
    <button onClick={function(){setView('menu');}} style={{border:'none',background:'none',color:G400,fontSize:13,cursor:'pointer',marginBottom:12,padding:0}}>← Zurück</button>
    <div style={{display:'flex',gap:6,marginBottom:10,padding:'8px 10px',background:G50,borderRadius:10,alignItems:'center',flexWrap:'wrap'}}>
      <span style={{fontSize:12,color:G600,fontWeight:'bold'}}>Anzeigen:</span>
      {[['all','📚 Alle'],['important','⭐ Nur wichtige']].map(function(pair){
        return <button key={pair[0]} onClick={function(){setCwFilter(pair[0]);}} style={{padding:'4px 10px',borderRadius:16,fontSize:11,fontWeight:'bold',background:cwFilter===pair[0]?T:'white',color:cwFilter===pair[0]?'white':G600,border:'1.5px solid '+(cwFilter===pair[0]?T:G200),cursor:'pointer',touchAction:'manipulation'}}>{pair[1]}</button>;
      })}
      <span style={{marginLeft:'auto',fontSize:11,color:T,fontWeight:'bold'}}>{selTotal===0?'Alle':selTotal+' gewählt'}</span>
    </div>
    {qTopLevel.map(function(kap){
      var kids=(qChildMap[kap.id]||[]).filter(function(c){
        var fi=safeWords(c.words).filter(function(w){return cwFilter==='all'||w.important;});
        return fi.length>0;
      }).slice().sort(naturalSort);
      if(kids.length===0) return null;
      var kapSel=kids.reduce(function(s,c){return s+(sel[c.id]||new Set()).size;},0);
      var kapOpen=openKap[kap.id];
      return <div key={kap.id} style={{marginBottom:9,border:'2px solid '+(kapSel>0?(kap.color||T):G200),borderRadius:12,overflow:'hidden'}}>
        <div onClick={function(){setOpenKap(function(p){var n=Object.assign({},p);n[kap.id]=!p[kap.id];return n;});}} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:kapSel>0?((kap.color||T)+'15'):'white',cursor:'pointer',touchAction:'manipulation'}}>
          <span style={{fontSize:20}}>{kap.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:'bold',fontSize:14,color:kap.color||T}}>{kap.title}</div>
            <div style={{fontSize:11,color:G400}}>{kids.length} Themenbereiche{kapSel>0?' · '+kapSel+' gewählt':''}</div>
          </div>
          <span style={{color:G400,fontSize:12}}>{kapOpen?'▲':'▼'}</span>
        </div>
        {kapOpen&&(<div style={{borderTop:'1px solid '+G200}}>
          {kids.map(function(c){
            var ws=safeWords(c.words); var s=sel[c.id]||new Set();
            var fi=ws.filter(function(w){return cwFilter==='all'||w.important;});
            var allS=fi.length>0&&fi.every(function(w){return s.has(ws.indexOf(w));}); var someS=fi.some(function(w){return s.has(ws.indexOf(w));})&&!allS;
            var open2=openCh===c.id;
            return <div key={c.id} style={{borderBottom:'1px solid '+G100}}>
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px 9px 20px',background:s.size>0?(c.color+'10'):'#fafafa',cursor:'pointer',touchAction:'manipulation'}} onClick={function(){setOpenCh(open2?null:c.id);}}>
                <span style={{fontSize:16}}>{c.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:'bold',fontSize:12,color:c.color}}>{c.title}</div>
                  <div style={{fontSize:10,color:G400}}>{fi.length} wählbar · {s.size} gewählt</div>
                </div>
                <div onClick={function(e){e.stopPropagation();qTogAll(c);}} style={{width:20,height:20,borderRadius:5,border:'2px solid '+(allS?c.color:someS?c.color:G200),background:allS?c.color:'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer',touchAction:'manipulation'}}>
                  {allS&&<span style={{color:'white',fontSize:11}}>✓</span>}{someS&&<span style={{color:c.color,fontSize:11}}>–</span>}
                </div>
                <span style={{color:G400,fontSize:10}}>{open2?'▲':'▼'}</span>
              </div>
              {open2&&<div style={{padding:'6px 14px 10px 20px',background:'#f9fafb',borderTop:'1px solid '+G100}}>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {fi.map(function(w){var ri=ws.indexOf(w);var isSel=s.has(ri);
                    return <div key={ri} onClick={function(){qTogW(c.id,ri);}} style={{display:'flex',alignItems:'center',gap:3,padding:'4px 8px',borderRadius:16,border:'1.5px solid '+(isSel?c.color:G200),background:isSel?(c.color+'15'):'white',cursor:'pointer',touchAction:'manipulation'}}>
                      {w.important&&<span style={{fontSize:8}}>⭐</span>}
                      <span style={{fontSize:11,fontWeight:w.important?'bold':'normal',color:isSel?c.color:G600}}>{w.word}</span>
                    </div>;
                  })}
                </div>
              </div>}
            </div>;
          })}
        </div>)}
      </div>;
    })}
    <div style={{position:'sticky',bottom:0,background:'white',paddingTop:8,paddingBottom:4,borderTop:'1px solid '+G200,marginTop:8}}>
      <button onClick={function(){setView('playing_duel');}} style={Object.assign({},BtnStyle(T,'white'),{width:'100%',padding:'12px',fontSize:13,marginBottom:6})}>⚔️ Duell starten ({selTotal===0?'alle Vokabeln':selTotal+' gewählt'})</button>
      <button onClick={function(){setView('playing_solo');}} style={Object.assign({},BtnStyle(G100,G600),{width:'100%',padding:'12px',fontSize:13})}>🎯 Solo spielen</button>
    </div>
  </div>;};

  if(view==='continue') return <div style={{padding:8}}>
    <button onClick={function(){setView('menu');}} style={{border:'none',background:'none',color:G400,fontSize:13,cursor:'pointer',marginBottom:12,padding:0}}>Zurueck</button>
    <div style={{fontWeight:'bold',fontSize:14,color:G900,marginBottom:10}}>Offene Herausforderungen</div>
    {pendingGames.length===0&&myGames.length===0&&<div style={{textAlign:'center',color:G400,padding:24,fontSize:13}}>Keine laufenden Spiele gefunden.</div>}
    {pendingGames.map(function(g){
      return <div key={g.id} style={{padding:'10px 12px',marginBottom:6,borderRadius:10,border:'2px solid '+AM,background:'#fffbeb',display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:20}}>⚔️</span>
        <div style={{flex:1}}><div style={{fontWeight:'bold',fontSize:13}}>{g.player1_name} fordert dich heraus</div><div style={{fontSize:10,color:G400}}>Code: {g.code}</div></div>
        <button onClick={function(){
          sbPatch('quiz_duels',{status:'active'},'id=eq.'+g.id).then(function(){
            setJoinGameId(g.id);
            setView('playing_duel');
          });
        }} style={{padding:'6px 14px',borderRadius:8,border:'none',background:T,color:'white',cursor:'pointer',fontSize:12,fontWeight:'bold'}}>Annehmen</button>
      </div>;
    })}
    {myGames.map(function(g){
      return <div key={g.id} style={{padding:'10px 12px',marginBottom:6,borderRadius:10,border:'1px solid '+G200,background:'white',display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:20}}>🎮</span>
        <div style={{flex:1}}><div style={{fontWeight:'bold',fontSize:13}}>vs. {g.player2_name||'Warte auf Gegner'}</div><div style={{fontSize:10,color:G400}}>Status: {g.status}</div></div>
      </div>;
    })}
  </div>;

  if(view==='history') return <div style={{padding:8}}>
    <button onClick={function(){setView('menu');}} style={{border:'none',background:'none',color:G400,fontSize:13,cursor:'pointer',marginBottom:12,padding:0}}>Zurueck</button>
    <div style={{fontWeight:'bold',fontSize:14,color:G900,marginBottom:10}}>Meine letzten Duelle</div>
    {!histLoaded&&<div style={{textAlign:'center',color:G400,padding:20}}>Laden...</div>}
    {histLoaded&&history.length===0&&<div style={{textAlign:'center',color:G400,padding:24,fontSize:13}}>Noch keine Duelle gespielt.</div>}
    {history.map(function(g){
      var isP1=String(g.player1_id)===String(player.id);
      var opp=isP1?g.player2_name:g.player1_name;
      var myWinsArr=JSON.parse(isP1?g.round_wins_p1||'[]':g.round_wins_p2||'[]');
      var oppWinsArr=JSON.parse(isP1?g.round_wins_p2||'[]':g.round_wins_p1||'[]');
      var myR=myWinsArr.filter(function(s){return s>=2;}).length;
      var oppR=oppWinsArr.filter(function(s){return s>=2;}).length;
      var myCorrect=myWinsArr.reduce(function(s,v){return s+v;},0);
      var oppCorrect=oppWinsArr.reduce(function(s,v){return s+v;},0);
      var result=myR>oppR?'win':myR<oppR?'loss':'draw';
      var sc=quizScoring||{correct:10,win:50,loss:-50,draw:30};
      var myPts=myCorrect*sc.correct+(result==='win'?sc.win:result==='draw'?sc.draw:sc.loss);
      var d=new Date(g.created_at); var dateStr=d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear();
      return <div key={g.id} style={{padding:'10px 12px',marginBottom:8,borderRadius:10,border:'2px solid '+(result==='win'?GR:result==='loss'?RE:AM),background:result==='win'?'#f0fdf4':result==='loss'?'#fef2f2':'#fffbeb'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
          <span style={{fontSize:18}}>{result==='win'?'🏆':result==='loss'?'😔':'🤝'}</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:'bold',fontSize:13,color:G900}}>vs {opp}</div>
            <div style={{fontSize:10,color:G400}}>{dateStr}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontWeight:'bold',fontSize:14,color:result==='win'?GR:result==='loss'?RE:AM}}>{myR}:{oppR}</div>
            <div style={{fontSize:10,fontWeight:'bold',color:myPts>=0?GR:RE}}>{myPts>=0?'+':''}{myPts} Pkt</div>
          </div>
        </div>
        <div style={{display:'flex',gap:6,fontSize:11}}>
          <div style={{flex:1,padding:'4px 8px',background:'rgba(0,0,0,0.05)',borderRadius:6,textAlign:'center'}}>
            <div style={{color:G400}}>Ich</div>
            <div style={{fontWeight:'bold',color:G900}}>{myCorrect}/18 richtig</div>
          </div>
          <div style={{flex:1,padding:'4px 8px',background:'rgba(0,0,0,0.05)',borderRadius:6,textAlign:'center'}}>
            <div style={{color:G400}}>{opp}</div>
            <div style={{fontWeight:'bold',color:G900}}>{oppCorrect}/18 richtig</div>
          </div>
        </div>
      </div>;
    })}
  </div>;

  if(view==='leaderboard') {
    var lbArr=lbData.slice().sort(function(a,b){return b.wins-a.wins||(b.games-a.games);});
    return <div style={{padding:8}}>
      <button onClick={function(){setView('menu');}} style={{border:'none',background:'none',color:G400,fontSize:13,cursor:'pointer',marginBottom:12,padding:0}}>← Zurück</button>
      <div style={{fontWeight:'bold',fontSize:14,color:G900,marginBottom:4}}>⚔️ Quiz-Duell Rangliste</div>
      <div style={{fontSize:11,color:G400,marginBottom:10}}>Nur Duell-Ergebnisse — für Gesamtpunkte → Home → 🏆 Gesamtrangliste</div>
      {!lbLoaded&&<div style={{textAlign:'center',color:G400,padding:24}}>Laden...</div>}
      {lbLoaded&&lbArr.length===0&&<div style={{textAlign:'center',color:G400,padding:24,fontSize:13}}>Noch keine Duelle gespielt.</div>}
      {lbArr.map(function(u,i){
        var isMe=String(u.id)===String(player.id);
        var winPct=u.games>0?Math.round(u.wins/u.games*100):0;
        return <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',marginBottom:5,borderRadius:10,background:isMe?TL:'white',border:'2px solid '+(isMe?T:G200)}}>
          <div style={{width:28,height:28,borderRadius:'50%',background:i===0?AM:i===1?G400:i===2?'#b45309':G100,color:i<3?'white':G600,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold',fontSize:12}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:'bold',fontSize:13,color:isMe?T:G900}}>{u.name}{isMe?' (du)':''}</div>
            <div style={{fontSize:10,color:G400}}>{u.wins} Siege · {u.games} Spiele · {winPct}% Siegrate</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:16,fontWeight:'bold',color:isMe?T:G600}}>{u.wins}</div>
            <div style={{fontSize:9,color:G400}}>Siege</div>
          </div>
        </div>;
      })}
    </div>;
  }

  return <div style={{padding:8}}>
    {[
      {icon:'➕',title:'Neues Spiel starten',sub:'Kapitel auswaehlen und losspielen',action:function(){setView('new');}},
      {icon:'▶️',title:'Spiel fortsetzen',sub:'Offene Duelle und Herausforderungen',action:function(){loadContinue();setView('continue');}},
      {icon:'📊',title:'Meine Historie',sub:'Letzte Duelle und Statistiken',action:function(){loadHistory();setView('history');}},
      {icon:'🏆',title:'Rangliste',sub:'Gesamtpunkte aller Spieler',action:function(){loadLeaderboard();setView('leaderboard');}},
    ].map(function(item,i){
      return <button key={i} onClick={item.action} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'14px',marginBottom:8,borderRadius:12,border:'1px solid '+G200,background:'white',cursor:'pointer',textAlign:'left',touchAction:'manipulation',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
        <span style={{fontSize:26,flexShrink:0}}>{item.icon}</span>
        <div><div style={{fontWeight:'bold',fontSize:14,color:G900}}>{item.title}</div><div style={{fontSize:11,color:G400}}>{item.sub}</div></div>
        <span style={{marginLeft:'auto',color:G400,fontSize:16}}>›</span>
      </button>;
    })}
  </div>;
}

function QuizDuel({ chapters, allChapters, globalWords, player, setPlayer, onDone, allUsers, setAllUsers, allCategories, onlineIds, quizScoring, initialGameId }) {
  var [phase, setPhase] = useState("setup");
  var [selectedKapitel, setSelectedKapitel] = useState([]);
  var [tab, setTab] = useState("users");
  var [gameId, setGameId] = useState(null);
  var [gameData, setGameData] = useState(null);
  var [rounds, setRounds] = useState([]);
  var [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  var [qIdx, setQIdx] = useState(0);
  var [chosen, setChosen] = useState(null);
  var [timeLeft, setTimeLeft] = useState(20);
  var [myAnswers, setMyAnswers] = useState([]);
  var [joinCode, setJoinCode] = useState("");
  var [joinErr, setJoinErr] = useState("");
  var [myCode, setMyCode] = useState("");
  var [roundCat, setRoundCat] = useState(null);
  var [pendingChallenges, setPendingChallenges] = useState([]);
  var timerRef = useRef(null);
  var pollRef = useRef(null);
  var [userSearch,setUserSearch]=useState('');

  useEffect(function(){
    if(!initialGameId) return;
    sbSingle('quiz_duels','id=eq.'+initialGameId).then(function(d){
      if(!d) return;
      var parsedRounds=JSON.parse(d.rounds||'[]');
      setRounds(parsedRounds); setGameId(d.id); setGameData(d);
      setCurrentRoundIdx(0); setPhase('readyToPlay');
    });
  },[]);

  useEffect(function(){
    if(!player) return;
    function pollAll(){
      sbGet('quiz_duels','player2_id=eq.'+player.id+'&status=eq.waiting&select=id,code,player1_name,created_at').then(function(d){
        if(Array.isArray(d)) setPendingChallenges(d);
      }).catch(function(){});
      if(gameId){
        sbSingle('quiz_duels','id=eq.'+gameId).then(function(d){ if(d) setGameData(d); }).catch(function(){});
      }
    }
    pollAll();
    pollRef.current = setInterval(pollAll, 3000);
    return function(){ clearInterval(pollRef.current); };
  },[player, gameId]);

  useEffect(function(){
    if(!gameData||!gameId) return;
    var isP1 = gameData.player1_id === player.id;
    var myTurn = (isP1 && gameData.whose_turn==='p1')||((!isP1)&&gameData.whose_turn==='p2');
    if(phase==='waiting'&&myTurn) setPhase('readyToPlay');
    if(gameData.status==='finished'&&phase!=='finalResult') setPhase('finalResult');
  },[gameData]);

  function challengeUser(targetUser){
    var chapSrc = selectedKapitel.length>0 ? chapters.filter(function(c){ return selectedKapitel.indexOf(c.id)>=0 || selectedKapitel.indexOf(c.parent_id)>=0; }) : chapters;
    var generated = makeAllRounds(chapSrc, effectiveGlobal);
    var code = Math.random().toString(36).slice(2,8).toUpperCase();
    sbPost('quiz_duels',{code:code, player1_id:player.id, player1_name:player.name,
      player2_id:targetUser.id, player2_name:targetUser.name,
      rounds:JSON.stringify(generated),
      round_wins_p1:JSON.stringify([]), round_wins_p2:JSON.stringify([]),
      current_round:0, whose_turn:'p2', status:'waiting',
    }).then(function(res){
      if(res&&!res._err){
        sbSingle('quiz_duels','code=eq.'+code).then(function(d){
          if(d){ setGameId(d.id); setRounds(generated); setMyCode(code); setPhase('waitingForChallengee'); }
        });
      }
    });
  }

  function createOpenGame(){
    var chapSrc = selectedKapitel.length>0 ? chapters.filter(function(c){ return selectedKapitel.indexOf(c.id)>=0 || selectedKapitel.indexOf(c.parent_id)>=0; }) : chapters;
    var generated = makeAllRounds(chapSrc, effectiveGlobal);
    var code = Math.random().toString(36).slice(2,8).toUpperCase();
    sbPost('quiz_duels',{code:code, player1_id:player.id, player1_name:player.name,
      rounds:JSON.stringify(generated),
      round_wins_p1:JSON.stringify([]), round_wins_p2:JSON.stringify([]),
      current_round:0, whose_turn:'p2', status:'waiting',
    }).then(function(res){
      if(res&&!res._err){
        sbSingle('quiz_duels','code=eq.'+code).then(function(d){
          if(d){ setGameId(d.id); setRounds(generated); setMyCode(code); setPhase('invite'); }
        });
      }
    });
  }

  function joinByCode(){
    var code = joinCode.trim().toUpperCase();
    if(!code){ setJoinErr('Code eingeben'); return; }
    sbSingle('quiz_duels','code=eq.'+code+'&status=eq.waiting').then(function(d){
      if(!d){ setJoinErr('Spiel nicht gefunden'); return; }
      var parsedRounds = JSON.parse(d.rounds||'[]');
      sbPatch('quiz_duels',{player2_id:player.id, player2_name:player.name, status:'active'},'id=eq.'+d.id).then(function(){
        setRounds(parsedRounds); setGameId(d.id);
        setGameData(Object.assign({},d,{player2_id:player.id,player2_name:player.name,status:'active'}));
        setCurrentRoundIdx(0); setPhase('readyToPlay');
      });
    });
  }

  function acceptChallenge(challenge){
    sbSingle('quiz_duels','id=eq.'+challenge.id).then(function(d){
      if(!d) return;
      var parsedRounds = JSON.parse(d.rounds||'[]');
      sbPatch('quiz_duels',{status:'active'},'id=eq.'+d.id).then(function(){
        setRounds(parsedRounds); setGameId(d.id);
        setGameData(Object.assign({},d,{status:'active'}));
        setCurrentRoundIdx(0); setPhase('readyToPlay');
      });
    });
  }

  function startMyTurn(){
    setQIdx(0); setMyAnswers([]); setChosen(null); setTimeLeft(20);
    if(allCategories&&allCategories.length>0) setPhase('catpick');
    else setPhase('playing');
  }
  function startWithCat(catId){ setRoundCat(catId); setPhase('playing'); }

  function handleDuelAnswer(word){
    clearInterval(timerRef.current);
    if(chosen) return;
    setChosen(word||'__none__');
    var correct = word && currentRoundArr && word===currentRoundArr[qIdx]&&currentRoundArr[qIdx].correct&&word===currentRoundArr[qIdx].correct.word;
    if(currentRoundArr&&currentRoundArr[qIdx]) correct = word===currentRoundArr[qIdx].correct.word;
    var newAnswers = myAnswers.concat([{word:word,correct:!!correct}]);
    setMyAnswers(newAnswers);
    setTimeout(function(){
      if(!currentRoundArr||qIdx+1>=currentRoundArr.length){
        var roundCorrect = newAnswers.filter(function(a){return a.correct;}).length;
        var isP1 = gameData&&gameData.player1_id===player.id;
        var existingWins = JSON.parse((isP1?gameData.round_wins_p1:gameData.round_wins_p2)||'[]');
        var newWins = existingWins.concat([roundCorrect]);
        var otherWins = JSON.parse((isP1?gameData.round_wins_p2:gameData.round_wins_p1)||'[]');
        var update = {};
        if(isP1){ update.round_wins_p1 = JSON.stringify(newWins); update.whose_turn = 'p2'; }
        else { update.round_wins_p2 = JSON.stringify(newWins); update.whose_turn = 'p1'; }
        if(newWins.length>=6&&otherWins.length>=6){
          update.status='finished';
          var sc=quizScoring||{correct:10,win:50,loss:-50,draw:30};
          var myTotal=newWins.reduce(function(s,v){return s+v;},0);
          var oppTotal=otherWins.reduce(function(s,v){return s+v;},0);
          var myRW=newWins.filter(function(s){return s>=2;}).length;
          var oppRW=otherWins.filter(function(s){return s>=2;}).length;
          var iWon2=myRW>oppRW; var isDraw2=myRW===oppRW;
          var myPts=myTotal*sc.correct+(iWon2?sc.win:isDraw2?sc.draw:sc.loss);
          var oppPts=oppTotal*sc.correct+(!iWon2?(isDraw2?sc.draw:sc.win):sc.loss);
          var myNewScore=Math.max(0,(player.total_score||0)+myPts);
          var oppId2=String(isP1?gameData.player2_id:gameData.player1_id);
          var oppUser2=(allUsers||[]).find(function(u){return String(u.id)===oppId2;});
          var oppNewScore=Math.max(0,((oppUser2&&oppUser2.total_score)||0)+oppPts);
          sbPatch('players',{total_score:myNewScore},'id=eq.'+player.id);
          sbPatch('players',{total_score:oppNewScore},'id=eq.'+oppId2);
          if(setPlayer) setPlayer(function(p){return Object.assign({},p,{total_score:myNewScore});});
          if(setAllUsers) setAllUsers(function(prev){return prev.map(function(u){
            if(String(u.id)===String(player.id)) return Object.assign({},u,{total_score:myNewScore});
            if(String(u.id)===oppId2) return Object.assign({},u,{total_score:oppNewScore});
            return u;
          });});
          update._myPts=myPts; update._oppPts=oppPts;
        }
        sbPatch('quiz_duels',update,'id=eq.'+gameId).then(function(){
          setGameData(function(prev){return Object.assign({},prev,update);});
          setPhase('roundResult');
        });
      } else {
        setQIdx(function(i){return i+1;}); setChosen(null); setTimeLeft(20);
      }
    },1200);
  }

  useEffect(function(){
    if(phase!=='playing'||chosen) return;
    clearInterval(timerRef.current); setTimeLeft(20);
    timerRef.current = setInterval(function(){
      setTimeLeft(function(t){
        if(t<=1){clearInterval(timerRef.current);handleDuelAnswer(null);return 0;}
        return t-1;
      });
    },1000);
    return function(){clearInterval(timerRef.current);};
  },[phase,qIdx,chosen]);

  var TOTAL_ROUNDS = 6;
  var currentRoundArr = rounds[currentRoundIdx]||[];
  var allWordsFlat = (function(){
    var ws=[]; (chapters||[]).forEach(function(ch){ if(!ch.parent_id) return; (ch.words||[]).forEach(function(w){ ws.push(Object.assign({},w,{chapterId:ch.id})); }); }); return ws;
  })();
  // effectiveGlobal: use passed globalWords prop for distractors, or fall back to local words
  var effectiveGlobal = (globalWords && globalWords.length>=4) ? globalWords : allWordsFlat;
  var currentRound = currentRoundArr[qIdx];
  var isP1 = gameData&&gameData.player1_id===player.id;
  var myWins = JSON.parse((gameData&&(isP1?gameData.round_wins_p1:gameData.round_wins_p2))||'[]');
  var oppWins = JSON.parse((gameData&&(isP1?gameData.round_wins_p2:gameData.round_wins_p1))||'[]');
  var oppName = gameData?(isP1?gameData.player2_name:gameData.player1_name)||'Gegner':'Gegner';

  function ScoreBoard({compact}){
    var myR=myWins.filter(function(s){return s>=2;}).length;
    var oppR=oppWins.filter(function(s){return s>=2;}).length;
    if(compact) return (
      <div style={{display:'flex',gap:6,alignItems:'center',justifyContent:'center',marginBottom:8}}>
        <span style={{fontWeight:'bold',color:T,fontSize:13}}>{player.name}</span>
        <span style={{fontSize:18,fontWeight:'bold',color:myR>oppR?GR:myR<oppR?RE:AM}}>{myR}</span>
        <span style={{color:G400}}>:</span>
        <span style={{fontSize:18,fontWeight:'bold',color:oppR>myR?GR:oppR<myR?RE:AM}}>{oppR}</span>
        <span style={{fontWeight:'bold',color:G600,fontSize:13}}>{oppName}</span>
        <span style={{marginLeft:8,fontSize:11,color:G400}}>Runde {Math.max(myWins.length,oppWins.length)+1}/{TOTAL_ROUNDS}</span>
      </div>
    );
    return (
      <div style={{padding:'10px 12px',background:G50,borderRadius:10,border:'1px solid '+G200,marginBottom:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <span style={{fontWeight:'bold',fontSize:12,color:T}}>{player.name}</span>
          <span style={{fontSize:10,color:G400}}>Runde {Math.max(myWins.length,oppWins.length)}/{TOTAL_ROUNDS}</span>
          <span style={{fontWeight:'bold',fontSize:12,color:G600}}>{oppName}</span>
        </div>
        <div style={{display:'flex',gap:3,justifyContent:'center',flexWrap:'wrap'}}>
          {Array.from({length:TOTAL_ROUNDS}).map(function(_,i){
            var myS=myWins[i]; var oppS=oppWins[i];
            var myWon=myS!==undefined&&myS>=2; var oppWon=oppS!==undefined&&oppS>=2;
            return <div key={i} style={{textAlign:'center',width:36}}>
              <div style={{fontSize:9,color:G400,marginBottom:2}}>R{i+1}</div>
              <div style={{display:'flex',gap:1}}>
                <div style={{flex:1,height:20,borderRadius:'3px 0 0 3px',background:myS!==undefined?(myWon?GR:RE):G200,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'white',fontWeight:'bold'}}>{myS!==undefined?myS:''}</div>
                <div style={{flex:1,height:20,borderRadius:'0 3px 3px 0',background:oppS!==undefined?(oppWon?GR:RE):G200,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'white',fontWeight:'bold'}}>{oppS!==undefined?oppS:''}</div>
              </div>
            </div>;
          })}
        </div>
      </div>
    );
  }

  if(phase==='setup'){
    var allOtherUsers=(allUsers||[]).filter(function(u){
      if(String(u.id)===String(player.id)) return false;
      if(u.is_admin) return false; if(u.is_active===false) return false;
      var n=(u.name||'').toLowerCase();
      if(n.startsWith('testuser_')||n.startsWith('cors_test')||n==='debuguser123') return false;
      return true;
    });
    var filteredUsers=userSearch.trim() ? allOtherUsers.filter(function(u){return u.name.toLowerCase().includes(userSearch.toLowerCase());}) : allOtherUsers;
    function avatarColor(name){
      var colors=['#0f766e','#7c3aed','#b45309','#0369a1','#be185d','#15803d','#dc2626','#0891b2'];
      var idx=0; for(var i=0;i<name.length;i++)idx=(idx+name.charCodeAt(i))%colors.length; return colors[idx];
    }
    return <div style={{padding:8}}>
      {pendingChallenges.length>0&&<div style={{padding:12,background:'#fffbeb',borderRadius:12,border:'2px solid '+AM,marginBottom:14}}>
        <div style={{fontWeight:'bold',fontSize:13,color:AM,marginBottom:8}}>⚔️ Herausforderungen ({pendingChallenges.length})</div>
        {pendingChallenges.map(function(c){ var ac2=avatarColor(c.player1_name||'?');
          return <div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:'1px solid #fde68a'}}>
            <div style={{width:36,height:36,borderRadius:'50%',background:ac2,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold',fontSize:15,flexShrink:0}}>{(c.player1_name||'?')[0].toUpperCase()}</div>
            <div style={{flex:1}}><div style={{fontWeight:'bold',fontSize:13,color:G900}}>{c.player1_name}</div><div style={{fontSize:10,color:G400}}>fordert dich heraus!</div></div>
            <button onClick={function(){acceptChallenge(c);}} style={{padding:'8px 16px',borderRadius:8,border:'none',background:T,color:'white',cursor:'pointer',fontSize:13,fontWeight:'bold',flexShrink:0,touchAction:'manipulation'}}>✓ Annehmen</button>
          </div>; })}
      </div>}
      <div style={{display:'flex',gap:6,marginBottom:12,background:G100,padding:4,borderRadius:10}}>
        <button onClick={function(){setTab('users');}} style={{flex:1,padding:'9px',borderRadius:8,fontSize:13,fontWeight:'bold',cursor:'pointer',border:'none',background:tab==='users'?'white':G100,color:tab==='users'?T:G600,boxShadow:tab==='users'?'0 1px 4px rgba(0,0,0,0.1)':'none'}}>👥 Spieler auswählen</button>
        <button onClick={function(){setTab('code');}} style={{flex:1,padding:'9px',borderRadius:8,fontSize:13,fontWeight:'bold',cursor:'pointer',border:'none',background:tab==='code'?'white':G100,color:tab==='code'?T:G600,boxShadow:tab==='code'?'0 1px 4px rgba(0,0,0,0.1)':'none'}}>🔗 Per Code</button>
      </div>
      {tab==='users'&&<div>
        <div style={{position:'relative',marginBottom:10}}>
          <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:G400,fontSize:16,pointerEvents:'none'}}>🔍</span>
          <input value={userSearch} onChange={function(e){setUserSearch(e.target.value);}} placeholder="Spieler suchen…" style={{width:'100%',padding:'11px 36px 11px 36px',fontSize:15,border:'1.5px solid '+G200,borderRadius:10,outline:'none',boxSizing:'border-box',background:'white'}}/>
          {userSearch&&<button onClick={function(){setUserSearch('');}} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',border:'none',background:'none',cursor:'pointer',color:G400,fontSize:16}}>✕</button>}
        </div>
        {filteredUsers.length===0&&<div style={{textAlign:'center',color:G400,padding:24,fontSize:13}}>{userSearch?'Kein Spieler gefunden.':'Keine anderen Spieler vorhanden.'}</div>}
        {filteredUsers.map(function(u){ var isOnline=(onlineIds||[]).indexOf(String(u.id))>=0; var ac=avatarColor(u.name);
          return <div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px',marginBottom:6,borderRadius:12,border:'1.5px solid '+(isOnline?G100:G200),background:isOnline?'white':G50,boxShadow:isOnline?'0 1px 4px rgba(0,0,0,0.06)':'none'}}>
            <div style={{position:'relative',flexShrink:0}}>
              <div style={{width:44,height:44,borderRadius:'50%',background:isOnline?ac:G400,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold',color:'white',fontSize:19,border:'2px solid '+(isOnline?'white':G200),boxShadow:'0 2px 6px rgba(0,0,0,0.15)'}}>{u.name[0].toUpperCase()}</div>
              <div style={{position:'absolute',bottom:1,right:1,width:12,height:12,borderRadius:'50%',background:isOnline?GR:G400,border:'2.5px solid white'}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:'bold',fontSize:14,color:isOnline?G900:G400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.name}</div>
              <div style={{fontSize:11,color:isOnline?'#22c55e':G400,fontWeight:'500'}}>{isOnline?'● Online':'○ Offline'}</div>
            </div>
            <button onClick={function(){challengeUser(u);}} style={{flexShrink:0,padding:'9px 16px',borderRadius:9,border:'none',background:isOnline?T:G200,color:isOnline?'white':G600,cursor:'pointer',fontSize:12,fontWeight:'bold',touchAction:'manipulation',boxShadow:isOnline?'0 2px 5px rgba(15,118,110,0.3)':'none'}}>{isOnline?'⚔️ Herausfordern':'✉️ Einladen'}</button>
          </div>; })}
        <button onClick={createOpenGame} style={{display:'block',width:'100%',padding:'11px',marginTop:10,borderRadius:10,border:'1.5px dashed '+G200,background:G50,cursor:'pointer',fontSize:12,color:G600,fontWeight:'bold',touchAction:'manipulation'}}>+ Offenes Spiel per Code erstellen</button>
      </div>}
      {tab==='code'&&<div>
        <div style={{padding:16,background:'white',borderRadius:12,border:'1px solid '+G200,marginBottom:10}}>
          <div style={{fontWeight:'bold',fontSize:14,color:T,marginBottom:4}}>🎮 Neues Duell erstellen</div>
          <div style={{fontSize:12,color:G400,marginBottom:12}}>Du erhältst einen 6-stelligen Code. Dein Gegner spielt als Erster.</div>
          <button onClick={createOpenGame} style={BtnStyle(T,'white',{width:'100%',padding:'12px',fontSize:14})}>Duell erstellen & Code teilen</button>
        </div>
        <div style={{padding:16,background:'white',borderRadius:12,border:'1px solid '+G200}}>
          <div style={{fontWeight:'bold',fontSize:14,color:'#7c3aed',marginBottom:4}}>🔗 Beitreten</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input value={joinCode} onChange={function(e){setJoinCode(e.target.value.toUpperCase());}} placeholder="CODE" style={{flex:1,padding:'12px 8px',fontSize:20,border:'2px solid #7c3aed',borderRadius:10,outline:'none',letterSpacing:8,textTransform:'uppercase',textAlign:'center',fontWeight:'bold',color:'#7c3aed'}}/>
            <button onClick={joinByCode} style={{padding:'12px 20px',borderRadius:10,border:'none',background:'#7c3aed',color:'white',cursor:'pointer',fontSize:16,fontWeight:'bold',touchAction:'manipulation'}}>→</button>
          </div>
          {joinErr&&<div style={{color:RE,fontSize:12,marginTop:8,padding:'6px 10px',background:'#fef2f2',borderRadius:7}}>{joinErr}</div>}
        </div>
      </div>}
    </div>;
  }

  if(phase==='waitingForChallengee') return <div style={{textAlign:'center',padding:32}}>
    <div style={{fontSize:36,marginBottom:12}}>📨</div>
    <h3 style={{color:T,marginBottom:8}}>Herausforderung gesendet!</h3>
    {myCode&&<div style={{fontSize:24,fontWeight:'bold',letterSpacing:6,color:AM,background:G100,padding:'10px 16px',borderRadius:10,display:'inline-block',marginBottom:12}}>{myCode}</div>}
    <p style={{color:G600,fontSize:13,marginBottom:16}}>Warte bis {gameData&&gameData.player2_name||'dein Gegner'} seine Runde gespielt hat.</p>
    <button onClick={function(){sbSingle('quiz_duels','id=eq.'+gameId).then(function(d){if(d){setGameData(d);if(d.whose_turn==='p1'&&d.status==='active')setPhase('readyToPlay');}});}}
      style={BtnStyle(G100,G600,{padding:'8px 16px',fontSize:12})}>🔄 Status prüfen</button>
  </div>;

  if(phase==='invite') return <div style={{textAlign:'center',padding:32}}>
    <div style={{fontSize:32,marginBottom:12}}>⏳</div>
    <h3 style={{color:T,marginBottom:8}}>Warte auf Mitspieler…</h3>
    <div style={{fontSize:28,fontWeight:'bold',letterSpacing:8,color:AM,margin:'16px 0',background:G100,padding:'12px 20px',borderRadius:12,display:'inline-block'}}>{myCode}</div>
    <p style={{color:G400,fontSize:13}}>Sobald jemand beitritt, kann er zuerst spielen, dann bist du dran.</p>
    <button onClick={function(){sbSingle('quiz_duels','id=eq.'+gameId).then(function(d){if(d){setGameData(d);if(d.whose_turn==='p1'&&d.status==='active')setPhase('readyToPlay');}});}}
      style={BtnStyle(G100,G600,{marginTop:16,padding:'8px 16px',fontSize:12})}>🔄 Aktualisieren</button>
  </div>;

  if(phase==='catpick'){
    var catsWithWords = (allCategories||[]).filter(function(cat){ return allWordsFlat.filter(function(w){return (w.cats||[]).indexOf(cat.id)>=0;}).length>=2; });
    if(catsWithWords.length===0){setPhase('playing');return null;}
    return <div style={{padding:8,textAlign:'center'}}>
      {gameData&&<ScoreBoard/>}
      <div style={{fontWeight:'bold',fontSize:14,color:T,marginBottom:8}}>Wähle eine Kategorie für diese Runde:</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
        {catsWithWords.map(function(cat){ var cnt=allWordsFlat.filter(function(w){return (w.cats||[]).indexOf(cat.id)>=0;}).length;
          return <button key={cat.id} onClick={function(){startWithCat(cat.id);}} style={{padding:'10px 5px',borderRadius:10,border:'2px solid '+G200,background:'white',cursor:'pointer',textAlign:'center',touchAction:'manipulation'}}>
            <div style={{fontSize:18,marginBottom:3}}>{cat.icon}</div>
            <div style={{fontSize:9,fontWeight:'bold',color:G600}}>{cat.name}</div>
            <div style={{fontSize:9,color:G400}}>{cnt} V</div>
          </button>; })}
      </div>
      <button onClick={function(){setPhase('playing');}} style={BtnStyle(G100,G600,{padding:'7px',fontSize:11,width:'100%'})}>Ohne Kategorie spielen</button>
    </div>;
  }

  if(phase==='readyToPlay'){
    var isMyTurnNow = gameData&&((isP1&&gameData.whose_turn==='p1')||(!isP1&&gameData.whose_turn==='p2'));
    return <div style={{padding:8,textAlign:'center'}}>
      {gameData&&<ScoreBoard/>}
      {isMyTurnNow
        ? <div style={{padding:20,background:'#d1fae5',borderRadius:14,marginBottom:12,border:'2px solid '+GR}}>
            <div style={{fontSize:28,marginBottom:8}}>🎯</div>
            <div style={{fontWeight:'bold',fontSize:16,color:'#065f46',marginBottom:4}}>Jetzt bist du dran!</div>
            <div style={{fontSize:12,color:G600}}>Runde {(isP1?myWins:oppWins).length+1} von {TOTAL_ROUNDS}</div>
          </div>
        : <div style={{padding:20,background:'#eff6ff',borderRadius:14,marginBottom:12}}>
            <div style={{fontSize:28,marginBottom:8}}>⏳</div>
            <div style={{fontWeight:'bold',fontSize:14,color:T}}>{oppName} spielt gerade…</div>
          </div>}
      {isMyTurnNow&&<button onClick={startMyTurn} style={BtnStyle(T,'white',{width:'100%',padding:'14px',fontSize:16})}>▶ Meine Runde starten</button>}
      {!isMyTurnNow&&<button onClick={function(){sbSingle('quiz_duels','id=eq.'+gameId).then(function(d){if(d) setGameData(d);});}} style={BtnStyle(G100,G600,{width:'100%',padding:'10px'})}>🔄 Aktualisieren</button>}
    </div>;
  }

  if(phase==='waiting') return <div style={{padding:8,textAlign:'center'}}>
    <ScoreBoard/>
    <div style={{padding:20,background:'#eff6ff',borderRadius:14,marginBottom:12}}>
      <div style={{fontSize:28,marginBottom:8}}>⏳</div>
      <div style={{fontWeight:'bold',fontSize:14,color:T}}>{oppName} ist dran!</div>
    </div>
    <button onClick={function(){sbSingle('quiz_duels','id=eq.'+gameId).then(function(d){
      if(d){setGameData(d);var myT=(isP1&&d.whose_turn==='p1')||(!isP1&&d.whose_turn==='p2');if(myT||d.status==='finished')setPhase('readyToPlay');}
    });}} style={BtnStyle(G100,G600,{width:'100%',padding:'10px'})}>🔄 Aktualisieren</button>
  </div>;

  if(phase==='roundResult'){
    var roundCorrect2=myAnswers.filter(function(a){return a.correct;}).length;
    var roundWon=roundCorrect2>=2;
    var gameOver2=gameData&&gameData.status==='finished';
    return <div style={{padding:8}}>
      <div style={{textAlign:'center',padding:'20px 16px',background:roundWon?'#f0fdf4':'#fef2f2',borderRadius:14,marginBottom:12,border:'2px solid '+(roundWon?GR:RE)}}>
        <div style={{fontSize:32,marginBottom:6}}>{roundWon?'🎉':'😔'}</div>
        <div style={{fontSize:17,fontWeight:'bold',color:roundWon?'#065f46':RE}}>Runde {myWins.length}: {roundCorrect2}/3 richtig - {roundWon?'Gewonnen!':'Verloren'}</div>
      </div>
      <ScoreBoard/>
      {!gameOver2&&<div style={{padding:10,background:'#eff6ff',borderRadius:10,marginBottom:12,fontSize:13,color:T,textAlign:'center'}}>Jetzt ist <strong>{oppName}</strong> dran mit Runde {oppWins.length+1}.</div>}
      <button onClick={function(){
        if(gameOver2){setPhase('finalResult');return;}
        setPhase('waiting'); setRoundCat(null);
        setCurrentRoundIdx(function(i){return i+1;}); setQIdx(0); setMyAnswers([]); setChosen(null);
      }} style={BtnStyle(T,'white',{width:'100%',padding:'12px'})}>{gameOver2?'🏁 Ergebnis sehen':'OK, Gegner ist dran →'}</button>
    </div>;
  }

  if(phase==='finalResult'){
    var myR2=myWins.filter(function(s){return s>=2;}).length;
    var oppR2=oppWins.filter(function(s){return s>=2;}).length;
    var tie=myR2===oppR2; var iWon=myR2>oppR2;
    var sc2=quizScoring||{correct:10,win:50,loss:-50,draw:30};
    var myCorrectTotal2=myWins.reduce(function(s,v){return s+v;},0);
    var myPtsEarned=myCorrectTotal2*sc2.correct+(iWon?sc2.win:tie?sc2.draw:sc2.loss);
    return <div style={{padding:8}}>
      <div style={{borderRadius:16,padding:'24px 16px',textAlign:'center',marginBottom:12,background:tie?'linear-gradient(135deg,'+AM+',#f59e0b)':iWon?'linear-gradient(135deg,'+GR+',#16a34a)':'linear-gradient(135deg,'+RE+',#dc2626)',color:'white'}}>
        <div style={{fontSize:48,marginBottom:8}}>{tie?'🤝':iWon?'🏆':'😔'}</div>
        <div style={{fontSize:22,fontWeight:'bold',marginBottom:4}}>{tie?'Unentschieden!':iWon?'Du hast gewonnen!':'Niederlage'}</div>
        <div style={{fontSize:16,opacity:0.9}}>{myR2} : {oppR2} Runden</div>
        <div style={{marginTop:8,padding:'6px 14px',background:'rgba(255,255,255,0.2)',borderRadius:20,display:'inline-block',fontSize:14,fontWeight:'bold'}}>
          {myPtsEarned>=0?'+':''}{myPtsEarned} Punkte
        </div>
      </div>
      <div style={{padding:'10px 14px',background:G50,borderRadius:10,border:'1px solid '+G200,marginBottom:10,fontSize:12}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
          <span style={{color:G600}}>Richtige Antworten ({myCorrectTotal2}/18):</span>
          <span style={{fontWeight:'bold',color:T}}>+{myCorrectTotal2*sc2.correct} Pkt</span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <span style={{color:G600}}>{iWon?'Sieg-Bonus':tie?'Unentschieden':' Niederlage'}:</span>
          <span style={{fontWeight:'bold',color:iWon?GR:tie?AM:RE}}>{iWon?'+'+sc2.win:tie?'+'+sc2.draw:sc2.loss} Pkt</span>
        </div>
      </div>
      <ScoreBoard/>
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button onClick={function(){setPhase('setup');setGameId(null);setGameData(null);setRounds([]);setMyAnswers([]);setCurrentRoundIdx(0);}} style={BtnStyle(T,'white',{flex:1,padding:'12px'})}>🔄 Neues Duell</button>
        <button onClick={onDone} style={BtnStyle(G100,G600,{flex:1,padding:'12px'})}>← Menü</button>
      </div>
    </div>;
  }

  var effectiveRound = currentRound;
  var isEn2De2=effectiveRound&&effectiveRound.type==='en2de';
  var question2=effectiveRound?(isEn2De2?effectiveRound.correct.word:effectiveRound.correct.clue):'';
  var letters2=['A','B','C','D'];
  return <div style={{padding:8}}>
    <ScoreBoard compact={true}/>
    <div style={{display:'flex',gap:8,marginBottom:10}}>
      <div style={{flex:1,textAlign:'center',padding:'8px',background:TL,borderRadius:8}}><div style={{fontSize:9,color:G400}}>Meine Runden</div><div style={{fontSize:17,fontWeight:'bold',color:T}}>{myWins.filter(function(s){return s>=2;}).length}</div></div>
      <div style={{flex:1,textAlign:'center',padding:'8px',background:G100,borderRadius:8}}><div style={{fontSize:9,color:G400}}>{oppName}</div><div style={{fontSize:17,fontWeight:'bold',color:G600}}>{oppWins.filter(function(s){return s>=2;}).length}</div></div>
      <div style={{flex:1,textAlign:'center',padding:'8px',background:timeLeft<=5?'#fef2f2':G100,borderRadius:8}}><div style={{fontSize:9,color:G400}}>Zeit</div><div style={{fontSize:17,fontWeight:'bold',color:timeLeft<=5?RE:G600}}>{timeLeft}s</div></div>
      <div style={{flex:1,textAlign:'center',padding:'8px',background:G100,borderRadius:8}}><div style={{fontSize:9,color:G400}}>Frage</div><div style={{fontSize:17,fontWeight:'bold',color:G600}}>{qIdx+1}/3</div></div>
    </div>
    {currentRound&&<div style={{textAlign:'center',padding:'20px 16px',background:G50,borderRadius:14,marginBottom:10,border:'2px solid '+G200}}>
      <div style={{fontSize:10,color:G400,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>{isEn2De2?'Was bedeutet auf Deutsch:':'Wie heißt auf Englisch:'}</div>
      <div style={{fontSize:26,fontWeight:'bold',color:G900}}>{question2}</div>
    </div>}
    <div style={{height:4,background:G200,borderRadius:2,overflow:'hidden',marginBottom:10}}>
      <div style={{height:'100%',width:(timeLeft/20*100)+'%',background:timeLeft<=5?RE:T,borderRadius:2,transition:'width 1s linear'}}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
      {effectiveRound&&effectiveRound.answers.map(function(a,i){
        var answerText=isEn2De2?a.clue:a.word;
        var isCorrect=a.word===effectiveRound.correct.word;
        var isChosen=chosen&&chosen===a.word;
        var bg=G50,border3='2px solid '+G200,col3=G900;
        if(chosen){ if(isCorrect){bg='#d1fae5';border3='2px solid '+GR;col3='#065f46';} else if(isChosen){bg='#fee2e2';border3='2px solid '+RE;col3='#991b1b';} }
        return <button key={i} onClick={function(){if(!chosen)handleDuelAnswer(a.word);}} disabled={!!chosen}
          style={{padding:'14px 10px',background:bg,border:border3,borderRadius:12,cursor:chosen?'default':'pointer',textAlign:'left',touchAction:'manipulation'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:22,height:22,borderRadius:'50%',background:chosen&&isCorrect?GR:chosen&&isChosen?RE:G200,color:chosen&&(isCorrect||isChosen)?'white':G600,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:'bold',flexShrink:0}}>{letters2[i]}</span>
            <span style={{fontSize:13,fontWeight:'bold',color:col3,lineHeight:1.3}}>{answerText}</span>
          </div>
        </button>;
      })}
    </div>
  </div>;
}

export { QuizSolo, QuizDuelMenu, QuizDuel };
