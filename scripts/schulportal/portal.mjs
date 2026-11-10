// Schulportal Hessen per Debug-Chrome (CDP, Port 9222) auslesen. Kein Passwort im Log.
import { spawnSync } from 'node:child_process';

const CDP = 'http://127.0.0.1:9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function vaultCreds() {
  const r = spawnSync('.venv/bin/python', ['-m', 'local_ai.vault_cli', 'get', 'Schulportal Emma'],
    { cwd: '/Users/ben/Projects/Mac Studio/local-ai', encoding: 'utf8' });
  if (r.status !== 0) throw new Error('Tresor nicht lesbar (Schulportal Emma)');
  const j = JSON.parse(r.stdout);
  const f = j.fields || j;
  return { user: f.user, password: f.password };
}

async function openTab() {
  const res = await fetch(CDP + '/json/new?about:blank', { method: 'PUT' });
  if (!res.ok) throw new Error('Debug-Chrome nicht erreichbar');
  const tab = await res.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = () => err(new Error('CDP-WebSocket Fehler')); });
  let id = 0; const pend = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const goto = async (url, waitFor) => {
    await send('Page.navigate', { url });
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      if (await ev('document.readyState') === 'complete' && (!waitFor || await ev(waitFor))) return;
    }
  };
  const close = async () => { try { ws.close(); await fetch(CDP + '/json/close/' + tab.id); } catch {} };
  return { ev, goto, close };
}

export async function withPortal(fn) {
  const t = await openTab();
  try {
    await t.goto('https://start.schulportal.hessen.de/meinunterricht.php');
    if (!(await t.ev('location.host')).startsWith('start.')) {
      const { user, password } = vaultCreds();
      await t.goto('https://login.schulportal.hessen.de/?i=4415', '!!document.querySelector("#username2")');
      await t.ev(`(()=>{const u=document.querySelector('#username2'),p=document.querySelector('#inputPassword');
        u.value=${JSON.stringify(user)};p.value=${JSON.stringify(password)};
        u.dispatchEvent(new Event('input',{bubbles:true}));p.dispatchEvent(new Event('input',{bubbles:true}));
        [...document.querySelectorAll('button')].find(b=>/Anmelden/.test(b.textContent)).click();})()`);
      for (let i = 0; i < 20 && !(await t.ev('location.host')).startsWith('start.'); i++) await sleep(1000);
      await t.goto('https://start.schulportal.hessen.de/meinunterricht.php');
      if (!(await t.ev('location.host')).startsWith('start.')) throw new Error('Schulportal-Login fehlgeschlagen');
    }
    return await fn(t);
  } finally { await t.close(); }
}

// Liefert [{id, name}] aller Kurse aus "mein Unterricht".
export async function listCourses(t) {
  await t.goto('https://start.schulportal.hessen.de/meinunterricht.php');
  return await t.ev(`(()=>{const out={};document.querySelectorAll('a[href*="a=sus_view"]').forEach(a=>{
    const m=a.href.match(/id=(\\d+)/);if(!m)return;
    const row=a.closest('tr,.panel,.card,li,div[id]')||a;
    out[m[1]]=out[m[1]]||(row.innerText||a.innerText).trim().split('\\n')[0];});
    return Object.entries(out).map(([id,name])=>({id,name}));})()`);
}

// Kursmappe → Einträge [{date,topic,homework}]
export async function courseHistory(t, id) {
  await t.goto('https://start.schulportal.hessen.de/meinunterricht.php?a=sus_view&id=' + id);
  const text = await t.ev('document.body.innerText');
  return parseHistory(text);
}

const ATT = /^(anwesend|entschuldigt|unentschuldigt|nicht erfasst|verspätet|beurlaubt)\b/i;
export function parseHistory(text) {
  const parts = text.split(/^(\d\d\.\d\d\.\d{4})\s*$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const lines = parts[i + 1].split('\n').map(l => l.trim());
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) continue;
    const topic = nonEmpty[0].replace(/^[\d.\s-]*Stunde\s*/, '').trim();
    const hw = [];
    for (const l of nonEmpty.slice(1)) {
      if (/^Hausaufgabe\s+(un)?erledigt/i.test(l) || ATT.test(l)) continue;
      if (/^(Datenschutz|Impressum)/.test(l)) break;
      hw.push(l);
    }
    out.push({ date: parts[i], topic, homework: hw.join(' ').trim() });
  }
  return out;
}
