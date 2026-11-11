const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { EMMA, login } = require('./helpers');

// Topf 1 als 4er-Paar-Zuordnung (Setup-Kopie aus hilfe-topf-davor.spec.js)
// „Wie im Topf davor lösen": wer die Lösung nicht weiß, darf in Topf 3-5 die
// leichtere Mechanik des vorherigen Topfs nutzen. Richtig gelöst bleibt das
// Wort im aktuellen Topf (kein Auf-, kein Abstieg). Topf 1+2 haben keine
// leichtere Vorstufe und bieten die Option deshalb nicht an.

const SB_KEY = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'config.js'), 'utf8')
  .match(/SB_KEY[^"]*"([A-Za-z0-9_.\-]{40,})"/)[1];

const WORTE = [];
const NAMEN = ['casa', 'perro', 'libro', 'ventana', 'puerta', 'gato', 'sol', 'luna', 'rio', 'nube', 'arbol', 'pan'];
for (let i = 0; i < 12; i++) WORTE.push({ word: NAMEN[i], clue: 'alt ' + i, type: 'noun' });

function fortschrittInTopf(pot) {
  const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  WORTE.forEach((w) => pots[pot].push(Object.assign({ streak: 0, correct: 2, wrong: 0 }, w)));
  return { pots, sentences: [], history: [], days: {}, sessions: [] };
}

async function runId(request, muster) {
  const res = await request.get('/rest/v1/ls_runs?select=id,name,grade',
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  const run = (await res.json()).find((r) => muster.test(r.name || ''));
  if (!run) throw new Error('Test-Run ' + muster + ' nicht gefunden');
  return run.id;
}

async function setup(page, rid, opts) {
  const o = opts || {};
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (req.url().includes('repeat_runs')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(o.letzterLauf ? [{ created_at: o.letzterLauf, score: 0, max_score: 0, items: '[]' }] : []) });
    }
    if (req.url().includes('ls_progress')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'test-progress', player_id: 'x', run_id: rid, data: JSON.stringify(o.stand) }]) });
    }
    if (req.url().includes('ls_runs')) {
      const res = await route.fetch();
      let rows;
      try { rows = await res.json(); } catch (e) { return route.fulfill({ response: res }); }
      if (Array.isArray(rows)) rows.forEach((r) => {
        if (r && r.id === rid) { r.words = JSON.stringify(WORTE); r.sentences = '[]'; r.word_count = WORTE.length; }
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.continue();
  });
}

async function openRun(page, name) {
  await login(page, EMMA);
  await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});
  await page.locator('button').filter({ hasText: '🪜' }).first().click();
  await expect(page.locator('text=Leiterspiel — Run wählen')).toBeVisible({ timeout: 15000 });
  await page.locator('button').filter({ hasText: name }).first().click();
  await page.locator('button:has-text("Lernen starten")').first().click();
}


// ls_progress-Schreibzugriffe mitschneiden (die Antwort kommt vom Mock, nichts landet in der DB)
function speicherStaende(page) {
  const saves = [];
  page.on('request', (req) => {
    if (req.method() !== 'GET' && req.url().includes('ls_progress')) {
      try {
        const body = JSON.parse(req.postData());
        saves.push(typeof body.data === 'string' ? JSON.parse(body.data) : body.data);
      } catch (e) {}
    }
  });
  return saves;
}

async function sichtbareClues(page) {
  return (await page.getByText(/^alt \d+$/).allInnerTexts()).map((t) => t.trim());
}
const wortZu = (clue) => NAMEN[+clue.split(' ')[1]];

async function verbinde(page, clue, wort) {
  await page.getByText(clue, { exact: true }).click();
  await page.getByText(wort, { exact: true }).click();
}

test.describe('Topf 1: Paar-Zuordnung', () => {
  test('4 Paare sauber verbunden steigen alle nach Topf 2 auf', async ({ page, request }) => {
    const rid = await runId(request, /Theme 2/);
    await setup(page, rid, { stand: fortschrittInTopf(1), letzterLauf: new Date().toISOString() });
    const saves = speicherStaende(page);
    await openRun(page, 'Theme 2');
    await expect(page.locator('text=Verbinde die Paare')).toBeVisible({ timeout: 15000 });

    const clues = await sichtbareClues(page);
    expect(clues.length).toBe(4);
    for (const c of clues) await verbinde(page, c, wortZu(c));

    await expect(page.locator('text=4 von 4 auf Anhieb')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Weiter")').click();
    await expect.poll(() => saves.length, { timeout: 10000 }).toBeGreaterThan(0);
    const d = saves[saves.length - 1];
    expect(d.pots['2'].length).toBe(4);
    expect(d.pots['1'].length).toBe(8);
    // danach geht es weiter: nächste Runde (8 Wörter übrig)
    await expect(page.locator('text=Verbinde die Paare')).toBeVisible({ timeout: 10000 });
  });

  test('ein Fehlversuch hält genau dieses Wort in Topf 1', async ({ page, request }) => {
    const rid = await runId(request, /Theme 2/);
    await setup(page, rid, { stand: fortschrittInTopf(1), letzterLauf: new Date().toISOString() });
    const saves = speicherStaende(page);
    await openRun(page, 'Theme 2');
    await expect(page.locator('text=Verbinde die Paare')).toBeVisible({ timeout: 15000 });

    const clues = await sichtbareClues(page);
    const [a, b] = clues;
    // a mit dem falschen Wort von b verbinden → Fehlversuch für a
    await verbinde(page, a, wortZu(b));
    await page.waitForTimeout(600);
    for (const c of clues) await verbinde(page, c, wortZu(c));

    await expect(page.locator('text=3 von 4 auf Anhieb')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Weiter")').click();
    await expect.poll(() => saves.length, { timeout: 10000 }).toBeGreaterThan(0);
    const d = saves[saves.length - 1];
    expect(d.pots['2'].length).toBe(3);
    const bleibt = d.pots['1'].find((w) => w.word === wortZu(a));
    expect(bleibt).toBeTruthy();
    expect(bleibt.wrong).toBe(1);
    expect(d.pots['2'].some((w) => w.word === wortZu(a))).toBe(false);
  });

  test('neue Wörter: erst Lernkarte mit allen Paaren, dann Zuordnung', async ({ page, request }) => {
    const rid = await runId(request, /Theme 2/);
    const stand = fortschrittInTopf(1);
    stand.pots[1].forEach((w) => { w.correct = 0; w.wrong = 0; });
    await setup(page, rid, { stand, letzterLauf: new Date().toISOString() });
    await openRun(page, 'Theme 2');
    await expect(page.locator('text=merk dir die Paare')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("Gemerkt — verbinden")').click();
    await expect(page.locator('text=Verbinde die Paare')).toBeVisible();
  });
});
