// Buchstabier-Diktat (Spanisch): die Stimme buchstabiert ganz langsam ein
// spanisches Wort Buchstabe für Buchstabe (a, be, ce, …), Emma schreibt es auf.
// Pool: nur Vokabeln, die sie schon kennt (Topf 3–6 in Klasse-6-Läufen),
// Zimmer-/Möbel-Wörter zuerst.
import { sbGet } from '../core/api.js';
import { CREDIT, logWordEvent, lsGetRunsForPlayer, tallyAnswer } from '../core/leitner.js';
import { useEffect, useMemo, useRef, useState } from '../core/react.js';
import { runScope } from '../core/scope.js';
import { BtnStyle, G100, G400, G600, G900, GR, RE, T } from '../core/theme.js';
import { speak, speakSeq, ttsSupported } from '../core/tts.js';
import { shuffleArr } from '../core/util.js';
import { parseData } from '../core/words.js';
import { fetchAllKlasse6Vocab, WiederholungWrap } from './wiederholung.jsx';

var ROUND_SIZE = 10;
var MIN_POT = 3;

// Zimmerbeschreibung (Spielwörter ohne Artikel)
var ROOM_WORDS = ['habitación','cama','cama alta','armario','póster','pared','ventana','foto','espejo','puerta','lámpara','alfombra','sillón','estantería','consola','videojuego','altavoz','escritorio','sofá','rincón','salón','mesa','silla','planta','mesa de noche','guirnalda de luces','almohada','jaula','hamaca','baño','piso'];

var LETTER_NAMES = { a:'a', b:'be', c:'ce', d:'de', e:'e', f:'efe', g:'ge', h:'hache', i:'i', j:'jota', k:'ka', l:'ele', m:'eme', n:'ene', 'ñ':'eñe', o:'o', p:'pe', q:'cu', r:'erre', s:'ese', t:'te', u:'u', v:'uve', w:'uve doble', x:'equis', y:'ye', z:'zeta',
  'á':'a con tilde', 'é':'e con tilde', 'í':'i con tilde', 'ó':'o con tilde', 'ú':'u con tilde', 'ü':'u con diéresis' };

// "la cama alta" → "cama alta"; null, wenn das Wort nicht diktierbar ist.
function dictTarget(raw) {
  var s = String(raw || '').split(',')[0].replace(/\([^)]*\)/g, '').split('/')[0];
  s = s.replace(/\s+(pl|f|m|adv|sg)\.?$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
  s = s.replace(/^(el|la|los|las|un|una)\s+/, '');
  if (!s || /[¿¡?!.\d]/.test(s)) return null;
  var tok = s.split(' ');
  if (tok.length > 3 || /^(algo|alguien)$/.test(tok[tok.length - 1]) || tok.indexOf('algo') >= 0) return null;
  if (s.replace(/ /g, '').length < 3 || s.length > 18) return null;
  return s;
}

function spellParts(target) {
  return target.split('').map(function (ch) { return ch === ' ' ? 'espacio' : (LETTER_NAMES[ch] || ch); });
}

// Nur Akzent-/Tilde-Unterschied (ñ bleibt eigener Buchstabe)?
function stripAccents(s) {
  return s.replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
}

function fetchKnownSpanish(pid, chapters) {
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!pid || !UUID.test(pid)) return Promise.resolve([]);
  return Promise.all([
    sbGet('ls_progress', 'player_id=eq.' + pid + '&select=run_id,data'),
    lsGetRunsForPlayer(pid)
  ]).then(function (res) {
    var rows = Array.isArray(res[0]) ? res[0] : [];
    var runInfo = {};
    (Array.isArray(res[1]) ? res[1] : []).forEach(function (r) { runInfo[r.id] = runScope(r, chapters || []); });
    var seen = {}, out = [];
    rows.forEach(function (row) {
      var sc = runInfo[row.run_id];
      if (!sc || sc.grade !== 6 || sc.language !== 'es') return;
      var pots = parseData(row.data).pots || {};
      for (var p = MIN_POT; p <= 6; p++) {
        (pots[p] || []).forEach(function (w) {
          if (!w.word) return;
          var k = w.word.toLowerCase();
          if (seen[k]) return; seen[k] = 1;
          out.push(w);
        });
      }
    });
    return out;
  });
}

