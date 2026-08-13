const { test, expect } = require('@playwright/test');
const { EMMA, login } = require('./helpers');

// In den Töpfen 3 bis 5 tippt man die Vokabel selbst ein. Der ✓-Knopf war
// direkt mit submitAnswer verdrahtet — React reicht dabei das Klick-Event als
// erstes Argument durch, und das ist der Parameter `skipped`. Jede getippte
// Antwort landete dadurch als "Nicht gewusst": Eingabe verworfen, als falsch
// gewertet, Wort einen Topf zurück. Mit der Enter-Taste ging es, am Handy nicht.
const TESTWORTE = [];
for (let i = 0; i < 12; i++) TESTWORTE.push({ word: 'alpha' + i, clue: 'alt ' + i, type: 'noun' });

async function readOnly(page, runId) {
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (req.url().includes('repeat_runs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ created_at: new Date().toISOString() }]),
      });
    }
    // Lernstand fälschen: alle Wörter in Topf 4 → die erste Frage ist eine
    // Tipp-Frage. Vorher hat sich der Test dorthin durchgeklickt; seit das
    // Überspringen auf 3 pro Runde begrenzt ist, geht das nicht mehr.
    if (req.url().includes('ls_progress')) {
      const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      TESTWORTE.forEach((w) => pots[4].push(Object.assign({ streak: 0, correct: 2, wrong: 0 }, w)));
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'test-progress', player_id: 'x', run_id: runId,
          data: JSON.stringify({ pots, sentences: [], history: [], days: {}, sessions: [] }) }]) });
    }
    // Die Wortliste des Runs muss dazu passen — sonst räumt das Leiterspiel den
    // gefälschten Stand beim Abgleich wieder weg.
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

async function themeRunId(request) {
  const SB_KEY = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'core', 'config.js'), 'utf8')
    .match(/SB_KEY[^"]*"([A-Za-z0-9_.\-]{40,})"/)[1];
  const res = await request.get('/rest/v1/ls_runs?select=id,name',
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  const run = (await res.json()).find((r) => /Theme 1/.test(r.name || ''));
  if (!run) throw new Error('Test-Run "Theme 1" nicht gefunden');
  return run.id;
}

async function tippfrageSuchen(page) {
  await login(page, EMMA);
  await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});
  await page.locator('button:has-text("Leiterspiel")').first().click();
  await page.locator('button').filter({ hasText: /Theme 1/ }).first().click();
  await page.locator('button:has-text("▶ Lernen starten")').click();
  const eingabe = page.locator('input[placeholder^="Englisch"], input[placeholder^="Deutsch"]');
  await eingabe.first().waitFor({ timeout: 10000 }).catch(() => {});
  return (await eingabe.count()) > 0;
}

test.describe('Getippte Antwort', () => {
  test('Der ✓-Knopf wertet die Eingabe aus statt zu überspringen', async ({ page, request }) => {
    await readOnly(page, await themeRunId(request));
    const gefunden = await tippfrageSuchen(page);
    expect(gefunden, 'keine Tipp-Frage erreicht').toBe(true);

    const eingabe = page.locator('input[placeholder^="Englisch"], input[placeholder^="Deutsch"]').first();
    await eingabe.fill('irgendwas');
    await page.locator('button:has-text("✓")').first().click();
    await page.waitForSelector('button:has-text("→ Weiter")', { timeout: 10000 });

    const text = await page.locator('body').innerText();
    // Egal ob richtig oder falsch — "Übersprungen" darf hier nicht stehen,
    // und die Eingabe muss als Antwort erscheinen.
    expect(text).not.toContain('Übersprungen');
    expect(text).toContain('irgendwas');
  });
});
