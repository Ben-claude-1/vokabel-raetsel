import { sbGet, sbPatch, sbPost } from '../core/api.js';
import { SB_URL } from '../core/config.js';
import { CREDIT, DEFAULT_STREAK, REVIEW_DEFAULT, SKIP_LIMIT, canPromote, generateSentences, logWordEvent, lsGetProgress, lsGetRunsForPlayer, lsGrade, lsInitProgress, lsLogAnswer, lsPercent, lsPickWord, lsRunPacing, potCredit, lsSaveProgress, markPromoted, reviewPolicyOf, tallyAnswer, trackPot } from '../core/leitner.js';
import { getReviewSkipStatus, requestReviewSkip } from '../core/push.js';
import { useEffect, useMemo, useRef, useState } from '../core/react.js';
import { filterRunsByScope, rootsOf, scopeText } from '../core/scope.js';
import { AM, BtnStyle, G100, G200, G400, G50, G600, G900, GR, POT_COL, POT_ICON, POT_LABEL, RE, T, TD, TL } from '../core/theme.js';
import { dayKey, fmtTestStamp, naturalSort, shuffleArr } from '../core/util.js';
import { buildT2Layout, checkAnswer, collectRunSentences, getWordType, normWordKey, parseData, parseWishStructured, safeWords, wordDisplay } from '../core/words.js';
import { ProgressStats } from './trainer.jsx';
import { CelebrationPopup, LernVerlaufChart, T2LetterField } from './widgets.jsx';

