const { test, expect } = require('@playwright/test');
const { EMMA, login } = require('./helpers');

// Diese Tests spielen echte Leiterspiel-Runden. Damit dabei nichts in der
// Datenbank landet, wird jeder schreibende Request abgefangen — die Oberfläche
// rechnet trotzdem ganz normal weiter. Geprüft wird das im Test selbst: am Ende
// darf kein POST/PATCH/DELETE durchgegangen sein.
async function readOnly(page, protokoll) {
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      protokoll.push(req.method() + ' ' + req.url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // Pflicht-Wiederholung als "heute erledigt" ausgeben, sonst ist das
    // Leiterspiel gesperrt und wir kommen gar nicht bis zu den Vokabeln.
    if (req.url().includes('repeat_runs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ created_at: new Date().toISOString() }]),
      });
    }
    return route.continue();
  });
}

async function totalScore(page) {
  const txt = await page.locator('text=/^\\d+ Pkt$/').first().innerText();
  return Number(txt.match(/(\d+) Pkt/)[1]);
}

// "Theme 2" ist ein unangetasteter Klassen-Run: alle Vokabeln liegen in Topf 1,
// es kommt also sicher die Multiple-Choice-Frage und nicht Topf 2 oder 3.
async function openRun(page) {
  await login(page, EMMA);
  await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});
  await page.locator('button:has-text("Leiterspiel")').first().click();
  await page.locator('button').filter({ hasText: /Theme 2/ }).first().click();
  await page.locator('button:has-text("▶ Lernen starten")').click();
  await page.waitForSelector('text=Topf 1 — Welche Übersetzung ist richtig?', { timeout: 15000 });
}

// Es zählt nur eine richtige Antwort — also so lange raten, bis eine sitzt.
// Rückgabe: {gezeigt, vorher, nachher} der ersten Runde mit Punkten.
async function ersteRichtigeAntwort(page) {
  for (let runde = 0; runde < 20; runde++) {
    const vorher = await totalScore(page);
    const optionen = page.locator('button:above(:text("Überspringen / Nicht gewusst"))');
    await optionen.nth(runde % 4).click();
    await page.waitForSelector('button:has-text("→ Weiter")', { timeout: 10000 });

    const plus = page.locator('text=/^\\+\\d+ Pkt$/');
    if (await plus.count()) {
      const gezeigt = Number((await plus.first().innerText()).match(/\+(\d+)/)[1]);
      const nachher = await totalScore(page);
      return { gezeigt, vorher, nachher };
    }
    await page.locator('button:has-text("→ Weiter")').click();
    await page.waitForTimeout(300);
  }
  return null;
}

test.describe('Punkte', () => {
  // Der eigentliche Fehler: die Spiele buchten die Punkte zweimal — einmal über
  // onUpdateScore, einmal noch mal per setPlayer. Angezeigt wurde die einfache,
  // addiert die doppelte Zahl.
  test('Gutschrift entspricht der angezeigten Punktzahl', async ({ page }) => {
    const schreibzugriffe = [];
    await readOnly(page, schreibzugriffe);
    await openRun(page);

    const r = await ersteRichtigeAntwort(page);
    expect(r, 'in 20 Runden keine richtige Antwort getroffen').not.toBeNull();
    expect(r.nachher - r.vorher).toBe(r.gezeigt);
  });

  test('Topf 1 gibt 10 Punkte', async ({ page }) => {
    const schreibzugriffe = [];
    await readOnly(page, schreibzugriffe);
    await openRun(page);

    const r = await ersteRichtigeAntwort(page);
    expect(r).not.toBeNull();
    expect(r.gezeigt).toBe(10);

    // Sicherheitsnetz: der Test darf die echten Daten nicht verändert haben.
    expect(schreibzugriffe.length, 'Schreibzugriffe wurden abgefangen').toBeGreaterThan(0);
  });
});
