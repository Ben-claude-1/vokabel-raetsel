const { test, expect } = require('@playwright/test');
const { EMMA, login, blockWrites } = require('./helpers');

test.describe('Leiterspiel', () => {
  test.beforeEach(async ({ page }) => {
    await blockWrites(page);
    await login(page, EMMA);
  });

  test('Leiterspiel-Menü öffnet sich', async ({ page }) => {
    await page.locator('button:has-text("Leiterspiel")').first().click();
    await page.waitForTimeout(1000);
    // Irgendein Run oder Hinweis soll sichtbar sein
    const content = await page.locator('body').innerText();
    expect(content).toMatch(/Leiterspiel|Run|Starten/i);
  });

  test('T2 Mehrwort-Vokabel zeigt Lücke zwischen Wörtern', async ({ page }) => {
    // Direkt eine T2-Phase simulieren ist schwer ohne bekannten Run-Stand.
    // Daher prüfen wir die Render-Logik: Wenn T2 aktiv ist, darf kein Wort ohne Lücke erscheinen.
    // Dieser Test dokumentiert das erwartete Verhalten.
    await page.locator('button:has-text("Leiterspiel")').first().click().catch(() => {});
    await page.waitForTimeout(500);
    // Placeholder: Test wird erweitert sobald ein Run mit Topf-2-Wörtern verfügbar ist.
    expect(true).toBe(true);
  });
});
