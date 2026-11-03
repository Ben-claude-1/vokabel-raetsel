#!/usr/bin/env node
'use strict';
// Chrome verweigert Anfragen von einer öffentlichen Seite (github.io) an
// Adressen aus dem privaten Bereich ("Private Network Access"), außer der
// Server bestätigt das explizit im Preflight mit
// Access-Control-Allow-Private-Network: true. mac-studio.taild5562c.ts.net
// löst auf eine Tailscale-CGNAT-Adresse (100.64.0.0/10) auf, die Chrome als
// privat einstuft — obwohl der Funnel öffentlich erreichbar ist. Weder
// postgrest noch der eigene push-server kennen diesen (recht neuen) Header,
// deshalb sitzt dieser schlanke Proxy davor und ergänzt ihn nur bei
// OPTIONS-Preflights, die ihn explizit anfragen. Alles andere reicht er
// unverändert durch.
const http = require('http');

const PORT = process.env.EDGE_PROXY_PORT || 8769;
const ROUTES = [
  { prefix: '/rest/v1', host: '127.0.0.1', port: 8766 },
  { prefix: '/push', host: '127.0.0.1', port: 8768 },
];

function pickRoute(url) {
  return ROUTES.find(function(r) {
    return url === r.prefix || url.indexOf(r.prefix + '/') === 0 || url.indexOf(r.prefix + '?') === 0;
  });
}

const server = http.createServer(function(req, res) {
  var route = pickRoute(req.url);
  if (!route) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }

  var wantsPrivateNetwork = req.method === 'OPTIONS' &&
    (req.headers['access-control-request-private-network'] || '').toLowerCase() === 'true';

  // Der Rückwärtskompatibilität wegen wie zuvor bei Tailscale: Präfix wird
  // vor dem Weiterreichen abgeschnitten (postgrest/push-server kennen ihn nicht).
  var upstreamPath = req.url.slice(route.prefix.length) || '/';

  var upstreamReq = http.request({
    host: route.host,
    port: route.port,
    method: req.method,
    path: upstreamPath,
    headers: Object.assign({}, req.headers, { host: route.host + ':' + route.port }),
  }, function(upstreamRes) {
    var headers = Object.assign({}, upstreamRes.headers);
    if (wantsPrivateNetwork) headers['access-control-allow-private-network'] = 'true';
    res.writeHead(upstreamRes.statusCode, headers);
    upstreamRes.pipe(res);
  });
  upstreamReq.on('error', function(e) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('proxy error: ' + e.message);
  });
  req.pipe(upstreamReq);
});

server.listen(PORT, '127.0.0.1', function() {
  console.log('edge-proxy listening on 127.0.0.1:' + PORT + ' -> ' +
    ROUTES.map(function(r) { return r.prefix + '=' + r.host + ':' + r.port; }).join(', '));
});

// ---------------------------------------------------------------------------
// /whoami — erkennt Familienmitglieder an ihrer Tailscale-Identität.
//
// Läuft auf einem EIGENEN Port (8771), der nur über eine tailnet-only
// Serve-Regel (:5461) erreichbar ist, NIE über den öffentlichen Funnel auf 443.
// `tailscale serve` setzt Tailscale-User-Login selbst und überschreibt, was der
// Client mitschickt. Wer nicht im Tailnet ist, erreicht den Port gar nicht —
// die App fällt dann auf Name + Passwort zurück.
//
// Absicherung gegen versehentliches Öffnen: wird für den Serve-Eintrag je ein
// Funnel eingeschaltet, kann man öffentlichen von Tailnet-Verkehr nicht mehr
// unterscheiden (gemessen am 01.08.2026 für CloudCLI). Darum prüft whoami die
// laufende Serve-Konfiguration und antwortet dann nicht (fail closed).
//
// Zuordnung Tailscale-Login -> Spieler: ~/.local/etc/vokabel/tailnet_players.json
//   { "emma@example.de": { "player": "Emma" },
//     "ben@example.de":  { "player": "Ben", "admin_player": "admin" } }
// Wird bei jeder Anfrage neu gelesen, Änderungen brauchen keinen Neustart.
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const WHOAMI_PORT = process.env.WHOAMI_PORT || 8771;
const WHOAMI_SERVE_PORT = process.env.WHOAMI_SERVE_PORT || '5461';
const WHOAMI_MAP = process.env.WHOAMI_MAP || path.join(os.homedir(), '.local/etc/vokabel/tailnet_players.json');
const TAILSCALE_BIN = process.env.TAILSCALE_BIN || '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
const WHOAMI_ORIGINS = ['https://ben-claude-1.github.io', 'http://localhost:3333'];

// Das Tailscale-CLI (GUI-App-Binary) startet unter launchd nur, wenn SHLVL gesetzt ist
// (gemessen 03.11.2026) — sonst „The Tailscale GUI failed to start“.
var funnelState = { checkedAt: 0, safe: false, probing: false };

function probeFunnel() {
  if (funnelState.probing) return;
  funnelState.probing = true;
  execFile(TAILSCALE_BIN, ['serve', 'status', '--json'], { timeout: 5000, env: Object.assign({}, process.env, { SHLVL: process.env.SHLVL || '1' }) }, function(err, stdout) {
    funnelState.probing = false;
    funnelState.checkedAt = Date.now();
    if (err) { funnelState.safe = false; console.error('whoami: serve status failed:', err.message); return; }
    try {
      var cfg = JSON.parse(stdout);
      var web = cfg.Web || {};
      var entries = Object.keys(web).filter(function(hp) {
        var h = web[hp] && web[hp].Handlers || {};
        return Object.keys(h).some(function(k) {
          return String(h[k].Proxy || '').indexOf(':' + WHOAMI_PORT) !== -1;
        });
      });
      var funnel = cfg.AllowFunnel || {};
      // sicher nur, wenn der Eintrag existiert und KEIN Funnel auf ihm liegt
      funnelState.safe = entries.length > 0 && entries.every(function(hp) { return !funnel[hp]; });
    } catch (e) { funnelState.safe = false; console.error('whoami: serve status unparsable:', e.message); }
    console.log('whoami: tailnet-only check ->', funnelState.safe);
  });
}
setInterval(probeFunnel, 60000);
probeFunnel();

function whoamiCors(req, res) {
  var origin = req.headers.origin;
  if (origin && WHOAMI_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if ((req.headers['access-control-request-private-network'] || '').toLowerCase() === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}

function whoamiReply(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

http.createServer(function(req, res) {
  whoamiCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.url.split('?')[0] !== '/whoami') { whoamiReply(res, 404, { error: 'not found' }); return; }
  if (!funnelState.safe) { whoamiReply(res, 403, { error: 'not verifiably tailnet-only' }); return; }
  var login = String(req.headers['tailscale-user-login'] || '').trim().toLowerCase();
  if (!login) { whoamiReply(res, 401, { error: 'no tailscale identity' }); return; }
  var map = {};
  try { map = JSON.parse(fs.readFileSync(WHOAMI_MAP, 'utf8')); } catch (e) { whoamiReply(res, 500, { error: 'map unreadable' }); return; }
  var entry = null;
  Object.keys(map).forEach(function(k) { if (k.toLowerCase() === login) entry = map[k]; });
  if (!entry || !entry.player) { whoamiReply(res, 404, { error: 'unknown identity' }); return; }
  whoamiReply(res, 200, { player: entry.player, admin_player: entry.admin_player || null });
}).listen(WHOAMI_PORT, '127.0.0.1', function() {
  console.log('whoami listening on 127.0.0.1:' + WHOAMI_PORT);
});
