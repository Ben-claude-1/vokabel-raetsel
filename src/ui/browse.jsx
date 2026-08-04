import { useCallback, useMemo, useRef, useState } from '../core/react.js';
import { AM, BtnStyle, G100, G200, G400, G50, G600, G900, T, TD, TL } from '../core/theme.js';
import { safeWords } from '../core/words.js';

function Puzzle({ data, solPhrase, solMsg, onWord, chapId }) {
  var grid = data.grid, nums = data.nums, across = data.across, down = data.down, rows = data.rows, cols = data.cols, solCells = data.solCells;
  var [user, setUser] = useState(function(){ var u=[]; for(var r=0;r<rows;r++){u.push([]);for(var c=0;c<cols;c++)u[r].push("");} return u; });
  var [checked, setChecked] = useState(false);
  var [cc, setCC] = useState(0);
  var reported = useRef({});
  var refs = useRef({});
  var order = useMemo(function() { var o=[]; for(var r=0;r<rows;r++) for(var c=0;c<cols;c++) if((grid[r]||[])[c]!=="") o.push(r+","+c); return o; }, [grid,rows,cols]);
  var solMap = useMemo(function(){ var m={}; solCells.forEach(function(s){ m[s.r+","+s.c]=s; }); return m; }, [solCells]);
  var rev = solCells.map(function(s){ return (user[s.r]&&user[s.r][s.c]||"")===s.letter?s.letter:null; });
  var solOk = solCells.length>0 && rev.every(function(l){ return l!==null; });
  function focusNext(r,c){ var i=order.indexOf(r+","+c); if(i<order.length-1&&refs.current[order[i+1]]) refs.current[order[i+1]].focus(); }
  function focusPrev(r,c){ var i=order.indexOf(r+","+c); if(i>0&&refs.current[order[i-1]]) refs.current[order[i-1]].focus(); }
  var setCell = useCallback(function(r,c,v){ var ch=v.replace(/[^A-Za-z]/g,"").slice(-1); setUser(function(u){ var n=u.map(function(row){return row.slice();}); n[r][c]=ch; return n; }); setChecked(false); if(ch) setTimeout(function(){focusNext(r,c);},0); },[]);
  var handleKD = useCallback(function(r,c,e){ if(e.key==="Backspace"&&!(user[r]&&user[r][c])){ e.preventDefault(); focusPrev(r,c); } else if(e.key==="ArrowRight"&&(grid[r]||[])[c+1]!==""){if(refs.current[r+","+(c+1)])refs.current[r+","+(c+1)].focus();} else if(e.key==="ArrowLeft"&&(grid[r]||[])[c-1]!==""){if(refs.current[r+","+(c-1)])refs.current[r+","+(c-1)].focus();} else if(e.key==="ArrowDown"&&(grid[r+1]||[])[c]!==""){if(refs.current[(r+1)+","+c])refs.current[(r+1)+","+c].focus();} else if(e.key==="ArrowUp"&&(grid[r-1]||[])[c]!==""){if(refs.current[(r-1)+","+c])refs.current[(r-1)+","+c].focus();} },[user,grid]);
  function report(word,clue,uGrid,cnt){ if(reported.current[word]) return; var p=data.placed.find(function(pl){return pl.word===word;}); if(!p) return; var typed=""; for(var i=0;i<word.length;i++){var r2=p.dir==="H"?p.row:p.row+i,c2=p.dir==="H"?p.col+i:p.col;typed+=(uGrid[r2]&&uGrid[r2][c2])||"";} reported.current[word]=true; if(onWord) onWord({word:word,clue:clue,correct:typed===word,typedAnswer:typed,checkCount:cnt,chapId:chapId}); }
  function check(){ var n=cc+1; setCC(n); setChecked(true); [].concat(across,down).forEach(function(x){ report(x.word,x.clue,user,n); }); }
  function finish(){ [].concat(across,down).forEach(function(x){ report(x.word,x.clue,user,cc); }); }
  var corr=0,tot=0;
  if(checked) for(var r=0;r<rows;r++) for(var c=0;c<cols;c++) if((grid[r]||[])[c]!==""){tot++;if(user[r]&&user[r][c]===(grid[r]||[])[c])corr++;}
  var CS=26;
  return (
    <div>
      <div style={{fontSize:11,color:G600,textAlign:"center",marginBottom:8,padding:"4px 8px",background:"#f0f9ff",borderRadius:6,border:"1px solid #bae6fd"}}>ℹ️ Monate → <strong>Großbuchstaben</strong> · alle anderen → <strong>Kleinbuchstaben</strong></div>
      <div style={{overflowX:"auto",marginBottom:10}}>
        <table style={{borderCollapse:"collapse",margin:"0 auto"}}>
          <tbody>
            {Array(rows).fill(0).map(function(_,r){
              return (<tr key={r}>{Array(cols).fill(0).map(function(_,c){
                var letter=(grid[r]||[])[c]||"",isB=letter==="",num=nums[r+","+c],sol=solMap[r+","+c],uv=user[r]&&user[r][c]||"";
                var bg="white"; if(!isB&&sol) bg="#fffbeb"; if(checked&&!isB&&uv) bg=uv===letter?"#bbf7d0":"#fecaca";
                return (<td key={c} style={{width:CS,height:CS,padding:0,border:isB?"none":"1px solid #555",background:isB?"#18181b":bg,position:"relative"}}>
                  {!isB&&(<span>
                    {num&&<span style={{position:"absolute",top:1,left:2,fontSize:6,color:"#444",lineHeight:1,pointerEvents:"none",zIndex:3}}>{num}</span>}
                    {sol&&<span style={{position:"absolute",bottom:1,right:1,width:9,height:9,borderRadius:"50%",background:AM,color:"white",fontSize:5,fontWeight:"bold",display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:3}}>{sol.pos}</span>}
                    <input ref={function(el){if(el)refs.current[r+","+c]=el;else delete refs.current[r+","+c];}} type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck="false" value={uv}
                      onChange={function(e){setCell(r,c,e.target.value);}} onKeyDown={function(e){handleKD(r,c,e);}}
                      style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none",outline:"none",background:"transparent",textAlign:"center",fontSize:12,fontWeight:"bold",color:"#111",paddingTop:num?5:0,boxSizing:"border-box",cursor:"text"}}/>
                  </span>)}
                </td>);
              })}</tr>);
            })}
          </tbody>
        </table>
      </div>
      {solCells.length>0&&(<div style={{margin:"8px 0",padding:"8px 12px",background:solOk?"#fef9c3":"#f8fafc",border:"2px solid "+(solOk?AM:G200),borderRadius:8}}>
        <div style={{fontSize:10,color:G400,marginBottom:5,fontWeight:"bold",textTransform:"uppercase",letterSpacing:1}}>🔑 Lösungswort</div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{solCells.map(function(sc,i){ var r2=rev[i]; return (<div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><div style={{width:24,height:24,border:"2px solid "+(r2?AM:G200),borderRadius:4,background:r2?"#fef3c7":"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:"bold",color:G900}}>{r2||""}</div><span style={{fontSize:7,color:AM,fontWeight:"bold"}}>{sc.pos}</span></div>); })}</div>
        {solOk&&<div style={{marginTop:8,padding:"6px 10px",background:"#fef08a",borderRadius:6,fontSize:14,fontWeight:"bold",color:"#92400e",textAlign:"center"}}>{solMsg}</div>}
      </div>)}
      <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:8,flexWrap:"wrap"}}>
        <button onClick={check} style={BtnStyle(T)}>✓ Prüfen</button>
        <button onClick={function(){setUser(function(){var u=[];for(var r=0;r<rows;r++){u.push([]);for(var c=0;c<cols;c++)u[r].push("");}return u;});setChecked(false);}} style={BtnStyle(G400)}>↺ Reset</button>
        <button onClick={finish} style={BtnStyle("#7c3aed")}>✅ Abschließen</button>
      </div>
      {checked&&<div style={{textAlign:"center",marginBottom:8,padding:"6px 10px",borderRadius:6,fontWeight:"bold",fontSize:13,background:corr===tot?"#d1fae5":"#fee2e2",color:corr===tot?"#065f46":"#991b1b"}}>{corr}/{tot} richtig {corr===tot?"🎉 Perfekt!":""} · Prüfen: {cc}×</div>}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:4}}>
        {[["→ Waagerecht",across],["↓ Senkrecht",down]].map(function(pair){
          var t2=pair[0],clues=pair[1];
          return (<div key={t2} style={{flex:"1 1 160px",minWidth:0}}>
            <div style={{fontWeight:"bold",fontSize:12,color:T,borderBottom:"2px solid "+T,marginBottom:4,paddingBottom:2}}>{t2}</div>
            {clues.map(function(item){ return (<div key={item.n} style={{fontSize:11,marginBottom:2,display:"flex",gap:4,alignItems:"baseline"}}><strong style={{minWidth:18,color:TD}}>{item.n}.</strong><span style={{color:G600}}>{item.clue}</span><span style={{marginLeft:"auto",fontSize:9,color:G400}}>({item.word.length})</span></div>); })}
          </div>);
        })}
      </div>
    </div>
  );
}

function WordSelector({ chapters, onStart, mode }) {
  var [openCh, setOpenCh] = useState(null);
  var [sel, setSel] = useState({});
  var [filter, setFilter] = useState("all");
  var total = Object.values(sel).reduce(function(s,set){ return s+set.size; }, 0);
  function getFiltered(ch){ return filter==="important" ? safeWords(ch.words).filter(function(w){return w.important;}) : ch.words; }
  function togAll(ch){ setSel(function(prev){ var n=Object.assign({},prev); var fi=getFiltered(ch); var cur=n[ch.id]||new Set(); var allS=fi.every(function(w){return cur.has(ch.words.indexOf(w));}); var next=new Set(cur); if(allS) fi.forEach(function(w){next.delete(ch.words.indexOf(w));}); else fi.forEach(function(w){next.add(ch.words.indexOf(w));}); n[ch.id]=next; return n; }); }
  function togW(chId,idx){ setSel(function(prev){ var n=Object.assign({},prev); var cur=new Set(n[chId]||[]); if(cur.has(idx)) cur.delete(idx); else cur.add(idx); n[chId]=cur; return n; }); }
  function getWords(){ var w=[]; chapters.forEach(function(ch){ var s=sel[ch.id]||new Set(); s.forEach(function(i){ if(ch.words[i]) w.push(Object.assign({},ch.words[i],{chapterId:ch.id})); }); }); return w; }
  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:12,padding:"8px 12px",background:G50,borderRadius:10,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:G600,fontWeight:"bold"}}>Anzeigen:</span>
        {[["all","📚 Alle"],["important","⭐ Nur fett"]].map(function(pair){ return <button key={pair[0]} onClick={function(){setFilter(pair[0]);}} style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:"bold",background:filter===pair[0]?T:"white",color:filter===pair[0]?"white":G600,border:"1.5px solid "+(filter===pair[0]?T:G200),cursor:"pointer"}}>{pair[1]}</button>; })}
      </div>
      <div style={{marginBottom:12,padding:"10px 14px",background:TL,borderRadius:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,color:T,fontWeight:"bold"}}>{total} Vokabeln gewählt</span>
        <button onClick={function(){ if(total>=3) onStart(getWords()); }} disabled={total<3} style={BtnStyle(total>=3?T:G400,"#fff",{padding:"6px 14px",opacity:total<3?0.5:1})}>{mode==="battle"?"⚔️ Rätsel-Duell":"🎯 Lernen starten"}</button>
      </div>
      {total<3&&<p style={{fontSize:11,color:G400,textAlign:"center",marginBottom:8}}>Mindestens 3 Vokabeln auswählen</p>}
      {chapters.map(function(ch){ var s=sel[ch.id]||new Set(); var fi=getFiltered(ch); var allS=fi.length>0&&fi.every(function(w){return s.has(ch.words.indexOf(w));}); var someS=fi.some(function(w){return s.has(ch.words.indexOf(w));})&&!allS; var open=openCh===ch.id;
        return (<div key={ch.id} style={{marginBottom:8,border:"2px solid "+(s.size>0?ch.color:G200),borderRadius:12,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:s.size>0?(ch.color+"15"):"white",cursor:"pointer"}} onClick={function(){setOpenCh(open?null:ch.id);}}>
            <span style={{fontSize:20}}>{ch.icon}</span>
            <div style={{flex:1}}><div style={{fontWeight:"bold",fontSize:13,color:ch.color}}>{ch.title}</div><div style={{fontSize:11,color:G400}}>{safeWords(ch.words).length} gesamt · {safeWords(ch.words).filter(function(w){return w.important;}).length} ⭐ · {s.size} gewählt</div></div>
            <div onClick={function(e){e.stopPropagation();togAll(ch);}} style={{width:22,height:22,borderRadius:6,border:"2px solid "+(allS?ch.color:someS?ch.color:G200),background:allS?ch.color:"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
              {allS&&<span style={{color:"white",fontSize:13}}>✓</span>}{someS&&<span style={{color:ch.color,fontSize:13}}>–</span>}
            </div>
            <span style={{color:G400,fontSize:12}}>{open?"▲":"▼"}</span>
          </div>
          {open&&(<div style={{padding:"8px 14px 12px",background:"#fafafa",borderTop:"1px solid "+G200}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {fi.map(function(w){ var ri=ch.words.indexOf(w); var isSel=s.has(ri);
                return (<div key={ri} onClick={function(){togW(ch.id,ri);}} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:20,border:"1.5px solid "+(isSel?ch.color:G200),background:isSel?(ch.color+"15"):"white",cursor:"pointer"}}>
                  {w.important&&<span style={{fontSize:9}}>⭐</span>}
                  <span style={{fontSize:12,fontWeight:w.important?"bold":"normal",color:isSel?ch.color:G600}}>{w.word}</span>
                  <span style={{fontSize:10,color:G400}}>= {w.clue}</span>
                </div>); })}
            </div>
          </div>)}
        </div>); })}
    </div>
  );
}

