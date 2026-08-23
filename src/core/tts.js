var VOICE_LANG = { en:'en-GB', es:'es-ES', fr:'fr-FR', la:'it-IT', de:'de-DE' };

function ttsSupported(){ return typeof window !== 'undefined' && 'speechSynthesis' in window; }

// Vokabeleinträge sind oft Listen ("big/large", "Haus, Gebäude") oder haben
// Klammerzusätze ("(the) hotel") — die Aussprache soll nur die erste Variante
// sagen, sonst liest die Stimme Kommas/Slashes/Klammern laut mit.
function speakableText(raw){
  var s = String(raw||'').replace(/\([^)]*\)/g,'').split(',')[0].split('/')[0];
  return s.replace(/\s+/g,' ').trim();
}

function speak(text, lang){
  if(!ttsSupported()) return;
  var s = speakableText(text);
  if(!s) return;
  try{
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(s);
    u.lang = VOICE_LANG[lang] || VOICE_LANG.en;
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }catch(e){}
}

export { ttsSupported, speakableText, speak, VOICE_LANG };
