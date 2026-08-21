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
