// Zwei Wischgesten-Spiele auf demselben Vokabelpool wie Satzvokabel (gelernter
// Klasse-6-Wortschatz der gewählten Sprache, siehe fetchKlasse6Pool/
// fetchAllKlasse6Vocab in wiederholung.jsx):
//
//   Wortkreis     — deutsches Wort vorgegeben, die Buchstaben des gesuchten
//                   Worts liegen gemischt im Kreis; man wischt sie in der
//                   richtigen Reihenfolge zusammen, ohne den Finger abzusetzen.
//   Vokabelpaare  — zwei Spalten (10 deutsch, 10 englisch), man wischt vom
//                   deutschen Wort zur passenden Übersetzung.
import { CREDIT, logWordEvent, tallyAnswer } from '../core/leitner.js';
import { useEffect, useMemo, useRef, useState } from '../core/react.js';
import { langLabel } from '../core/scope.js';
import { BtnStyle, G100, G200, G400, G600, G900, GR, RE, T } from '../core/theme.js';
import { shuffleArr } from '../core/util.js';
import { SatzVokabelGame } from './leiterspiel.jsx';
import { fetchAllKlasse6Vocab, fetchKlasse6Pool, WiederholungWrap } from './wiederholung.jsx';
import { SpeakButton } from './widgets.jsx';

// ───────────────────────── Wortkreis ─────────────────────────

var ROUND_SIZE = 12;

