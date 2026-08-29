// Verben-Trainer für die unregelmäßigen Verben (Chicken/Hamburger/Echo/Miau/
// Sonstige). Eigenes Modul statt Erweiterung der generischen Vokabelkarte,
// weil hier — anders als sonst im Leiterspiel — eine Frage bis zu drei
// Antworten gleichzeitig prüft (Grundform, Simple Past, Past Participle).
// Wird von leiterspiel.jsx eingebunden, sobald ein Wort ein `pattern`-Feld
// trägt; die Fortschritts-/Topf-Mechanik (Streak, Auf-/Abstieg, Wiederholung)
// bleibt dieselbe wie bei den anderen Kapiteln, siehe submitVerbAnswer dort.
import { useEffect, useMemo, useState } from '../core/react.js';
import { BtnStyle, G100, G200, G400, G50, G600, G900, T } from '../core/theme.js';
import { shuffleArr } from '../core/util.js';
import { checkAnswer, wordDisplay } from '../core/words.js';

var patternMeta = {
  chicken:   {emoji:'🐔', label:'Chicken',   rule:'alle 3 Formen gleich'},
  hamburger: {emoji:'🍔', label:'Hamburger', rule:'1. und 3. Form gleich'},
  echo:      {emoji:'📢', label:'Echo',      rule:'2. und 3. Form gleich'},
  miau:      {emoji:'🐱', label:'Miau',      rule:'I → A → U'},
  sonstige:  {emoji:'🔀', label:'Sonstige',  rule:'alle 3 Formen verschieden'}
};

var VERB_POT_LABEL = {1:'Zuordnen', 2:'Mit Hilfe', 3:'Abfrage', 4:'Rückwärts', 5:'Rückwärts', 6:'Gelernt'};
var VERB_POT_ICON  = {1:'🧩', 2:'💡', 3:'✍️', 4:'🔄', 5:'🔄', 6:'🏆'};

