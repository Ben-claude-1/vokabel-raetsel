import { useState } from '../core/react.js';
import { pushSupported, sendTestPush, subscribeToPush } from '../core/push.js';
import { BtnStyle, G50, G200, G400, G600, RE, T } from '../core/theme.js';

function PushAdmin({ player }) {
  var [status, setStatus] = useState('');
  var [busy, setBusy] = useState(false);

  function doSubscribe() {
    setBusy(true); setStatus('');
    subscribeToPush(player.id).then(function() {
      setStatus('✅ Push aktiviert für ' + player.name);
    }).catch(function(e) {
      setStatus('Fehler: ' + e.message);
    }).finally(function() { setBusy(false); });
  }

  function doTest() {
    setBusy(true); setStatus('');
    sendTestPush(player.id, 'Vokabel-Rätsel', 'Test-Benachrichtigung 🔔').then(function(res) {
      if (!res.ok) { setStatus('Fehler: ' + (res.data && res.data.error || 'unbekannt')); return; }
      setStatus('Gesendet an ' + res.data.sent + ' Gerät(e): ' + JSON.stringify(res.data.results));
    }).catch(function(e) {
      setStatus('Fehler: ' + e.message);
    }).finally(function() { setBusy(false); });
  }

  return (
    <div style={{padding:12,background:G50,borderRadius:12,border:'2px dashed '+G200}}>
      <div style={{fontWeight:'bold',fontSize:13,color:T,marginBottom:8}}>🔔 Push-Benachrichtigungen (Test)</div>
      <div style={{fontSize:11,color:G400,marginBottom:10}}>
        Erstellt eine Push-Subscription für „{player.name}" auf diesem Gerät/Browser und kann darüber eine Testnachricht auslösen.
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button disabled={busy || !pushSupported()} onClick={doSubscribe} style={BtnStyle(T,'white',{opacity:busy?0.6:1})}>🔔 Push aktivieren</button>
        <button disabled={busy} onClick={doTest} style={BtnStyle(G200,G600,{opacity:busy?0.6:1})}>📨 Test-Push senden</button>
      </div>
      {!pushSupported() && <div style={{fontSize:11,color:RE,marginTop:8}}>Dieser Browser unterstützt keine Web-Push-Benachrichtigungen.</div>}
      {status && <div style={{fontSize:11,color:G600,marginTop:8,wordBreak:'break-word'}}>{status}</div>}
    </div>
  );
}

export { PushAdmin };
