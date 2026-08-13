const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { EMMA, login } = require('./helpers');

// Zwei Regeln, die aus der Auswertung vom 13.08.2026 kommen:
//
//   1. Überspringen ist auf 3 pro Runde begrenzt. Danach wird die Lösung
//      gezeigt und muss geschrieben werden — es zählt weiter als „nicht
//      gewusst", geht aber nicht mehr per Dauerklick.
//   2. Die Wiederholung prüft klassenübergreifend. Vorher war der
//      Klasse-5-Wortschatz unsichtbar, sobald der Umschalter auf Klasse 6 stand.
//
// Wie in wechsel.spec.js wird jeder schreibende Request abgefangen und der
// Lernstand durch einen synthetischen ersetzt.

const SB_KEY = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'config.js'), 'utf8')
  .match(/SB_KEY[^"]*"([A-Za-z0-9_.\-]{40,})"/)[1];

const WORTE = [];
for (let i = 0; i < 12; i++) WORTE.push({ word: 'alpha' + i, clue: 'alt ' + i, type: 'noun' });

// Alle Wörter in Topf 4 → freie Eingabe, das ist der Modus mit dem
// Überspringen-Knopf direkt unter dem Eingabefeld.
function fortschrittTopf4() {
  const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  WORTE.forEach((w) => pots[4].push(Object.assign({ streak: 0, correct: 2, wrong: 0 }, w)));
  return { pots, sentences: [], history: [], days: {}, sessions: [] };
}

// Gelernte Vokabeln (Topf 6) ohne Beleg → lange überfällig.
function fortschrittGelernt() {
  const pots = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (let i = 0; i < 25; i++) pots[6].push({ word: 'alpha' + i, clue: 'alt ' + i, type: 'noun', streak: 0, correct: 3, wrong: 0 });
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

async function openLeiterspiel(page) {
  await login(page, EMMA);
  await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});
  await page.locator('button').filter({ hasText: '🪜' }).first().click();
}

test.describe('Überspringen begrenzen', () => {
  test('nach drei Überspringern muss die Lösung geschrieben werden', async ({ page, request }) => {
    const rid = await runId(request, /Theme 2/);
    await setup(page, rid, { stand: fortschrittTopf4(), letzterLauf: new Date().toISOString() });
    await openLeiterspiel(page);

    await expect(page.locator('text=Leiterspiel — Run wählen')).toBeVisible({ timeout: 15000 });
    await page.locator('button').filter({ hasText: 'Theme 2' }).first().click();
    await page.locator('button:has-text("Lernen starten")').first().click();

    const skip = page.locator('button:has-text("Überspringen / Nicht gewusst")');
    for (let i = 3; i >= 1; i--) {
      await expect(skip).toContainText('noch ' + i, { timeout: 15000 });
      await skip.click();
      await expect(page.locator('text=⏭ Übersprungen')).toBeVisible({ timeout: 10000 });
      await page.locator('button:has-text("→ Weiter")').first().click();
    }

    // Vierter Versuch: kein Klick-Weiter mehr, sondern abschreiben
    const abschreiben = page.locator('button:has-text("Lösung zeigen & abschreiben")');
    await expect(abschreiben).toBeVisible({ timeout: 15000 });
    await abschreiben.click();
    await expect(page.locator('text=Keine Überspringer mehr übrig')).toBeVisible();

    // Falsche Eingabe bringt einen nicht weiter
    await page.locator('input').first().fill('irgendwas');
    await page.locator('button:has-text("✓")').first().click();
    await expect(page.locator('text=Noch nicht gleich')).toBeVisible();

    // Die Lösung abschreiben → zählt als übersprungen
    const loesung = (await page.locator('text=Keine Überspringer mehr übrig')
      .locator('xpath=following-sibling::div[2]').innerText()).trim();
    await page.locator('input').first().fill(loesung);
    await page.locator('button:has-text("✓")').first().click();
    await expect(page.locator('text=⏭ Übersprungen')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Wiederholung klassenübergreifend', () => {
  test('Klasse-5-Vokabeln lösen die Sperre aus, obwohl Klasse 6 gewählt ist', async ({ page, request }) => {
    // „Kapitel 4" ist ein Klasse-5-Run; die App startet in Klasse 6. Vorher war
    // dieser Bestand für die Wiederholung unsichtbar.
    const rid = await runId(request, /^Kapitel 4$/);
    await setup(page, rid, { stand: fortschrittGelernt(), letzterLauf: null });
    await openLeiterspiel(page);

    await expect(page.locator('text=Erst die Wiederholung!')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("🔁 Wiederholung starten")').click();
    await expect(page.locator('text=aus allen Klassen und Sprachen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Lernpool:')).toContainText('25');
  });
});
