const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { EMMA, login, blockWrites } = require('./helpers');

const SB_KEY = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'config.js'), 'utf8')
  .match(/SB_KEY[^"]*"([A-Za-z0-9_.\-]{40,})"/)[1];

// Die run_id muss echt sein, sonst fällt der gefälschte Lernstand aus der
// Klassen-/Sprachauswahl heraus.
async function themeRunId(request) {
  const res = await request.get('/rest/v1/ls_runs?select=id,name',
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  const run = (await res.json()).find((r) => /Theme 2/.test(r.name || ''));
  if (!run) throw new Error('Test-Run "Theme 2" nicht gefunden');
  return run.id;
}

// Tagesaufgaben auf der Startseite: drei Aufträge, Fortschrittsbalken, und am
// Ende eine Belohnung, die genau einmal abgeholt werden kann.
//
// Der Testserver ist schreibgeschützt (tests/dev-server.js), zusätzlich fängt
// blockWrites im Browser ab — es kann nichts in Emmas Lernstand gelangen.

// Ein Tagesstand, der die erste Aufgabe erfüllt und die anderen offen lässt.
async function tagesstand(page, opts) {
  const o = opts || {};
  await page.route('**/rest/v1/learn_sessions*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const sessions = [];
    for (let i = 0; i < (o.minuten || 0); i++) {
      sessions.push({ game: 'leiterspiel', active_seconds: 60, started_at: new Date().toISOString() });
    }
    (o.spiele || []).forEach((g) => sessions.push({ game: g, active_seconds: 30, started_at: new Date().toISOString() }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) });
  });
}

test.describe('Tagesaufgaben', () => {
  test('drei Aufgaben mit Fortschritt, Belohnung erst wenn etwas fertig ist', async ({ page }) => {
    await blockWrites(page);
    await tagesstand(page, { minuten: 0 });
    await login(page, EMMA);
    await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});

    const karte = page.locator('text=Deine 3 Aufgaben heute');
    await expect(karte).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=0 von 3 geschafft')).toBeVisible();
    // Ohne erledigte Aufgabe gibt es nichts abzuholen
    await expect(page.locator('button:has-text("Punkte abholen")')).toHaveCount(0);
  });

  test('erfüllte Aufgabe wird abgehakt und die Belohnung ist abholbar', async ({ page }) => {
    await blockWrites(page);
    // 20 Minuten Lernzeit erfüllt die Ausdauer-Aufgabe (Ziel 15 Minuten)
    await tagesstand(page, { minuten: 20 });
    await login(page, EMMA);
    await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});

    await expect(page.locator('text=Deine 3 Aufgaben heute')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=1 von 3 geschafft')).toBeVisible();
    const abholen = page.locator('button:has-text("Punkte abholen")');
    await expect(abholen).toBeVisible();
    await expect(abholen).toContainText('80');   // Belohnung der Ausdauer-Aufgabe
  });

  test('eine fällige Wiederholung wird zur Tagesaufgabe', async ({ page, request }) => {
    await blockWrites(page);
    await tagesstand(page, { minuten: 0 });
    // Noch nie wiederholt und 25 überfällige gelernte Vokabeln -> die Sperre
    // greift, also muss die Wiederholung als Aufgabe auftauchen statt eines
    // anderen Spiels. Beides muss gefälscht werden: ohne gelernten Bestand
    // gibt es nichts zu wiederholen und die Sperre bliebe aus.
    const runId = await themeRunId(request);
    await page.route('**/rest/v1/repeat_runs*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/ls_progress*', (route) => {
      const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      for (let i = 0; i < 25; i++) pots[6].push({ word: 'alpha' + i, clue: 'alt ' + i, correct: 3 });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'p', player_id: 'x', run_id: runId,
          data: JSON.stringify({ pots, sentences: [], history: [], days: {}, sessions: [] }) }]) });
    });
    await login(page, EMMA);
    await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});

    await expect(page.locator('text=Deine 3 Aufgaben heute')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Einen Wiederholungslauf machen')).toBeVisible();
  });
});