// Nur einfache einzelne Wörter passen in den Kreis — Mehrwort-Phrasen oder
// Zahlen/Satzzeichen ließen sich nicht sinnvoll zu Buchstaben-Kacheln machen.
function pickLetterWord(w) {
  var word = (w.word || '').trim();
  if (!word || /[\s,;()/0-9']/.test(word)) return null;
  if (word.length < 3 || word.length > 9) return null;
  return word;
}

function buildCircle(target) {
  var tiles = target.split('').map(function (ch, i) { return { letter: ch, srcIdx: i }; });
  tiles = shuffleArr(tiles);
  var n = tiles.length;
  var R = n <= 6 ? 82 : 92;
  var size = n <= 6 ? 46 : n <= 8 ? 40 : 36;
  tiles.forEach(function (t, i) {
    var ang = -Math.PI / 2 + i * (2 * Math.PI / n);
    t.cx = 120 + R * Math.cos(ang);
    t.cy = 120 + R * Math.sin(ang);
    t.size = size;
  });
  return tiles;
}

function WortkreisGame({ words, lang, player, onUpdateScore, onDone }) {
  var pid = player && player.id;
  var round = useMemo(function () {
    var eligible = (words || []).map(function (w) {
      var target = pickLetterWord(w);
      return target ? { word: w.word, clue: w.clue, lang: w.lang || lang, target: target } : null;
    }).filter(Boolean);
    return shuffleArr(eligible).slice(0, Math.min(ROUND_SIZE, eligible.length));
  }, [words]);

  var [idx, setIdx] = useState(0);
  var [selected, setSelected] = useState([]);
  var [dragging, setDragging] = useState(false);
  var [tries, setTries] = useState(0);
  var [phase, setPhase] = useState('q'); // q, show
  var [result, setResult] = useState(null);
  var [flash, setFlash] = useState(false);
  var [total, setTotal] = useState(0);
  var containerRef = useRef(null);
  var tileRefs = useRef([]);

  var cur = round[idx];
  var tiles = useMemo(function () { return cur ? buildCircle(cur.target) : []; }, [cur && cur.target, idx]);

  if (!round.length) return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🔤</div>
      <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 6 }}>Noch nicht genug passende Vokabeln</div>
      <div style={{ fontSize: 12, color: G600, marginBottom: 16 }}>Der Wortkreis braucht einfache, einzelne Wörter (3–9 Buchstaben) aus deinem gelernten Wortschatz.</div>
      <button onClick={onDone} style={BtnStyle(G100, G600, { padding: '10px 20px' })}>Zurück</button>
    </div>
  </WiederholungWrap>;

  if (idx >= round.length) return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
      <div style={{ fontWeight: 'bold', fontSize: 17, color: T, marginBottom: 4 }}>Geschafft!</div>
      <div style={{ fontSize: 14, color: G600, marginBottom: 20 }}>{total} Punkte</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={function () { setIdx(0); setTotal(0); }} style={BtnStyle('#16a34a', 'white', { padding: '12px 20px', fontSize: 14 })}>↺ Nochmal</button>
        <button onClick={onDone} style={BtnStyle(T, 'white', { padding: '12px 20px', fontSize: 14 })}>← Zurück</button>
      </div>
    </div>
  </WiederholungWrap>;

  function hitTest(x, y) {
    for (var i = 0; i < tiles.length; i++) {
      var el = tileRefs.current[i];
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = x - cx, dy = y - cy;
      if (Math.sqrt(dx * dx + dy * dy) <= r.width / 2) return i;
    }
    return null;
  }

  function evaluate(sel) {
    var word = sel.map(function (i) { return tiles[i].letter; }).join('');
    var ok = sel.length === tiles.length && word.toLowerCase() === cur.target.toLowerCase();
    if (ok) {
      var pts = tries === 0 ? 10 : tries === 1 ? 5 : 0;
      var credit = tries === 0 ? CREDIT.review0 : tries === 1 ? CREDIT.review1 : CREDIT.review2;
      tallyAnswer(true, false, credit);
      logWordEvent(pid, 'wortkreis', null, cur.word, cur.clue, true, null);
      if (pts > 0 && onUpdateScore) onUpdateScore(pts);
      setTotal(function (t) { return t + pts; });
      setResult({ correct: true, points: pts });
      setPhase('show');
    } else {
      setTries(function (t) { return t + 1; });
      setSelected([]);
      setFlash(true);
      setTimeout(function () { setFlash(false); }, 400);
    }
  }

  function giveUp() {
    tallyAnswer(false, true);
    logWordEvent(pid, 'wortkreis', null, cur.word, cur.clue, false, null);
    setResult({ correct: false, points: 0 });
    setPhase('show');
  }

  function next() {
    setIdx(function (i) { return i + 1; }); setSelected([]); setTries(0); setResult(null); setPhase('q'); setFlash(false);
  }

  function onDown(e) {
    if (phase !== 'q') return;
    var hit = hitTest(e.clientX, e.clientY);
    if (hit == null) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    setDragging(true); setSelected([hit]);
  }
  function onMove(e) {
    if (!dragging) return;
    var hit = hitTest(e.clientX, e.clientY);
    if (hit == null) return;
    setSelected(function (sel) {
      if (sel.indexOf(hit) >= 0 || sel.length >= tiles.length) return sel;
      return sel.concat([hit]);
    });
  }
  function onUp() {
    if (!dragging) return;
    setDragging(false);
    // Erst werten, wenn wirklich alle Buchstaben ausgewählt sind — sonst
    // zählte ein zu früh abgesetzter Finger als Fehlversuch, obwohl der
    // Spieler einfach nur neu ansetzen wollte.
    if (selected.length === tiles.length) evaluate(selected);
    else setSelected([]);
  }

  var liveWord = selected.map(function (i) { return tiles[i].letter; }).join('').toUpperCase();

  if (phase === 'show' && result) return <WiederholungWrap>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: G600, marginBottom: 10 }}>
      <span>Wort {idx + 1} / {round.length}</span>
      <span style={{ fontWeight: 'bold', color: T }}>{total} Punkte</span>
    </div>
    <div style={{ background: result.correct ? '#d1fae5' : '#fee2e2', borderRadius: 14, padding: '20px 16px', marginBottom: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 34, marginBottom: 6 }}>{result.correct ? '✅' : '🏳️'}</div>
      <div style={{ fontSize: 14, fontWeight: 'bold', color: result.correct ? '#065f46' : '#991b1b' }}>
        {result.correct ? ('Richtig! +' + result.points + ' Punkte') : 'Aufgegeben'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 'bold', color: G900, letterSpacing: 2 }}>{cur.target.toUpperCase()}</span>
        <SpeakButton text={cur.target} lang={cur.lang} />
      </div>
      <div style={{ fontSize: 11, color: G600, marginTop: 8 }}>{cur.clue}</div>
    </div>
    <button onClick={next} style={BtnStyle(T, 'white', { width: '100%', padding: '14px', fontSize: 15 })}>{idx + 1 >= round.length ? 'Ergebnis anzeigen' : 'Weiter →'}</button>
  </WiederholungWrap>;

  return <WiederholungWrap>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: G600, marginBottom: 10 }}>
      <span>Wort {idx + 1} / {round.length}</span>
      <span style={{ fontWeight: 'bold', color: T }}>{total} Punkte</span>
    </div>
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid ' + G200, padding: 16, marginBottom: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: G400, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Gesuchtes Wort</div>
      <div style={{ fontSize: 22, fontWeight: 'bold', color: T }}>{cur.clue}</div>
    </div>
    <div style={{ textAlign: 'center', minHeight: 28, marginBottom: 8, fontSize: 22, fontWeight: 'bold', letterSpacing: 3, color: flash ? RE : G900 }}>
      {liveWord || '·'.repeat(tiles.length)}
    </div>
    <div ref={containerRef}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{ position: 'relative', width: 240, height: 240, margin: '0 auto 16px', touchAction: 'none' }}>
      <svg width={240} height={240} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {selected.length > 1 && <polyline fill="none" stroke={flash ? RE : T} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          points={selected.map(function (i) { return tiles[i].cx + ',' + tiles[i].cy; }).join(' ')} />}
      </svg>
      {tiles.map(function (t, i) {
        var sel = selected.indexOf(i) >= 0;
        return <div key={i} ref={function (el) { tileRefs.current[i] = el; }}
          style={{ position: 'absolute', left: t.cx - t.size / 2, top: t.cy - t.size / 2, width: t.size, height: t.size, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.size > 42 ? 18 : 15, fontWeight: 'bold',
            background: sel ? (flash ? RE : T) : 'white', color: sel ? 'white' : G900, border: '2px solid ' + (sel ? (flash ? RE : T) : G200),
            userSelect: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'background .15s,border-color .15s' }}>
          {t.letter.toUpperCase()}
        </div>;
      })}
    </div>
    <div style={{ fontSize: 11, color: G400, textAlign: 'center', marginBottom: 12 }}>Wische über die Buchstaben, um das Wort zu bilden.</div>
    {tries > 0 && <div style={{ fontSize: 11, color: '#d97706', textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}>{tries === 1 ? '💡 noch 5 Punkte' : '💡 0 Punkte möglich'}</div>}
    <button onClick={giveUp} style={BtnStyle(G100, G600, { width: '100%', padding: '10px', fontSize: 12 })}>Aufgeben</button>
    <button onClick={onDone} style={{ width: '100%', border: 'none', background: 'none', color: G400, fontSize: 11, marginTop: 14, cursor: 'pointer' }}>Runde abbrechen</button>
  </WiederholungWrap>;
}

