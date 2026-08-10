const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { EMMA, login } = require('./helpers');

// Lernen und Wiederholen wechseln sich ab: Das Leiterspiel bleibt zu, bis der
// fällige Wiederholungslauf gemacht ist — und ist danach wieder frei.
//
// Wie in punkte.spec.js wird jeder schreibende Request abgefangen, damit nichts
// in Emmas Lernstand landet. Lernstand und Wortliste des Test-Runs werden durch
// synthetische ersetzt, damit der Test nicht davon abhängt, wie Emmas echter
// Stand gerade aussieht.

const SB_KEY = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'config.js'), 'utf8')
  .match(/SB_KEY[^"]*"([A-Za-z0-9_.\-]{40,})"/)[1];

const GELERNT = 25;   // Vokabeln in Topf 6 — über minPool (20), damit gesperrt wird
const NEU = 10;

const TESTWORTE = [];
for (let i = 0; i < GELERNT; i++) TESTWORTE.push({ word: 'alpha' + i, clue: 'alt ' + i, type: 'noun' });
for (let i = 0; i < NEU; i++) TESTWORTE.push({ word: 'beta' + i, clue: 'neu ' + i, type: 'noun' });

// Alle gelernten Wörter sind lange überfällig (kein `lc` = nie belegt gekonnt).
function testFortschritt() {
  const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (let i = 0; i < GELERNT; i++) {
    pots[6].push({ word: 'alpha' + i, clue: 'alt ' + i, type: 'noun', streak: 0, correct: 3, wrong: 0 });
  }
  for (let i = 0; i < NEU; i++) {
    pots[1].push({ word: 'beta' + i, clue: 'neu ' + i, type: 'noun', streak: 0 });
  }
  return { pots, sentences: [], history: [], days: {}, sessions: [] };
}

// Die run_id muss echt sein, sonst fällt der Lernstand aus der Klassen-/
// Sprachauswahl heraus und die Shell sieht einen leeren Pool.
async function themeRunId(request) {
  const res = await request.get('/rest/v1/ls_runs?select=id,name',
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  const rows = await res.json();
  const run = rows.find((r) => /Theme 2/.test(r.name || ''));
  if (!run) throw new Error('Test-Run "Theme 2" nicht gefunden');
  return run.id;
}

async function setup(page, runId, protokoll, opts) {
  const letzterLauf = (opts || {}).letzterLauf || null;
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      protokoll.push(req.method() + ' ' + req.url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (req.url().includes('repeat_runs')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(letzterLauf ? [{ created_at: letzterLauf }] : []),
      });
    }
    if (req.url().includes('ls_progress')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'test-progress', player_id: 'x', run_id: runId,
          data: JSON.stringify(testFortschritt()) }]),
      });
    }
    if (req.url().includes('ls_runs')) {
      const res = await route.fetch();
      let rows;
      try { rows = await res.json(); } catch (e) { return route.fulfill({ response: res }); }
      if (Array.isArray(rows)) rows.forEach((r) => {
        if (r && r.id === runId) {
          r.words = JSON.stringify(TESTWORTE); r.sentences = '[]'; r.word_count = TESTWORTE.length;
        }
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.continue();
  });
}

async function openLeiterspiel(page) {
  await login(page, EMMA);
  await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});
  // Achtung: bei gesperrtem Zustand enthält auch die Wiederholungs-Kachel das
  // Wort "Leiterspiel" ("... ist bis dahin gesperrt"). Deshalb über das Symbol.
  await page.locator('button').filter({ hasText: '🪜' }).first().click();
}

test.describe('Wechsel Lernen / Wiederholen', () => {
  test('ohne Wiederholung ist das Leiterspiel gesperrt', async ({ page, request }) => {
    const schreibzugriffe = [];
    const runId = await themeRunId(request);
    await setup(page, runId, schreibzugriffe);
    await openLeiterspiel(page);

    await expect(page.locator('text=Erst die Wiederholung!')).toBeVisible({ timeout: 15000 });
    // Der Wechsel wird als Kette gezeigt: Lernen → Wiederholen → Lernen
    await expect(page.locator('text=🔁 Wiederholen')).toBeVisible();
    await expect(page.locator('button:has-text("🔁 Wiederholung starten")')).toBeVisible();
    // Die Run-Liste bleibt zu
    await expect(page.locator('text=Leiterspiel — Run wählen')).toHaveCount(0);
    expect(schreibzugriffe.every((z) => /ls_progress|learn_sessions|settings|players/.test(z)),
      'unerwarteter Schreibzugriff: ' + schreibzugriffe.join(' | ')).toBe(true);
  });

  test('frisch wiederholt und wenig gelernt: Leiterspiel ist frei', async ({ page, request }) => {
    // Das ist der Fall, der die Dauerschleife verhindert — der Rückstand ist
    // unverändert groß (25 fällig), aber der Lauf ist gerade erst gelaufen.
    const schreibzugriffe = [];
    const runId = await themeRunId(request);
    await setup(page, runId, schreibzugriffe, { letzterLauf: new Date().toISOString() });
    await openLeiterspiel(page);

    await expect(page.locator('text=Leiterspiel — Run wählen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Erst die Wiederholung!')).toHaveCount(0);
  });
});
