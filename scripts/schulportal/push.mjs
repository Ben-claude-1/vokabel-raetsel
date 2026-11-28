// Pushover an Emma. Der Empfänger ist FEST (Emmas eigenes Konto) und kein Parameter.
// App-Token kommt aus dem Tresor (Eintrag "pushover", Feld app_token), Emmas User Key aus einer Datei (chmod 600).
// Nichts davon wird geloggt oder zurückgegeben.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const KEY_FILE = path.join(os.homedir(), '.local/state/lernapp-schulportal/emma-pushover-userkey');
const LOCAL_AI = '/Users/ben/Projects/Mac Studio/local-ai';
const MAX_LEN = 500;

function appToken() {
  const out = execFileSync(path.join(LOCAL_AI, '.venv/bin/python'), ['-m', 'local_ai.vault_cli', 'get', 'pushover'],
    { cwd: LOCAL_AI, encoding: 'utf8', timeout: 20000 });
  const t = JSON.parse(out).app_token;
  if (!t) throw new Error('Pushover-App-Token fehlt im Tresor');
  return t;
}

export async function pushEmma(message, title = 'Nachricht') {
  message = String(message ?? '').trim();
  if (!message) throw new Error('leerer Text');
  if (message.length > MAX_LEN) throw new Error(`Text zu lang (max. ${MAX_LEN} Zeichen)`);
  const user = fs.readFileSync(KEY_FILE, 'utf8').trim();
  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: appToken(), user, title: String(title).slice(0, 100), message }),
  });
  if (!res.ok) throw new Error('Pushover: HTTP ' + res.status);
}