function WortkreisReview({ player, chapters, scope, onUpdateScore, onDone }) {
  var [words, setWords] = useState(null);
  var pid = player && player.id;
  var language = scope && scope.language;
  var isBen = player && player.name === 'Ben';

  useEffect(function () {
    setWords(null);
    if (isBen) { setWords(fetchAllKlasse6Vocab(chapters, language)); return; }
    fetchKlasse6Pool(pid, chapters, language).then(function (pool) { setWords(pool); }).catch(function () { setWords([]); });
  }, [pid, chapters, language, isBen]);

  if (words === null) return <WiederholungWrap><div style={{ textAlign: 'center', padding: 40, color: G400 }}>Lade Vokabeln…</div></WiederholungWrap>;
  if (!words.length) return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🔤</div>
      <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 6 }}>Noch nichts zum Üben</div>
      <div style={{ fontSize: 12, color: G600, marginBottom: 16 }}>Sobald du im Leiterspiel Vokabeln in Klasse 6 ({langLabel(language)}) in den „Gelernt"-Topf gebracht hast, kannst du hier den Wortkreis spielen.</div>
      <button onClick={onDone} style={BtnStyle(G100, G600, { padding: '10px 20px' })}>Zurück</button>
    </div>
  </WiederholungWrap>;
  return <WortkreisGame words={words} lang={language} player={player} onUpdateScore={onUpdateScore} onDone={onDone} />;
}

