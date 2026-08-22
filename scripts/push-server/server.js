#!/usr/bin/env node
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { Client } = require('pg');
const webpush = require('web-push');

const VAPID_PATH = process.env.VAPID_KEYS_PATH || '/Users/ben/.local/etc/vokabel/vapid_keys.json';
const PUSHOVER_PATH = process.env.PUSHOVER_KEYS_PATH || '/Users/ben/.local/etc/vokabel/pushover.json';
const PG_CONFIG = {
  host: process.env.PUSH_PG_HOST || '::1',
  port: Number(process.env.PUSH_PG_PORT || 5433),
  user: process.env.PUSH_PG_USER || 'ben',
  database: process.env.PUSH_PG_DB || 'vokabel',
};
const PORT = process.env.PUSH_SERVER_PORT || 8767;
// Der Freigabe-Link steht im Klartext in der Pushover-Nachricht auf Bens Handy —
// eine öffentliche Herkunft ist da kein zusätzliches Risiko, aber ohne Eintrag
// hier würde withCors() den Preflight/die Antwort für github.io stumm verweigern.
const ALLOWED_ORIGINS = new Set([
  'https://ben-claude-1.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
]);
// Zwischen zwei Anfragen desselben Kindes muss diese Zeit liegen, bevor eine
// neue Pushover-Nachricht rausgeht — sonst könnte ungeduldiges Tippen Bens
// Handy fluten. Eine schon offene Anfrage wird stattdessen einfach zurückgegeben.
const SKIP_REQUEST_COOLDOWN_MS = 60000;

const vapid = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
webpush.setVapidDetails('mailto:business@one-mann-consulting.de', vapid.publicKey, vapid.privateKey);

const pushover = JSON.parse(fs.readFileSync(PUSHOVER_PATH, 'utf8'));

// Der Freigabe-Link braucht kein eigenes Geheimnis in der DB: das HMAC bindet
// id+decision an APPROVE_SECRET, das nur dieser Server kennt. Damit kann
// niemand, der die (ohnehin zufällige) request-id kennt, sich selbst freigeben.
function approveToken(id, decision) {
  return crypto.createHmac('sha256', pushover.approve_secret).update(id + ':' + decision).digest('hex').slice(0, 32);
}

function sendPushover(title, message, url) {
  var body = new URLSearchParams({
    token: pushover.app_token,
    user: pushover.user_key_ben,
    title: title,
    message: message,
    url: url,
    url_title: 'Anfrage öffnen',
    priority: '1',
  });
  return fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: body })
    .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, data: j }; }); });
}

function withCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise(function(resolve, reject) {
    var data = '';
    req.on('data', function(chunk) { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', function() {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sendToPlayer(playerId, payload) {
  const client = new Client(PG_CONFIG);
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE player_id = $1',
      [playerId]
    );
    const results = [];
    for (const row of rows) {
      const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        results.push({ id: row.id, ok: true });
      } catch (err) {
        results.push({ id: row.id, ok: false, status: err.statusCode, msg: err.message });
        if (err.statusCode === 404 || err.statusCode === 410) {
          await client.query('DELETE FROM push_subscriptions WHERE id = $1', [row.id]);
        }
      }
    }
    return results;
  } finally {
    await client.end();
  }
}

const REASON_TEXT = {
  learned: 'hat ihr Lernpensum erreicht',
  days: 'ist seit Tagen keine Wiederholung mehr fällig gewesen',
  first: 'macht ihre allererste Wiederholung',
};

async function createSkipRequest(playerId, playerName, reason, dueCount) {
  const client = new Client(PG_CONFIG);
  await client.connect();
  try {
    const { rows: recent } = await client.query(
      "select id, status, created_at from review_skip_requests where player_id = $1 order by created_at desc limit 1",
      [playerId]
    );
    const last = recent[0];
    if (last && last.status === 'pending') return { row: last, isNew: false };
    if (last && (Date.now() - new Date(last.created_at).getTime()) < SKIP_REQUEST_COOLDOWN_MS) {
      return { row: last, isNew: false, cooldown: true };
    }
    const { rows } = await client.query(
      `insert into review_skip_requests (player_id, player_name, reason, due_count)
       values ($1, $2, $3, $4) returning id, status, created_at`,
      [playerId, playerName, reason, dueCount]
    );
    return { row: rows[0], isNew: true };
  } finally {
    await client.end();
  }
}

async function resolveSkipRequest(id, decision) {
  const client = new Client(PG_CONFIG);
  await client.connect();
  try {
    const { rows } = await client.query('select id, status, player_name from review_skip_requests where id = $1', [id]);
    const row = rows[0];
    if (!row) return { notFound: true };
    if (row.status !== 'pending') return { already: row.status, playerName: row.player_name };
    const status = decision === 'approve' ? 'approved' : 'denied';
    await client.query(
      "update review_skip_requests set status = $1, resolved_at = now(), resolved_by = 'ben-pushover' where id = $2",
      [status, id]
    );
    return { status: status, playerName: row.player_name };
  } finally {
    await client.end();
  }
}

