// „Muster-Detektiv" — Zuordnungsspiel für die unregelmäßigen Verben.
//
// Gezeigt wird nur das englische Verb mit seiner deutschen Bedeutung; gesucht
// ist das Muster (🐔 Chicken / 🍔 Hamburger / 📢 Echo / 🐱 Miau / 🔀 Sonstige).
// Damit übt es genau das, was der Verben-Trainer im Leiterspiel voraussetzt:
// dort steht das Muster als Hilfe über der Karte, hier muss es selbst gefunden
// werden. Eigenes Spiel auf Leiterspiel-Ebene, ohne Topf-Mechanik — der
// Fortschritt ist eine lokale Trefferstatistik, siehe core/verbsort.js.
import { CREDIT, logWordEvent, tallyAnswer } from '../core/leitner.js';
import { useMemo, useState } from '../core/react.js';
import { AM, BtnStyle, G100, G200, G400, G50, G600, G900, GR, RE, T, TD } from '../core/theme.js';
import { MASTER_STREAK, SORT_PATTERNS, SORT_PATTERN_META, collectVerbs, isMastered, loadStats, masteryCount, pickRound, recordAnswer, saveStats, verbsByPattern } from '../core/verbsort.js';
import { primaryForm } from './verbdrill.jsx';
import { SpeakButton } from './widgets.jsx';

var PTS_CORRECT = 5;
var PTS_PERFECT_BONUS = 20;
var ROUND_SIZES = [10, 20];

function FormsRow({ verb }) {
  var forms = [primaryForm(verb.word), primaryForm(verb.pastSimple), primaryForm(verb.pastParticiple)];
  return <div style={{display:'flex',gap:6,justifyContent:'center',flexWrap:'wrap',marginTop:8}}>
    {forms.map(function(f, i) {
      return <span key={i} style={{background:'white',border:'1px solid '+G200,borderRadius:8,padding:'4px 10px',fontSize:13,fontWeight:'bold',color:G900}}>{f}</span>;
    })}
  </div>;
}

function PatternLegend({ counts }) {
  return <div style={{border:'2px solid '+G200,borderRadius:12,overflow:'hidden',marginBottom:12}}>
    {SORT_PATTERNS.map(function(p, i) {
      var m = SORT_PATTERN_META[p];
      return <div key={p} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderBottom:i<SORT_PATTERNS.length-1?'1px solid '+G100:'none'}}>
        <span style={{fontSize:20}}>{m.emoji}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:'bold',color:m.color}}>{m.label} — {m.rule}</div>
          <div style={{fontSize:11,color:G400}}>{m.example}</div>
        </div>
        {counts && <span style={{fontSize:10,color:G400,whiteSpace:'nowrap'}}>{counts[p]||0} Verben</span>}
      </div>;
    })}
  </div>;
}

