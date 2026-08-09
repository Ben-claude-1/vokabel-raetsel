const { test, expect } = require('@playwright/test');
const { EMMA, login } = require('./helpers');

// Prüft die eingestreute Wiederholung: jede 5. Frage holt ein fälliges Wort aus
// Topf 6 zurück, statt es bis zum nächsten Pflichtlauf liegen zu lassen.
//
// Wie in punkte.spec.js wird jeder schreibende Request abgefangen, damit nichts
// in Emmas Lernstand landet.
//
// Zusätzlich bekommt der Test-Run eine eigene Wortliste und einen dazu passenden
// Fortschritt: 20 gelernte, lange überfällige Wörter und 10 neue. Beides muss
// zusammenpassen, weil die App den Fortschritt beim Laden gegen die Wortliste
// des Runs abgleicht und Unbekanntes verwirft.
const ALT = 20, NEU = 10;

const TESTWORTE = [];
for (let i = 0; i < ALT; i++) TESTWORTE.push({ word: 'alpha' + i, clue: 'alt ' + i, type: 'noun' });
for (let i = 0; i < NEU; i++) TESTWORTE.push({ word: 'beta' + i, clue: 'neu ' + i, type: 'noun' });

function testFortschritt() {
  const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (let i = 0; i < ALT; i++) {
    pots[6].push({ word: 'alpha' + i, clue: 'alt ' + i, type: 'noun', streak: 0,
      correct: 3, wrong: 0, lc: '2026-01-01', ls: '2026-01-01', rl: 0 });
  }
  for (let i = 0; i < NEU; i++) {
    pots[1].push({ word: 'beta' + i, clue: 'neu ' + i, type: 'noun', streak: 0 });
  }
  return { pots, sentences: [], history: [], days: {}, sessions: [] };
}

async function setup(page, protokoll) {
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      protokoll.push(req.method() + ' ' + req.url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (req.url().includes('repeat_runs')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ created_at: new Date().toISOString() }]),
      });
    }
    if (req.url().includes('ls_progress')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'test-progress', player_id: 'x', run_id: 'y',
          data: JSON.stringify(testFortschritt()) }]),
      });
    }
    // Wortliste des Theme-2-Runs durch die Testwörter ersetzen
    if (req.url().includes('ls_runs')) {
      const res = await route.fetch();
      let rows;
      try { rows = await res.json(); } catch (e) { return route.fulfill({ response: res }); }
      if (Array.isArray(rows)) {
        rows.forEach((r) => {
          if (r && /Theme 2/.test(r.name || '')) {
            r.words = JSON.stringify(TESTWORTE);
            r.sentences = '[]';
            r.word_count = TESTWORTE.length;
          }
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.continue();
  });
}

test.describe('Wiederholung im Spielfluss', () => {
  test('jede 5. Frage ist ein fälliges Wort aus Topf 6', async ({ page }) => {
    const schreibzugriffe = [];
    await setup(page, schreibzugriffe);
    await login(page, EMMA);
    await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});
    await page.locator('button:has-text("Leiterspiel")').first().click();
    await page.locator('button').filter({ hasText: /Theme 2/ }).first().click();
    await page.locator('button:has-text("▶ Lernen starten")').click();

    let wiederholungen = 0;
    let fragen = 0;
    for (let i = 0; i < 12; i++) {
      await page.waitForSelector('button:has-text("Überspringen"), button:has-text("→ Weiter")', { timeout: 15000 });
      const istWdh = await page.locator('text=🔁 Wiederholung — kannst du es noch?').count();
      if (istWdh) {
        wiederholungen++;
        // Wiederholungsfragen werden frei getippt und geben 30 Punkte
        await expect(page.locator('text=Richtig = 30 Punkte')).toBeVisible();
      }
      fragen++;
      const skip = page.locator('button:has-text("Überspringen")').first();
      if (await skip.count()) await skip.click();
      const weiter = page.locator('button:has-text("→ Weiter")');
      await weiter.waitFor({ timeout: 10000 });
      await weiter.click();
      await page.waitForTimeout(200);
    }

    expect(fragen).toBeGreaterThanOrEqual(10);
    // Bei 12 Fragen und "jede 5." müssen mindestens zwei dabei sein
    expect(wiederholungen).toBeGreaterThanOrEqual(2);
    // Sicherheitsnetz: die Speichervorgänge wurden abgefangen, in der Datenbank
    // ist nichts gelandet.
    expect(schreibzugriffe.length, 'Schreibzugriffe wurden abgefangen').toBeGreaterThan(0);
    expect(schreibzugriffe.every((z) => /ls_progress|learn_sessions|settings|players/.test(z)),
      'unerwarteter Schreibzugriff: ' + schreibzugriffe.join(' | ')).toBe(true);
  });
});
