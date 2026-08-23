import { useEffect, useRef, useState } from '../core/react.js';
import { sbGet } from '../core/api.js';
import { safeWords } from '../core/words.js';
import { chGrade, chLang, langLabel, naturalIdCmp } from '../core/scope.js';
import { BtnStyle, G50, G100, G200, G400, G600, RE, T, TL } from '../core/theme.js';

var CHAT_MODEL = 'claude-haiku-4-5-20251001';
var MAX_TURNS = 40; // Testlimit — vermeidet unbegrenzte Kosten bei einem offenen Test-Feature
var MAX_REVIEW_WORDS = 400; // Klasse-5-Wortschatz kann groß sein, System-Prompt begrenzen

function wordLine(w) { return w.word + ' = ' + (w.clue || ''); }

function buildSystemPrompt(langCode, chapterTitle, chapterWords, reviewWords) {
  var lang = langLabel(langCode);
  var lines = [];
  lines.push('Du bist ein geduldiger Sprachlernpartner für ein Kind der 6. Klasse (Niveau A1-A2). Sprich ausschließlich auf ' + lang + ', kurze einfache Sätze.');
  lines.push('Wenn das Kind offensichtlich nicht weiterkommt oder auf Deutsch schreibt, hilf kurz auf Deutsch und mach dann auf ' + lang + ' weiter.');
  lines.push('Baue ab und zu (nicht in jedem Satz) natürlich Fragen ein, die Vokabeln aus den folgenden Listen benutzen. Korrigiere Fehler freundlich und kurz, ohne den Gesprächsfluss zu stark zu unterbrechen.');
  if (chapterWords.length) {
    lines.push('Aktuell gelerntes Thema "' + chapterTitle + '", diese Vokabeln stehen im Fokus:');
    lines.push(chapterWords.map(wordLine).join(', '));
  }
  if (reviewWords.length) {
    lines.push('Diese Vokabeln aus Klasse 5 sollte das Kind schon können — frag gelegentlich auch danach, um zu prüfen ob sie sitzen:');
    lines.push(reviewWords.slice(0, MAX_REVIEW_WORDS).map(wordLine).join(', '));
  }
  lines.push('Beginne das Gespräch mit einer kurzen, freundlichen Frage auf ' + lang + '.');
  return lines.join('\n\n');
}

function getApiKey() {
  return sbGet('settings', 'key=eq.anthropic_key').then(function(d) {
    return (d && d[0] && d[0].value) || localStorage.getItem('claude_api_key') || '';
  }).catch(function() {
    return localStorage.getItem('claude_api_key') || '';
  });
}