// ───────────────────────── Vokabelpaare ─────────────────────────

var MATCH_SIZE = 10;

// Gewichtung wie in der normalen Wiederholung (wiederholung.jsx): Vokabeln,
// die öfter falsch als richtig beantwortet wurden, sollen häufiger dran sein
// — aber per gewichteter Ziehung statt starrem Sortieren, sonst wären es
// Runde für Runde immer dieselben zehn.
function matchHardness(w) { return 1 + 0.2 * Math.max(0, (w.wrong || 0) - (w.correct || 0)); }

function weightedSample(list, n, weightFn) {
  var pool = list.slice(), out = [];
  while (pool.length && out.length < n) {
    var total = 0;
    var weights = pool.map(function (x) { var v = Math.max(0.01, weightFn(x)); total += v; return v; });
    var r = Math.random() * total, i = 0;
    for (; i < pool.length - 1; i++) { r -= weights[i]; if (r <= 0) break; }
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

function buildMatchRound(words) {
  var pool = (words || []).filter(function (w) { return w.word && w.clue; });
  var n = Math.min(MATCH_SIZE, pool.length);
  var picked = weightedSample(pool, n, matchHardness).map(function (w, i) { return { id: i, word: w.word, clue: w.clue, lang: w.lang }; });
  return { pairs: picked, left: shuffleArr(picked), right: shuffleArr(picked) };
}

function MatchCard({ side, text, isMatched, isWrong, isDragging, setRef, onDown }) {
  return <div ref={setRef} onPointerDown={onDown}
    style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid ' + (isMatched ? GR : isWrong ? RE : isDragging ? T : G200),
      background: isMatched ? '#d1fae5' : isWrong ? '#fee2e2' : 'white', color: isMatched ? '#065f46' : G900,
      fontSize: 13, fontWeight: isMatched ? 'bold' : 'normal', marginBottom: 8, textAlign: side === 'left' ? 'left' : 'right',
      touchAction: 'none', userSelect: 'none', cursor: isMatched ? 'default' : 'pointer', opacity: isMatched ? 0.75 : 1 }}>
    {text}
  </div>;
}