function BuchstabierGame({ words, player, onUpdateScore, onDone }) {
  var pid = player && player.id;
  var round = useMemo(function () {
    var el = [];
    var seen = {};
    (words || []).forEach(function (w) {
      var t = dictTarget(w.word);
      if (!t || seen[t]) return; seen[t] = 1;
      el.push({ word: w.word, clue: w.clue, target: t, room: ROOM_WORDS.indexOf(t) >= 0 });
    });
    var room = shuffleArr(el.filter(function (x) { return x.room; }));
    var rest = shuffleArr(el.filter(function (x) { return !x.room; }));
    return room.concat(rest).slice(0, ROUND_SIZE);
  }, [words]);

  var [phase, setPhase] = useState('start'); // start, q, show, done
  var [idx, setIdx] = useState(0);
  var [input, setInput] = useState('');
  var [tries, setTries] = useState(0);
  var [hint, setHint] = useState(false);
  var [note, setNote] = useState('');
  var [result, setResult] = useState(null);
  var [total, setTotal] = useState(0);
  var [speaking, setSpeaking] = useState(false);
  var cancelRef = useRef(null);
  var inputRef = useRef(null);
  var cur = round[idx];

  function stop() { if (cancelRef.current) { cancelRef.current(); cancelRef.current = null; } }
  function spell() {
    if (!cur) return;
    stop(); setSpeaking(true);
    cancelRef.current = speakSeq(spellParts(cur.target), 'es', { rate: 0.55, gap: 1000, onEnd: function () { setSpeaking(false); } });
  }
  useEffect(function () { if (phase === 'q') { spell(); if (inputRef.current) inputRef.current.focus(); } return stop; }, [phase, idx]);
  useEffect(function () { return stop; }, []);

  if (!round.length) return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>✍️</div>
      <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 6 }}>Noch nicht genug passende Vokabeln</div>
      <div style={{ fontSize: 12, color: G600, marginBottom: 16 }}>Das Buchstabier-Diktat braucht spanische Vokabeln, die du im Leiterspiel schon bis mindestens Topf {MIN_POT} gebracht hast.</div>
      <button onClick={onDone} style={BtnStyle(G100, G600, { padding: '10px 20px' })}>Zurück</button>
    </div>
  </WiederholungWrap>;

  if (phase === 'start') return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 44, marginBottom: 8 }}>✍️</div>
      <div style={{ fontWeight: 'bold', fontSize: 17, color: T, marginBottom: 8 }}>Buchstabier-Diktat</div>
      <div style={{ fontSize: 13, color: G600, marginBottom: 6 }}>Du hörst ein spanisches Wort Buchstabe für Buchstabe — ganz langsam.</div>
      <div style={{ fontSize: 13, color: G600, marginBottom: 6 }}>Schreib es auf (mit Akzenten: á é í ó ú ñ). Ton anmachen! 🔊</div>
      <div style={{ fontSize: 12, color: G400, marginBottom: 20 }}>{round.length} Wörter · Zimmer-Wörter zuerst</div>
      {!ttsSupported() && <div style={{ fontSize: 12, color: RE, marginBottom: 12 }}>Dein Gerät kann leider nicht vorlesen.</div>}
      <button onClick={function () { setPhase('q'); }} style={BtnStyle(T, 'white', { padding: '12px 28px', fontSize: 15 })}>Los geht's</button>
      <div><button onClick={onDone} style={{ border: 'none', background: 'none', color: G400, fontSize: 11, marginTop: 14, cursor: 'pointer' }}>Zurück</button></div>
    </div>
  </WiederholungWrap>;

  if (phase === 'done' || !cur) return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
      <div style={{ fontWeight: 'bold', fontSize: 17, color: T, marginBottom: 4 }}>Geschafft!</div>
      <div style={{ fontSize: 14, color: G600, marginBottom: 20 }}>{total} Punkte</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={onDone} style={BtnStyle(T, 'white', { padding: '12px 20px', fontSize: 14 })}>← Zurück</button>
      </div>
    </div>
  </WiederholungWrap>;

  function addChar(ch) { setInput(function (v) { return v + ch; }); if (inputRef.current) inputRef.current.focus(); }

  function submit() {
    var a = input.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!a || phase !== 'q') return;
    if (a === cur.target) {
      stop();
      var pts = (tries === 0 && !hint) ? 10 : tries <= 1 ? 5 : 0;
      var credit = (tries === 0 && !hint) ? CREDIT.review0 : tries <= 1 ? CREDIT.review1 : CREDIT.review2;
      tallyAnswer(true, false, credit);
      logWordEvent(pid, 'buchstabieren', null, cur.word, cur.clue, true, null, { answer: a });
      if (pts > 0 && onUpdateScore) onUpdateScore(pts);
      setTotal(function (t) { return t + pts; });
      setResult({ correct: true, points: pts });
      setPhase('show');
    } else {
      setTries(function (t) { return t + 1; });
      setNote(stripAccents(a) === stripAccents(cur.target) ? 'Fast! Achte auf die Akzente (á é í ó ú ñ).' : 'Das stimmt noch nicht. Hör nochmal genau hin! 👂');
      setInput('');
      if (inputRef.current) inputRef.current.focus();
    }
  }

  function giveUp() {
    stop();
    tallyAnswer(false, true);
    logWordEvent(pid, 'buchstabieren', null, cur.word, cur.clue, false, null, { answer: input.trim() || null });
    setResult({ correct: false, points: 0 });
    setPhase('show');
  }

  function next() {
    setInput(''); setTries(0); setHint(false); setNote(''); setResult(null);
    if (idx + 1 >= round.length) { setPhase('done'); return; }
    setIdx(idx + 1); setPhase('q');
  }

  return <WiederholungWrap>
    <div style={{ fontSize: 11, color: G400, textAlign: 'center', marginBottom: 8 }}>Wort {idx + 1} / {round.length}</div>
    <div style={{ textAlign: 'center', marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: G600 }}>Bedeutung</div>
      <div style={{ fontSize: 18, fontWeight: 'bold', color: G900 }}>{cur.clue}</div>
    </div>
    {phase === 'q' && <div>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <button onClick={spell} disabled={speaking} style={BtnStyle(speaking ? G100 : T, speaking ? G400 : 'white', { padding: '12px 22px', fontSize: 15 })}>{speaking ? '🔊 Ich buchstabiere …' : '🔊 Nochmal buchstabieren'}</button>
      </div>
      <input ref={inputRef} value={input} onChange={function (e) { setInput(e.target.value); }}
        onKeyDown={function (e) { if (e.key === 'Enter') submit(); }}
        autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
        placeholder="Schreib das Wort …"
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: 18, textAlign: 'center', border: '2px solid ' + (note ? '#d97706' : '#d1d5db'), borderRadius: 10, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
        {['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü'].map(function (c) {
          return <button key={c} onClick={function () { addChar(c); }} style={BtnStyle(G100, G900, { padding: '8px 12px', fontSize: 16 })}>{c}</button>;
        })}
      </div>
      {note && <div style={{ fontSize: 12, color: '#d97706', textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}>{note}</div>}
      <button onClick={submit} style={BtnStyle(GR, 'white', { width: '100%', padding: '12px', fontSize: 14, marginBottom: 8 })}>Prüfen</button>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={function () { stop(); setSpeaking(false); setHint(true); speak(cur.target, 'es', { rate: 0.7 }); }} style={BtnStyle(G100, G600, { flex: 1, padding: '10px', fontSize: 12 })}>💡 Wort vorsprechen</button>
        <button onClick={giveUp} style={BtnStyle(G100, G600, { flex: 1, padding: '10px', fontSize: 12 })}>Aufgeben</button>
      </div>
      {(tries > 0 || hint) && <div style={{ fontSize: 11, color: '#d97706', textAlign: 'center', marginTop: 8, fontWeight: 'bold' }}>{(tries === 0 && hint) || tries === 1 ? '💡 noch 5 Punkte' : tries > 1 ? '💡 0 Punkte möglich' : ''}</div>}
    </div>}
    {phase === 'show' && result && <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 6 }}>{result.correct ? '✅' : '❌'}</div>
      <div style={{ fontSize: 24, fontWeight: 'bold', color: result.correct ? GR : RE, marginBottom: 4 }}>{cur.target}</div>
      <div style={{ fontSize: 12, color: G600, marginBottom: 14 }}>{result.correct ? (result.points > 0 ? '+' + result.points + ' Punkte' : 'Richtig, aber ohne Punkte') : 'So wird es geschrieben'}</div>
      <button onClick={function () { speak(cur.target, 'es', { rate: 0.7 }); }} style={BtnStyle(G100, G600, { padding: '8px 16px', fontSize: 12, marginRight: 8 })}>🔊 anhören</button>
      <button onClick={next} style={BtnStyle(T, 'white', { padding: '10px 24px', fontSize: 14 })}>{idx + 1 >= round.length ? 'Fertig' : 'Weiter →'}</button>
    </div>}
    <button onClick={function () { stop(); onDone(); }} style={{ width: '100%', border: 'none', background: 'none', color: G400, fontSize: 11, marginTop: 14, cursor: 'pointer' }}>Runde abbrechen</button>
  </WiederholungWrap>;
}

