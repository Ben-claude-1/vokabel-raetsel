const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { EMMA, login } = require('./helpers');

// „Wie im Topf davor lösen": wer die Lösung nicht weiß, darf in Topf 3-5 die
// leichtere Mechanik des vorherigen Topfs nutzen. Richtig gelöst bleibt das
// Wort im aktuellen Topf (kein Auf-, kein Abstieg). Topf 1+2 haben keine
// leichtere Vorstufe und bieten die Option deshalb nicht an.

const SB_KEY = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'config.js'), 'utf8')
  .match(/SB_KEY[^"]*"([A-Za-z0-9_.\-]{40,})"/)[1];

const WORTE = [];
for (let i = 0; i < 12; i++) WORTE.push({ word: 'alpha' + i, clue: 'alt ' + i, type: 'noun' });

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

test.describe('Wie im Topf davor lösen', () => {
  test('Topf 4: richtig mit Hilfe gelöst bleibt in Topf 4', async ({ page, request }) => {
    const rid = await runId(request, /Theme 2/);
    await setup(page, rid, { stand: fortschrittInTopf(4), letzterLauf: new Date().toISOString() });
    await openRun(page, 'Theme 2');

    const hilfe = page.locator('button:has-text("Wie im Topf davor lösen")');
    await expect(hilfe).toBeVisible({ timeout: 15000 });
    // Die Übersetzung ("alt N") steht als Bedeutung da, daraus lässt sich das
    // erwartete Wort ("alphaN") eindeutig ablesen.
    const clue = (await page.getByText(/^alt \d+$/).first().innerText()).trim();
    const wort = 'alpha' + clue.split(' ')[1];
    await hilfe.click();
    await expect(page.locator('text=Hilfe wie in Topf 3')).toBeVisible();

    await page.locator('input').first().fill(wort);
    await page.locator('button:has-text("✓")').first().click();
    await expect(page.locator('text=🔽 Mit Hilfe gelöst')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=bleibt Topf 4')).toBeVisible();
  });

  test('Topf 1 und Topf 2 bieten die Hilfe nicht an', async ({ page, request }) => {
    const rid = await runId(request, /Theme 2/);
    await setup(page, rid, { stand: fortschrittInTopf(1), letzterLauf: new Date().toISOString() });
    await openRun(page, 'Theme 2');
    await expect(page.locator('text=Topf 1')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button:has-text("Wie im Topf davor lösen")')).toHaveCount(0);
  });
});
