// Test-Server: liefert die App aus UND leitet /rest/v1/* an die echte API weiter.
//
// Warum der Umweg: Die API erlaubt seit dem Security-Lockdown nur noch die
// GitHub-Pages-Herkunft (Access-Control-Allow-Headers wird nur für
// https://ben-claude-1.github.io gesetzt). Ein Browser auf http://localhost
// bekommt deshalb schon den Preflight verweigert -> "Server nicht erreichbar".
// Über diesen Proxy laufen App und API unter derselben Herkunft, damit entfällt
// der Preflight komplett. Serverseitig muss nichts gelockert werden.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.TEST_PORT || 3333);
const API = process.env.TEST_API || 'https://mac-studio.taild5562c.ts.net';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};

function proxy(req, res) {
  const target = new URL(API + req.url);
  const headers = Object.assign({}, req.headers, { host: target.host });
  delete headers['origin'];
  delete headers['referer'];
  delete headers['accept-encoding'];

  const upstream = https.request(
    { hostname: target.hostname, port: target.port || 443, path: target.pathname + target.search, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    }
  );
  upstream.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('proxy error: ' + e.message);
  });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  const clean = decodeURIComponent(req.url.split('?')[0]);
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/rest/v1/')) return proxy(req, res);
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log('Test-Server auf http://localhost:' + PORT + ' (API-Proxy -> ' + API + ')');
});