function LeitersSpielSession({ run, player, chapters, onDone, onUpdateScore, streak: streakProp }) {
  var streak = Object.assign({}, DEFAULT_STREAK, streakProp || {});
  var [data, setData] = useState(null);
  var [dataLoading, setDataLoading] = useState(true);
  var [phase, setPhase] = useState('pick');
  var [current, setCurrent] = useState(null);
  var [input, setInput] = useState('');
  var [result, setResult] = useState(null);
  var [streakCount, setStreakCount] = useState(0);
  var [celebration, setCelebration] = useState(null);
  var [sessionLog, setSessionLog] = useState([]);
  var [quizOptions, setQuizOptions] = useState([]);
  var [quizChosen, setQuizChosen] = useState(null);
  var [sesStart, setSesStart] = useState(null);
  var [sesAns, setSesAns] = useState(0);
  var [sesCor, setSesCor] = useState(0);
  // Überspringen ist begrenzt: die ersten SKIP_LIMIT gehen mit einem Klick,
  // danach muss die Lösung einmal geschrieben werden (zählt trotzdem als
  // „nicht gewusst"). `copyMode` ist dieser Abschreib-Schritt.
  var [skipsLeft, setSkipsLeft] = useState(SKIP_LIMIT);
  var [copyMode, setCopyMode] = useState(false);
  var [copyHint, setCopyHint] = useState(false);
  // „Wie im Topf davor lösen": in Topf 3-5 kann statt aufzugeben die leichtere
  // Mechanik des vorherigen Topfs genutzt werden. Richtig gelöst bleibt das
  // Wort im aktuellen Topf — weder Auf- noch Abstieg. Topf 1+2 haben keine
  // Vorstufe, die einfacher wäre, deshalb dort nicht verfügbar.
  var [helpMode, setHelpMode] = useState(false);
  var HELP_FROM_POT = {3:2, 4:3, 5:4};
  var [testWords, setTestWords] = useState([]);
  var [testIdx, setTestIdx] = useState(0);
  var [testLog, setTestLog] = useState([]);
  var [expandedTestIdx, setExpandedTestIdx] = useState(null);
  var sesLastActive = useRef(null);
  var sesActiveSec = useRef(0);
  var inputRef = useRef();
  var qShownAt = useRef(null); // Zeitpunkt, an dem die Frage erschien → Antwortzeit
  function answerMs(){ var t=qShownAt.current; qShownAt.current=null; return t?Date.now()-t:null; }

  useEffect(function(){
    if(!player||!run) return;
    var runWords=[]; try{runWords=typeof run.words==='string'?JSON.parse(run.words||'[]'):(run.words||[]);}catch(e){}
    var runSents=[]; try{runSents=typeof run.sentences==='string'?JSON.parse(run.sentences||'[]'):(run.sentences||[]);}catch(e){}
    function reconcile(d){
      if(!d || !d.pots) return lsInitProgress(runWords, runSents);
      var runKeys = {};
      runWords.forEach(function(w){ runKeys[normWordKey(w.word)] = w; });
      var seen = {};
      var newPots = {1:[],2:[],3:[],4:[],5:[],6:[]};
      [1,2,3,4,5,6].forEach(function(pot){
        (d.pots[pot]||[]).forEach(function(w){
          var k = normWordKey(w.word);
          if(!runKeys[k] || seen[k]) return;
          seen[k] = 1;
          newPots[pot].push(w);
        });
      });
      runWords.forEach(function(w){
        var k = normWordKey(w.word);
        if(!seen[k]) newPots[1].push({word:w.word, clue:w.clue, type:w.type||'noun', chapterId:w.chapterId||'', streak:0, wrongStreak:0});
      });
      return Object.assign({}, d, {pots:newPots});
    }
    lsGetProgress(player.id, run.id).then(function(rows){
      if(Array.isArray(rows)&&rows.length>0){
        var row=rows[0];
        var d=parseData(row.data);
        var reconciled = reconcile(d);
        var beforeCount = [1,2,3,4,5,6].reduce(function(s,p){return s+((d.pots&&d.pots[p])||[]).length;},0);
        var afterCount = [1,2,3,4,5,6].reduce(function(s,p){return s+reconciled.pots[p].length;},0);
        setData(reconciled);
        if(beforeCount !== afterCount){
          lsSaveProgress(player.id, run.id, reconciled);
        }
      } else {
        setData(lsInitProgress(runWords, runSents));
      }
      setDataLoading(false);
    }).catch(function(){
      setData(lsInitProgress(runWords, runSents));
      setDataLoading(false);
    });
  },[]);

  useEffect(function(){ if(inputRef.current && (phase==='answer'||phase==='dashes'||phase==='test_q')) inputRef.current.focus(); },[phase,testIdx]);

  useEffect(function(){
    var active=phase==='test_q'||phase==='test_show'||phase==='satzmeister'||phase==='satzquiz';
    if(!active) return;
    var id=setInterval(trackActiveTime,120000);
    return function(){clearInterval(id);};
  },[phase]);

  function saveAndUpdate(newData){
    lsSaveProgress(player.id, run.id, newData);
    setData(newData);
  }
  function trackActiveTime(){
    var now=Date.now();
    var prev=sesLastActive.current||(sesStart?sesStart:null);
    if(prev){ var gap=(now-prev)/1000; if(gap<=300) sesActiveSec.current+=gap; }
    sesLastActive.current=now;
  }

  function saveSession(currentData) {
    if(!sesStart || sesAns===0) return currentData;
    var dur = Math.round(sesActiveSec.current);
    if(dur < 10) return currentData;
    var pct = lsPercent(currentData);
    var today = dayKey();
    var session = {d:today, ts:sesStart, dur:dur, ans:sesAns, cor:sesCor, pct:pct};
    var nd = JSON.parse(JSON.stringify(currentData));
    if(!nd.sessions) nd.sessions=[];
    nd.sessions.push(session);
    if(nd.sessions.length>180) nd.sessions=nd.sessions.slice(-180);
    setSesStart(null); setSesAns(0); setSesCor(0); sesLastActive.current=null; sesActiveSec.current=0;
    return nd;
  }

  function pickWord(){
    if(!sesStart) setSesStart(Date.now());
    var w = lsPickWord(data, current ? current.word : null, {workingSet:streak.workingSet});
    if(!w){ setPhase('done'); return; }
    setCurrent(w); setInput(''); setResult(null); setHelpMode(false);
    qShownAt.current = Date.now();
    if(w.pot===1){
      var allWords=[];
      [1,2,3,4,5,6].forEach(function(pot){(data.pots[pot]||[]).forEach(function(ww){allWords.push(ww);});});
      var wType=getWordType(w);
      var sameType=allWords.filter(function(ww){return normWordKey(ww.word)!==normWordKey(w.word)&&getWordType(ww)===wType;});
      var quizPool=sameType.length>=3?sameType:allWords.filter(function(ww){return normWordKey(ww.word)!==normWordKey(w.word);});
      var others=shuffleArr(quizPool).slice(0,3);
      setQuizOptions(shuffleArr([{word:w.word,clue:w.clue}].concat(others.map(function(d){return {word:d.word,clue:d.clue};}))));
      setQuizChosen(null); setPhase('quiz');
    } else if(w.pot===2){
      setPhase('t2');
    } else if(w.pot===3){
      setPhase('dashes');
    } else {
      setPhase('answer');
    }
  }

  function submitDispute(type){
    if(!current||!player) return;
    var payload={player_id:player.id,player_name:player.name,run_id:run.id,
      word:current.word,clue:current.clue,typed_answer:result?result.typed:'',
      pot:current.pot,chapter_id:'',status:'open',dispute_type:type,
      created_at:new Date().toISOString()};
    sbPost('word_disputes',payload).then(function(res){
      if(!res||res._err){alert('⚠️ Fehler beim Senden – bitte Admin kontaktieren.');return;}
      if(type==='unimportant') alert('✅ Meldung gesendet. Admin prüft die Anfrage.');
      else alert('✅ Anfrage gesendet. Admin prüft deine Antwort.');
    }).catch(function(){alert('⚠️ Verbindungsfehler beim Senden.');});
  }

  function handleQuizAnswer(opt){
    if(quizChosen) return;
    setQuizChosen(opt);
    var correct=normWordKey(opt.word)===normWordKey(current.word);
    setSesAns(function(n){return n+1;}); if(correct) setSesCor(function(n){return n+1;}); trackActiveTime();
    var newData=JSON.parse(JSON.stringify(data));
    var reqStreak=((streak.upThresholds||DEFAULT_STREAK.upThresholds)[1])||2;
    var potArr=(newData.pots[1]||[]);
    var wIdx=potArr.findIndex(function(w){return normWordKey(w.word)===normWordKey(current.word);});
    if(wIdx<0)wIdx=potArr.findIndex(function(w){return w.word===current.word;});
    var wObj=wIdx>=0?potArr.splice(wIdx,1)[0]:{word:current.word,clue:current.clue,streak:0};
    var newStreak=correct?(wObj.streak||0)+1:0;
    var moveTo=1;
    if(correct&&newStreak>=reqStreak){
      // Höchstens eine Stufe pro Tag — sonst ist „gelernt" nur ein guter Nachmittag.
      if(canPromote(wObj)){ moveTo=2; newStreak=0; markPromoted(wObj); }
      else newStreak=reqStreak;   // hält die Stufe: morgen reicht eine richtige Antwort
    }
    wObj.streak=newStreak; wObj.correct=(wObj.correct||0)+(correct?1:0); wObj.wrong=(wObj.wrong||0)+(!correct?1:0);
    trackPot(wObj,1,correct);
    if(!newData.pots[moveTo])newData.pots[moveTo]=[];
    newData.pots[moveTo].push(wObj);
    if(correct)newData.totalCorrect=(newData.totalCorrect||0)+1;
    else newData.totalWrong=(newData.totalWrong||0)+1;
    tallyAnswer(correct, false, CREDIT.pot1);
    lsLogAnswer(newData,{word:current.word,clue:current.clue,correct:correct,fromPot:1,toPot:moveTo,
      pctBefore:lsPercent(data), pctAfter:lsPercent(newData), rt:answerMs(), wObj:wObj});
    logWordEvent(player&&player.id, 'leiterspiel', run.id, current.word, current.clue, correct, moveTo);
    saveAndUpdate(newData);
    var pts=correct?10:0;
    if(pts>0&&onUpdateScore)onUpdateScore(pts);
    var log={word:current.word,clue:current.clue,typed:opt.word,correct:correct,partial:false,fromPot:1,toPot:moveTo,pts:pts};
    setSessionLog(function(l){return l.concat([log]);});
    if(correct&&moveTo===6)setCelebration('🏆 "'+current.word+'" gelernt!');
    setTimeout(function(){
      setResult({correct:correct,word:current.word,clue:current.clue,answer:current.word,typed:opt.word,fromPot:1,toPot:moveTo,pts:pts,newStreak:newStreak,reqStreak:reqStreak});
      setPhase('showResult');
    }, correct?800:1500);
  }

  // „Nicht gewusst" in Topf 1 (Multiple Choice): zählt als falsche Antwort,
  // das Wort bleibt in Topf 1 und der Streak wird zurückgesetzt.
  function skipQuiz(){
    if(!current || quizChosen) return;
    setQuizChosen({word:''});
    var rt = answerMs();
    setSesAns(function(n){return n+1;}); trackActiveTime();
    var newData = JSON.parse(JSON.stringify(data));
    var potArr = (newData.pots[1]||[]);
    var wIdx = potArr.findIndex(function(w){ return normWordKey(w.word)===normWordKey(current.word); });
    var wObj = wIdx>=0 ? potArr.splice(wIdx,1)[0] : {word:current.word,clue:current.clue,streak:0};
    wObj.streak = 0;
    wObj.wrong = (wObj.wrong||0)+1;
    trackPot(wObj,1,false);
    if(!newData.pots[1]) newData.pots[1]=[];
    newData.pots[1].push(wObj);
    newData.totalWrong = (newData.totalWrong||0)+1;
    tallyAnswer(false, true);
    lsLogAnswer(newData,{word:current.word,clue:current.clue,correct:false,fromPot:1,toPot:1,
      pctBefore:lsPercent(data), pctAfter:lsPercent(newData), rt:rt, wObj:wObj, skipped:true});
    logWordEvent(player&&player.id, 'leiterspiel', run.id, current.word, current.clue, false, 1);
    saveAndUpdate(newData);
    setSessionLog(function(l){return l.concat([{word:current.word,clue:current.clue,typed:'',correct:false,partial:false,skipped:true,fromPot:1,toPot:1,pts:0}]);});
    setStreakCount(0);
    setResult({skipped:true,correct:false,word:current.word,clue:current.clue,answer:current.word,typed:'',fromPot:1,toPot:1,pts:0});
    setPhase('showResult');
  }

  // Eine getippte Antwort verbuchen. `skipped` = „Nicht gewusst": zählt wie
  // eine falsche Antwort (das ist es ja auch) und wird zusätzlich als
  // übersprungen vermerkt — vorher verschwanden genau diese Wörter spurlos.
  function submitAnswer(skipped){
    if(!current) return;
    var rt = answerMs();
    var typed = skipped ? '' : input.trim();
    var fromPot = current.pot;
    var isPot5 = fromPot === 5;
    var correctAnswer = isPot5 ? current.clue : wordDisplay(current);
    var status = skipped ? 'wrong' : checkAnswer(typed, correctAnswer);
    var correct = status==='correct'||status==='partial';
    setSesAns(function(n){return n+1;}); if(correct) setSesCor(function(n){return n+1;}); trackActiveTime();
    var newData = JSON.parse(JSON.stringify(data));
    var reqStreak = ((streak.upThresholds||DEFAULT_STREAK.upThresholds)[fromPot])||2;
    var potArr = (newData.pots[fromPot]||[]);
    var wIdx = potArr.findIndex(function(w){ return normWordKey(w.word)===normWordKey(current.word); });
    if(wIdx<0) wIdx = potArr.findIndex(function(w){ return w.word===current.word; });
    var wObj = wIdx>=0 ? potArr[wIdx] : {word:current.word,clue:current.clue,streak:0};
    if(wIdx>=0) potArr.splice(wIdx,1);
    var newStreak = correct ? (wObj.streak||0)+1 : 0;
    var moveTo = fromPot;
    if(correct && newStreak>=reqStreak){
      // Höchstens eine Stufe pro Tag — sonst ist „gelernt" nur ein guter Nachmittag.
      if(canPromote(wObj)){
        moveTo = fromPot<(streak.pots||6) ? fromPot+1 : fromPot;
        newStreak = 0; markPromoted(wObj);
      } else newStreak = reqStreak;   // hält die Stufe: morgen reicht eine richtige Antwort
    } else if(!correct && fromPot>1){
      moveTo = fromPot-1; newStreak=0;
    }
    wObj.streak = newStreak;
    wObj.correct = (wObj.correct||0) + (correct?1:0);
    wObj.wrong = (wObj.wrong||0) + (!correct?1:0);
    trackPot(wObj,fromPot,correct);
    if(!(newData.pots[moveTo])) newData.pots[moveTo]=[];
    newData.pots[moveTo].push(wObj);
    if(correct) newData.totalCorrect=(newData.totalCorrect||0)+1;
    else newData.totalWrong=(newData.totalWrong||0)+1;
    tallyAnswer(correct, !!skipped, potCredit(fromPot));
    lsLogAnswer(newData,{word:current.word,clue:current.clue,correct:correct,fromPot:fromPot,toPot:moveTo,
      pctBefore:lsPercent(data), pctAfter:lsPercent(newData), rt:rt, wObj:wObj, skipped:!!skipped});
    logWordEvent(player&&player.id, 'leiterspiel', run.id, current.word, current.clue, correct, moveTo);
    saveAndUpdate(newData);

    var pts = correct ? (fromPot*5+(status==='partial'?1:0)) : 0;
    if(pts>0 && onUpdateScore) onUpdateScore(pts);

    var newSc = correct ? streakCount+1 : 0;
    setStreakCount(newSc);
    var log = {word:current.word,clue:current.clue,typed:typed,correct:correct,partial:status==='partial',skipped:!!skipped,fromPot:fromPot,toPot:moveTo,pts:pts};
    setSessionLog(function(l){return l.concat([log]);});
    setResult({correct:correct,partial:status==='partial',skipped:!!skipped,answer:correctAnswer,word:current.word,clue:current.clue,typed:typed,fromPot:fromPot,toPot:moveTo,pts:pts,newStreak:newStreak,reqStreak:reqStreak});
    setPhase('showResult');
    if(correct && moveTo===6 && fromPot!==6) setCelebration('🏆 "'+current.word+'" gelernt!');
  }

  // Die Lösung der aktuellen Frage — im Abschreib-Schritt sichtbar und das,
  // was eingegeben werden muss.
  function loesung(){
    if(!current) return '';
    return current.pot===5 ? current.clue : wordDisplay(current);
  }

  // „Nicht gewusst" drücken. Solange Überspringer übrig sind, geht es wie
  // bisher direkt weiter; danach kommt der Abschreib-Schritt.
  function requestSkip(){
    if(!current || copyMode) return;
    if(skipsLeft > 0){
      setSkipsLeft(function(n){ return n-1; });
      if(phase==='quiz') skipQuiz(); else submitAnswer(true);
      return;
    }
    setCopyHint(false); setInput(''); setCopyMode(true);
  }

  // Abschreiben abgeschlossen → wird wie ein Überspringer verbucht.
  function finishCopy(){
    if(!copyMode) return;
    setCopyMode(false); setCopyHint(false);
    if(phase==='quiz') skipQuiz(); else submitAnswer(true);
  }

  function submitCopy(){
    var st = checkAnswer(input.trim(), loesung());
    if(st==='correct'||st==='partial') finishCopy();
    else setCopyHint(true);
  }

  // Ein Klick auf ✓ / Enter: im Abschreib-Schritt gegen die Lösung prüfen,
  // sonst die normale Antwort werten.
  function submitTyped(){ if(copyMode) submitCopy(); else submitAnswer(false); }

  function copyBox(anleitung){
    if(!copyMode) return null;
    return <div style={{background:'#fef3c7',border:'2px solid #fcd34d',borderRadius:12,padding:'10px 12px',marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:'bold',color:'#92400e',marginBottom:3}}>Keine Überspringer mehr übrig</div>
      <div style={{fontSize:11,color:'#92400e',marginBottom:6}}>{anleitung}</div>
      <div style={{fontSize:20,fontWeight:'bold',color:G900,textAlign:'center'}}>{loesung()}</div>
      {copyHint&&<div style={{fontSize:11,color:RE,marginTop:6,textAlign:'center'}}>Noch nicht gleich — Buchstabe für Buchstabe abschreiben.</div>}
    </div>;
  }

  function skipButton(extra){
    return <button onClick={requestSkip} disabled={copyMode||helpMode}
      style={BtnStyle(G100,G600,Object.assign({width:'100%',padding:'8px',fontSize:12,opacity:(copyMode||helpMode)?0.45:1},extra||{}))}>
      {skipsLeft>0 ? 'Überspringen / Nicht gewusst · noch '+skipsLeft : '🔤 Lösung zeigen & abschreiben'}
    </button>;
  }

  function findWordRef(d, pot, word){
    var arr = (d.pots[pot]||[]);
    var idx = arr.findIndex(function(w){ return normWordKey(w.word)===normWordKey(word); });
    if(idx<0) idx = arr.findIndex(function(w){ return w.word===word; });
    return idx>=0 ? arr[idx] : null;
  }

  function helpAvailable(){ return !!(current && HELP_FROM_POT[current.pot]) && !copyMode; }

  function startHelp(){
    if(!helpAvailable()) return;
    setInput(''); setCopyHint(false); setHelpMode(true);
  }

  // Mit der Hilfe richtig gelöst: zählt weder als Auf- noch als Abstieg, das
  // Wort bleibt exakt da, wo es war. Gutschrift und Punkte richten sich nach
  // dem leichteren Topf, nicht nach dem eigentlichen — das war ja der
  // erleichterte Weg.
  function submitHelped(){
    if(!current) return;
    var fromPot = current.pot;
    var helperPot = HELP_FROM_POT[fromPot];
    if(!helperPot) return;
    var rt = answerMs();
    setSesAns(function(n){return n+1;}); setSesCor(function(n){return n+1;}); trackActiveTime();
    var newData = JSON.parse(JSON.stringify(data));
    var wObj = findWordRef(newData, fromPot, current.word);
    tallyAnswer(true, false, potCredit(helperPot));
    lsLogAnswer(newData,{word:current.word,clue:current.clue,correct:true,fromPot:fromPot,toPot:fromPot,
      pctBefore:lsPercent(data), pctAfter:lsPercent(data), rt:rt, wObj:wObj, helped:true});
    logWordEvent(player&&player.id, 'leiterspiel', run.id, current.word, current.clue, true, fromPot);
    saveAndUpdate(newData);
    var pts = helperPot*5;
    if(pts>0 && onUpdateScore) onUpdateScore(pts);
    setSessionLog(function(l){return l.concat([{word:current.word,clue:current.clue,typed:wordDisplay(current),correct:true,partial:false,helped:true,fromPot:fromPot,toPot:fromPot,pts:pts}]);});
    setHelpMode(false);
    setResult({correct:true,helped:true,answer:wordDisplay(current),word:current.word,clue:current.clue,typed:wordDisplay(current),fromPot:fromPot,toPot:fromPot,pts:pts});
    setPhase('showResult');
  }

  // Auch mit Hilfe nicht geschafft: zählt wie ein normales „nicht gewusst" im
  // aktuellen Topf (Rückstufung, Zählung als Überspringer).
  function submitHelpFailed(){
    setHelpMode(false);
    submitAnswer(true);
  }

  // Getippte Antwort im Hilfe-Modus: das Ziel ist in Topf 4 und 5 gleich —
  // das Wort selbst (Topf 5 fragt sonst rückwärts, die Hilfe dreht das um).
  function submitHelpTyped(){
    if(!current) return;
    var status = checkAnswer(input.trim(), wordDisplay(current));
    if(status==='correct'||status==='partial') submitHelped();
    else submitHelpFailed();
  }

  function helpButton(extra){
    if(!helpAvailable()) return null;
    return <button onClick={startHelp} disabled={copyMode||helpMode}
      style={BtnStyle('#3b82f6','white',Object.assign({width:'100%',padding:'8px',fontSize:12,marginTop:6,opacity:(copyMode||helpMode)?0.45:1},extra||{}))}>
      🔽 Wie im Topf davor lösen
    </button>;
  }

  function dashBoxes(layout, inputVal){
    var ai=0; var typedNS=inputVal.replace(/\s+/g,'');
    return <div style={{display:'flex',gap:4,alignItems:'flex-end',justifyContent:'center',flexWrap:'wrap'}}>
      {layout.items.map(function(it,ci){
        if(it.type==='space') return <span key={'sp'+ci} style={{width:12,display:'inline-block'}}/>;
        if(it.type==='static') return <span key={'st'+ci} style={{fontSize:13,color:G600,fontStyle:'italic',padding:'0 4px',whiteSpace:'nowrap',alignSelf:'center'}}>{it.text}</span>;
        var letter=typedNS[ai]||''; ai++;
        return <div key={'sl'+ci} style={{width:24,textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
          <span style={{fontSize:16,fontWeight:'bold',color:T,minHeight:22,lineHeight:'22px'}}>{letter}</span>
          <div style={{width:24,height:3,background:letter?T:G400,borderRadius:1}}/>
        </div>;
      })}
    </div>;
  }

  function nextWord(){
    setResult(null); setCelebration(null);
    setCopyMode(false); setCopyHint(false); setHelpMode(false);
    var allDone = (data.pots[6]||[]).length >= Object.values(data.pots).reduce(function(s,a){return s+a.length;},0);
    if(allDone){ setPhase('done'); return; }
    pickWord();
  }

  // Notenschlüssel für 10 Vokabeln: 0F→1, 1F→2, 2F→3, 3-4F→4, 5-6F→5, 7+F→6
  function testGradeFor(errors){
    if(errors<=0) return 1;
    if(errors<=1) return 2;
    if(errors<=2) return 3;
    if(errors<=4) return 4;
    if(errors<=6) return 5;
    return 6;
  }
  // Gewichtete Auswahl aus Vokabeln + zugewiesenen Sätzen. Pro Netto-Falsch-Antwort +20% Gewicht.
  function pickTestItems(d, sentences, count){
    var pool = [];
    [1,2,3,4,5,6].forEach(function(pot){
      (d.pots[pot]||[]).forEach(function(w){
        pool.push({item:Object.assign({},w,{pot:pot,kind:'word'}), weight:1+0.2*Math.max(0,(w.wrong||0)-(w.correct||0))});
      });
    });
    (sentences||[]).forEach(function(s){
      pool.push({item:Object.assign({},s,{kind:'sentence'}), weight:1});
    });
    var n = Math.min(count, pool.length);
    var picked = [];
    for(var i=0;i<n;i++){
      var totalW = pool.reduce(function(s,x){return s+x.weight;},0);
      var r = Math.random()*totalW, cum = 0, selIdx = 0;
      for(var j=0;j<pool.length;j++){
        cum += pool[j].weight;
        if(cum >= r){ selIdx = j; break; }
      }
      picked.push(pool[selIdx].item);
      pool.splice(selIdx,1);
    }
    return picked;
  }
  function startTest(){
    var sents = collectRunSentences(data, chapters);
    var picked = pickTestItems(data, sents, 10);
    if(picked.length===0){ alert('Keine Vokabeln im Run.'); return; }
    if(!sesStart) setSesStart(Date.now());
    setTestWords(picked); setTestIdx(0); setTestLog([]);
    setInput(''); setResult(null); setCurrent(picked[0]);
    qShownAt.current = Date.now();
    setPhase('test_q');
  }
  function testItemPrompt(it){ return it.kind==='sentence' ? it.translation : it.clue; }
  function testItemAnswer(it){ return it.kind==='sentence' ? it.text : wordDisplay(it); }
  function testItemDisplayWord(it){ return it.kind==='sentence' ? it.text : it.word; }
  function submitTestAnswer(){
    var w = testWords[testIdx]; if(!w) return;
    var typed = input.trim();
    var correctAnswer = testItemAnswer(w);
    var status = checkAnswer(typed, correctAnswer);
    var correct = status==='correct'||status==='partial';
    setSesAns(function(n){return n+1;}); if(correct) setSesCor(function(n){return n+1;}); trackActiveTime();
    tallyAnswer(correct, false, CREDIT.typed);
    var entry = {kind:w.kind, word:testItemDisplayWord(w), clue:testItemPrompt(w), typed:typed, correct:correct, partial:status==='partial', skipped:false, wordRef:w.wordRef||null, rt:answerMs()};
    setTestLog(function(l){return l.concat([entry]);});
    setResult({correct:correct,partial:status==='partial',answer:correctAnswer,word:entry.word,clue:entry.clue,typed:typed,skipped:false,kind:w.kind});
    setPhase('test_show');
  }
  function skipTestAnswer(){
    var w = testWords[testIdx]; if(!w) return;
    setSesAns(function(n){return n+1;}); trackActiveTime();
    tallyAnswer(false, true);
    var entry = {kind:w.kind, word:testItemDisplayWord(w), clue:testItemPrompt(w), typed:'', correct:false, partial:false, skipped:true, wordRef:w.wordRef||null, rt:answerMs()};
    setTestLog(function(l){return l.concat([entry]);});
    setResult({skipped:true,correct:false,answer:testItemAnswer(w),word:entry.word,clue:entry.clue,typed:'',kind:w.kind});
    setPhase('test_show');
  }
  function finalizeTest(finalLog){
    var tCorr = finalLog.filter(function(l){return l.correct;}).length;
    var tErr = finalLog.length - tCorr;
    var tGrade = testGradeFor(tErr);
    var entry = {ts:Date.now(), date:dayKey(), total:finalLog.length, correct:tCorr, errors:tErr, grade:tGrade, items:finalLog};
    var nd = JSON.parse(JSON.stringify(data));
    if(!Array.isArray(nd.tests)) nd.tests = [];
    nd.tests.push(entry);
    if(nd.tests.length>30) nd.tests = nd.tests.slice(-30);
    // Test-Antworten zählen im Tages-Log mit (Töpfe ändern sie nicht).
    var pctNow = lsPercent(nd);
    finalLog.forEach(function(l){
      if(l.kind==='sentence') return;
      // Wort-Objekt im Topf suchen, damit „zuletzt gefragt/gekonnt" auch nach
      // einem Test stimmt und der Abstand richtig gemessen wird.
      var wObj = null, wPot = null;
      [1,2,3,4,5,6].forEach(function(p){
        if(wObj) return;
        var found = (nd.pots[p]||[]).find(function(x){ return normWordKey(x.word)===normWordKey(l.word); }) || null;
        if(found){ wObj = found; wPot = p; }
      });
      lsLogAnswer(nd,{word:l.word, clue:l.clue, correct:!!l.correct, fromPot:null, toPot:null,
        pctBefore:pctNow, pctAfter:pctNow, rt:l.rt, wObj:wObj, skipped:!!l.skipped});
      logWordEvent(player&&player.id, 'leiterspiel_test', run.id, l.word, l.clue, !!l.correct, wPot);
    });
    saveAndUpdate(nd);
  }
  function nextTestQuestion(){
    setResult(null); setInput('');
    var nextI = testIdx + 1;
    if(nextI >= testWords.length){
      finalizeTest(testLog);
      setPhase('test_done');
      return;
    }
    setTestIdx(nextI); setCurrent(testWords[nextI]); qShownAt.current = Date.now(); setPhase('test_q');
  }
  function exitTest(){
    setTestWords([]); setTestIdx(0); setTestLog([]);
    setInput(''); setResult(null); setCurrent(null); setPhase('pick');
  }

  if(dataLoading||!data) return <div style={{textAlign:'center',padding:40,color:G400}}>Lade Fortschritt…</div>;

  var livePct = lsPercent(data, streak);
  var liveLearned = (data.pots[6]||[]).length;
  var liveTotal = Object.values(data.pots).reduce(function(s,a){return s+a.length;},0);
  var liveChip = (phase!=='pick' && phase!=='done') ? <div style={{position:'fixed',top:6,right:6,zIndex:9999,background:'rgba(15,118,110,0.95)',color:'white',padding:'5px 10px',borderRadius:18,fontSize:11,fontWeight:'bold',boxShadow:'0 2px 6px rgba(0,0,0,0.2)',display:'flex',alignItems:'center',gap:6,backdropFilter:'blur(4px)'}}>
    <span>{livePct}%</span>
    <span style={{opacity:0.7,fontWeight:'normal'}}>·</span>
    <span style={{opacity:0.85}}>✅ {liveLearned}/{liveTotal}</span>
  </div> : null;

  if(phase==='pick'){
    var pct = lsPercent(data, streak);
    var grade = lsGrade(pct, streak);
    var totalWords = Object.values(data.pots).reduce(function(s,a){return s+a.length;},0);
    var learned = (data.pots[5]||[]).length + (data.pots[6]||[]).length;
    return(
      <div style={{padding:8}}>
        <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',borderRadius:16,padding:20,color:'white',textAlign:'center',marginBottom:12}}>
          <div style={{fontSize:32,marginBottom:6}}>{run.icon||'🎯'} {run.name}</div>
          <div style={{display:'flex',gap:16,justifyContent:'center',marginBottom:10}}>
            <div><div style={{fontSize:24,fontWeight:'bold'}}>{pct}%</div><div style={{fontSize:10,opacity:.8}}>Fortschritt</div></div>
            <div><div style={{fontSize:24,fontWeight:'bold'}}>{learned}/{totalWords}</div><div style={{fontSize:10,opacity:.8}}>Gelernt</div></div>
            <div><div style={{fontSize:24,fontWeight:'bold'}}>{grade}</div><div style={{fontSize:10,opacity:.8}}>Note</div></div>
          </div>
          <div style={{height:6,background:'rgba(255,255,255,.3)',borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',width:pct+'%',background:'white',borderRadius:3}}/>
          </div>
        </div>
        <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',justifyContent:'center'}}>
          {[1,2,3,4,5].map(function(p){
            var cnt = (data.pots[p]||[]).length;
            return <div key={p} style={{textAlign:'center',padding:'8px 10px',borderRadius:10,background:POT_COL[p]+'18',border:'2px solid '+POT_COL[p]+'44',minWidth:52}}>
              <div style={{fontSize:18}}>{POT_ICON[p]}</div>
              <div style={{fontSize:17,fontWeight:'bold',color:POT_COL[p]}}>{cnt}</div>
              <div style={{fontSize:9,color:G400}}>{POT_LABEL[p]}</div>
            </div>;
          })}
          {learned>0&&<div style={{textAlign:'center',padding:'8px 10px',borderRadius:10,background:GR+'18',border:'2px solid '+GR+'44',minWidth:52}}>
            <div style={{fontSize:18}}>{POT_ICON[6]}</div>
            <div style={{fontSize:17,fontWeight:'bold',color:GR}}>{learned}</div>
            <div style={{fontSize:9,color:G400}}>Gelernt</div>
          </div>}
        </div>
        {(function(){
          var pct = lsPercent(data, streak);
          var spentSec = (data.sessions||[]).reduce(function(s,sess){return s+(sess.dur||0);},0) + (sesStart?Math.round((Date.now()-sesStart)/1000):0);
          var pacing = lsRunPacing(pct, run.target_pct, run.target_date, spentSec);
          var soll = pacing && pacing.requiredMinPerDay;
          return <LernVerlaufChart sessions={data.sessions||[]} todayExtraSec={sesStart?Math.round((Date.now()-sesStart)/1000):0} requiredMinPerDay={soll} targetDate={run.target_date}/>;
        })()}
        <button onClick={pickWord} style={BtnStyle(T,'white',{width:'100%',padding:'14px',fontSize:16,marginBottom:8})}>▶ Lernen starten</button>
        <button onClick={startTest} disabled={totalWords===0} style={BtnStyle('#a855f7','white',{width:'100%',padding:'14px',fontSize:16,marginBottom:8,opacity:totalWords===0?0.5:1})}>📝 Test starten (10 Vokabeln)</button>
        <button onClick={function(){if(!sesStart) setSesStart(Date.now()); setPhase('satzmeister');}} disabled={totalWords===0} style={BtnStyle('#0ea5e9','white',{width:'100%',padding:'14px',fontSize:16,marginBottom:8,opacity:totalWords===0?0.5:1})}>✍️ Satzmeister</button>
        <button onClick={function(){if(!sesStart) setSesStart(Date.now()); setPhase('satzquiz');}} disabled={totalWords===0} style={BtnStyle('#f97316','white',{width:'100%',padding:'14px',fontSize:16,marginBottom:8,opacity:totalWords===0?0.5:1})}>🔤 Satzquiz</button>
        {Array.isArray(data.tests)&&data.tests.length>0&&(function(){
          var len = data.tests.length;
          var recent = data.tests.slice(-10).reverse();
          return <div style={{marginBottom:8,padding:'10px 12px',background:'white',borderRadius:12,border:'2px solid #e9d5ff'}}>
            <div style={{fontSize:11,fontWeight:'bold',color:'#7c3aed',marginBottom:6,letterSpacing:1,textTransform:'uppercase'}}>📝 Test-Historie</div>
            {recent.map(function(t,i){
              var realIdx = len-1-i;
              var isOpen = expandedTestIdx===realIdx;
              var gColor = t.grade<=2?'#059669':t.grade<=4?'#7c3aed':'#dc2626';
              var wrongs = (t.items||[]).filter(function(it){return !it.correct;}).length;
              return <div key={realIdx} style={{borderBottom:i<recent.length-1?'1px solid '+G100:'none'}}>
                <div onClick={function(){setExpandedTestIdx(isOpen?null:realIdx);}}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'6px 2px',cursor:'pointer',fontSize:12}}>
                  <span style={{fontSize:18,fontWeight:'bold',color:gColor,minWidth:20,textAlign:'center'}}>{t.grade}</span>
                  <span style={{fontSize:11,color:G900,flex:1}}>{t.correct}/{t.total} richtig{wrongs>0?' · '+wrongs+' Fehler':''}</span>
                  <span style={{fontSize:10,color:G400,fontFamily:'monospace'}}>{fmtTestStamp(t)}</span>
                  <span style={{fontSize:10,color:G400,minWidth:12,textAlign:'right'}}>{isOpen?'▲':'▼'}</span>
                </div>
                {isOpen&&<div style={{padding:'2px 0 8px'}}>
                  {(t.items||[]).map(function(it,j){
                    var bg = it.correct?'#d1fae5':it.skipped?G50:'#fee2e2';
                    var icon = it.correct?'✓':it.skipped?'⏭':'✗';
                    if(it.kind==='sentence'){
                      return <div key={j} style={{padding:'5px 8px',marginBottom:3,borderRadius:6,background:bg,fontSize:11}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                          <span>{icon}</span>
                          <span style={{fontSize:8,padding:'1px 5px',borderRadius:6,background:'#a855f7',color:'white',fontWeight:'bold'}}>💬 SATZ</span>
                          {it.wordRef&&<span style={{fontSize:9,color:G400,marginLeft:'auto'}}>{it.wordRef}</span>}
                        </div>
                        <div style={{fontWeight:'bold',color:G900}}>{it.word}</div>
                        <div style={{color:G600,fontSize:10,fontStyle:'italic'}}>{it.clue}</div>
                        {!it.correct&&!it.skipped&&it.typed&&<div style={{color:'#991b1b',fontSize:10,marginTop:2}}>Deine Antwort: <span style={{textDecoration:'line-through'}}>{it.typed}</span></div>}
                      </div>;
                    }
                    return <div key={j} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 8px',marginBottom:2,borderRadius:6,background:bg,fontSize:11}}>
                      <span>{icon}</span>
                      <span style={{fontWeight:'bold',color:G900,minWidth:0}}>{it.word}</span>
                      <span style={{color:G600,fontSize:10}}>{it.clue}</span>
                      {!it.correct&&!it.skipped&&it.typed&&<span style={{marginLeft:'auto',color:'#991b1b',fontSize:10,textDecoration:'line-through'}}>{it.typed}</span>}
                    </div>;
                  })}
                </div>}
              </div>;
            })}
          </div>;
        })()}
        <button onClick={function(){var nd=saveSession(data);if(nd!==data){lsSaveProgress(player.id,run.id,nd);}onDone();}} style={BtnStyle(G100,G600,{width:'100%',padding:'10px',fontSize:13})}>← Zurück</button>
      </div>
    );
  }

  if(phase==='quiz'){
    return(
      <div style={{padding:8}}>
        {liveChip}
        {celebration&&<CelebrationPopup msg={celebration} onClose={function(){setCelebration(null);nextWord();}}/>}
        <div style={{textAlign:'center',padding:'16px',background:G50,borderRadius:14,marginBottom:12,border:'2px solid '+G200}}>
          <div style={{fontSize:10,color:G400,marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Topf 1 — Welche Übersetzung ist richtig?</div>
          <div style={{fontSize:22,fontWeight:'bold',color:G900}}>{current&&current.clue}</div>
        </div>
        {copyBox('Tippe die markierte Lösung an — zählt als „nicht gewusst".')}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
          {quizOptions.map(function(opt){
            var isCorrect=quizChosen&&normWordKey(opt.word)===normWordKey(current.word);
            var isChosen=quizChosen&&normWordKey(opt.word)===normWordKey(quizChosen.word);
            var istLoesung=copyMode&&normWordKey(opt.word)===normWordKey(current.word);
            var bg=quizChosen?(isCorrect?'#d1fae5':isChosen&&!isCorrect?'#fee2e2':G50):istLoesung?'#fef3c7':copyMode?G50:'white';
            var border=quizChosen?(isCorrect?GR:isChosen&&!isCorrect?RE:G200):istLoesung?'#f59e0b':G200;
            return <button key={opt.word} onClick={function(){ if(copyMode){ if(istLoesung) finishCopy(); return; } handleQuizAnswer(opt); }}
              disabled={!!quizChosen||(copyMode&&!istLoesung)}
              style={{padding:'13px 16px',borderRadius:10,border:'2px solid '+border,background:bg,
                textAlign:'left',fontSize:15,fontWeight:'bold',color:G900,cursor:quizChosen?'default':'pointer',touchAction:'manipulation',
                opacity:copyMode&&!istLoesung?0.5:1}}>
              {opt.word}
            </button>;
          })}
        </div>
        {skipButton()}
      </div>
    );
  }

  if(phase==='t2'){
    return(
      <div style={{padding:8}}>
        {liveChip}
        <div style={{textAlign:'center',padding:'18px 16px',background:'#eff6ff',borderRadius:14,marginBottom:12,border:'2px solid #93c5fd'}}>
          <div style={{fontSize:10,color:G400,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Topf 2 — Buchstaben sortieren</div>
          <div style={{fontSize:11,color:G600,marginBottom:6}}>Bedeutung: <strong>{current&&current.clue}</strong></div>
          <div style={{fontSize:10,color:G400}}>Tippe die Buchstaben in der richtigen Reihenfolge</div>
        </div>
        {copyBox('Lege die Lösung mit den Buchstaben — zählt als „nicht gewusst".')}
        {current&&<T2LetterField key={'t2_'+current.word} word={wordDisplay(current)} onCorrect={function(){
          if(copyMode){ finishCopy(); return; }
          var newData=JSON.parse(JSON.stringify(data));
          var potArr=(newData.pots[2]||[]);
          var wIdx=potArr.findIndex(function(w){return normWordKey(w.word)===normWordKey(current.word);});
          if(wIdx<0) wIdx=potArr.findIndex(function(w){return w.word===current.word;});
          var wObj=wIdx>=0?potArr.splice(wIdx,1)[0]:{word:current.word,clue:current.clue,streak:0};
          var reqStreak=(streak.upThresholds&&streak.upThresholds[2])||2;
          wObj.streak=(wObj.streak||0)+1;
          wObj.correct=(wObj.correct||0)+1;
          setSesAns(function(n){return n+1;}); setSesCor(function(n){return n+1;}); trackActiveTime();
          trackPot(wObj,2,true);
          var moveTo=2;
          if(wObj.streak>=reqStreak){
            // Höchstens eine Stufe pro Tag.
            if(canPromote(wObj)){ moveTo=3; wObj.streak=0; markPromoted(wObj); }
            else wObj.streak=reqStreak;
          }
          if(!newData.pots[moveTo])newData.pots[moveTo]=[];
          newData.pots[moveTo].push(wObj);
          newData.totalCorrect=(newData.totalCorrect||0)+1;
          tallyAnswer(true, false, CREDIT.pot2);
          lsLogAnswer(newData,{word:current.word,clue:current.clue,correct:true,fromPot:2,toPot:moveTo,
            pctBefore:lsPercent(data), pctAfter:lsPercent(newData), rt:answerMs(), wObj:wObj});
          logWordEvent(player&&player.id, 'leiterspiel', run.id, current.word, current.clue, true, moveTo);
          saveAndUpdate(newData);
          var pts=10;
          if(onUpdateScore)onUpdateScore(pts);
          setSessionLog(function(l){return l.concat([{word:current.word,clue:current.clue,typed:current.word,correct:true,partial:false,fromPot:2,toPot:moveTo,pts:pts}]);});
          if(moveTo===6)setCelebration('🏆 "'+current.word+'" gelernt!');
          setResult({correct:true,partial:false,answer:current.word,word:current.word,clue:current.clue,typed:current.word,fromPot:2,toPot:moveTo,pts:pts,newStreak:wObj.streak,reqStreak:reqStreak});
          setPhase('showResult');
        }} onWrong={function(typed){
          var newData=JSON.parse(JSON.stringify(data));
          var potArr=(newData.pots[2]||[]);
          var wIdx=potArr.findIndex(function(w){return normWordKey(w.word)===normWordKey(current.word);});
          if(wIdx<0) wIdx=potArr.findIndex(function(w){return w.word===current.word;});
          var wObj=wIdx>=0?potArr.splice(wIdx,1)[0]:{word:current.word,clue:current.clue,streak:0};
          wObj.streak=0;
          wObj.wrong=(wObj.wrong||0)+1;
          setSesAns(function(n){return n+1;}); trackActiveTime();
          trackPot(wObj,2,false);
          if(!newData.pots[1])newData.pots[1]=[];
          newData.pots[1].push(wObj);
          newData.totalWrong=(newData.totalWrong||0)+1;
          tallyAnswer(false);
          lsLogAnswer(newData,{word:current.word,clue:current.clue,correct:false,fromPot:2,toPot:1,
            pctBefore:lsPercent(data), pctAfter:lsPercent(newData), rt:answerMs(), wObj:wObj});
          logWordEvent(player&&player.id, 'leiterspiel', run.id, current.word, current.clue, false, 1);
          saveAndUpdate(newData);
          setSessionLog(function(l){return l.concat([{word:current.word,clue:current.clue,typed:typed,correct:false,partial:false,fromPot:2,toPot:1,pts:0}]);});
          setResult({correct:false,partial:false,answer:current.word,word:current.word,clue:current.clue,typed:typed,fromPot:2,toPot:1,pts:0});
          setPhase('showResult');
        }}/>}
        {skipButton({marginTop:10})}
      </div>
    );
  }

  if(phase==='dashes'){
    if(helpMode) return(
      <div style={{padding:8}}>
        {liveChip}
        <div style={{textAlign:'center',padding:'18px 16px',background:'#eff6ff',borderRadius:14,marginBottom:12,border:'2px solid #93c5fd'}}>
          <div style={{fontSize:10,color:G400,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>🔽 Hilfe wie in Topf 2 — Buchstaben sortieren</div>
          <div style={{fontSize:11,color:G600,marginBottom:6}}>Bedeutung: <strong>{current&&current.clue}</strong></div>
          <div style={{fontSize:10,color:G400}}>Tippe die Buchstaben in der richtigen Reihenfolge</div>
        </div>
        {current&&<T2LetterField key={'help3_'+current.word} word={wordDisplay(current)} onCorrect={submitHelped} onWrong={submitHelpFailed}/>}
        <div style={{fontSize:11,color:G400,textAlign:'center',marginTop:8}}>Richtig gelöst bleibt die Vokabel in Topf 3.</div>
      </div>
    );
    var dashLayout = buildT2Layout(wordDisplay(current));
    var dashLetterCount = dashLayout.targetNoSpaces.length;
    return(
      <div style={{padding:8}}>
        {liveChip}
        {celebration&&<CelebrationPopup msg={celebration} onClose={function(){setCelebration(null);nextWord();}}/>}
        <div style={{textAlign:'center',padding:'18px 16px',background:'#f0fdf4',borderRadius:14,marginBottom:12,border:'2px solid #86efac'}}>
          <div style={{fontSize:10,color:G400,marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Topf 3 — Wie heißt das auf Englisch?</div>
          <div style={{fontSize:22,fontWeight:'bold',color:G900,marginBottom:10}}>{current&&current.clue}</div>
          {dashBoxes(dashLayout, input)}
          <div style={{fontSize:11,color:G400,marginTop:6}}>{dashLetterCount} Buchstaben</div>
        </div>
        {copyBox('Schreib die Lösung einmal ab — dann geht es weiter. Zählt als „nicht gewusst".')}
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
            onKeyDown={function(e){if(e.key==='Enter')submitTyped();}}
            autoCapitalize='none' autoCorrect='off' autoComplete='off' spellCheck='false'
            placeholder={copyMode?'Lösung abschreiben…':('Englisch ('+dashLetterCount+' Buchstaben)…')}
            style={{flex:1,padding:'12px 14px',fontSize:16,border:'2px solid '+(copyMode?'#f59e0b':T),borderRadius:10,outline:'none'}}/>
          <button onClick={submitTyped} style={BtnStyle(copyMode?'#f59e0b':T,'white',{padding:'12px 16px',fontSize:15})}>✓</button>
        </div>
        {skipButton()}
        {helpButton()}
      </div>
    );
  }

  if(phase==='showResult'||phase==='answer'){
    if(phase==='answer' && helpMode){
      var helperPot = HELP_FROM_POT[current.pot];
      var showDashHint = helperPot===3;
      var hLayout = showDashHint ? buildT2Layout(wordDisplay(current)) : null;
      var hLetterCount = hLayout ? hLayout.targetNoSpaces.length : null;
      return(
        <div style={{padding:8}}>
          {liveChip}
          <div style={{textAlign:'center',padding:'18px 16px',background:'#eff6ff',borderRadius:14,marginBottom:12,border:'2px solid #93c5fd'}}>
            <div style={{fontSize:10,color:G400,marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>🔽 Hilfe wie in Topf {helperPot} — Wie heißt das auf Englisch?</div>
            <div style={{fontSize:22,fontWeight:'bold',color:G900,marginBottom:showDashHint?10:4}}>{current&&current.clue}</div>
            {showDashHint && dashBoxes(hLayout, input)}
            {showDashHint && <div style={{fontSize:11,color:G400,marginTop:6}}>{hLetterCount} Buchstaben</div>}
          </div>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
              onKeyDown={function(e){if(e.key==='Enter')submitHelpTyped();}}
              autoCapitalize='none' autoCorrect='off' autoComplete='off' spellCheck='false'
              placeholder={showDashHint?('Englisch ('+hLetterCount+' Buchstaben)…'):'Englisch…'}
              style={{flex:1,padding:'12px 14px',fontSize:16,border:'2px solid #3b82f6',borderRadius:10,outline:'none'}}/>
            <button onClick={submitHelpTyped} style={BtnStyle('#3b82f6','white',{padding:'12px 16px',fontSize:15})}>✓</button>
          </div>
          <div style={{fontSize:11,color:G400,textAlign:'center'}}>Richtig gelöst bleibt die Vokabel in Topf {current.pot}.</div>
        </div>
      );
    }
    if(phase==='answer') return(
      <div style={{padding:8}}>
        {liveChip}
        {celebration&&<CelebrationPopup msg={celebration} onClose={function(){setCelebration(null);nextWord();}}/>}
        <div style={{textAlign:'center',padding:'18px 16px',background:G50,borderRadius:14,marginBottom:12,border:'2px solid '+G200}}>
          <div style={{fontSize:10,color:G400,marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Topf {current&&current.pot} — {current&&current.pot===5?'Wie heißt das auf Deutsch?':'Wie heißt das auf Englisch?'}</div>
          <div style={{fontSize:24,fontWeight:'bold',color:G900,marginBottom:4}}>{current&&(current.pot===5?current.word:current.clue)}</div>
        </div>
        {copyBox('Schreib die Lösung einmal ab — dann geht es weiter. Zählt als „nicht gewusst".')}
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
            onKeyDown={function(e){if(e.key==='Enter')submitTyped();}}
            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck="false"
            placeholder={copyMode?'Lösung abschreiben…':(current&&current.pot===5?'Deutsch…':'Englisch…')}
            style={{flex:1,padding:'12px 14px',fontSize:16,border:'2px solid '+(copyMode?'#f59e0b':T),borderRadius:10,outline:'none'}}/>
          <button onClick={submitTyped} style={BtnStyle(copyMode?'#f59e0b':T,'white',{padding:'12px 16px',fontSize:15})}>✓</button>
        </div>
        {skipButton()}
        {helpButton()}
      </div>
    );
    return(
      <div style={{padding:8}}>
        {liveChip}
        {celebration&&<CelebrationPopup msg={celebration} onClose={function(){setCelebration(null);}}/>}
        {result&&(
          <div style={{padding:16,borderRadius:14,marginBottom:12,background:result.skipped?G50:result.helped?'#eff6ff':result.correct?'#d1fae5':'#fee2e2',border:'2px solid '+(result.skipped?G200:result.helped?'#93c5fd':result.correct?GR:RE)}}>
            <div style={{fontSize:18,fontWeight:'bold',color:result.skipped?G600:result.helped?'#1d4ed8':result.correct?'#065f46':'#991b1b',marginBottom:6}}>
              {result.skipped?'⏭ Übersprungen':result.helped?'🔽 Mit Hilfe gelöst':result.correct?'✓ Richtig'+(result.partial?' (fast)':''):'✗ Falsch'}
            </div>
            <div style={{fontSize:14,color:G900,marginBottom:4}}><span style={{fontWeight:'bold'}}>{result.word||result.answer}</span>{result.clue&&<span style={{color:G600,marginLeft:8,fontSize:12}}>({result.clue})</span>}</div>
            {!result.correct&&!result.skipped&&<div style={{fontSize:12,color:G400}}>Deine Antwort: {result.typed}</div>}
            {result.helped&&<div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
              <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:POT_COL[result.fromPot]+'22',color:POT_COL[result.fromPot],fontWeight:'bold'}}>{POT_ICON[result.fromPot]} bleibt {POT_LABEL[result.fromPot]}</span>
              {result.pts>0&&<span style={{marginLeft:'auto',fontSize:12,fontWeight:'bold',color:AM}}>+{result.pts} Pkt</span>}
            </div>}
            {!result.skipped&&!result.helped&&<div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
              <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:POT_COL[result.fromPot]+'22',color:POT_COL[result.fromPot],fontWeight:'bold'}}>{POT_ICON[result.fromPot]} {POT_LABEL[result.fromPot]}</span>
              <span style={{fontSize:12,color:G400}}>→</span>
              <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:POT_COL[result.toPot]+'22',color:POT_COL[result.toPot],fontWeight:'bold'}}>{POT_ICON[result.toPot]} {POT_LABEL[result.toPot]}</span>
              {result.pts>0&&<span style={{marginLeft:'auto',fontSize:12,fontWeight:'bold',color:AM}}>+{result.pts} Pkt</span>}
            </div>}
          </div>
        )}
        <button onClick={nextWord} style={BtnStyle(T,'white',{width:'100%',padding:'12px',fontSize:15,marginBottom:8})}>→ Weiter</button>
        <button onClick={function(){var nd=saveSession(data);if(nd!==data){saveAndUpdate(nd);}setPhase('pick');}} style={BtnStyle(G100,G600,{width:'100%',padding:'9px',fontSize:12})}>Pause / Menü</button>
        {result&&!result.correct&&!result.skipped&&<button onClick={function(){submitDispute('dispute');}} style={BtnStyle('#7c3aed','white',{width:'100%',padding:'8px',fontSize:11,marginTop:4})}>❓ Antwort anfechten</button>}
        <button onClick={function(){submitDispute('unimportant');}} style={BtnStyle(G100,G400,{width:'100%',padding:'8px',fontSize:11,marginTop:4})}>🔇 Als unwichtig melden</button>
      </div>
    );
  }

  if(phase==='test_q'){
    var tw = testWords[testIdx];
    var twIsSent = tw && tw.kind==='sentence';
    var testChip = <div style={{position:'fixed',top:6,right:6,zIndex:9999,background:'rgba(168,85,247,0.95)',color:'white',padding:'5px 10px',borderRadius:18,fontSize:11,fontWeight:'bold',boxShadow:'0 2px 6px rgba(0,0,0,0.2)'}}>📝 Test {testIdx+1}/{testWords.length}</div>;
    return(
      <div style={{padding:8}}>
        {testChip}
        <div style={{textAlign:'center',padding:'18px 16px',background:'#faf5ff',borderRadius:14,marginBottom:12,border:'2px solid #d8b4fe'}}>
          <div style={{fontSize:10,color:'#7c3aed',marginBottom:4,textTransform:'uppercase',letterSpacing:1,fontWeight:'bold'}}>{twIsSent?'Test — Übersetze ins Englische':'Test — Wie heißt das auf Englisch?'}</div>
          <div style={{fontSize:twIsSent?18:24,fontWeight:'bold',color:G900,lineHeight:1.3}}>{tw&&(twIsSent?tw.translation:tw.clue)}</div>
          {twIsSent&&<div style={{fontSize:10,color:G400,marginTop:6}}>💬 Beispielsatz · Vokabel: {tw.wordRef}</div>}
        </div>
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
            onKeyDown={function(e){if(e.key==='Enter')submitTestAnswer();}}
            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck="false"
            placeholder={twIsSent?'Englischer Satz…':'Englisch…'}
            style={{flex:1,padding:'12px 14px',fontSize:16,border:'2px solid #a855f7',borderRadius:10,outline:'none'}}/>
          <button onClick={submitTestAnswer} style={BtnStyle('#a855f7','white',{padding:'12px 16px',fontSize:15})}>✓</button>
        </div>
        <button onClick={skipTestAnswer} style={BtnStyle(G100,G600,{width:'100%',padding:'8px',fontSize:12})}>Überspringen / Nicht gewusst</button>
        <button onClick={function(){if(confirm('Test abbrechen? Der bisherige Fortschritt geht verloren.'))exitTest();}} style={BtnStyle(G100,G400,{width:'100%',padding:'7px',fontSize:11,marginTop:6})}>Abbrechen</button>
      </div>
    );
  }

  if(phase==='test_show'){
    var testChip2 = <div style={{position:'fixed',top:6,right:6,zIndex:9999,background:'rgba(168,85,247,0.95)',color:'white',padding:'5px 10px',borderRadius:18,fontSize:11,fontWeight:'bold',boxShadow:'0 2px 6px rgba(0,0,0,0.2)'}}>📝 Test {testIdx+1}/{testWords.length}</div>;
    var isLast = testIdx+1 >= testWords.length;
    return(
      <div style={{padding:8}}>
        {testChip2}
        {result&&(
          <div style={{padding:16,borderRadius:14,marginBottom:12,background:result.skipped?G50:result.correct?'#d1fae5':'#fee2e2',border:'2px solid '+(result.skipped?G200:result.correct?GR:RE)}}>
            <div style={{fontSize:18,fontWeight:'bold',color:result.skipped?G600:result.correct?'#065f46':'#991b1b',marginBottom:6}}>
              {result.skipped?'⏭ Übersprungen':result.correct?'✓ Richtig'+(result.partial?' (fast)':''):'✗ Falsch'}
            </div>
            <div style={{fontSize:14,color:G900,marginBottom:4}}><span style={{fontWeight:'bold'}}>{result.answer}</span>{result.clue&&<span style={{color:G600,marginLeft:8,fontSize:12}}>({result.clue})</span>}</div>
            {!result.correct&&!result.skipped&&<div style={{fontSize:12,color:G400}}>Deine Antwort: {result.typed}</div>}
          </div>
        )}
        <button onClick={nextTestQuestion} style={BtnStyle('#a855f7','white',{width:'100%',padding:'12px',fontSize:15})}>{isLast?'→ Auswertung':'→ Weiter'}</button>
      </div>
    );
  }

  if(phase==='test_done'){
    var tCorr = testLog.filter(function(l){return l.correct;}).length;
    var tErr = testLog.length - tCorr;
    var tGrade = testGradeFor(tErr);
    var tEmoji = tGrade<=2?'🏆':tGrade<=3?'👍':tGrade<=4?'📚':'😢';
    var tBg = tGrade<=2?'linear-gradient(135deg,#10b981,#065f46)':tGrade<=4?'linear-gradient(135deg,#a855f7,#6b21a8)':'linear-gradient(135deg,#dc2626,#7f1d1d)';
    return(
      <div style={{padding:8}}>
        <div style={{background:tBg,borderRadius:16,padding:24,color:'white',textAlign:'center',marginBottom:12}}>
          <div style={{fontSize:48,marginBottom:8}}>{tEmoji}</div>
          <div style={{fontSize:22,fontWeight:'bold',marginBottom:4}}>Test beendet</div>
          <div style={{fontSize:13,opacity:.85,marginBottom:12}}>{tCorr} richtig · {tErr} falsch · von {testLog.length}</div>
          <div style={{fontSize:64,fontWeight:'bold',lineHeight:1}}>{tGrade}</div>
          <div style={{fontSize:12,opacity:.85,marginTop:4}}>Note</div>
        </div>
        <div style={{marginBottom:12}}>
          {testLog.map(function(l,i){
            var bg = l.correct?'#d1fae5':l.skipped?G50:'#fee2e2';
            if(l.kind==='sentence'){
              return <div key={i} style={{padding:'8px 10px',marginBottom:4,borderRadius:8,background:bg,fontSize:12}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                  <span>{l.correct?'✓':l.skipped?'⏭':'✗'}</span>
                  <span style={{fontSize:9,padding:'1px 6px',borderRadius:8,background:'#a855f7',color:'white',fontWeight:'bold'}}>💬 SATZ</span>
                  <span style={{fontSize:10,color:G400,marginLeft:'auto'}}>{l.wordRef||''}</span>
                </div>
                <div style={{fontWeight:'bold'}}>{l.word}</div>
                <div style={{color:G400,fontSize:11,fontStyle:'italic'}}>{l.clue}</div>
              </div>;
            }
            return <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',marginBottom:4,borderRadius:8,background:bg,fontSize:12}}>
              <span>{l.correct?'✓':l.skipped?'⏭':'✗'}</span>
              <span style={{fontWeight:'bold',flex:1}}>{l.word}</span>
              <span style={{color:G400,fontSize:11}}>{l.clue}</span>
            </div>;
          })}
        </div>
        <button onClick={exitTest} style={BtnStyle('#a855f7','white',{width:'100%',padding:'12px'})}>← Zurück</button>
      </div>
    );
  }

  if(phase==='done'){
    var corr3=sessionLog.filter(function(l){return l.correct;}).length;
    var wrong3=sessionLog.filter(function(l){return !l.correct&&!l.skipped;}).length;
    var pct2=lsPercent(data);
    return(
      <div style={{padding:8}}>
        <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',borderRadius:16,padding:24,color:'white',textAlign:'center',marginBottom:12}}>
          <div style={{fontSize:40,marginBottom:8}}>{pct2>=80?'🏆':pct2>=60?'👍':'📚'}</div>
          <div style={{fontSize:22,fontWeight:'bold',marginBottom:4}}>Session beendet</div>
          <div style={{fontSize:14,opacity:.85}}>{corr3} richtig · {wrong3} falsch</div>
          <div style={{marginTop:8,fontSize:16,fontWeight:'bold'}}>{pct2}% Gesamtfortschritt</div>
        </div>
        {sessionLog.length>0&&<div style={{marginBottom:12}}>
          {sessionLog.slice(-10).map(function(l,i){
            return <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',marginBottom:3,borderRadius:7,background:l.helped?'#dbeafe':l.correct?'#d1fae5':l.skipped?G50:'#fee2e2',fontSize:11}}>
              <span>{l.helped?'🔽':l.correct?'✓':l.skipped?'⏭':'✗'}</span>
              <span style={{fontWeight:'bold',flex:1}}>{l.word}</span>
              <span style={{color:G400}}>{l.clue}</span>
              {l.pts>0&&<span style={{color:AM,fontWeight:'bold'}}>+{l.pts}</span>}
            </div>;
          })}
        </div>}
        <button onClick={function(){var nd=saveSession(data);if(nd!==data){lsSaveProgress(player.id,run.id,nd);}onDone();}} style={BtnStyle(T,'white',{width:'100%',padding:'12px'})}>← Zurück</button>
      </div>
    );
  }
  if(phase==='satzmeister'){
    var smW=(function(){
      var rw=[]; try{rw=typeof run.words==='string'?JSON.parse(run.words||'[]'):(run.words||[]);}catch(e){}
      if(rw.length>0) return rw;
      var w=[]; [1,2,3,4,5].forEach(function(p){(data.pots[p]||[]).forEach(function(ww){w.push(ww);});});
      return w;
    })();
    return <div>{liveChip}<SatzmeisterGame words={smW} runId={run.id} runName={run.name} player={player} onUpdateScore={onUpdateScore} onDone={function(){trackActiveTime();setPhase('pick');}}/></div>;
  }
  if(phase==='satzquiz'){
    var sqW=(function(){
      var rw=[]; try{rw=typeof run.words==='string'?JSON.parse(run.words||'[]'):(run.words||[]);}catch(e){}
      if(rw.length>0) return rw;
      var w=[]; [1,2,3,4,5].forEach(function(p){(data.pots[p]||[]).forEach(function(ww){w.push(ww);});});
      return w;
    })();
    return <div>{liveChip}<SatzquizGame words={sqW} runId={run.id} runName={run.name} player={player} onUpdateScore={onUpdateScore} onDone={function(){trackActiveTime();setPhase('pick');}}/></div>;
  }
  return null;
}

function SatzmeisterGame({ words, runId, runName, player, onUpdateScore, onDone }) {
  var [sentences, setSentences] = useState(null);
  var [loadErr, setLoadErr] = useState('');
  var [idx, setIdx] = useState(0);
  var [input, setInput] = useState('');
  var [hints, setHints] = useState(0);
  var [revealed, setRevealed] = useState([]);
  var [gPhase, setGPhase] = useState('q');
  var [lastOk, setLastOk] = useState(false);
  var [lastPts, setLastPts] = useState(0);
  var [lastSkip, setLastSkip] = useState(false);
  var [total, setTotal] = useState(0);
  var [regenKey, setRegenKey] = useState(0);
  var ref = useRef(null);

  useEffect(function(){
    setSentences(null); setLoadErr(''); setIdx(0); setTotal(0); setHints(0); setRevealed([]); setGPhase('q');
    function start(ws) {
      if(!ws||!ws.length){setLoadErr('Keine Vokabeln (v4, words='+JSON.stringify((words||[]).length)+', runId='+runId+')');setSentences([]);return;}
      generateSentences(ws, runName, regenKey>0).then(function(s){setSentences(s);})
        .catch(function(e){setLoadErr(e.message||'Fehler');setSentences([]);});
    }
    if(words&&words.length){start(words);return;}
    if(runId){
      sbGet('ls_runs','id=eq.'+runId+'&select=words').then(function(rows){
        var rw=[]; try{var raw=rows&&rows[0]&&rows[0].words;rw=typeof raw==='string'?JSON.parse(raw||'[]'):(raw||[]);}catch(e){}
        start(rw);
      }).catch(function(){start([]);});
    } else { start([]); }
  },[regenKey]);

  useEffect(function(){if(ref.current&&gPhase==='q')ref.current.focus();},[idx,gPhase]);

  if(!sentences) return <div style={{padding:40,textAlign:'center'}}><div style={{fontSize:28,marginBottom:8}}>🤖</div><div style={{fontSize:13,color:G400}}>Generiere Sätze…</div></div>;
  if(loadErr||!sentences.length) return <div style={{padding:20,textAlign:'center'}}><div style={{color:RE,fontSize:13,marginBottom:12}}>{loadErr||'Keine Sätze generiert.'}</div><button onClick={onDone} style={BtnStyle(G100,G600,{padding:'10px 24px'})}>← Zurück</button></div>;
  if(idx>=sentences.length) return <div style={{padding:24,textAlign:'center'}}><div style={{fontSize:48,marginBottom:8}}>🏆</div><div style={{fontSize:22,fontWeight:'bold',color:T,marginBottom:4}}>Satzmeister!</div><div style={{fontSize:16,color:G600,marginBottom:20}}>{total} Punkte</div><div style={{display:'flex',gap:8,justifyContent:'center'}}><button onClick={function(){setRegenKey(function(k){return k+1;});}} style={BtnStyle('#0ea5e9','white',{padding:'12px 20px',fontSize:14})}>↺ Neue Sätze</button><button onClick={onDone} style={BtnStyle(T,'white',{padding:'12px 20px',fontSize:14})}>← Zurück</button></div></div>;

  var sent = sentences[idx];
  var answer = (sent.answer||'').trim();
  var letters = answer.split('');
  var nonSpace = letters.reduce(function(a,l,i){if(!/\s/.test(l))a.push(i);return a;},[]);
  var parts = sent.sentence.split('___');

  function calcPts(){ return Math.max(0, 10-hints*2); }

  function makeDisplay(){
    if(hints===0) return null;
    return letters.map(function(l,i){
      if(/\s/.test(l)) return ' ';
      if(hints===1) return '_';
      if(i===0) return l;
      return revealed.indexOf(i)>=0?l:'_';
    }).join('');
  }

  function isAllRevealed(){
    if(hints<2) return false;
    return nonSpace.every(function(i){return i===0||revealed.indexOf(i)>=0;});
  }

  function addHint(){
    var nh=hints+1;
    if(nh>=3){
      var hidden=nonSpace.filter(function(i){return i>0&&revealed.indexOf(i)<0;});
      if(hidden.length>0){
        var pick=hidden[Math.floor(Math.random()*hidden.length)];
        setRevealed(function(r){return r.concat([pick]);});
      }
    }
    setHints(nh);
  }

  function submit(){
    var typed=input.trim(); if(!typed) return;
    var res=checkAnswer(typed,answer);
    var ok=res==='correct'||res==='partial';
    tallyAnswer(ok);
    logWordEvent(player&&player.id, 'satzmeister', runId, answer, sent.clue, ok, null);
    var pts=ok?calcPts():0;
    if(pts>0&&onUpdateScore) onUpdateScore(pts);
    setTotal(function(t){return t+pts;});
    setLastOk(ok); setLastPts(pts); setLastSkip(false); setGPhase('a');
  }

  function skip(){
    tallyAnswer(false, true);
    logWordEvent(player&&player.id, 'satzmeister', runId, answer, sent.clue, false, null);
    setLastOk(false); setLastPts(0); setLastSkip(true); setGPhase('a');
  }

  function next(){
    setIdx(function(i){return i+1;});
    setInput(''); setHints(0); setRevealed([]);
    setLastOk(false); setLastPts(0); setLastSkip(false); setGPhase('q');
  }

  var wordDisplay=makeDisplay();

  if(gPhase==='a') return(
    <div style={{padding:16}}>
      <div style={{fontSize:11,color:G400,marginBottom:12}}>Satz {idx+1} / {sentences.length}</div>
      <div style={{borderRadius:14,padding:16,marginBottom:12,background:lastSkip?G50:lastOk?'#d1fae5':'#fee2e2',border:'2px solid '+(lastSkip?G200:lastOk?GR:RE)}}>
        <div style={{fontSize:16,fontWeight:'bold',color:lastSkip?G600:lastOk?'#065f46':'#991b1b',marginBottom:6}}>
          {lastSkip?'⏭ Übersprungen':lastOk?'✓ Richtig':'✗ Falsch'}
          {lastPts>0&&<span style={{marginLeft:8,fontSize:14,color:AM}}>+{lastPts} Pkt</span>}
        </div>
        <div style={{fontSize:14,color:G900,lineHeight:1.6,marginBottom:4}}>
          {parts[0]||''}<strong style={{color:T}}>{answer}</strong>{parts[1]||''}
        </div>
        {!lastOk&&!lastSkip&&<div style={{fontSize:11,color:G400}}>Deine Antwort: {input||'–'}</div>}
        <div style={{fontSize:11,color:G400,marginTop:4}}>{sent.clue}</div>
      </div>
      <div style={{fontSize:12,color:G400,marginBottom:12,textAlign:'right'}}>Gesamt: {total} Pkt</div>
      <button onClick={next} style={BtnStyle(T,'white',{width:'100%',padding:'12px',fontSize:15})}>{idx+1>=sentences.length?'Fertig':'→ Weiter'}</button>
    </div>
  );

  return(
    <div style={{padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:11,color:G400}}>Satz {idx+1} / {sentences.length}</div>
        <div style={{fontSize:13,fontWeight:'bold',color:AM}}>{total} Pkt</div>
      </div>
      <div style={{background:'#eff6ff',borderRadius:14,padding:16,marginBottom:12,border:'1px solid #bfdbfe',fontSize:16,lineHeight:1.8,color:G900}}>
        <span>{parts[0]||''}</span>
        <span style={{display:'inline-block',minWidth:64,textAlign:'center',background:T+'22',borderRadius:6,padding:'0 6px',color:T,fontWeight:'bold',fontFamily:'monospace',letterSpacing:2}}>{wordDisplay||'___'}</span>
        <span>{parts[1]||''}</span>
      </div>
      <div style={{fontSize:11,color:G400,textAlign:'center',marginBottom:12}}>🇩🇪 {sent.clue}</div>
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        <input ref={ref} value={input} onChange={function(e){setInput(e.target.value);}} onKeyDown={function(e){if(e.key==='Enter')submit();}} placeholder="Englische Antwort…" style={{flex:1,padding:'10px 12px',border:'2px solid '+G200,borderRadius:10,fontSize:14,outline:'none'}}/>
        <button onClick={submit} disabled={!input.trim()} style={BtnStyle(T,'white',{padding:'10px 16px',fontSize:15,opacity:!input.trim()?0.5:1})}>✓</button>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={addHint} disabled={isAllRevealed()} style={BtnStyle(isAllRevealed()?G100:'#f59e0b','white',{flex:1,padding:'10px',fontSize:13,opacity:isAllRevealed()?0.4:1})}>
          💡 Tipp{hints>0?' ('+calcPts()+'P)':''}
        </button>
        <button onClick={skip} style={BtnStyle(G100,G400,{flex:1,padding:'10px',fontSize:13})}>⏭ Überspringen</button>
      </div>
      <div style={{marginTop:8,fontSize:10,color:G400,textAlign:'center'}}>{calcPts()>0?'Richtig jetzt = '+calcPts()+' Punkte':'0 Punkte (Wort komplett aufgedeckt)'}</div>
    </div>
  );
}

function SatzquizGame({ words, runId, runName, player, onUpdateScore, onDone }) {
  var [sentences, setSentences] = useState(null);
  var [allOpts, setAllOpts] = useState(null);
  var [loadErr, setLoadErr] = useState('');
  var [idx, setIdx] = useState(0);
  var [chosen, setChosen] = useState(null);
  var [total, setTotal] = useState(0);
  var [regenKey, setRegenKey] = useState(0);

  useEffect(function(){
    setSentences(null); setAllOpts(null); setLoadErr(''); setIdx(0); setTotal(0); setChosen(null);
    function start(ws) {
      if(!ws||!ws.length){setLoadErr('Keine Vokabeln.');setSentences([]);setAllOpts([]);return;}
      generateSentences(ws, runName, regenKey>0).then(function(sents){
        var opts=sents.map(function(s){
          var ans=(s.answer||'').trim();
          var dists=shuffleArr(ws.filter(function(w){return w.word.toLowerCase()!==ans.toLowerCase();})).slice(0,3).map(function(w){return w.word;});
          return shuffleArr([ans].concat(dists));
        });
        setSentences(sents); setAllOpts(opts);
      }).catch(function(e){setLoadErr(e.message||'Fehler');setSentences([]);setAllOpts([]);});
    }
    if(words&&words.length){start(words);return;}
    if(runId){
      sbGet('ls_runs','id=eq.'+runId+'&select=words').then(function(rows){
        var rw=[]; try{var raw=rows&&rows[0]&&rows[0].words;rw=typeof raw==='string'?JSON.parse(raw||'[]'):(raw||[]);}catch(e){}
        start(rw);
      }).catch(function(){start([]);});
    } else { start([]); }
  },[regenKey]);

  if(!sentences||!allOpts) return <div style={{padding:40,textAlign:'center'}}><div style={{fontSize:28,marginBottom:8}}>🤖</div><div style={{fontSize:13,color:G400}}>Generiere Sätze…</div></div>;
  if(loadErr||!sentences.length) return <div style={{padding:20,textAlign:'center'}}><div style={{color:RE,fontSize:13,marginBottom:12}}>{loadErr||'Keine Sätze generiert.'}</div><button onClick={onDone} style={BtnStyle(G100,G600,{padding:'10px 24px'})}>← Zurück</button></div>;
  if(idx>=sentences.length) return <div style={{padding:24,textAlign:'center'}}><div style={{fontSize:48,marginBottom:8}}>🎉</div><div style={{fontSize:22,fontWeight:'bold',color:T,marginBottom:4}}>Satzquiz!</div><div style={{fontSize:16,color:G600,marginBottom:20}}>{total} Punkte</div><div style={{display:'flex',gap:8,justifyContent:'center'}}><button onClick={function(){setRegenKey(function(k){return k+1;});}} style={BtnStyle('#f97316','white',{padding:'12px 20px',fontSize:14})}>↺ Neue Sätze</button><button onClick={onDone} style={BtnStyle(T,'white',{padding:'12px 20px',fontSize:14})}>← Zurück</button></div></div>;

  var sent=sentences[idx];
  var answer=(sent.answer||'').trim();
  var opts=allOpts[idx]||[];
  var parts=sent.sentence.split('___');

  function pick(opt){
    if(chosen) return;
    setChosen(opt);
    var res=checkAnswer(opt,answer);
    var ok=res==='correct'||res==='partial';
    tallyAnswer(ok, false, CREDIT.choice);
    logWordEvent(player&&player.id, 'satzquiz', runId, answer, sent.clue, ok, null);
    var pts=ok?10:0;
    if(pts>0&&onUpdateScore) onUpdateScore(pts);
    setTotal(function(t){return t+pts;});
    setTimeout(function(){setIdx(function(i){return i+1;});setChosen(null);},1500);
  }

  return(
    <div style={{padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:11,color:G400}}>Frage {idx+1} / {sentences.length}</div>
        <div style={{fontSize:13,fontWeight:'bold',color:AM}}>{total} Pkt</div>
      </div>
      <div style={{background:'#eff6ff',borderRadius:14,padding:16,marginBottom:12,border:'1px solid #bfdbfe',fontSize:16,lineHeight:1.8,color:G900}}>
        <span>{parts[0]||''}</span>
        <span style={{display:'inline-block',minWidth:64,textAlign:'center',background:T+'22',borderRadius:6,padding:'0 6px',color:T,fontWeight:'bold'}}>___</span>
        <span>{parts[1]||''}</span>
      </div>
      <div style={{fontSize:11,color:G400,textAlign:'center',marginBottom:14}}>🇩🇪 {sent.clue}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {opts.map(function(opt,i){
          var res=checkAnswer(opt,answer);
          var isCorrect=res==='correct'||res==='partial';
          var isChosen=chosen===opt;
          var bg=!chosen?'white':isCorrect?'#d1fae5':isChosen?'#fee2e2':'white';
          var border=!chosen?G200:isCorrect?GR:isChosen?RE:G200;
          var col=!chosen?G900:isCorrect?'#065f46':isChosen?'#991b1b':G400;
          return <button key={i} onClick={function(){pick(opt);}} disabled={!!chosen}
            style={{padding:'14px 8px',borderRadius:12,border:'2px solid '+border,background:bg,cursor:chosen?'default':'pointer',fontSize:14,fontWeight:'bold',color:col,touchAction:'manipulation'}}>
            {opt}
          </button>;
        })}
      </div>
    </div>
  );
}

// Statt der Wiederholung: Papa per Pushover um Freigabe bitten, das Leiterspiel
// diesmal trotzdem zu öffnen. Bleibt beim Warten auf demselben Bildschirm, auch
// nach einem Reload — die offene Anfrage steckt in localStorage. Sobald Papa
// zustimmt, holt `onApproved` (= Shells loadReview) den neuen Stand — die Sperre
// fällt dann von selbst, weil review_skip_requests jetzt als „last" mitzählt.
function ReviewSkipRequest({ player, reviewInfo, onApproved }){
  var lsKey = 'ls_skip_req_'+(player&&player.id);
  var [reqId, setReqId] = useState(function(){ try{ return localStorage.getItem(lsKey)||null; }catch(e){ return null; } });
  var [status, setStatus] = useState(reqId ? 'pending' : 'idle'); // idle|sending|pending|approved|denied|error
  var pollRef = useRef(null);

  function stopPoll(){ if(pollRef.current){ clearInterval(pollRef.current); pollRef.current=null; } }
  function check(id){
    getReviewSkipStatus(id).then(function(st){
      if(st==='approved'){ setStatus('approved'); stopPoll(); try{localStorage.removeItem(lsKey);}catch(e){} if(onApproved) onApproved(); }
      else if(st==='denied'){ setStatus('denied'); stopPoll(); try{localStorage.removeItem(lsKey);}catch(e){} }
      else if(st==='pending'){ setStatus('pending'); }
    });
  }
  useEffect(function(){
    if(reqId && (status==='pending')){
      check(reqId);
      pollRef.current = setInterval(function(){ check(reqId); }, 5000);
    }
    return stopPoll;
  }, [reqId]);

  function ask(){
    setStatus('sending');
    requestReviewSkip(player.id, player.name, reviewInfo.reason, reviewInfo.dueCount).then(function(res){
      if(!res.ok || !res.data || !res.data.id){ setStatus('error'); return; }
      setReqId(res.data.id);
      try{ localStorage.setItem(lsKey, res.data.id); }catch(e){}
      setStatus(res.data.status==='approved'?'approved':res.data.status==='denied'?'denied':'pending');
    }).catch(function(){ setStatus('error'); });
  }

  if(status==='idle') return <button onClick={ask}
    style={BtnStyle(G100,G600,{width:'100%',padding:'11px',fontSize:12,marginTop:8})}>🙋 Papa fragen, ob's heute ohne geht</button>;
  if(status==='sending') return <div style={{marginTop:10,fontSize:12,color:G400}}>Sende Anfrage…</div>;
  if(status==='pending') return <div style={{marginTop:10,padding:'10px 12px',background:G50,borderRadius:10,fontSize:12,color:G600}}>
    ⏳ Warte auf Papas Freigabe — er hat eine Nachricht bekommen.</div>;
  if(status==='approved') return <div style={{marginTop:10,padding:'10px 12px',background:TL,color:TD,borderRadius:10,fontSize:12,fontWeight:'bold'}}>
    ✅ Papa hat zugestimmt — einen Moment…</div>;
  if(status==='denied') return <div style={{marginTop:10}}>
    <div style={{padding:'10px 12px',background:'#fef2f2',color:RE,borderRadius:10,fontSize:12,marginBottom:6}}>❌ Papa möchte, dass du die Wiederholung machst.</div>
  </div>;
  return <div style={{marginTop:10,fontSize:12,color:RE}}>Anfrage fehlgeschlagen — versuch's nochmal.
    <button onClick={function(){setStatus('idle');}} style={BtnStyle(G100,G600,{padding:'6px 12px',fontSize:11,marginLeft:8})}>↺</button></div>;
}

function LeitersSpielMenu({ player, chapters, scope, onStart, onDone, allUsers, reviewInfo, onReview, onReviewSkipApproved }) {
  var [runs, setRuns] = useState([]);
  var [loading, setLoading] = useState(true);
  var [streakSettings, setStreakSettings] = useState(null);
  var [progressMap, setProgressMap] = useState({});
  var [secondsByRun, setSecondsByRun] = useState({});
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  useEffect(function(){
    if(!player||!UUID.test(player.id)){setLoading(false);return;}
    lsGetRunsForPlayer(player.id).then(function(r){
      setRuns(Array.isArray(r)?r:[]); setLoading(false);
    }).catch(function(){ setLoading(false); });
    sbGet('settings','key=eq.streak_settings').then(function(d){
      if(d&&d[0]){try{var s=JSON.parse(d[0].value);setStreakSettings(s);}catch(e){}}
    }).catch(function(){});
    if(UUID.test(player.id)){
      sbGet('ls_progress','player_id=eq.'+player.id+'&select=run_id,data').then(function(rows){
        var pm={}; (Array.isArray(rows)?rows:[]).forEach(function(row){pm[row.run_id]=parseData(row.data);});
        setProgressMap(pm);
      }).catch(function(){});
      sbGet('learn_sessions','player_id=eq.'+player.id+'&select=run_id,active_seconds').then(function(rows){
        var sm={}; (Array.isArray(rows)?rows:[]).forEach(function(row){
          if(!row.run_id) return;
          sm[row.run_id]=(sm[row.run_id]||0)+(row.active_seconds||0);
        });
        setSecondsByRun(sm);
      }).catch(function(){});
    }
  },[]);
  if(loading) return <div style={{textAlign:'center',padding:40,color:G400}}>Lade Runs…</div>;
  // Pflicht-Wiederholung: solange sie offen ist, bleibt das Leiterspiel zu.
  if(reviewInfo && reviewInfo.locked) return(
    <div style={{padding:16}}>
      <div style={{background:'white',border:'2px solid '+AM,borderRadius:16,padding:'22px 18px',textAlign:'center'}}>
        <div style={{fontSize:44,marginBottom:8}}>🔒</div>
        <div style={{fontWeight:'bold',fontSize:17,color:G900,marginBottom:6}}>Erst die Wiederholung!</div>
        <div style={{fontSize:13,color:G600,lineHeight:1.55,marginBottom:8}}>
          {reviewInfo.reason==='learned'
            ? 'Du hast seit der letzten Wiederholung '+reviewInfo.answersSince+' Vokabeln geübt — jetzt schauen wir, ob das Gelernte noch sitzt.'
            : reviewInfo.reason==='first'
              ? 'Bevor es weitergeht: einmal prüfen, was von den gelernten Vokabeln noch sitzt.'
              : 'Deine letzte Wiederholung war vor '+reviewInfo.daysSince+' Tag'+(reviewInfo.daysSince===1?'':'en')+' — Zeit zu prüfen, ob das Gelernte noch sitzt.'}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontSize:11,color:G600,marginBottom:10}}>
          <span style={{background:TL,color:TD,borderRadius:20,padding:'4px 10px',fontWeight:'bold'}}>📚 Lernen</span>
          <span style={{color:G400}}>→</span>
          <span style={{background:AM,color:'white',borderRadius:20,padding:'4px 10px',fontWeight:'bold'}}>🔁 Wiederholen</span>
          <span style={{color:G400}}>→</span>
          <span style={{background:TL,color:TD,borderRadius:20,padding:'4px 10px',fontWeight:'bold'}}>📚 Lernen</span>
        </div>
        <div style={{fontSize:12,color:G400,marginBottom:16}}>
          {reviewInfo.runSize||reviewInfo.policy.count} Vokabeln · {reviewInfo.dueCount} von {reviewInfo.poolSize} gelernten sind dran
        </div>
        <button onClick={onReview} style={BtnStyle(T,'white',{width:'100%',padding:'14px',fontSize:15})}>🔁 Wiederholung starten</button>
        <ReviewSkipRequest player={player} reviewInfo={reviewInfo} onApproved={onReviewSkipApproved}/>
        <button onClick={function(){onDone(true);}} style={BtnStyle(G100,G600,{width:'100%',padding:'10px',fontSize:12,marginTop:8})}>Zurück</button>
      </div>
    </div>
  );
  var scopedRuns = filterRunsByScope(runs, chapters, scope);
  if(scopedRuns.length===0) return <div style={{padding:16,textAlign:'center',color:G400,fontSize:13}}>
    Noch keine Runs für {scopeText(scope)}.{runs.length>0?' In einer anderen Klasse/Sprache gibt es welche — oben in der Kopfzeile umschalten.':' Bitte Admin fragen.'}
  </div>;
  var gs = Object.assign({}, DEFAULT_STREAK, streakSettings || {});
  return(
    <div style={{padding:8}}>
      <div style={{fontWeight:'bold',fontSize:14,color:G900,marginBottom:2}}>Leiterspiel — Run wählen</div>
      <div style={{fontSize:11,color:G400,marginBottom:12}}>{scopeText(scope)}</div>
      {scopedRuns.map(function(run){
        var wordCount = safeWords(run.words).length || run.word_count || 0;
        var prog = progressMap[run.id];
        var pct = prog ? lsPercent(prog,gs) : 0;
        var grade = prog ? lsGrade(pct,gs) : null;
        var pacing = lsRunPacing(pct, run.target_pct, run.target_date, secondsByRun[run.id]||0);
        var pacingBg = !pacing ? null : (pacing.status==='done'?'#d1fae5':pacing.status==='easy'?'#d1fae5':pacing.status==='ok'?'#fef3c7':pacing.status==='hard'?'#fed7aa':pacing.status==='unrealistic'||pacing.status==='overdue'?'#fee2e2':'#eff6ff');
        var pacingFg = !pacing ? null : (pacing.status==='done'||pacing.status==='easy'?'#065f46':pacing.status==='ok'?'#92400e':pacing.status==='hard'?'#9a3412':pacing.status==='unrealistic'||pacing.status==='overdue'?'#991b1b':T);
        return(
          <button key={run.id} onClick={function(){onStart(run,gs);}}
            style={{display:'block',width:'100%',textAlign:'left',padding:'13px 14px',marginBottom:7,borderRadius:12,border:'2px solid '+(T+'44'),background:'white',cursor:'pointer',touchAction:'manipulation'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:22}}>{run.icon||'🎯'}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:'bold',fontSize:13,color:G900}}>{run.name}</div>
                <div style={{fontSize:10,color:G400}}>{wordCount} Vokabeln{run.is_admin_run?' · 📋 Klassen-Run':''}</div>
              </div>
              {grade ? <div style={{textAlign:'right'}}><div style={{fontWeight:'bold',fontSize:16,color:T}}>{grade}</div><div style={{fontSize:10,color:G400}}>{pct}%</div></div> : <span style={{fontSize:12,color:G400,padding:'4px 10px',background:G100,borderRadius:20}}>Neu</span>}
            </div>
            {pct>0&&<div style={{height:4,background:G200,borderRadius:2,overflow:'hidden',marginTop:8}}><div style={{height:'100%',width:pct+'%',background:T,borderRadius:2}}/></div>}
            {pacing && <div style={{marginTop:7,padding:'6px 9px',borderRadius:7,background:pacingBg,color:pacingFg,fontSize:11,fontWeight:'bold',display:'flex',justifyContent:'space-between',gap:8}}>
              <span>🎯 bis {pacing.targetDate}{pacing.targetPct<100?' ('+pacing.targetPct+'%)':''}</span>
              <span>{pacing.status==='done'?'✅ erreicht':(pacing.status==='overdue'?pacing.etaMessage:(pacing.requiredMinPerDay+' Min/Tag · '+pacing.daysLeft+' T'))}</span>
            </div>}
          </button>
        );
      })}
    </div>
  );
}

function LeitersSpielCreate({ player, chapters, scope, onDone }) {
  var [name, setName] = useState('');
  var [icon, setIcon] = useState('🎯');
  var [selectedWords, setSelectedWords] = useState([]);
  var [saving, setSaving] = useState(false);
  var [msg, setMsg] = useState('');
  var [openCh, setOpenCh] = useState({});
  var [filterMode, setFilterMode] = useState('manual');
  var [seqChId, setSeqChId] = useState('');
  var [seqFrom, setSeqFrom] = useState('');
  var [seqTo, setSeqTo] = useState('');
  var [pageFrom, setPageFrom] = useState('');
  var [pageTo, setPageTo] = useState('');
  var [aiWish, setAiWish] = useState('');
  var [aiLoading, setAiLoading] = useState(false);
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var allWords = useMemo(function(){
    var w=[];
    chapters.filter(function(c){return c.parent_id;}).forEach(function(ch){
      (ch.words||[]).forEach(function(ww){ w.push(Object.assign({},ww,{chapId:ch.id,chapTitle:ch.title,chapColor:ch.color})); });
    });
    return w;
  },[chapters]);
  var seqChapters = useMemo(function(){
    return chapters.filter(function(c){
      if(!c.parent_id) return false;
      return safeWords(c.words).some(function(w){return typeof w.seq==='number';});
    });
  },[chapters]);
  var seqRange = useMemo(function(){
    if(!seqChId) return null;
    var ch = chapters.find(function(c){return c.id===seqChId;});
    if(!ch) return null;
    var ws = safeWords(ch.words).filter(function(w){return typeof w.seq==='number';});
    if(!ws.length) return null;
    var seqs = ws.map(function(w){return w.seq;}).sort(function(a,b){return a-b;});
    return {min:seqs[0], max:seqs[seqs.length-1], words:ws};
  },[seqChId, chapters]);
  function applySeqRange(){
    if(!seqRange) return;
    var lo = parseInt(seqFrom,10) || seqRange.min;
    var hi = parseInt(seqTo,10) || seqRange.max;
    if(lo>hi){ var x=lo; lo=hi; hi=x; }
    var picked = seqRange.words.filter(function(w){return w.seq>=lo && w.seq<=hi;});
    setSelectedWords(picked.map(function(w){return {word:w.word,clue:w.clue,pot:1,type:w.type||'noun',important:w.important||false,book_page:w.book_page,chapterId:w.chapId};}));
    setMsg('✓ '+picked.length+' Vokabeln aus Bereich '+lo+'–'+hi+' gewählt');
    setTimeout(function(){setMsg('');},2500);
  }
  function applyPageRange(){
    var lo = parseInt(pageFrom,10);
    var hi = parseInt(pageTo,10);
    if(isNaN(lo) || isNaN(hi)){ setMsg('Bitte Von und Bis angeben'); setTimeout(function(){setMsg('');},2500); return; }
    if(lo>hi){ var x=lo; lo=hi; hi=x; }
    var picked = allWords.filter(function(w){return typeof w.book_page==='number' && w.book_page>=lo && w.book_page<=hi;});
    setSelectedWords(picked.map(function(w){return {word:w.word,clue:w.clue,pot:1,type:w.type||'noun',important:w.important||false,book_page:w.book_page,chapterId:w.chapId};}));
    setMsg('✓ '+picked.length+' Vokabeln auf Seiten '+lo+'–'+hi+' gewählt');
    setTimeout(function(){setMsg('');},2500);
  }
  function applyImportant(){
    var picked = allWords.filter(function(w){return w.important;});
    setSelectedWords(picked.map(function(w){return {word:w.word,clue:w.clue,pot:1,type:w.type||'noun',important:true,book_page:w.book_page,chapterId:w.chapId};}));
    setMsg('✓ '+picked.length+' wichtige Vokabeln gewählt');
    setTimeout(function(){setMsg('');},2500);
  }
  function applyAiWish(){
    if(!aiWish.trim()){ setMsg('Bitte einen Wunsch eintragen'); setTimeout(function(){setMsg('');},2500); return; }
    var det = parseWishStructured(aiWish, chapters);
    if(det.matched){
      var picked = allWords.filter(function(w){
        return det.filters.every(function(f){return f(w, chapters);});
      });
      setSelectedWords(picked.map(function(w){return {word:w.word,clue:w.clue,pot:1,type:w.type||'noun',important:!!w.important,book_page:w.book_page,chapterId:w.chapId};}));
      setMsg('✓ '+picked.length+' Vokabeln gewählt ('+det.description+')');
      setTimeout(function(){setMsg('');},4000);
      return;
    }
    setAiLoading(true);
    var defaultOllamaUrl = (location.protocol==='https:') ? (SB_URL.replace(/\/$/,'')+'/ollama') : 'http://localhost:11434';
    var ollamaUrl = (localStorage.getItem('ollama_url')||defaultOllamaUrl).replace(/\/$/,'');
    var model = localStorage.getItem('ollama_model_text') || 'qwen2.5:32b';
    function chapterPath(c){
      var path=[c.title]; var cur=c;
      for(var i=0;i<5;i++){
        if(!cur.parent_id) break;
        var p = chapters.find(function(x){return x.id===cur.parent_id;});
        if(!p) break;
        path.unshift(p.title); cur=p;
      }
      return path.join(' › ');
    }
    var vocabList = allWords.map(function(w){
      return {
        word: w.word, clue: w.clue,
        important: !!w.important,
        book_page: w.book_page!=null ? w.book_page : null,
        chapter: chapterPath(chapters.find(function(c){return c.id===w.chapId;}) || {title:'?'}),
      };
    });
    var prompt =
      'Du wählst Vokabeln aus einer Lernapp nach dem Wunsch des Nutzers.\n\n'+
      'Vokabel-Datenbank (JSON):\n'+JSON.stringify(vocabList)+'\n\n'+
      'Wunsch des Nutzers: "'+aiWish+'"\n\n'+
      'Wähle die passenden Wörter aus. Antworte AUSSCHLIESSLICH mit JSON:\n'+
      '{"words":["word1","word2",...]}';

    fetch(ollamaUrl+'/api/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({model:model, stream:false, format:'json',
        options:{temperature:0.0, num_ctx:32768},
        messages:[{role:'user', content:prompt}]
      })
    }).then(function(r){
      if(!r.ok) throw new Error('Ollama HTTP '+r.status);
      return r.json();
    }).then(function(d){
      var content = (d&&d.message&&d.message.content) || '';
      var m = content.match(/\{[\s\S]*\}/);
      if(!m) throw new Error('Keine JSON-Antwort: '+content.slice(0,150));
      var parsed = JSON.parse(m[0]);
      var wishedKeys = (parsed.words||[]).map(function(w){return normWordKey(w);});
      var picked = allWords.filter(function(w){return wishedKeys.indexOf(normWordKey(w.word))>=0;});
      setSelectedWords(picked.map(function(w){return {word:w.word,clue:w.clue,pot:1,type:w.type||'noun',important:!!w.important,book_page:w.book_page,chapterId:w.chapId};}));
      setMsg('✓ '+picked.length+' Vokabeln per KI gewählt: "'+aiWish+'"');
      setAiLoading(false);
      setTimeout(function(){setMsg('');},4000);
    }).catch(function(e){
      setMsg('Fehler: '+e.message+' — läuft `ollama serve` mit qwen2.5:32b? CORS via OLLAMA_ORIGINS=*');
      setAiLoading(false);
      setTimeout(function(){setMsg('');},6000);
    });
  }
  function isSelected(word){ return selectedWords.findIndex(function(w){return normWordKey(w.word)===normWordKey(word.word);})>=0; }
  function makeSel(w){ return {word:w.word,clue:w.clue,pot:1,type:w.type||'noun',important:w.important||false,book_page:w.book_page,chapterId:w.chapId||w.chapterId||''}; }
  function toggleWord(wObj){
    setSelectedWords(function(prev){
      if(isSelected(wObj)) return prev.filter(function(w){return normWordKey(w.word)!==normWordKey(wObj.word);});
      return prev.concat([makeSel(wObj)]);
    });
  }
  function selectAll(){ setSelectedWords(allWords.map(makeSel)); }
  function toggleChapter(ch){
    var allSel=safeWords(ch.words).every(function(w){return isSelected(w);});
    if(allSel){ setSelectedWords(function(prev){return prev.filter(function(sw){return !safeWords(ch.words).some(function(cw){return normWordKey(cw.word)===normWordKey(sw.word);});}); }); }
    else { var toAdd=safeWords(ch.words).filter(function(w){return !isSelected(w);}).map(function(w){return makeSel(Object.assign({},w,{chapId:ch.id}));}); setSelectedWords(function(prev){return prev.concat(toAdd);}); }
  }
  function save(){
    if(!name.trim()||selectedWords.length<2){setMsg('Name und mind. 2 Wörter erforderlich');return;}
    setSaving(true);
    var sortedSel = selectedWords.slice().sort(function(a,b){
      var pa=(a.book_page!=null?a.book_page:99999), pb=(b.book_page!=null?b.book_page:99999);
      if(pa!==pb) return pa-pb;
      return (a.word||'').localeCompare(b.word||'');
    });
    var wordsJson=JSON.stringify(sortedSel.map(function(w){return{word:w.word,clue:w.clue,type:w.type||'noun',chapterId:w.chapterId||w.chapId||'',important:!!w.important,book_page:w.book_page,pot:1};}));
    var newRun={name:name.trim(),icon:icon,player_id:UUID.test(player.id)?player.id:null,
      is_admin_run:!!(player.is_admin),word_count:sortedSel.length,sentence_count:0,
      grade:scope?scope.grade:null, language:scope?scope.language:null,
      words:wordsJson,sentences:'[]',created_at:new Date().toISOString()};
    sbPost('ls_runs',newRun).then(function(res){
      setSaving(false);
      if(res&&res._err){setMsg('Fehler: '+res.msg);return;}
      setMsg('✓ Run gespeichert!');
      setTimeout(onDone,1000);
    }).catch(function(){setSaving(false);setMsg('Verbindungsfehler');});
  }
  var topLevel=rootsOf(chapters).slice().sort(function(a,b){return a.id<b.id?-1:1;});
  return(
    <div style={{padding:8}}>
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        <div style={{fontSize:32,cursor:'pointer'}} onClick={function(){var icons=['🎯','📚','🏆','⭐','🎓','💪','🔥','🧠'];setIcon(icons[(icons.indexOf(icon)+1)%icons.length]);}}>{icon}</div>
        <input value={name} onChange={function(e){setName(e.target.value);}} placeholder="Run-Name…"
          style={{flex:1,padding:'10px 12px',fontSize:16,border:'2px solid '+T,borderRadius:10,outline:'none'}}/>
      </div>
      <div style={{marginBottom:10,padding:10,background:G50,border:'1px solid '+G200,borderRadius:8}}>
        <div style={{display:'flex',gap:4,marginBottom:6,flexWrap:'wrap'}}>
          {[['manual','✋ Manuell'],['important','⭐ Nur wichtige'],['pages','📖 Seitenbereich'],['range','🔤 Vokabel A–B'],['ai','🤖 KI-Wunsch']].map(function(m){
            return <button key={m[0]} onClick={function(){setFilterMode(m[0]);}} style={BtnStyle(filterMode===m[0]?T:'white', filterMode===m[0]?'white':G600,{padding:'5px 9px',fontSize:11,border:'1px solid '+(filterMode===m[0]?T:G200)})}>{m[1]}</button>;
          })}
          <button onClick={function(){setSelectedWords([]);}} style={BtnStyle(RE,'white',{padding:'5px 9px',fontSize:11,marginLeft:'auto'})}>✕ Auswahl leeren</button>
        </div>
        {filterMode==='manual' && <div style={{fontSize:10,color:G400}}>Klick die Vokabeln einzeln in der Liste unten an oder ganze Themenbereiche per ✓-Box.</div>}
        {filterMode==='important' && <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <span style={{fontSize:11,color:G600}}>Alle ⭐-markierten Vokabeln aus allen Kapiteln:</span>
          <button onClick={applyImportant} style={BtnStyle(T,'white',{padding:'5px 10px',fontSize:11})}>↳ {allWords.filter(function(w){return w.important;}).length} wählen</button>
        </div>}
        {filterMode==='pages' && <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:G600}}>Seiten von</span>
          <input type='number' value={pageFrom} onChange={function(e){setPageFrom(e.target.value);}} placeholder='z.B. 223'
            style={{width:80,padding:'4px 6px',fontSize:11,border:'1px solid '+G200,borderRadius:5}}/>
          <span style={{fontSize:11,color:G600}}>bis</span>
          <input type='number' value={pageTo} onChange={function(e){setPageTo(e.target.value);}} placeholder='z.B. 227'
            style={{width:80,padding:'4px 6px',fontSize:11,border:'1px solid '+G200,borderRadius:5}}/>
          <button onClick={applyPageRange} style={BtnStyle(T,'white',{padding:'5px 10px',fontSize:11})}>↳ Wählen</button>
          <span style={{fontSize:9,color:G400}}>(Buchseitenzahl)</span>
        </div>}
        {filterMode==='ai' && <div>
          <div style={{fontSize:11,color:G600,marginBottom:5}}>Beschreibe in eigenen Worten welche Vokabeln du möchtest. Beispiele:</div>
          <div style={{fontSize:10,color:G400,marginBottom:6,fontStyle:'italic'}}>„Wichtige Vokabeln von Seite 223" · „Wichtige Vokabeln von fish bis penguin" · „Wichtige Vokabeln aus Theme 5"</div>
          <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
            <input value={aiWish} onChange={function(e){setAiWish(e.target.value);}} disabled={aiLoading}
              onKeyDown={function(e){if(e.key==='Enter'){applyAiWish();}}}
              placeholder="Dein Wunsch…"
              style={{flex:'1 1 200px',padding:'6px 10px',fontSize:12,border:'1.5px solid '+T,borderRadius:6}}/>
            <button onClick={applyAiWish} disabled={aiLoading||!aiWish.trim()} style={BtnStyle(T,'white',{padding:'6px 12px',fontSize:11})}>
              {aiLoading?'⏳ KI denkt…':'↳ KI wählen lassen'}
            </button>
          </div>
          <div style={{fontSize:9,color:G400,marginTop:4}}>Lokal via Ollama (qwen2.5:32b). Daten verlassen den Mac nicht.</div>
        </div>}
        {filterMode==='range' && seqChapters.length>0 && <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
          <select value={seqChId} onChange={function(e){setSeqChId(e.target.value);setSeqFrom('');setSeqTo('');}}
            style={{flex:'1 1 140px',padding:'5px 7px',fontSize:11,border:'1px solid '+G200,borderRadius:6}}>
            <option value="">-- Themenbereich --</option>
            {seqChapters.map(function(c){return <option key={c.id} value={c.id}>{c.icon} {c.title}</option>;})}
          </select>
          {seqRange && <span style={{display:'contents'}}>
            <span style={{fontSize:10,color:G600}}>von</span>
            <input type='number' value={seqFrom} onChange={function(e){setSeqFrom(e.target.value);}} placeholder={String(seqRange.min)} min={seqRange.min} max={seqRange.max}
              style={{width:60,padding:'4px 6px',fontSize:11,border:'1px solid '+G200,borderRadius:5}}/>
            <span style={{fontSize:10,color:G600}}>bis</span>
            <input type='number' value={seqTo} onChange={function(e){setSeqTo(e.target.value);}} placeholder={String(seqRange.max)} min={seqRange.min} max={seqRange.max}
              style={{width:60,padding:'4px 6px',fontSize:11,border:'1px solid '+G200,borderRadius:5}}/>
            <button onClick={applySeqRange} style={BtnStyle(T,'white',{padding:'5px 10px',fontSize:11})}>↳ Wählen</button>
          </span>}
        </div>}
      </div>
      <div style={{marginBottom:8,display:'flex',gap:6,alignItems:'center'}}>
        <span style={{flex:1,padding:'8px 12px',background:TL,borderRadius:8,fontSize:13,color:T,fontWeight:'bold'}}>{selectedWords.length} Vokabeln ausgewählt</span>
        <button onClick={selectAll} style={BtnStyle(G100,G600,{padding:'8px 12px',fontSize:11})}>Alle ({allWords.length})</button>
      </div>
      {(function(){
        function toggleOpen(id){ setOpenCh(function(prev){var n=Object.assign({},prev); n[id]=!n[id]; return n;}); }
        function renderVocabRow(w, chId){
          var sel = isSelected(w);
          var typeColors={verb:'#7c3aed',noun:'#0369a1',adjective:'#b45309',phrase:'#15803d',other:G600};
          var typeLabels={verb:'V',noun:'N',adjective:'Adj',phrase:'Ph',other:'?'};
          var tc=typeColors[w.type]||G400; var tl=typeLabels[w.type]||'';
          return <div onClick={function(){toggleWord(Object.assign({},w,{chapId:chId}));}} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 8px',borderBottom:'1px solid '+G100,fontSize:11,cursor:'pointer',background:sel?TL:'transparent'}}>
            <span style={{width:14,flexShrink:0,fontSize:11,color:sel?T:G200,fontWeight:'bold',textAlign:'center'}}>{sel?'✓':''}</span>
            <span style={{fontSize:12,flexShrink:0,color:w.important?AM:G200}}>{w.important?'⭐':'☆'}</span>
            <div style={{flex:1,minWidth:0,display:'flex',gap:6,alignItems:'baseline',overflow:'hidden'}} title={w.word+' → '+w.clue}>
              <span style={{fontWeight:'bold',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:1}}>{w.word}</span>
              <span style={{color:G400,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:1}}>{w.clue}</span>
            </div>
            {w.book_page!=null && <span style={{fontSize:9,color:G400,flexShrink:0}}>S.{w.book_page}</span>}
            {w.type && <span style={{fontSize:8,padding:'1px 5px',borderRadius:8,background:tc+'18',color:tc,fontWeight:'bold',flexShrink:0,border:'1px solid '+tc+'44'}}>{tl}</span>}
          </div>;
        }
        function renderLeaf(ch, depth){
          var pad = 8 + depth*12;
          var chSel = safeWords(ch.words).every(function(w){return isSelected(w);});
          var chSome = !chSel && safeWords(ch.words).some(function(w){return isSelected(w);});
          var open = openCh[ch.id];
          var selCount = safeWords(ch.words).filter(function(w){return isSelected(w);}).length;
          return <div key={ch.id} style={{borderBottom:'1px solid '+G100}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px '+pad+'px',cursor:'pointer',background:open?(ch.color||T)+'10':'white'}} onClick={function(){toggleOpen(ch.id);}}>
              <div onClick={function(e){e.stopPropagation();toggleChapter(ch);}} style={{width:18,height:18,borderRadius:4,border:'2px solid '+(chSel?ch.color:chSome?ch.color:G200),background:chSel?ch.color:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
                {chSel&&<span style={{color:'white',fontSize:10}}>✓</span>}
                {chSome&&<span style={{color:ch.color,fontSize:12}}>−</span>}
              </div>
              <span style={{fontSize:13,flexShrink:0}}>{ch.icon}</span>
              <span style={{fontSize:12,fontWeight:'bold',color:ch.color,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ch.title}</span>
              <span style={{fontSize:10,color:G400,flexShrink:0}}>{selCount}/{safeWords(ch.words).length}</span>
              <span style={{fontSize:10,color:G400,marginLeft:4}}>{open?'▲':'▼'}</span>
            </div>
            {open&&<div style={{background:'#fafafa'}}>
              {safeWords(ch.words).slice().sort(function(a,b){
                var pa=(a.book_page!=null?a.book_page:99999), pb=(b.book_page!=null?b.book_page:99999);
                if(pa!==pb) return pa-pb;
                return (a.seq||9999)-(b.seq||9999) || (a.word||'').localeCompare(b.word||'');
              }).map(function(w,i){return <div key={i} style={{paddingLeft:pad+'px'}}>{renderVocabRow(w, ch.id)}</div>;})}
            </div>}
          </div>;
        }
        function renderBranch(ch, depth){
          var grandkids = chapters.filter(function(c){return c.parent_id===ch.id;}).slice().sort(naturalSort);
          var open = openCh[ch.id];
          var pad = 8 + depth*12;
          if(!grandkids.length) return renderLeaf(ch, depth);
          return <div key={ch.id} style={{borderBottom:'1px solid '+G100}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px '+pad+'px',cursor:'pointer',background:open?G50:'white'}} onClick={function(){toggleOpen(ch.id);}}>
              <span style={{fontSize:14,flexShrink:0,marginLeft:18}}>{ch.icon}</span>
              <span style={{fontSize:12,fontWeight:'bold',color:ch.color||T,flex:1,overflow:'hidden',textOverflow:'ellipsis'}}>{ch.title}</span>
              <span style={{fontSize:10,color:G400,flexShrink:0}}>{grandkids.length} Bereiche</span>
              <span style={{fontSize:10,color:G400,marginLeft:4}}>{open?'▲':'▼'}</span>
            </div>
            {open&&<div>{grandkids.map(function(gk){return renderBranch(gk, depth+1);})}</div>}
          </div>;
        }
        return topLevel.map(function(kap){
          var open = openCh[kap.id];
          var children = chapters.filter(function(c){return c.parent_id===kap.id;}).slice().sort(naturalSort);
          return <div key={kap.id} style={{marginBottom:8,border:'1px solid '+G200,borderRadius:10,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:G50,cursor:'pointer'}} onClick={function(){toggleOpen(kap.id);}}>
              <span style={{fontSize:18}}>{kap.icon}</span>
              <span style={{fontWeight:'bold',fontSize:13,color:kap.color||T,flex:1}}>{kap.title}</span>
              <span style={{fontSize:10,color:G400}}>{open?'▲':'▼'}</span>
            </div>
            {open && <div>{children.map(function(c){return renderBranch(c, 1);})}</div>}
          </div>;
        });
      })()}
      {msg&&<div style={{padding:'8px 12px',borderRadius:8,background:msg.startsWith('✓')?'#d1fae5':'#fee2e2',color:msg.startsWith('✓')?T:RE,marginBottom:8,fontSize:12}}>{msg}</div>}
      <button onClick={save} disabled={saving} style={BtnStyle(T,'white',{width:'100%',padding:'12px',marginTop:8})}>{saving?'Speichern…':'💾 Run speichern'}</button>
    </div>
  );
}

function KapitelProgress({ player, chapters, onDone }) {
  return <ProgressStats chapters={chapters} player={player} allCategories={[]} />;
}

// Vor einer Klassenarbeit: Pflicht-Wiederholung bis zu einem Stichtag aussetzen,
// damit die Übungszeit ganz dem neuen Stoff gehört. Das Datum läuft von selbst
// ab — deshalb ein Datum und kein Schalter, der sonst aus bliebe.
function ReviewPauseRow({ pol, setPol }){
  var heute = dayKey();
  var aktiv = !!(pol.pauseUntil && pol.pauseUntil >= heute);
  var abgelaufen = !!(pol.pauseUntil && pol.pauseUntil < heute);
  function inTagen(n){
    var d = new Date(); d.setDate(d.getDate()+n); return dayKey(d);
  }
  function setzen(bis, notiz){
    setPol(Object.assign({}, pol, {pauseUntil:bis, pauseNote: notiz==null ? (pol.pauseNote||'') : notiz}));
  }
  function lang(iso){
    if(!iso) return '';
    var p = iso.split('-');
    return p[2]+'.'+p[1]+'.'+p[0];
  }
  var Quick = function(props){
    return <button onClick={props.onClick}
      style={BtnStyle(G100, G600, {padding:'5px 10px',fontSize:11})}>{props.children}</button>;
  };
  return <div style={{padding:'10px 0',borderBottom:'1px solid '+G100}}>
    <div style={{fontSize:12,color:G600,fontWeight:'bold'}}>⏸️ Pause bis (z. B. vor einer Klassenarbeit)</div>
    <div style={{fontSize:10,color:G400,marginBottom:8}}>
      Bis einschließlich diesem Tag kommt keine Pflicht-Wiederholung und das Leiterspiel bleibt offen.
      Danach greift die Regel automatisch wieder — der Rückstand geht nicht verloren, er wird nur später aufgeholt.
    </div>
    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
      <input type='date' value={pol.pauseUntil||''} min={heute}
        onChange={function(e){ setzen(e.target.value||''); }}
        style={{padding:'6px 8px',fontSize:13,border:'1px solid '+G200,borderRadius:6}}/>
      <Quick onClick={function(){ setzen(inTagen(7)); }}>+7 Tage</Quick>
      <Quick onClick={function(){ setzen(inTagen(14)); }}>+14 Tage</Quick>
      {pol.pauseUntil && <Quick onClick={function(){ setzen('', ''); }}>✕ Aufheben</Quick>}
    </div>
    <input type='text' value={pol.pauseNote||''} placeholder='Wofür? z. B. „Spanisch-Test"'
      onChange={function(e){ setzen(pol.pauseUntil||'', e.target.value); }}
      style={{width:'100%',boxSizing:'border-box',marginTop:8,padding:'6px 8px',fontSize:12,border:'1px solid '+G200,borderRadius:6}}/>
    {aktiv && <div style={{marginTop:8,padding:'7px 10px',background:TL,color:TD,borderRadius:6,fontSize:11}}>
      Ausgesetzt bis <b>{lang(pol.pauseUntil)}</b>{pol.pauseNote?' — '+pol.pauseNote:''}. Solange wird nur neu gelernt.
    </div>}
    {abgelaufen && <div style={{marginTop:8,fontSize:11,color:G400}}>
      Pause vom {lang(pol.pauseUntil)} ist abgelaufen — die Wiederholung läuft wieder normal.
    </div>}
  </div>;
}

function ReviewPolicySettings(){
  var [pol,setPol]=useState(REVIEW_DEFAULT);
  var [saving,setSaving]=useState(false);
  var [msg,setMsg]=useState('');
  useEffect(function(){
    sbGet('settings','key=eq.review_policy&select=value').then(function(d){
      if(d&&d[0]) setPol(reviewPolicyOf(d[0].value));
    }).catch(function(){});
  },[]);
  function save(){
    setSaving(true);
    var val=JSON.stringify(reviewPolicyOf(pol));
    sbGet('settings','key=eq.review_policy').then(function(d){
      var p = d&&d[0] ? sbPatch('settings',{value:val},'key=eq.review_policy') : sbPost('settings',{key:'review_policy',value:val});
      return Promise.resolve(p);
    }).then(function(){ setSaving(false); setMsg('✓ Gespeichert'); setTimeout(function(){setMsg('');},2500); })
      .catch(function(){ setSaving(false); setMsg('Fehler'); });
  }
  function Row(props){
    return <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid '+G100}}>
      <div style={{flex:1}}>
        <div style={{fontSize:12,color:G600,fontWeight:'bold'}}>{props.label}</div>
        <div style={{fontSize:10,color:G400}}>{props.hint}</div>
      </div>
      <input type='number' min={props.min} max={props.max} value={props.value}
        onChange={function(e){ props.onChange(parseInt(e.target.value,10)||props.value); }}
        style={{width:62,padding:'6px 8px',fontSize:13,border:'1px solid '+G200,borderRadius:6,textAlign:'center'}}/>
    </div>;
  }
  return <div style={{marginTop:22,paddingTop:14,borderTop:'2px solid '+G100}}>
    <div style={{fontWeight:'bold',fontSize:13,color:G900,marginBottom:2}}>🔁 Pflicht-Wiederholung</div>
    <p style={{fontSize:11,color:G400,marginBottom:10,lineHeight:1.5}}>
      Lernen und Wiederholen wechseln sich ab: Nach dem eingestellten Pensum ist das Leiterspiel gesperrt,
      bis ein Wiederholungslauf gemacht wurde. Abgefragt werden gelernte Vokabeln — die am längsten
      überfälligen zuerst (Abstand wächst 1→3→7→14→30→60 Tage). Falsch beantwortete wandern zurück in Topf 4.
      <br/><br/>
      <b>Wichtig:</b> Den Takt gibt das Lernpensum vor, nicht der Rückstand. Bei vielen überfälligen Vokabeln
      wäre sonst nach jedem Lauf sofort wieder gesperrt — es gäbe keinen Wechsel, sondern eine Dauerschleife.
      Stattdessen wird der einzelne Lauf größer (bis zur Obergrenze), damit er den Rückstand aufholt.
    </p>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:'1px solid '+G100}}>
      <div style={{flex:1,fontSize:12,color:G600,fontWeight:'bold'}}>Aktiv</div>
      <button onClick={function(){ setPol(Object.assign({},pol,{enabled:!pol.enabled})); }}
        style={BtnStyle(pol.enabled?T:G100, pol.enabled?'white':G600, {padding:'6px 14px',fontSize:12})}>{pol.enabled?'An':'Aus'}</button>
    </div>
    <Row label="Lernpensum bis zum Lauf" hint="Antworten im Leiterspiel, dann ist Wiederholen dran" min={10} max={500}
      value={pol.answersTrigger} onChange={function(v){ setPol(Object.assign({},pol,{answersTrigger:v})); }}/>
    <Row label="Takt in Tagen" hint="Spätestens nach so vielen Tagen, auch ohne Lernen" min={1} max={60}
      value={pol.days} onChange={function(v){ setPol(Object.assign({},pol,{days:v})); }}/>
    <Row label="Vokabeln pro Lauf" hint="Normalgröße des Wiederholungslaufs" min={5} max={50}
      value={pol.count} onChange={function(v){ setPol(Object.assign({},pol,{count:v})); }}/>
    <Row label="Obergrenze pro Lauf" hint="Bei viel Rückstand — mehr wird es nie" min={5} max={80}
      value={pol.maxCount} onChange={function(v){ setPol(Object.assign({},pol,{maxCount:v})); }}/>
    <Row label="Erst ab … gelernten Vokabeln" hint="Vorher wird nicht gesperrt" min={1} max={500}
      value={pol.minPool} onChange={function(v){ setPol(Object.assign({},pol,{minPool:v})); }}/>
    <ReviewPauseRow pol={pol} setPol={setPol}/>
    {msg&&<div style={{padding:'8px 0',color:T,fontSize:12}}>{msg}</div>}
    <button onClick={save} disabled={saving} style={BtnStyle(T,'white',{width:'100%',padding:'11px',marginTop:10})}>{saving?'…':'💾 Wiederholungs-Regel speichern'}</button>
  </div>;
}

function LeitersSpielStreakSettings({ onDone }) {
  var [settings, setSettings] = useState({required:[2,1,1,1,1]});
  var [saving, setSaving] = useState(false);
  var [msg, setMsg] = useState('');
  useEffect(function(){
    sbGet('settings','key=eq.streak_settings').then(function(d){
      if(d&&d[0]){try{
        var parsed=JSON.parse(d[0].value);
        if(parsed&&Array.isArray(parsed.required)) setSettings(parsed);
        else if(parsed&&parsed.upThresholds){
          var req=[1,2,3,4,5].map(function(p){return parsed.upThresholds[p]||1;});
          setSettings({required:req});
        }
      }catch(e){}}
    }).catch(function(){});
  },[]);
  function save(){
    setSaving(true);
    var r=settings.required||[2,1,1,1,1];
    var ut={1:r[0],2:r[1],3:r[2],4:r[3],5:r[4]};
    var dt={1:0,2:1,3:1,4:1,5:1};
    var full={required:r,upThresholds:ut,downThresholds:dt};
    var val=JSON.stringify(full);
    sbGet('settings','key=eq.streak_settings').then(function(d){
      var p=d&&d[0] ? sbPatch('settings',{value:val},'key=eq.streak_settings') : sbPost('settings',{key:'streak_settings',value:val});
      Promise.resolve(p).then(function(){setSaving(false);setMsg('✓ Gespeichert');setTimeout(function(){setMsg('');},2500);}).catch(function(){setSaving(false);setMsg('Fehler');});
    }).catch(function(){setSaving(false);setMsg('Verbindungsfehler');});
  }
  var req=settings.required||[2,1,1,1,1];
  return(
    <div style={{padding:8}}>
      <p style={{fontSize:12,color:G400,marginBottom:12}}>Wie oft muss ein Wort in jedem Topf richtig beantwortet werden?</p>
      {[1,2,3,4,5].map(function(p){
        var r=req[p-1]||1;
        return <div key={p} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid '+G100}}>
          <span style={{fontSize:16}}>{POT_ICON[p]}</span>
          <span style={{flex:1,fontSize:13,color:G600,fontWeight:'bold'}}>{POT_LABEL[p]}</span>
          <div style={{display:'flex',gap:4}}>
            {[1,2,3,4,5].map(function(n){
              return <button key={n} onClick={function(){setSettings(function(s){var nr=(s.required||[2,1,1,1,1]).slice();nr[p-1]=n;return Object.assign({},s,{required:nr});});}}
                style={{width:28,height:28,borderRadius:6,border:'2px solid '+(r===n?T:G200),background:r===n?T:'white',color:r===n?'white':G600,cursor:'pointer',fontWeight:'bold',fontSize:12,touchAction:'manipulation'}}>{n}</button>;
            })}
          </div>
        </div>;
      })}
      {msg&&<div style={{padding:'8px',color:T,fontSize:12,marginTop:8}}>{msg}</div>}
      <button onClick={save} disabled={saving} style={BtnStyle(T,'white',{width:'100%',padding:'11px',marginTop:12})}>{saving?'…':'💾 Speichern'}</button>
      <ReviewPolicySettings/>
    </div>
  );
}

function LeitersSpielGradeSettings({ onDone }) {
  var [thresholds, setThresholds] = useState({A:90,B:75,C:60,D:50});
  var [saving, setSaving] = useState(false);
  var [msg, setMsg] = useState('');
  useEffect(function(){
    sbGet('settings','key=eq.grade_settings').then(function(d){
      if(d&&d[0]){try{setThresholds(JSON.parse(d[0].value));}catch(e){}}
    }).catch(function(){});
  },[]);
  function save(){
    setSaving(true);
    sbGet('settings','key=eq.grade_settings').then(function(d){
      var body={key:'grade_settings',value:JSON.stringify(thresholds)};
      if(d&&d[0]){ sbPatch('settings',{value:JSON.stringify(thresholds)},'key=eq.grade_settings').then(function(){setSaving(false);setMsg('✓ Gespeichert');}).catch(function(){setSaving(false);setMsg('Fehler');}); }
      else { sbPost('settings',body).then(function(){setSaving(false);setMsg('✓ Gespeichert');}).catch(function(){setSaving(false);setMsg('Fehler');}); }
    }).catch(function(){setSaving(false);setMsg('Verbindungsfehler');});
  }
  return(
    <div style={{padding:8}}>
      {['A','B','C','D'].map(function(g){
        return <div key={g} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid '+G100}}>
          <span style={{fontWeight:'bold',fontSize:18,color:T,minWidth:24}}>{g}</span>
          <span style={{fontSize:13,color:G600,flex:1}}>ab</span>
          <input type="number" min="0" max="100" value={thresholds[g]||0}
            onChange={function(e){var v=parseInt(e.target.value)||0;setThresholds(function(t){var n=Object.assign({},t);n[g]=v;return n;});}}
            style={{width:60,padding:'6px',fontSize:14,border:'2px solid '+G200,borderRadius:8,textAlign:'center',outline:'none'}}/>
          <span style={{fontSize:13,color:G400}}>%</span>
        </div>;
      })}
      {msg&&<div style={{padding:'8px',color:T,fontSize:12,marginTop:8}}>{msg}</div>}
      <button onClick={save} disabled={saving} style={BtnStyle(T,'white',{width:'100%',padding:'11px',marginTop:12})}>{saving?'…':'💾 Speichern'}</button>
    </div>
  );
}

function RunEditor({ run, chapters, onSave, onCancel }) {
  var initWords = useMemo(function(){
    var raw=run.words; if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch(e){raw=[];}} return Array.isArray(raw)?raw.slice():[];
  },[]);
  var [words, setWords] = useState(initWords);
  var [saving, setSaving] = useState(false);
  var [targetDate, setTargetDate] = useState(run.target_date || '');
  var [targetPct, setTargetPct] = useState(run.target_pct != null ? run.target_pct : 100);
  // Klasse 5/6 sind dreistufig (Klasse > Sprache > Theme/Unidad) — die Wörter
  // hängen erst am dritten Level. byParent erlaubt beliebige Verschachtelungstiefe,
  // statt wie zuvor nur Kinder von topLevel zu zeigen (dort standen bei Klasse 5/6
  // immer 0 Wörter, weil das Sprach-Zwischenlevel selbst keine eigenen hat).
  var byParent = useMemo(function(){
    var m={};
    (chapters||[]).forEach(function(c){ var p=c.parent_id||null; (m[p]=m[p]||[]).push(c); });
    return m;
  },[chapters]);
  var byId = useMemo(function(){
    var m={}; (chapters||[]).forEach(function(c){ m[c.id]=c; }); return m;
  },[chapters]);
  var [openCh, setOpenCh] = useState({});
  function isInRun(word){ return words.findIndex(function(w){return normWordKey(w.word)===normWordKey(word.word);})>=0; }
  function getRunPot(wordStr){ var found=words.find(function(w){return normWordKey(w.word)===normWordKey(wordStr);}); return found?found.pot:1; }
  function toggle(wObj){
    setWords(function(prev){
      if(isInRun(wObj)) return prev.filter(function(w){return normWordKey(w.word)!==normWordKey(wObj.word);});
      var existing=prev.find(function(w){return normWordKey(w.word)===normWordKey(wObj.word);});
      return prev.concat([{word:wObj.word,clue:wObj.clue,pot:existing?existing.pot:1}]);
    });
  }
  function collectWords(chId){
    var out=[]; var node=byId[chId];
    if(node) out=out.concat(safeWords(node.words));
    (byParent[chId]||[]).forEach(function(c){ out=out.concat(collectWords(c.id)); });
    return out;
  }
  function toggleChapter(chId){
    var all=collectWords(chId);
    var allIn=all.length>0 && all.every(function(w){return isInRun(w);});
    if(allIn){ setWords(function(prev){return prev.filter(function(w){return !all.some(function(cw){return normWordKey(cw.word)===normWordKey(w.word);});}); }); }
    else { var toAdd=all.filter(function(w){return !isInRun(w);}).map(function(w){return{word:w.word,clue:w.clue,pot:1};}); setWords(function(prev){return prev.concat(toAdd);}); }
  }
  function setPot(wordStr, pot){
    setWords(function(prev){ return prev.map(function(w){ return normWordKey(w.word)===normWordKey(wordStr)?Object.assign({},w,{pot:pot}):w; }); });
  }
  function removeWord(wordStr){ setWords(function(prev){return prev.filter(function(w){return normWordKey(w.word)!==normWordKey(wordStr);});}); }
  function addWord(wObj){ setWords(function(prev){return prev.concat([{word:wObj.word,clue:wObj.clue,pot:1}]);}); }
  function toggleOpen(id){ setOpenCh(function(prev){ var n=Object.assign({},prev); n[id]=!n[id]; return n; }); }
  function save(){
    setSaving(true);
    var wordsJson = JSON.stringify(words);
    var body = {words:wordsJson, word_count:words.length, name:run.name,
      target_date: targetDate||null, target_pct: targetPct||100};
    sbPatch('ls_runs',body,'id=eq.'+run.id)
      .then(function(){
        setSaving(false);
        onSave(Object.assign({},run,{words:words,word_count:words.length,target_date:targetDate||null,target_pct:targetPct||100}));
      })
      .catch(function(){setSaving(false);});
  }
  function renderChapterNode(ch, depth){
    var kids=(byParent[ch.id]||[]).slice().sort(naturalSort);
    var hasKids=kids.length>0;
    var allWords=collectWords(ch.id);
    var inCount=allWords.filter(function(w){return isInRun(w);}).length;
    var allIn=allWords.length>0 && inCount===allWords.length;
    var someIn=!allIn && inCount>0;
    var open=!!openCh[ch.id];
    return <div key={ch.id} style={{borderTop:'1px solid '+G100}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px 7px '+(12+(depth-1)*16)+'px',cursor:'pointer'}} onClick={function(){toggleOpen(ch.id);}}>
        <div onClick={function(e){e.stopPropagation();toggleChapter(ch.id);}} style={{width:18,height:18,borderRadius:4,border:'2px solid '+(allIn?ch.color:someIn?ch.color:G200),background:allIn?ch.color:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
          {allIn&&<span style={{color:'white',fontSize:10}}>✓</span>}
          {someIn&&<span style={{color:ch.color,fontSize:12}}>−</span>}
        </div>
        <span style={{fontSize:12,fontWeight:'bold',color:ch.color,flex:1}}>{ch.icon} {ch.title}</span>
        <span style={{fontSize:10,color:G400}}>{inCount}/{allWords.length}</span>
        <span style={{fontSize:10,color:G400,marginLeft:4}}>{open?'▲':'▼'}</span>
      </div>
      {open&&hasKids&&<div style={{background:'#fafafa'}}>
        {kids.map(function(kid){ return renderChapterNode(kid, depth+1); })}
      </div>}
      {open&&!hasKids&&<div style={{background:'#fafafa'}}>
        {safeWords(ch.words).map(function(w,i){
          var inRun=isInRun(w);
          var typeColors={verb:'#7c3aed',noun:'#0369a1',adjective:'#b45309',phrase:'#15803d',other:G600};
          var typeLabels={verb:'Verb',noun:'Subst.',adjective:'Adj.',phrase:'Phrase',other:'Sonst.'};
          var tc=typeColors[w.type]||null; var tl=typeLabels[w.type]||null;
          return <div key={i} style={{display:'flex',alignItems:'center',gap:8,
            padding:'7px 12px 7px '+(28+(depth-1)*16)+'px',background:i%2===0?'white':G50,
            borderBottom:'1px solid '+G100}}>
            <input type='checkbox' checked={inRun}
              onChange={function(){inRun?removeWord(w.word):addWord(w);}}
              style={{width:15,height:15,cursor:'pointer',accentColor:T,flexShrink:0}}/>
            {w.important&&<span style={{fontSize:11,color:AM,flexShrink:0}}>⭐</span>}
            <span style={{flex:1,fontWeight:'bold',color:G900,fontSize:13}}>{w.word}</span>
            <span style={{color:G400,fontSize:11}}>{w.clue}</span>
            {tl&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:10,background:tc+'18',color:tc,fontWeight:'bold',flexShrink:0,border:'1px solid '+tc+'44',whiteSpace:'nowrap'}}>{tl}</span>}
          </div>;
        })}
      </div>}
    </div>;
  }
  var topLevel=rootsOf(chapters).slice().sort(naturalSort);
  return(
    <div style={{padding:8}}>
      <div style={{fontWeight:'bold',fontSize:14,color:G900,marginBottom:4}}>{run.icon} {run.name} bearbeiten</div>
      <div style={{padding:'8px 12px',background:TL,borderRadius:8,fontSize:13,color:T,fontWeight:'bold',marginBottom:10}}>{words.length} Vokabeln im Run</div>
      <div style={{padding:10,background:'white',border:'1px solid '+G200,borderRadius:8,marginBottom:10}}>
        <div style={{fontWeight:'bold',fontSize:11,color:G600,marginBottom:6}}>🎯 Lernziel</div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <label style={{fontSize:11,color:G400,flex:'0 0 auto'}}>Bis:</label>
          <input type='date' value={targetDate||''} onChange={function(e){setTargetDate(e.target.value);}}
            style={{flex:1,padding:'5px 7px',fontSize:12,border:'1px solid '+G200,borderRadius:6}}/>
          <label style={{fontSize:11,color:G400,flex:'0 0 auto'}}>Ziel:</label>
          <input type='number' min='1' max='100' value={targetPct} onChange={function(e){setTargetPct(parseInt(e.target.value,10)||100);}}
            style={{width:54,padding:'5px 7px',fontSize:12,border:'1px solid '+G200,borderRadius:6}}/>
          <span style={{fontSize:11,color:G400}}>%</span>
          {targetDate&&<button onClick={function(){setTargetDate('');}} title='Ziel löschen'
            style={{padding:'4px 8px',fontSize:10,border:'1px solid '+G200,background:'white',color:G400,cursor:'pointer',borderRadius:5}}>✕</button>}
        </div>
      </div>
      {topLevel.map(function(kap){
        var children=(byParent[kap.id]||[]).slice().sort(naturalSort);
        return <div key={kap.id} style={{marginBottom:8,border:'1px solid '+G200,borderRadius:10,overflow:'hidden'}}>
          <div style={{padding:'8px 12px',background:G50,fontWeight:'bold',fontSize:12,color:kap.color||T}}>{kap.icon} {kap.title}</div>
          {children.map(function(ch){ return renderChapterNode(ch, 1); })}
        </div>;
      })}
      <div style={{display:'flex',gap:8,marginTop:10}}>
        <button onClick={save} disabled={saving} style={BtnStyle(T,'white',{flex:1,padding:'11px'})}>{saving?'…':'💾 Speichern'}</button>
        <button onClick={onCancel} style={BtnStyle(G100,G600,{flex:1,padding:'11px'})}>Abbrechen</button>
      </div>
    </div>
  );
}

export { LeitersSpielSession, SatzmeisterGame, SatzquizGame, LeitersSpielMenu, LeitersSpielCreate, KapitelProgress, ReviewPolicySettings, LeitersSpielStreakSettings, LeitersSpielGradeSettings, RunEditor };