function htmlPage(title, body) {
  return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title><style>body{font-family:-apple-system,sans-serif;background:#f5f5f4;margin:0;padding:40px 20px;text-align:center;color:#292524;}' +
    '.card{max-width:360px;margin:0 auto;background:white;border-radius:16px;padding:28px 20px;box-shadow:0 4px 20px rgba(0,0,0,0.08);}' +
    'h1{font-size:18px;margin:0 0 8px;}p{font-size:14px;color:#78716c;margin:0;}</style></head>' +
    '<body><div class="card">' + body + '</div></body></html>';
}

const server = http.createServer(async function(req, res) {
  withCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/vapid-public-key') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ publicKey: vapid.publicKey }));
    return;
  }

  if (req.method === 'POST' && req.url === '/send') {
    try {
      const body = await readBody(req);
      const playerId = body.player_id;
      if (!UUID_RE.test(playerId || '')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'player_id fehlt oder ungueltig' }));
        return;
      }
      const payload = {
        title: String(body.title || 'Vokabel-Rätsel').slice(0, 120),
        body: String(body.body || '').slice(0, 300),
        url: typeof body.url === 'string' ? body.url : '/',
      };
      const results = await sendToPlayer(playerId, payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sent: results.length, results: results }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/skip-request') {
    try {
      const body = await readBody(req);
      const playerId = body.player_id;
      if (!UUID_RE.test(playerId || '')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'player_id fehlt oder ungueltig' }));
        return;
      }
      const playerName = String(body.player_name || 'Ein Kind').slice(0, 60);
      const reason = String(body.reason || '').slice(0, 30);
      const dueCount = Number.isFinite(Number(body.due_count)) ? Math.max(0, Math.round(Number(body.due_count))) : null;
      const { row, isNew, cooldown } = await createSkipRequest(playerId, playerName, reason, dueCount);
      if (isNew) {
        const approveUrl = 'https://mac-studio.taild5562c.ts.net/push/skip-approve?id=' + row.id + '&decision=approve&token=' + approveToken(row.id, 'approve');
        const denyUrl = 'https://mac-studio.taild5562c.ts.net/push/skip-approve?id=' + row.id + '&decision=deny&token=' + approveToken(row.id, 'deny');
        const grund = REASON_TEXT[reason] || 'möchte die Wiederholung überspringen';
        const menge = dueCount != null ? ' (' + dueCount + ' fällige Vokabeln)' : '';
        sendPushover(
          '🪜 ' + playerName + ' möchte die Wiederholung überspringen',
          playerName + ' ' + grund + menge + '.\n\n✅ Freigeben: ' + approveUrl + '\n\n❌ Ablehnen: ' + denyUrl,
          approveUrl
        ).catch(function(e) { console.error('pushover send failed:', e.message); });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: row.id, status: row.status, cooldown: !!cooldown }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'GET' && req.url.indexOf('/skip-approve') === 0) {
    try {
      const params = new URL(req.url, 'http://x').searchParams;
      const id = params.get('id') || '';
      const decision = params.get('decision') === 'deny' ? 'deny' : 'approve';
      const token = params.get('token') || '';
      const validId = UUID_RE.test(id);
      const validToken = validId && token.length === 32 &&
        crypto.timingSafeEqual(Buffer.from(approveToken(id, decision)), Buffer.from(token));
      if (!validId || !validToken) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlPage('Ungültiger Link', '<h1>🚫 Ungültiger Link</h1><p>Dieser Freigabe-Link ist nicht gültig.</p>'));
        return;
      }
      const result = await resolveSkipRequest(id, decision);
      res.writeHead(result.notFound ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (result.notFound) {
        res.end(htmlPage('Nicht gefunden', '<h1>🤷 Nicht gefunden</h1><p>Diese Anfrage existiert nicht (mehr).</p>'));
      } else if (result.already) {
        const txt = result.already === 'approved' ? 'bereits freigegeben' : 'bereits abgelehnt';
        res.end(htmlPage('Schon entschieden', '<h1>ℹ️ Schon entschieden</h1><p>' + (result.playerName || '') + ': ' + txt + '.</p>'));
      } else if (result.status === 'approved') {
        res.end(htmlPage('Freigegeben', '<h1>✅ Freigegeben</h1><p>' + (result.playerName || 'Das Kind') + ' kann die Wiederholung diesmal überspringen — die App öffnet sich gleich von selbst.</p>'));
      } else {
        res.end(htmlPage('Abgelehnt', '<h1>❌ Abgelehnt</h1><p>' + (result.playerName || 'Das Kind') + ' muss die Wiederholung noch machen.</p>'));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlPage('Fehler', '<h1>Fehler</h1><p>' + err.message + '</p>'));
    }
    return;
  }

  if (req.method === 'GET' && req.url.indexOf('/skip-status') === 0) {
    const params = new URL(req.url, 'http://x').searchParams;
    const id = params.get('id') || '';
    if (!UUID_RE.test(id)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'id fehlt oder ungueltig' }));
      return;
    }
    const client = new Client(PG_CONFIG);
    try {
      await client.connect();
      const { rows } = await client.query('select status from review_skip_requests where id = $1', [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: rows[0] ? rows[0].status : null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    } finally {
      await client.end();
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', function() {
  console.log('push-server listening on 127.0.0.1:' + PORT);
});
