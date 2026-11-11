// Topf 1 des Leiterspiels als Paar-Zuordnung: 2-4 Vokabeln auf einmal, deutsche
// Wörter mit der Übersetzung verbinden (Wischen oder nacheinander antippen).
// Ein Wort gilt als „sauber", wenn es ohne Fehlversuch verbunden wurde — nur
// dann steigt es in Topf 2 auf (siehe submitPotMatch in leiterspiel.jsx).
// Fehlversuch = ein Wischen/Tippen, das von diesem Wort ausging und danebenlag.
import { useEffect, useMemo, useRef, useState } from '../core/react.js';
import { BtnStyle, G100, G200, G400, G600, G900, GR, RE, T } from '../core/theme.js';
import { shuffleArr } from '../core/util.js';
import { SpeakButton } from './widgets.jsx';

function Card({ side, text, isMatched, isWrong, isActive, setRef, onDown }) {
  return <div ref={setRef} onPointerDown={onDown}
    style={{ padding: '14px 12px', borderRadius: 10, border: '2px solid ' + (isMatched ? GR : isWrong ? RE : isActive ? T : G200),
      background: isMatched ? '#d1fae5' : isWrong ? '#fee2e2' : isActive ? '#eff6ff' : 'white', color: isMatched ? '#065f46' : G900,
      fontSize: 14, fontWeight: isMatched ? 'bold' : 'normal', marginBottom: 10, textAlign: side === 'left' ? 'left' : 'right',
      touchAction: 'none', userSelect: 'none', cursor: isMatched ? 'default' : 'pointer', opacity: isMatched ? 0.75 : 1 }}>
    {text}
  </div>;
}

