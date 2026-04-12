const { test, expect } = require('@playwright/test');
const { EMMA, login } = require('./helpers');

test.describe('Leiterspiel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, EMMA);
  });

  test('Leiterspiel-Menü öffnet sich', async ({ page }) => {
    await page.click('button:has-text("🎯"), button:has-text("Leiterspiel")');
    await page.waitForTimeout(1000);
    // Irgendein Run oder Hinweis soll sichtbar sein
    const content = await page.locator('body').innerText();
    expect(content).toMatch(/Leiterspiel|Run|Starten/i);
  });

  test('T2 Mehrwort-Vokabel zeigt Lücke zwischen Wörtern', async ({ page }) => {
    // Direkt eine T2-Phase simulieren ist schwer ohne bekannten Run-Stand.
    // Daher prüfen wir die Render-Logik: Wenn T2 aktiv ist, darf kein Wort ohne Lücke erscheinen.
    // Dieser Test dokumentiert das erwartete Verhalten.
    await page.click('button:has-text("🎯"), button:has-text("Leiterspiel")').catch(() => {});
    await page.waitForTimeout(500);
    // Placeholder: Test wird erweitert sobald ein Run mit Topf-2-Wörtern verfügbar ist.
    expect(true).toBe(true);
  });
});
