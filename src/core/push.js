import { SB_URL, SB_KEY } from './config.js';

var PUSH_URL = SB_URL + '/push';
var VAPID_PUBLIC_KEY = 'BPNrq9xPfmYdHkJZ1YzE6mVZpsejhGDACLFzij8FqY3lUvtrYBz5oxqrhF4UBxoTCnjSJFPDA4cFMkkp1NiazfM';

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

function subscribeToPush(playerId) {
  if (!pushSupported()) return Promise.reject(new Error('Push wird von diesem Browser nicht unterstützt'));
  return Notification.requestPermission().then(function(perm) {
    if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt');
    return navigator.serviceWorker.register('/sw.js');
  }).then(function() {
    return navigator.serviceWorker.ready;
  }).then(function(reg) {
    return reg.pushManager.getSubscription().then(function(existing) {
      if (existing) return existing;
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    });
  }).then(function(sub) {
    var json = sub.toJSON();
    return fetch(SB_URL + '/rest/v1/push_subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'return=minimal' },
      body: JSON.stringify({ player_id: playerId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent }),
      mode: 'cors', credentials: 'omit'
    }).then(function(r) { if (!r.ok) throw new Error('Speichern fehlgeschlagen (' + r.status + ')'); return true; });
  });
}

function sendTestPush(playerId, title, body) {
  return fetch(PUSH_URL + '/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: playerId, title: title, body: body }),
    mode: 'cors', credentials: 'omit'
  }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, data: j }; }); });
}

export { pushSupported, subscribeToPush, sendTestPush };
