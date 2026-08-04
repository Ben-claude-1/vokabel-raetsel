import { SOLS, buildCW } from '../core/crossword.js';
import { useState } from '../core/react.js';
import { rootsOf } from '../core/scope.js';
import { BtnStyle, G100, G200, G400, G50, G600, T, TL } from '../core/theme.js';
import { naturalSort } from '../core/util.js';
import { safeWords } from '../core/words.js';
import { Puzzle } from './browse.jsx';

function CrosswordGame({ chapters, onDone }) {
  var [puzzle, setPuzzle] = useState(null);
  var [sel, setSel] = useState({});
  var [filter, setFilter] = useState('all');
  var [openKap, setOpenKap] = useState({});
  var [openCh, setOpenCh] = useState(null);

  function cwValid(w){ return w.word && w.clue && w.word.replace(/[^A-Za-z]/g,'').length>=3; }
  function getFiltered(ch){
    var ws=safeWords(ch.words);
    return ws.filter(function(w){ return cwValid(w)&&(filter==='all'||w.important); });
  }
  function togAll(ch){
    var ws=safeWords(ch.words);
    var fi=ws.filter(function(w){ return cwValid(w)&&(filter==='all'||w.important); });
    setSel(function(prev){
      var n=Object.assign({},prev); var cur=n[ch.id]||new Set();
      var allS=fi.every(function(w){return cur.has(ws.indexOf(w));});
      var next=new Set(cur);
      if(allS) fi.forEach(function(w){next.delete(ws.indexOf(w));});
      else fi.forEach(function(w){next.add(ws.indexOf(w));});
      n[ch.id]=next; return n;
    });
  }
  function togW(chId,idx){
    setSel(function(prev){var n=Object.assign({},prev);var cur=new Set(n[chId]||[]);if(cur.has(idx))cur.delete(idx);else cur.add(idx);n[chId]=cur;return n;});
  }
  function getWords(){
    var w=[];
    chapters.forEach(function(ch){var ws=safeWords(ch.words);var s=sel[ch.id]||new Set();s.forEach(function(i){if(ws[i]&&cwValid(ws[i]))w.push(Object.assign({},ws[i]));});});
    return w;
  }
  function startPuzzle(){
    var words=getWords().map(function(w){return Object.assign({},w,{word:w.word.replace(/[^A-Za-z]/g,'').toUpperCase()});});
    if(words.length<4){alert('Mindestens 4 Vokabeln auswählen (mind. 3 englische Buchstaben je Wort).');return;}
    var sol=SOLS[Math.floor(Math.random()*SOLS.length)];
    var cw=buildCW(words,sol.phrase);
    setPuzzle({cw:cw,sol:sol});
  }

  var total=Object.values(sel).reduce(function(s,set){return s+set.size;},0);
  var topLevel=rootsOf(chapters).slice().sort(naturalSort);
  var childMap={};
  chapters.filter(function(c){return c.parent_id;}).forEach(function(c){
    if(!childMap[c.parent_id]) childMap[c.parent_id]=[];
    childMap[c.parent_id].push(c);
  });

  // kapitel-level counts
  function kapSelCount(kap){
    return (childMap[kap.id]||[]).reduce(function(s,ch){return s+(sel[ch.id]||new Set()).size;},0);
  }

  if(puzzle){
    return (
      <div style={{padding:8}}>
        <button onClick={function(){setPuzzle(null);}} style={{marginBottom:10,background:'none',border:'none',color:T,cursor:'pointer',fontSize:13,touchAction:'manipulation'}}>← Andere Vokabeln wählen</button>
        <Puzzle data={puzzle.cw} solPhrase={puzzle.sol.phrase} solMsg={puzzle.sol.msg}/>
      </div>
    );
  }

  return (
    <div style={{padding:8}}>
      <div style={{display:'flex',gap:6,marginBottom:12,padding:'8px 12px',background:G50,borderRadius:10,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:12,color:G600,fontWeight:'bold'}}>Anzeigen:</span>
        {[['all','📚 Alle'],['important','⭐ Nur wichtige']].map(function(pair){
          return <button key={pair[0]} onClick={function(){setFilter(pair[0]);}} style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:'bold',background:filter===pair[0]?T:'white',color:filter===pair[0]?'white':G600,border:'1.5px solid '+(filter===pair[0]?T:G200),cursor:'pointer',touchAction:'manipulation'}}>{pair[1]}</button>;
        })}
      </div>
      <div style={{marginBottom:12,padding:'10px 14px',background:TL,borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:13,color:T,fontWeight:'bold'}}>{total} Vokabeln gewählt</span>
        <button onClick={startPuzzle} disabled={total<4} style={BtnStyle(total>=4?T:G400,'#fff',{padding:'6px 14px',opacity:total<4?0.5:1,touchAction:'manipulation'})}>🔤 Rätsel starten</button>
      </div>
      {total<4&&<p style={{fontSize:11,color:G400,textAlign:'center',marginBottom:8}}>Mindestens 4 Vokabeln auswählen</p>}
      {topLevel.map(function(kap){
        var kids=(childMap[kap.id]||[]).filter(function(c){return getFiltered(c).length>0;}).slice().sort(naturalSort);
        if(kids.length===0) return null;
        var kapSel=kapSelCount(kap);
        var kapOpen=openKap[kap.id];
        return (
          <div key={kap.id} style={{marginBottom:10,border:'2px solid '+(kapSel>0?(kap.color||T):G200),borderRadius:12,overflow:'hidden'}}>
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
                var ws=safeWords(c.words); var s=sel[c.id]||new Set(); var fi=getFiltered(c);
                var allS=fi.length>0&&fi.every(function(w){return s.has(ws.indexOf(w));}); var someS=fi.some(function(w){return s.has(ws.indexOf(w));})&&!allS;
                var open=openCh===c.id;
                return (
                  <div key={c.id} style={{borderBottom:'1px solid '+G100}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px 9px 20px',background:s.size>0?(c.color+'10'):'#fafafa',cursor:'pointer',touchAction:'manipulation'}} onClick={function(){setOpenCh(open?null:c.id);}}>
                      <span style={{fontSize:16}}>{c.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:'bold',fontSize:12,color:c.color}}>{c.title}</div>
                        <div style={{fontSize:10,color:G400}}>{fi.length} wählbar · {s.size} gewählt</div>
                      </div>
                      <div onClick={function(e){e.stopPropagation();togAll(c);}} style={{width:20,height:20,borderRadius:5,border:'2px solid '+(allS?c.color:someS?c.color:G200),background:allS?c.color:'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer',touchAction:'manipulation'}}>
                        {allS&&<span style={{color:'white',fontSize:11}}>✓</span>}{someS&&<span style={{color:c.color,fontSize:11}}>–</span>}
                      </div>
                      <span style={{color:G400,fontSize:11}}>{open?'▲':'▼'}</span>
                    </div>
                    {open&&(<div style={{padding:'8px 14px 10px 20px',background:'#f9fafb'}}>
                      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                        {fi.map(function(w){var ri=ws.indexOf(w);var isSel=s.has(ri);
                          return (<div key={ri} onClick={function(){togW(c.id,ri);}} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:20,border:'1.5px solid '+(isSel?c.color:G200),background:isSel?(c.color+'15'):'white',cursor:'pointer',touchAction:'manipulation'}}>
                            {w.important&&<span style={{fontSize:9}}>⭐</span>}
                            <span style={{fontSize:11,fontWeight:w.important?'bold':'normal',color:isSel?c.color:G600}}>{w.word}</span>
                            <span style={{fontSize:10,color:G400}}>= {w.clue}</span>
                          </div>);
                        })}
                      </div>
                    </div>)}
                  </div>
                );
              })}
            </div>)}
          </div>
        );
      })}
      {topLevel.length===0&&<div style={{color:G400,fontSize:13,textAlign:'center',marginTop:30}}>Keine Kapitel mit gültigen Vokabeln gefunden.</div>}
    </div>
  );
}

export { CrosswordGame };
