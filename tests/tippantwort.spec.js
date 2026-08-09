const { test, expect } = require('@playwright/test');
const { EMMA, login } = require('./helpers');

// In den Töpfen 3 bis 5 tippt man die Vokabel selbst ein. Der ✓-Knopf war
// direkt mit submitAnswer verdrahtet — React reicht dabei das Klick-Event als
// erstes Argument durch, und das ist der Parameter `skipped`. Jede getippte
// Antwort landete dadurch als "Nicht gewusst": Eingabe verworfen, als falsch
// gewertet, Wort einen Topf zurück. Mit der Enter-Taste ging es, am Handy nicht.
async function readOnly(page) {
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
    return route.continue();
  });
}

// "Theme 1" ist der Run mit Vokabeln in allen Töpfen — nur dort kommen
// überhaupt Tipp-Fragen vor.
async function tippfrageSuchen(page) {
  await login(page, EMMA);
  await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});
  await page.locator('button:has-text("Leiterspiel")').first().click();
  await page.locator('button').filter({ hasText: /Theme 1/ }).first().click();
  await page.locator('button:has-text("▶ Lernen starten")').click();

  const eingabe = page.locator('input[placeholder^="Englisch"], input[placeholder^="Deutsch"]');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    if (await eingabe.count()) return true;
    const skip = page.locator('button:has-text("Überspringen")').first();
    if (!(await skip.count())) return false;
    await skip.click();
    await page.locator('button:has-text("→ Weiter")').click({ timeout: 8000 }).catch(() => {});
  }
  return false;
}

test.describe('Getippte Antwort', () => {
  test('Der ✓-Knopf wertet die Eingabe aus statt zu überspringen', async ({ page }) => {
    await readOnly(page);
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