function PotMatch({ words, lang, onFinish }) {
  var pairs = useMemo(function () {
    return words.map(function (w, i) {
      return { id: i, word: w.word, clue: w.clue, isNew: ((w.correct || 0) + (w.wrong || 0)) === 0 };
    });
  }, [words]);
  var order = useMemo(function () {
    var l = shuffleArr(pairs), r = shuffleArr(pairs);
    // nicht zufällig auf gleicher Höhe landen lassen, sonst ist es geschenkt
    for (var tries = 0; tries < 5 && pairs.length > 1 && r.every(function (p, i) { return p.id === l[i].id; }); tries++) r = shuffleArr(pairs);
    return { left: l, right: r };
  }, [pairs]);

  var [stage, setStage] = useState(pairs.some(function (p) { return p.isNew; }) ? 'intro' : 'match');
  var [matched, setMatched] = useState({});
  var [wrongFlash, setWrongFlash] = useState(null);
  var [drag, setDrag] = useState(null);
  var [selected, setSelected] = useState(null);
  var wrongs = useRef({});
  var containerRef = useRef(null);
  var leftRefs = useRef({});
  var rightRefs = useRef({});

  var doneCount = Object.keys(matched).length;
  useEffect(function () {
    if (stage === 'match' && pairs.length && doneCount === pairs.length) {
      var t = setTimeout(function () { setStage('summary'); }, 600);
      return function () { clearTimeout(t); };
    }
  }, [doneCount, stage]);

  function hitCard(refs, x, y) {
    var ids = Object.keys(refs.current);
    for (var i = 0; i < ids.length; i++) {
      var el = refs.current[ids[i]];
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return +ids[i];
    }
    return null;
  }
  function anchor(side, id) {
    var el = (side === 'left' ? leftRefs : rightRefs).current[id];
    var cont = containerRef.current;
    if (!el || !cont) return { x: 0, y: 0 };
    var r = el.getBoundingClientRect(), c = cont.getBoundingClientRect();
    return side === 'left' ? { x: r.right - c.left, y: r.top + r.height / 2 - c.top } : { x: r.left - c.left, y: r.top + r.height / 2 - c.top };
  }

  // fromSide/fromId = womit begonnen wurde, toId = Karte auf der Gegenseite
  function attempt(fromSide, fromId, toId) {
    if (fromId === toId) {
      setMatched(function (m) { var n = Object.assign({}, m); n[fromId] = true; return n; });
    } else {
      wrongs.current[fromId] = (wrongs.current[fromId] || 0) + 1;
      setWrongFlash({ side: fromSide, a: fromId, b: toId });
      setTimeout(function () { setWrongFlash(null); }, 450);
    }
  }

  function startDrag(side, id, e) {
    if (matched[id]) return;
    var cont = containerRef.current; if (!cont) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    var a = anchor(side, id), c = cont.getBoundingClientRect();
    setDrag({ side: side, id: id, x1: a.x, y1: a.y, x2: e.clientX - c.left, y2: e.clientY - c.top, moved: false });
  }
  function moveDrag(e) {
    if (!drag) return;
    var c = containerRef.current.getBoundingClientRect();
    setDrag(function (d) {
      if (!d) return d;
      var x2 = e.clientX - c.left, y2 = e.clientY - c.top;
      return Object.assign({}, d, { x2: x2, y2: y2, moved: d.moved || Math.abs(x2 - d.x1) + Math.abs(y2 - d.y1) > 12 });
    });
  }
  function endDrag(e) {
    if (!drag) return;
    var started = drag;
    setDrag(null);
    var own = started.side === 'left' ? leftRefs : rightRefs;
    var other = started.side === 'left' ? rightRefs : leftRefs;
    var hitOther = hitCard(other, e.clientX, e.clientY);
    if (started.moved && hitOther != null) { setSelected(null); attempt(started.side, started.id, hitOther); return; }
    // Antippen: erst eine Karte wählen, dann die passende auf der Gegenseite
    var hitOwn = hitCard(own, e.clientX, e.clientY);
    if (hitOwn === started.id) {
      if (selected && selected.side !== started.side) { var s = selected; setSelected(null); attempt(s.side, s.id, started.id); }
      else setSelected({ side: started.side, id: started.id });
    }
  }

  function cardProps(side, p) {
    var isWrong = !!wrongFlash && ((wrongFlash.side === side && wrongFlash.a === p.id) || (wrongFlash.side !== side && wrongFlash.b === p.id));
    var isActive = (!!drag && drag.side === side && drag.id === p.id) || (!!selected && selected.side === side && selected.id === p.id);
    return { side: side, text: side === 'left' ? p.clue : p.word, isMatched: !!matched[p.id], isWrong: isWrong, isActive: isActive,
      setRef: function (el) { (side === 'left' ? leftRefs : rightRefs).current[p.id] = el; },
      onDown: function (e) { startDrag(side, p.id, e); } };
  }

  if (stage === 'intro') {
    return <div>
      <div style={{ textAlign: 'center', padding: '16px 12px', background: '#eff6ff', borderRadius: 14, marginBottom: 12, border: '2px solid #bfdbfe' }}>
        <div style={{ fontSize: 10, color: G400, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>🆕 Neue Wörter — merk dir die Paare</div>
        {pairs.map(function (p) {
          return <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, color: G900, marginBottom: 8 }}>
            <span>{p.clue}</span><span style={{ color: G400 }}>=</span>
            <span style={{ fontWeight: 'bold' }}>{p.word}</span>
            <SpeakButton text={p.word} lang={lang} style={{ fontSize: 16, padding: '0 2px' }} />
          </div>;
        })}
      </div>
      <button onClick={function () { setStage('match'); }} style={BtnStyle(GR, 'white', { width: '100%', padding: '14px', fontSize: 16 })}>Gemerkt — verbinden ▶</button>
    </div>;
  }

  if (stage === 'summary') {
    var clean = pairs.filter(function (p) { return !wrongs.current[p.id]; }).length;
    return <div>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 34 }}>{clean === pairs.length ? '🏆' : '👍'}</div>
        <div style={{ fontWeight: 'bold', fontSize: 15, color: T }}>{clean} von {pairs.length} auf Anhieb</div>
      </div>
      {pairs.map(function (p) {
        var ok = !wrongs.current[p.id];
        return <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, marginBottom: 8,
          background: ok ? '#d1fae5' : '#fef3c7', border: '2px solid ' + (ok ? GR : '#f59e0b'), fontSize: 14, color: G900 }}>
          <span style={{ flex: 1 }}><b>{p.word}</b> = {p.clue}</span>
          <SpeakButton text={p.word} lang={lang} style={{ fontSize: 15, padding: '0 2px' }} />
          <span style={{ fontSize: 11, color: G600 }}>{ok ? '⬆️ Topf 2' : '🔁 nochmal'}</span>
        </div>;
      })}
      <button onClick={function () {
        onFinish(pairs.map(function (p) { return { word: words[p.id].word, clean: !wrongs.current[p.id] }; }));
      }} style={BtnStyle(T, 'white', { width: '100%', padding: '14px', fontSize: 16, marginTop: 6 })}>Weiter ▶</button>
    </div>;
  }

  return <div>
    <div style={{ fontSize: 10, color: G400, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Topf 1 — Verbinde die Paare</div>
    <div style={{ fontSize: 11, color: G400, textAlign: 'center', marginBottom: 10 }}>Wische oder tippe: deutsches Wort → Übersetzung. {doneCount} / {pairs.length}</div>
    <div ref={containerRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
      style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 24 }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
        {pairs.filter(function (p) { return matched[p.id]; }).map(function (p) {
          var a = anchor('left', p.id), b = anchor('right', p.id);
          return <line key={p.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={GR} strokeWidth="2" opacity="0.5" />;
        })}
        {drag && drag.moved && <line x1={drag.x1} y1={drag.y1} x2={drag.x2} y2={drag.y2} stroke={T} strokeWidth="3" strokeLinecap="round" />}
      </svg>
      <div style={{ flex: 1 }}>{order.left.map(function (p) { return <Card key={p.id} {...cardProps('left', p)} />; })}</div>
      <div style={{ flex: 1 }}>{order.right.map(function (p) { return <Card key={p.id} {...cardProps('right', p)} />; })}</div>
    </div>
  </div>;
}

export { PotMatch };