function VokabelpaareGame({ words, player, onUpdateScore, onDone }) {
  var pid = player && player.id;
  var [round, setRound] = useState(function () { return buildMatchRound(words); });
  var [matched, setMatched] = useState({});
  var [wrongFlash, setWrongFlash] = useState(null);
  var [drag, setDrag] = useState(null); // {side, id, x1,y1,x2,y2}
  var [score, setScore] = useState(0);
  var [sentences, setSentences] = useState(false);
  var containerRef = useRef(null);
  var leftRefs = useRef({});
  var rightRefs = useRef({});

  useEffect(function () {
    setRound(buildMatchRound(words)); setMatched({}); setScore(0); setWrongFlash(null); setDrag(null); setSentences(false);
  }, [words]);

  var pairs = round.pairs, left = round.left, right = round.right;
  var done = pairs.length > 0 && Object.keys(matched).length === pairs.length;

  // Nach der Zuordnung dieselben zehn Vokabeln noch als Satz mit Lücke
  // (wie Satzvokabel) — die genaue Wortliste kommt mit in den Cache-Schlüssel
  // (über runName), damit nicht aus Versehen Sätze einer anderen Zehnergruppe
  // aus dem Cache kommen.
  if (sentences) {
    var sentenceWords = pairs.map(function (p) { return { word: p.word, clue: p.clue, lang: p.lang }; });
    var runName = 'Vokabelpaare ' + pairs.map(function (p) { return p.word; }).slice().sort().join(',');
    return <SatzVokabelGame words={sentenceWords} runId={null} runName={runName} lang={pairs[0] && pairs[0].lang}
      player={player} onUpdateScore={onUpdateScore} onDone={function () { setSentences(false); }} />;
  }

  if (!pairs.length) return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🔗</div>
      <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 6 }}>Noch nicht genug Vokabeln</div>
      <div style={{ fontSize: 12, color: G600, marginBottom: 16 }}>Zum Verbinden braucht es ein paar mehr gelernte Vokabeln.</div>
      <button onClick={onDone} style={BtnStyle(G100, G600, { padding: '10px 20px' })}>Zurück</button>
    </div>
  </WiederholungWrap>;

  function anchor(side, id) {
    var el = (side === 'left' ? leftRefs : rightRefs).current[id];
    var cont = containerRef.current;
    if (!el || !cont) return { x: 0, y: 0 };
    var r = el.getBoundingClientRect(), c = cont.getBoundingClientRect();
    return side === 'left' ? { x: r.right - c.left, y: r.top + r.height / 2 - c.top } : { x: r.left - c.left, y: r.top + r.height / 2 - c.top };
  }

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

  function startDrag(side, id, e) {
    if (matched[id]) return;
    var cont = containerRef.current; if (!cont) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    var a = anchor(side, id), c = cont.getBoundingClientRect();
    setDrag({ side: side, id: id, x1: a.x, y1: a.y, x2: e.clientX - c.left, y2: e.clientY - c.top });
  }
  function moveDrag(e) {
    if (!drag) return;
    var cont = containerRef.current; if (!cont) return;
    var c = cont.getBoundingClientRect();
    setDrag(function (d) { return d ? Object.assign({}, d, { x2: e.clientX - c.left, y2: e.clientY - c.top }) : d; });
  }
  function endDrag(e) {
    if (!drag) return;
    var otherRefs = drag.side === 'left' ? rightRefs : leftRefs;
    var hit = hitCard(otherRefs, e.clientX, e.clientY);
    var started = drag;
    setDrag(null);
    if (hit == null) return;
    if (hit === started.id) {
      var pr = pairs.find(function (p) { return p.id === started.id; });
      tallyAnswer(true, false, CREDIT.choice);
      if (pr) logWordEvent(pid, 'vokabelpaare', null, pr.word, pr.clue, true, null);
      if (onUpdateScore) onUpdateScore(10);
      setScore(function (s) { return s + 10; });
      setMatched(function (m) { var n = Object.assign({}, m); n[started.id] = true; return n; });
    } else {
      tallyAnswer(false, false);
      setWrongFlash({ a: started.id, b: hit, side: started.side });
      setTimeout(function () { setWrongFlash(null); }, 450);
    }
  }

  function cardProps(side, p) {
    var isMatched = !!matched[p.id];
    var isWrong = !!wrongFlash && ((wrongFlash.side === side && wrongFlash.a === p.id) || (wrongFlash.side !== side && wrongFlash.b === p.id));
    var isDragging = !!drag && drag.side === side && drag.id === p.id;
    return { side: side, text: side === 'left' ? p.clue : p.word, isMatched: isMatched, isWrong: isWrong, isDragging: isDragging,
      setRef: function (el) { (side === 'left' ? leftRefs : rightRefs).current[p.id] = el; },
      onDown: function (e) { startDrag(side, p.id, e); } };
  }

  return <WiederholungWrap>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: G600, marginBottom: 10 }}>
      <span>{Object.keys(matched).length} / {pairs.length} Paare</span>
      <span style={{ fontWeight: 'bold', color: T }}>{score} Punkte</span>
    </div>
    <div style={{ fontSize: 11, color: G400, textAlign: 'center', marginBottom: 10 }}>Wische von einem deutschen Wort zur passenden Übersetzung.</div>
    <div ref={containerRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
      style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 24 }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
        {pairs.filter(function (p) { return matched[p.id]; }).map(function (p) {
          var a = anchor('left', p.id), b = anchor('right', p.id);
          return <line key={p.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={GR} strokeWidth="2" opacity="0.5" />;
        })}
        {drag && <line x1={drag.x1} y1={drag.y1} x2={drag.x2} y2={drag.y2} stroke={T} strokeWidth="3" strokeLinecap="round" />}
      </svg>
      <div style={{ flex: 1 }}>{left.map(function (p) { return <MatchCard key={p.id} {...cardProps('left', p)} />; })}</div>
      <div style={{ flex: 1 }}>{right.map(function (p) { return <MatchCard key={p.id} {...cardProps('right', p)} />; })}</div>
    </div>
    {done && <div style={{ marginTop: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 34, marginBottom: 6 }}>🏆</div>
      <div style={{ fontWeight: 'bold', fontSize: 15, color: T, marginBottom: 4 }}>Alle Paare gefunden!</div>
      <div style={{ fontSize: 13, color: G600, marginBottom: 16 }}>{score} Punkte</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={function () { setSentences(true); }} style={BtnStyle('#7c3aed', 'white', { padding: '12px 20px', fontSize: 14 })}>📝 Sätze üben →</button>
        <button onClick={function () { setRound(buildMatchRound(words)); setMatched({}); setScore(0); }} style={BtnStyle('#16a34a', 'white', { padding: '12px 20px', fontSize: 14 })}>↺ Neue Runde</button>
        <button onClick={onDone} style={BtnStyle(T, 'white', { padding: '12px 20px', fontSize: 14 })}>← Zurück</button>
      </div>
    </div>}
  </WiederholungWrap>;
}

