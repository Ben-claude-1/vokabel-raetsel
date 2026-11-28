// Routinen-Starter für Emma (Lern App).
// Bindet nur 127.0.0.1, Positivliste statt freiem Befehl:
//   POST /remind                 prüft Emmas Lernzeit (sync.mjs remind), Alexa-Ansage + Push nur bei < 30 min
//   POST /emma/push  {"text":…}  Pushover-Nachricht an Emma. Empfänger ist fest, kein Parameter.
// Aufgerufen von Hub-Routinen per http-Aktion (Gruppe "Lernen Emma").
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pushEmma } from './push.mjs';

const PORT = 8796;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYNC = path.join(HERE, 'sync.mjs');
const MIN_PUSH_GAP_MS = 5000; // Schutz vor Dauerfeuer auf Emmas Handy
let running = false;
let lastPush = 0;

const send = (res, code, body) =>
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }).end(body);

function readBody(req, max = 4096) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > max) { reject(new Error('zu groß')); req.destroy(); } });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  if (req.method !== 'POST') return send(res, 404, 'nicht gefunden\n');

  if (req.url === '/remind') {
    if (running) return send(res, 409, 'läuft schon\n');
    running = true;
    const p = spawn(process.execPath, [SYNC, 'remind'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', code => {
      running = false;
      console.log(new Date().toISOString().slice(0, 19), 'remind exit', code);
      send(res, code === 0 ? 200 : 500, out);
    });
    return;
  }

  if (req.url === '/emma/push') {
    try {
      const now = Date.now();
      if (now - lastPush < MIN_PUSH_GAP_MS) return send(res, 429, 'zu schnell hintereinander\n');
      let text;
      try { text = JSON.parse(await readBody(req)).text; } catch { return send(res, 400, 'erwartet JSON {"text": "…"}\n'); }
      if (typeof text !== 'string') return send(res, 400, 'text fehlt\n');
      lastPush = now;
      await pushEmma(text, 'Nachricht von Papa');
      console.log(new Date().toISOString().slice(0, 19), 'push gesendet,', text.length, 'Zeichen');
      return send(res, 200, 'gesendet\n');
    } catch (e) {
      console.log(new Date().toISOString().slice(0, 19), 'push fehlgeschlagen:', e.message);
      return send(res, 500, 'fehlgeschlagen: ' + e.message + '\n');
    }
  }

  send(res, 404, 'nicht gefunden\n');
}).listen(PORT, '127.0.0.1', () => console.log('remind-starter auf 127.0.0.1:' + PORT));