function VerbSortGame({ player, chapters, onDone, onUpdateScore }) {
  var verbs = useMemo(function(){ return collectVerbs(chapters); }, [chapters]);
  var byPattern = useMemo(function(){ return verbsByPattern(verbs); }, [verbs]);
  var [stats, setStats] = useState(function(){ return loadStats(player && player.id); });
  var [round, setRound] = useState(null);   // {words, idx, log, result, size}
  var [showRules, setShowRules] = useState(false);

  function persist(next) {
    setStats(next);
    saveStats(player && player.id, next);
  }

  function start(size, weakOnly) {
    var words = pickRound(verbs, stats, size, weakOnly);
    if (!words.length) return;
    setRound({words: words, idx: 0, log: [], result: null});
  }

  function answer(pattern) {
    if (!round || round.result) return;
    var cur = round.words[round.idx];
    var correct = pattern === cur.pattern;
    tallyAnswer(correct, false, CREDIT.choice);
    logWordEvent(player && player.id, 'verbmuster', null, cur.word, cur.clue, correct, null);
    if (correct && onUpdateScore) onUpdateScore(PTS_CORRECT);
    persist(recordAnswer(stats, cur.key, correct));
    var entry = {key: cur.key, word: cur.word, meaning: cur.meaning || cur.clue, verb: cur, chosen: pattern, correct: correct};
    setRound(Object.assign({}, round, {log: round.log.concat([entry]), result: entry}));
  }

  function next() {
    if (!round) return;
    var ni = round.idx + 1;
    if (ni >= round.words.length) {
      // Bonus für eine fehlerfreie Runde — hier gutgeschrieben und nicht erst
      // beim Verlassen der Auswertung, sonst hinge er am Wegklicken.
      var alleRichtig = round.log.length > 0 && round.log.every(function(l){ return l.correct; });
      if (alleRichtig && onUpdateScore) onUpdateScore(PTS_PERFECT_BONUS);
      setRound(Object.assign({}, round, {done: true, result: null}));
      return;
    }
    setRound(Object.assign({}, round, {idx: ni, result: null}));
  }

  if (!verbs.length) return <div style={{padding:16,textAlign:'center',color:G400,fontSize:13}}>
    Keine unregelmäßigen Verben gefunden — die Muster-Kapitel fehlen noch.
  </div>;

  // ── Auswertung ────────────────────────────────────────────────────────────
  if (round && round.done) {
    var richtig = round.log.filter(function(l){ return l.correct; }).length;
    var perfekt = richtig === round.log.length;
    var punkte = richtig * PTS_CORRECT + (perfekt ? PTS_PERFECT_BONUS : 0);
    return <div style={{padding:8}}>
      <div style={{background:'linear-gradient(135deg,'+T+','+TD+')',borderRadius:16,padding:24,color:'white',textAlign:'center',marginBottom:12}}>
        <div style={{fontSize:40,marginBottom:8}}>{perfekt?'🏆':'🕵️'}</div>
        <div style={{fontSize:22,fontWeight:'bold',marginBottom:4}}>{richtig} von {round.log.length} richtig einsortiert</div>
        <div style={{fontSize:13,opacity:.85}}>+{punkte} Punkte{perfekt?' (mit '+PTS_PERFECT_BONUS+' Bonus für alles richtig!)':''}</div>
      </div>
      <div style={{marginBottom:12}}>
        {round.log.map(function(l, i) {
          var right = SORT_PATTERN_META[l.verb.pattern] || {};
          var chosen = SORT_PATTERN_META[l.chosen] || {};
          return <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',marginBottom:3,borderRadius:8,background:l.correct?'#d1fae5':'#fee2e2',fontSize:12}}>
            <span>{l.correct?'✓':'✗'}</span>
            <span style={{fontWeight:'bold',flex:1,color:G900}}>{l.word}</span>
            <span style={{color:G400}}>{l.meaning}</span>
            <span style={{fontWeight:'bold',whiteSpace:'nowrap'}}>
              {l.correct ? right.emoji : chosen.emoji+' → '+right.emoji}
            </span>
          </div>;
        })}
      </div>
      <button onClick={function(){ setRound(null); }}
        style={BtnStyle(T,'white',{width:'100%',padding:'12px',marginBottom:7})}>↻ Noch eine Runde</button>
      <button onClick={onDone}
        style={BtnStyle(G100,G600,{width:'100%',padding:'10px',fontSize:12})}>← Fertig</button>
    </div>;
  }

  // ── Spielrunde ────────────────────────────────────────────────────────────
  if (round) {
    var cur = round.words[round.idx];
    var res = round.result;
    var richtigBisher = round.log.filter(function(l){ return l.correct; }).length;
    return <div style={{padding:8}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:G400,marginBottom:8}}>
        <span>🕵️ Muster-Detektiv · {round.idx+1}/{round.words.length}</span>
        <span>{richtigBisher} richtig</span>
      </div>
      <div style={{height:4,background:G200,borderRadius:2,overflow:'hidden',marginBottom:12}}>
        <div style={{height:'100%',width:(round.idx/round.words.length*100)+'%',background:T,borderRadius:2}}/>
      </div>

      <div style={{padding:'18px 16px',background:G50,borderRadius:14,border:'2px solid '+G200,textAlign:'center',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <span style={{fontSize:26,fontWeight:'bold',color:G900}}>{primaryForm(cur.word)}</span>
          <SpeakButton text={cur.word} lang='en'/>
        </div>
        <div style={{fontSize:14,color:G600,marginTop:4}}>{cur.meaning || cur.clue}</div>
        {!res && <div style={{fontSize:11,color:G400,marginTop:8}}>In welche Gruppe gehört dieses Verb?</div>}
      </div>

      {res ? (
        <div>
          <div style={{padding:16,borderRadius:14,marginBottom:12,background:res.correct?'#d1fae5':'#fee2e2',border:'2px solid '+(res.correct?GR:RE),textAlign:'center'}}>
            <div style={{fontSize:16,fontWeight:'bold',color:res.correct?'#065f46':'#991b1b',marginBottom:4}}>
              {res.correct ? '✓ Richtig!' : '✗ Das ist ein '+(SORT_PATTERN_META[cur.pattern]||{}).label+'-Verb'}
            </div>
            <div style={{fontSize:12,color:G600}}>
              {(SORT_PATTERN_META[cur.pattern]||{}).emoji} {(SORT_PATTERN_META[cur.pattern]||{}).label} — {(SORT_PATTERN_META[cur.pattern]||{}).rule}
            </div>
            <FormsRow verb={cur}/>
            {cur.mnemonic && <div style={{marginTop:10,fontSize:12,color:'#92400e',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'8px 12px',textAlign:'left'}}>🧠 {cur.mnemonic}</div>}
          </div>
          <button onClick={next} style={BtnStyle(T,'white',{width:'100%',padding:'12px'})}>
            {round.idx+1>=round.words.length ? '→ Auswertung' : '→ Weiter'}
          </button>
        </div>
      ) : (
        <div>
          {SORT_PATTERNS.map(function(p) {
            var m = SORT_PATTERN_META[p];
            return <button key={p} onClick={function(){ answer(p); }}
              style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'11px 13px',marginBottom:7,borderRadius:12,
                border:'2px solid '+m.color+'55',background:'white',cursor:'pointer',textAlign:'left',touchAction:'manipulation'}}>
              <span style={{fontSize:22,flexShrink:0}}>{m.emoji}</span>
              <div>
                <div style={{fontWeight:'bold',fontSize:13,color:m.color}}>{m.label}</div>
                <div style={{fontSize:11,color:G400}}>{m.rule} · {m.example}</div>
              </div>
            </button>;
          })}
        </div>
      )}
    </div>;
  }

  // ── Startbildschirm ───────────────────────────────────────────────────────
  var sitzen = masteryCount(verbs, stats);
  var wacklig = verbs.filter(function(v){ return !isMastered(stats, v.key); }).length;
  var counts = {};
  SORT_PATTERNS.forEach(function(p){ counts[p] = byPattern[p].length; });
  return <div style={{padding:8}}>
    <div style={{background:'linear-gradient(135deg,'+T+'22,'+T+'08)',borderRadius:16,padding:16,marginBottom:12,border:'1px solid '+T+'22'}}>
      <div style={{fontWeight:'bold',fontSize:15,color:T,marginBottom:3}}>🕵️ Muster-Detektiv</div>
      <div style={{fontSize:12,color:G600,lineHeight:1.5}}>
        Du siehst ein Verb mit seiner deutschen Bedeutung — und sortierst es in die richtige Gruppe ein.
        Keine Formen tippen, nur erkennen, welches Muster dahintersteckt.
      </div>
      <div style={{marginTop:10,height:6,background:'white',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:(verbs.length?sitzen/verbs.length*100:0)+'%',background:T,borderRadius:3}}/>
      </div>
      <div style={{fontSize:11,color:G600,marginTop:5}}>
        {sitzen} von {verbs.length} Verben sitzen ({MASTER_STREAK}× hintereinander richtig)
      </div>
    </div>

    <div style={{fontSize:11,fontWeight:'bold',color:G600,marginBottom:6}}>Wie viele Verben?</div>
    <div style={{display:'flex',gap:6,marginBottom:8}}>
      {ROUND_SIZES.map(function(n) {
        return <button key={n} onClick={function(){ start(n, false); }}
          style={BtnStyle(T,'white',{flex:1,padding:'12px',fontSize:14})}>{n} Verben</button>;
      })}
    </div>
    <button onClick={function(){ start(Math.min(20, wacklig), true); }} disabled={wacklig<4}
      style={BtnStyle(AM,'white',{width:'100%',padding:'11px',fontSize:13,marginBottom:7,opacity:wacklig<4?0.4:1})}>
      🔥 Wackelkandidaten üben ({wacklig})
    </button>
    <button onClick={function(){ start(verbs.length, false); }}
      style={BtnStyle(G100,G600,{width:'100%',padding:'10px',fontSize:12,marginBottom:12})}>
      Alle {verbs.length} Verben am Stück
    </button>

    <button onClick={function(){ setShowRules(function(v){ return !v; }); }}
      style={BtnStyle(G100,G600,{width:'100%',padding:'8px',fontSize:11,marginBottom:8})}>
      {showRules ? '▲ Muster-Übersicht ausblenden' : '▼ Muster-Übersicht anzeigen'}
    </button>
    {showRules && <PatternLegend counts={counts}/>}
  </div>;
}

export { VerbSortGame };