// Anzeigeform ohne Klammer-Zusatz und ohne Alternative nach dem Komma —
// „learnt (learned)“ → „learnt“, „was, were“ → „was“. Zum Tippen gilt trotzdem
// der volle Feldtext (siehe gradeField), das hier ist nur fürs Auge.
function primaryForm(s) {
  return String(s || '').split(',')[0].replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function gradeField(typed, expectedFull, label) {
  var status = checkAnswer(typed, expectedFull || '');
  return {label:label, typed:typed, expected:primaryForm(expectedFull), correct: status==='correct'||status==='partial'};
}

function patternBadge(pattern) {
  var pm = patternMeta[pattern] || patternMeta.sonstige;
  return <div style={{display:'inline-block',fontSize:11,fontWeight:'bold',color:T,background:'#f0fdfa',border:'2px solid '+T,borderRadius:20,padding:'2px 10px',marginBottom:8}}>
    {pm.emoji} {pm.label} · {pm.rule}
  </div>;
}

function VerbHeader({current}) {
  return <div style={{textAlign:'center',marginBottom:12}}>
    {patternBadge(current.pattern)}
    <div style={{fontSize:22,fontWeight:'bold',color:G900}}>{current.clue}</div>
  </div>;
}

function FieldRow({label, value, onChange, placeholder, onEnter, autoFocus}) {
  return <div style={{marginBottom:8}}>
    <div style={{fontSize:11,color:G400,marginBottom:3,fontWeight:'bold'}}>{label}</div>
    <input value={value} onChange={function(e){onChange(e.target.value);}}
      onKeyDown={function(e){if(e.key==='Enter') onEnter();}}
      autoFocus={autoFocus} autoCapitalize='none' autoCorrect='off' autoComplete='off' spellCheck='false'
      placeholder={placeholder||''}
      style={{width:'100%',padding:'10px 12px',fontSize:16,border:'2px solid '+G200,borderRadius:10,outline:'none',boxSizing:'border-box'}}/>
  </div>;
}

// Gemeinsames Grundgerüst für Hint-/Free-Typing (Topf 2/3) und Rückwärts
// (Topf 4/5): drei Felder, ein „Nicht gewusst"-Ausstieg, ein Prüfen-Knopf.
function ThreeFieldCard({fieldsMeta, potLabel, onSubmit}) {
  var [values, setValues] = useState(function(){
    var v = {}; fieldsMeta.forEach(function(f){ v[f.key]=''; }); return v;
  });
  useEffect(function(){
    var v = {}; fieldsMeta.forEach(function(f){ v[f.key]=''; }); setValues(v);
  }, [fieldsMeta.map(function(f){return f.expectedFull;}).join('|')]);

  function submit() {
    var fields = fieldsMeta.map(function(f){ return gradeField(values[f.key], f.expectedFull, f.label); });
    var allCorrect = fields.every(function(f){ return f.correct; });
    onSubmit({allCorrect:allCorrect, fields:fields, typed:values});
  }
  function giveUp() {
    var fields = fieldsMeta.map(function(f){ return {label:f.label, typed:'', expected:primaryForm(f.expectedFull), correct:false}; });
    onSubmit({allCorrect:false, fields:fields, typed:values});
  }

  return <div>
    {fieldsMeta.map(function(f, i){
      return <FieldRow key={f.key} label={f.label} value={values[f.key]}
        placeholder={f.placeholder} autoFocus={i===0}
        onChange={function(v){ setValues(Object.assign({}, values, {[f.key]:v})); }}
        onEnter={function(){ if(i===fieldsMeta.length-1) submit(); }}/>;
    })}
    <div style={{fontSize:10,color:G400,marginBottom:10,textTransform:'uppercase',letterSpacing:1,textAlign:'center'}}>{potLabel}</div>
    <button onClick={submit} style={BtnStyle(T,'white',{width:'100%',padding:'12px',fontSize:15,marginBottom:8})}>✓ Prüfen</button>
    <button onClick={giveUp} style={BtnStyle(G100,G600,{width:'100%',padding:'8px',fontSize:12})}>Nicht gewusst / Lösung zeigen</button>
  </div>;
}

// Erste Buchstaben als Platzhalter — bewusst einfach (kein Buchstaben-Puzzle
// wie Topf 2 bei den Vokabeln), das würde für drei parallele Felder mit
// unterschiedlicher Länge zu unübersichtlich.
function hintPlaceholder(expectedFull) {
  var p = primaryForm(expectedFull);
  return p ? p[0]+'…' : '';
}

function VerbFieldsPanel({current, mode, onSubmit}) {
  var withHint = mode === 'hint';
  // Chicken: alle 3 Formen sind textgleich — dreimal dieselbe Zeichenkette
  // abtippen prüft nichts (siehe ChatGPT-Vorlage: dort wird das nur einmal
  // schnell im Kopf bestätigt, "cut – cut – cut"), deshalb nur 1 Feld.
  var isChicken = current.pattern === 'chicken';
  var fieldsMeta = useMemo(function(){
    if(isChicken) return [
      {key:'grundform', label:'Form (alle 3 gleich)', expectedFull: wordDisplay(current), placeholder: withHint?hintPlaceholder(current.word):''}
    ];
    return [
      {key:'grundform', label:'Grundform', expectedFull: wordDisplay(current), placeholder: withHint?hintPlaceholder(current.word):''},
      {key:'simplePast', label:'Simple Past', expectedFull: current.pastSimple, placeholder: withHint?hintPlaceholder(current.pastSimple):''},
      {key:'pastParticiple', label:'Past Participle', expectedFull: current.pastParticiple, placeholder: withHint?hintPlaceholder(current.pastParticiple):''}
    ];
  }, [current.word, mode]);
  return <div style={{padding:'16px',background:withHint?'#eff6ff':'#f0fdf4',borderRadius:14,border:'2px solid '+(withHint?'#93c5fd':'#86efac')}}>
    <VerbHeader current={current}/>
    <ThreeFieldCard fieldsMeta={fieldsMeta} potLabel={withHint?'Mit Hilfe — erster Buchstabe':'Abfrage — ohne Hilfe'} onSubmit={onSubmit}/>
  </div>;
}

function VerbReversePanel({current, showForm, onSubmit}) {
  var isChicken = current.pattern === 'chicken';
  var shownFull = showForm==='pastParticiple' ? current.pastParticiple : current.pastSimple;
  var missingKey = showForm==='pastParticiple' ? 'pastSimple' : 'pastParticiple';
  var missingLabel = showForm==='pastParticiple' ? 'Simple Past' : 'Past Participle';
  var shownDisplay = primaryForm(shownFull).replace(/^(\S+)$/, '$1'); // nur zur Klarheit, keine Änderung
  // Chicken: die gezeigte Form ist textgleich mit Grundform UND der fehlenden
  // Form — "Grundform"/"other" abzufragen hieße nur, den bereits sichtbaren
  // Text nochmal abzuschreiben. Einzig sinnvoller Test bleibt die Bedeutung.
  var fieldsMeta = useMemo(function(){
    if(isChicken) return [
      {key:'meaning', label:'Bedeutung (Deutsch)', expectedFull: current.meaning}
    ];
    return [
      {key:'grundform', label:'Grundform', expectedFull: wordDisplay(current)},
      {key:'meaning', label:'Bedeutung (Deutsch)', expectedFull: current.meaning},
      {key:'other', label:missingLabel, expectedFull: current[missingKey]}
    ];
  }, [current.word, showForm]);
  return <div style={{padding:'16px',background:'#fff7ed',borderRadius:14,border:'2px solid #fdba74'}}>
    <div style={{textAlign:'center',marginBottom:12}}>
      {patternBadge(current.pattern)}
      <div style={{fontSize:11,color:G400,marginBottom:2,textTransform:'uppercase',letterSpacing:1}}>{showForm==='pastParticiple'?'Past Participle':'Simple Past'}</div>
      <div style={{fontSize:26,fontWeight:'bold',color:G900}}>{shownDisplay.replace(/\s*,\s*/g,' / ')}</div>
    </div>
    <ThreeFieldCard fieldsMeta={fieldsMeta} potLabel='Rückwärts' onSubmit={onSubmit}/>
  </div>;
}

function VerbMatchPanel({current, onSubmit}) {
  var chips = useMemo(function(){
    return shuffleArr([
      {id:'base', text:primaryForm(current.word)},
      {id:'past', text:primaryForm(current.pastSimple)},
      {id:'part', text:primaryForm(current.pastParticiple)}
    ]);
  }, [current.word]);
  var slots = [
    {key:'grundform', label:'Grundform'},
    {key:'simplePast', label:'Simple Past'},
    {key:'pastParticiple', label:'Past Participle'}
  ];
  var emptyAssign = {grundform:null, simplePast:null, pastParticiple:null};
  var [assign, setAssign] = useState(emptyAssign);
  var [selected, setSelected] = useState(null);
  useEffect(function(){ setAssign(emptyAssign); setSelected(null); }, [current.word]);

  var usedIds = Object.keys(assign).map(function(k){ return assign[k]; }).filter(Boolean);
  function chipText(id){ var c = chips.filter(function(x){return x.id===id;})[0]; return c ? c.text : ''; }
  function tapChip(chip){
    if(usedIds.indexOf(chip.id)>=0) return;
    setSelected(selected===chip.id ? null : chip.id);
  }
  function tapSlot(slotKey){
    if(assign[slotKey]){ var next=Object.assign({},assign); next[slotKey]=null; setAssign(next); return; }
    if(!selected) return;
    var next2=Object.assign({},assign); next2[slotKey]=selected; setAssign(next2);
    setSelected(null);
  }
  var allFilled = slots.every(function(s){ return !!assign[s.key]; });

  function fieldsMetaFor(){
    return [
      {key:'grundform', label:'Grundform', expectedFull: wordDisplay(current)},
      {key:'simplePast', label:'Simple Past', expectedFull: current.pastSimple},
      {key:'pastParticiple', label:'Past Participle', expectedFull: current.pastParticiple}
    ];
  }
  function submit(){
    if(!allFilled) return;
    var fields = fieldsMetaFor().map(function(f){ return gradeField(chipText(assign[f.key]), f.expectedFull, f.label); });
    var allCorrect = fields.every(function(f){ return f.correct; });
    onSubmit({allCorrect:allCorrect, fields:fields, typed:assign});
  }
  function giveUp(){
    var fields = fieldsMetaFor().map(function(f){ return {label:f.label, typed:'', expected:primaryForm(f.expectedFull), correct:false}; });
    onSubmit({allCorrect:false, fields:fields, typed:assign});
  }

  return <div style={{padding:'16px',background:G50,borderRadius:14,border:'2px solid '+G200}}>
    <VerbHeader current={current}/>
    <div style={{fontSize:11,color:G400,textAlign:'center',marginBottom:8}}>Tippe eine Form an, dann das passende Feld</div>
    <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:16,flexWrap:'wrap'}}>
      {chips.map(function(chip){
        var used = usedIds.indexOf(chip.id)>=0;
        var isSel = selected===chip.id;
        return <button key={chip.id} onClick={function(){tapChip(chip);}} disabled={used}
          style={BtnStyle(isSel?T:'white', isSel?'white':G900, {padding:'10px 16px',fontSize:16,fontWeight:'bold',border:'2px solid '+(isSel?T:G200),opacity:used?0.25:1,cursor:used?'default':'pointer'})}>
          {chip.text}
        </button>;
      })}
    </div>
    <div style={{marginBottom:12}}>
      {slots.map(function(s){
        var filled = assign[s.key];
        return <div key={s.key} onClick={function(){tapSlot(s.key);}}
          style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',marginBottom:6,borderRadius:10,
            border:'2px dashed '+(filled?T:G200),background:filled?'#f0fdfa':'white',cursor:'pointer'}}>
          <span style={{fontSize:12,color:G600,fontWeight:'bold'}}>{s.label}</span>
          <span style={{fontSize:16,fontWeight:'bold',color:filled?T:G400}}>{filled?chipText(filled):'– antippen –'}</span>
        </div>;
      })}
    </div>
    <button onClick={submit} disabled={!allFilled} style={BtnStyle(T,'white',{width:'100%',padding:'12px',fontSize:15,marginBottom:8,opacity:allFilled?1:0.4})}>✓ Prüfen</button>
    <button onClick={giveUp} style={BtnStyle(G100,G600,{width:'100%',padding:'8px',fontSize:12})}>Nicht gewusst / Lösung zeigen</button>
  </div>;
}

function VerbResultFields({fields}) {
  if(!fields || !fields.length) return null;
  return <div style={{marginTop:8}}>
    {fields.map(function(f, i){
      return <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',marginBottom:3,borderRadius:8,background:f.correct?'#d1fae5':'#fee2e2',fontSize:12}}>
        <span style={{color:G600}}>{f.label}</span>
        <span style={{fontWeight:'bold',color:f.correct?'#065f46':'#991b1b'}}>
          {f.correct ? f.expected : (f.typed ? f.typed+' → '+f.expected : f.expected)}
        </span>
      </div>;
    })}
  </div>;
}

export { patternMeta, VERB_POT_LABEL, VERB_POT_ICON, primaryForm, VerbFieldsPanel, VerbReversePanel, VerbMatchPanel, VerbResultFields };
