#!/usr/bin/env node
'use strict';
const http = require('http');
const fs = require('fs');
const { Client } = require('pg');
const webpush = require('web-push');

const VAPID_PATH = process.env.VAPID_KEYS_PATH || '/Users/ben/.local/etc/vokabel/vapid_keys.json';
const PG_CONFIG = {
  host: process.env.PUSH_PG_HOST || '::1',
  port: Number(process.env.PUSH_PG_PORT || 5433),
  user: process.env.PUSH_PG_USER || 'ben',
  database: process.env.PUSH_PG_DB || 'vokabel',
};
const PORT = process.env.PUSH_SERVER_PORT || 8767;
const ALLOWED_ORIGINS = new Set([
  'https://ben-claude-1.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
]);

const vapid = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
webpush.setVapidDetails('mailto:business@one-mann-consulting.de', vapid.publicKey, vapid.privateKey);

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

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', function() {
  console.log('push-server listening on 127.0.0.1:' + PORT);
});