function BrowseChapter({ ch }) {
  var [open, setOpen] = useState(false);
  var [showSent, setShowSent] = useState(false);
  var sentCount = (ch.sentences||[]).length;
  return (
    <div style={{marginBottom:8,border:'2px solid '+ch.color+'30',borderRadius:12,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:ch.color+'10',cursor:'pointer'}} onClick={function(){setOpen(function(o){return !o;});}}>
        <span style={{fontSize:20}}>{ch.icon}</span>
        <div style={{flex:1}}><div style={{fontWeight:'bold',fontSize:13,color:ch.color}}>{ch.title}</div><div style={{fontSize:11,color:G400}}>{safeWords(ch.words).length} Vokabeln · {safeWords(ch.words).filter(function(w){return w.important;}).length} ⭐{sentCount?' · '+sentCount+' Sätze':''}</div></div>
        <span style={{color:G400,fontSize:12}}>{open?'▲':'▼'}</span>
      </div>
      {open&&(<div style={{padding:'10px 14px',background:'#fafafa',borderTop:'1px solid '+G200}}>
        {sentCount>0&&(<div style={{display:'flex',gap:6,marginBottom:8}}>
          <button onClick={function(){setShowSent(false);}} style={{flex:1,padding:'5px',borderRadius:6,border:'2px solid '+(showSent?G200:ch.color),background:showSent?'white':ch.color+'15',cursor:'pointer',fontSize:11,fontWeight:'bold',color:showSent?G600:ch.color}}>📝 Vokabeln</button>
          <button onClick={function(){setShowSent(true);}} style={{flex:1,padding:'5px',borderRadius:6,border:'2px solid '+(showSent?ch.color:G200),background:showSent?ch.color+'15':'white',cursor:'pointer',fontSize:11,fontWeight:'bold',color:showSent?ch.color:G600}}>💬 Sätze ({sentCount})</button>
        </div>)}
        {!showSent&&ch.words.slice().sort(function(a,b){return (a.word||'').toLowerCase().localeCompare((b.word||'').toLowerCase());}).map(function(w,i){
          return(<div key={i} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid '+G100,fontSize:12}}><span style={{fontWeight:w.important?'bold':'normal'}}>{w.important?'⭐ ':''}{w.word}</span><span style={{color:G400}}>{w.clue}</span></div>);
        })}
        {showSent&&(ch.sentences||[]).map(function(s,i){ return(<div key={i} style={{padding:'6px 0',borderBottom:'1px solid '+G100}}><div style={{fontSize:12,fontWeight:s.important?'bold':'normal'}}>{s.important?'⭐ ':''}{s.text}</div><div style={{fontSize:11,color:G400}}>{s.translation}</div></div>); })}
      </div>)}
    </div>
  );
}

export { Puzzle, WordSelector, BrowseChapter };