function ChatAdmin({ chapters, scope }) {
  var langScope = (scope && scope.language) || 'en';
  var gradeScope = (scope && scope.grade) || 6;
  var chaptersInScope = (chapters || []).filter(function(c) {
    return c.parent_id && chLang(c) === langScope && chGrade(c) === gradeScope && safeWords(c.words).length > 0;
  }).sort(function(a, b) { return naturalIdCmp(a.id, b.id); });
  var [chapterId, setChapterId] = useState(chaptersInScope[0] ? chaptersInScope[0].id : '');
  var [includeReview, setIncludeReview] = useState(langScope === 'en');
  var [messages, setMessages] = useState([]); // {role:'user'|'assistant', text}
  var [input, setInput] = useState('');
  var [busy, setBusy] = useState(false);
  var [error, setError] = useState('');
  var listRef = useRef(null);

  useEffect(function() {
    setChapterId(chaptersInScope[0] ? chaptersInScope[0].id : '');
    setIncludeReview(langScope === 'en');
    setMessages([]); setInput(''); setError('');
  }, [langScope, gradeScope]);

  useEffect(function() {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  function reviewWordPool() {
    if (!includeReview) return [];
    return (chapters || []).filter(function(c) {
      return c.parent_id && chLang(c) === 'en' && chGrade(c) === 5;
    }).flatMap(function(c) { return safeWords(c.words); });
  }

  function reset() {
    setMessages([]); setInput(''); setError('');
  }

  function send() {
    var text = input.trim();
    if (!text || busy || messages.length >= MAX_TURNS * 2) return;
    var chapter = chaptersInScope.find(function(c) { return c.id === chapterId; });
    var chapterWords = chapter ? safeWords(chapter.words) : [];
    var systemPrompt = buildSystemPrompt(langScope, chapter ? chapter.title : '', chapterWords, reviewWordPool());
    var nextMessages = messages.concat([{ role: 'user', text: text }]);
    setMessages(nextMessages);
    setInput(''); setBusy(true); setError('');
    getApiKey().then(function(key) {
      if (!key) throw new Error('Kein Anthropic API-Key hinterlegt (siehe Tab 🔑 API-Key).');
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: CHAT_MODEL, max_tokens: 500, system: systemPrompt,
          messages: nextMessages.map(function(m) { return { role: m.role, content: m.text }; }),
        }),
      });
    }).then(function(r) { return r.json(); }).then(function(d) {
      if (d.error) throw new Error(d.error.message || 'API-Fehler');
      var reply = (d.content || []).map(function(b) { return b.text || ''; }).join('');
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', text: reply || '(keine Antwort)' }]); });
    }).catch(function(e) {
      setError(e.message);
    }).finally(function() { setBusy(false); });
  }

  var atLimit = messages.length >= MAX_TURNS * 2;

  return (
    <div style={{ padding: 12, background: G50, borderRadius: 12, border: '2px dashed ' + G200 }}>
      <div style={{ fontWeight: 'bold', fontSize: 13, color: T, marginBottom: 8 }}>💬 Sprach-Chat (Test, nur Admin)</div>
      <div style={{ fontSize: 11, color: G400, marginBottom: 10 }}>
        Testet einen Chat mit Claude ({CHAT_MODEL}) auf {langLabel(langScope)}, der Vokabeln aus dem gewählten Kapitel und optional aus Klasse 5 einbaut. Läuft direkt im Browser, wie die Foto-Erkennung — Key aus dem Tab 🔑 API-Key.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={chapterId} onChange={function(e) { setChapterId(e.target.value); reset(); }}
          style={{ padding: '6px 8px', fontSize: 11, border: '1px solid ' + G200, borderRadius: 6 }}>
          {chaptersInScope.map(function(c) { return <option key={c.id} value={c.id}>{c.title}</option>; })}
        </select>
        {langScope === 'en' && <label style={{ fontSize: 11, color: G600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={includeReview} onChange={function(e) { setIncludeReview(e.target.checked); reset(); }} />
          Klasse-5-Vokabeln einbeziehen
        </label>}
        <button onClick={reset} disabled={busy} style={BtnStyle(G100, G600, { padding: '6px 10px', fontSize: 11 })}>🔄 Neu starten</button>
      </div>

      <div ref={listRef} style={{ background: 'white', borderRadius: 10, border: '1px solid ' + G200, height: 320, overflowY: 'auto', padding: 10, marginBottom: 8 }}>
        {messages.length === 0 && <div style={{ fontSize: 11, color: G400 }}>Noch keine Nachricht — einfach unten etwas auf {langLabel(langScope)} schreiben, um das Gespräch zu starten.</div>}
        {messages.map(function(m, i) {
          return <div key={i} style={{ marginBottom: 8, textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <span style={{ display: 'inline-block', maxWidth: '80%', padding: '7px 10px', borderRadius: 10, fontSize: 12, background: m.role === 'user' ? T : TL, color: m.role === 'user' ? 'white' : '#292524' }}>{m.text}</span>
          </div>;
        })}
        {busy && <div style={{ fontSize: 11, color: G400 }}>⏳ …</div>}
      </div>

      {atLimit && <div style={{ fontSize: 11, color: RE, marginBottom: 8 }}>Testlimit ({MAX_TURNS} Nachrichten) erreicht — bitte neu starten.</div>}
      {error && <div style={{ fontSize: 11, color: RE, marginBottom: 8 }}>Fehler: {error}</div>}

      <div style={{ display: 'flex', gap: 6 }}>
        <input value={input} onChange={function(e) { setInput(e.target.value); }}
          onKeyDown={function(e) { if (e.key === 'Enter') send(); }}
          disabled={busy || atLimit} placeholder={'Nachricht auf ' + langLabel(langScope) + '…'}
          style={{ flex: 1, padding: '8px 10px', fontSize: 12, border: '1px solid ' + G200, borderRadius: 6, boxSizing: 'border-box' }} />
        <button onClick={send} disabled={busy || atLimit || !input.trim()} style={BtnStyle(T, 'white', { padding: '8px 14px', opacity: (busy || atLimit) ? 0.6 : 1 })}>Senden</button>
      </div>
    </div>
  );
}

export { ChatAdmin };