function BuchstabierenReview({ player, chapters, scope, onUpdateScore, onDone }) {
  var [words, setWords] = useState(null);
  var pid = player && player.id;
  var isBen = player && player.name === 'Ben';
  var language = scope && scope.language;

  useEffect(function () {
    if (language !== 'es') { setWords([]); return; }
    setWords(null);
    if (isBen) { setWords(fetchAllKlasse6Vocab(chapters, 'es')); return; }
    fetchKnownSpanish(pid, chapters).then(setWords).catch(function () { setWords([]); });
  }, [pid, chapters, language, isBen]);

  if (words === null) return <WiederholungWrap><div style={{ textAlign: 'center', padding: 40, color: G400 }}>Lade Vokabeln…</div></WiederholungWrap>;
  if (language !== 'es') return <WiederholungWrap>
    <div style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>✍️</div>
      <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 6 }}>Nur für Spanisch</div>
      <div style={{ fontSize: 12, color: G600, marginBottom: 16 }}>Wechsle oben auf Spanisch, um das Buchstabier-Diktat zu spielen.</div>
      <button onClick={onDone} style={BtnStyle(G100, G600, { padding: '10px 20px' })}>Zurück</button>
    </div>
  </WiederholungWrap>;
  return <BuchstabierGame words={words} player={player} onUpdateScore={onUpdateScore} onDone={onDone} />;
}

export { BuchstabierenReview };
