var VOICE_LANG = { en:'en-GB', es:'es-ES', fr:'fr-FR', la:'it-IT', de:'de-DE' };

function ttsSupported(){ return typeof window !== 'undefined' && 'speechSynthesis' in window; }

// Vokabeleinträge sind oft Listen ("big/large", "Haus, Gebäude") oder haben
// Klammerzusätze ("(the) hotel") — die Aussprache soll nur die erste Variante
// sagen, sonst liest die Stimme Kommas/Slashes/Klammern laut mit.
function speakableText(raw){
  var s = String(raw||'').replace(/\([^)]*\)/g,'').split(',')[0].split('/')[0];
  return s.replace(/\s+/g,' ').trim();
}

var voiceCache = null;
function refreshVoices(){
  if(!ttsSupported()) return;
  var list = window.speechSynthesis.getVoices();
  if(list && list.length) voiceCache = list;
}
if(ttsSupported()){
  refreshVoices();
  if('onvoiceschanged' in window.speechSynthesis){
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
}

// iOS/macOS liefern pro Sprache oft mehrere Stimmen: robotische "Compact"-
// Systemstimmen und nachgeladene "Enhanced/Premium"-Stimmen, die deutlich
// natürlicher klingen. Android/Chrome hat meist eine gute "Google …"-Stimme.
// Wir bevorzugen die beste verfügbare, statt einfach die erste zu nehmen.
function pickVoice(langCode){
  if(!voiceCache || !voiceCache.length) return null;
  var base = langCode.split('-')[0];
  var candidates = voiceCache.filter(function(v){ return v.lang && v.lang.split('-')[0] === base; });
  if(!candidates.length) return null;
  function score(v){
    var n = (v.name||'') + ' ' + (v.voiceURI||'');
    if(v.lang === langCode && /enhanced|premium|neural/i.test(n)) return 4;
    if(/enhanced|premium|neural/i.test(n)) return 3;
    if(v.lang === langCode && /google/i.test(n)) return 3;
    if(/google/i.test(n)) return 2;
    if(v.lang === langCode) return 1;
    if(/compact/i.test(n)) return -1;
    return 0;
  }
  candidates.sort(function(a,b){ return score(b) - score(a); });
  return candidates[0];
}

function speak(text, lang, opts){
  if(!ttsSupported()) return;
  var s = speakableText(text);
  if(!s) return;
  var rate = (opts && opts.rate) || 0.72;
  try{
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(s);
    var langCode = VOICE_LANG[lang] || VOICE_LANG.en;
    u.lang = langCode;
    u.rate = rate;
    u.pitch = 1;
    var v = pickVoice(langCode);
    if(v) u.voice = v;
    window.speechSynthesis.speak(u);
  }catch(e){}
}

export { ttsSupported, speakableText, speak, VOICE_LANG };