function VokabelpaareReview({ player, chapters, scope, onUpdateScore, onDone }) {
  var [words, setWords] = useState(null);
  var pid = player && player.id;
  var language = scope && scope.language;
  var isBen = player && player.name === 'Ben';

  useEffect(function () {
    setWords(null);
    if (isBen) { setWords(fetchAllKlasse6Vocab(chapters, language)); return; }
    fetchKlasse6Pool(pid, chapters, language).then(function (pool) { setWords(pool); }).catch(function () { setWords([]); });
  }, [pid, chapters, language, isBen]);

  if (words === null) return <WiederholungWrap><div style={{ textAlign: 'center', padding: 40, color: G400 }}>Lade Vokabeln…</div></WiederholungWrap>;
  if (words.length < 4) return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🔗</div>
      <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 6 }}>Noch nichts zum Verbinden</div>
      <div style={{ fontSize: 12, color: G600, marginBottom: 16 }}>Sobald du im Leiterspiel Vokabeln in Klasse 6 ({langLabel(language)}) in den „Gelernt"-Topf gebracht hast, kannst du hier Vokabelpaare verbinden.</div>
      <button onClick={onDone} style={BtnStyle(G100, G600, { padding: '10px 20px' })}>Zurück</button>
    </div>
  </WiederholungWrap>;
  return <VokabelpaareGame words={words} player={player} onUpdateScore={onUpdateScore} onDone={onDone} />;
}

export { WortkreisReview, VokabelpaareReview };
