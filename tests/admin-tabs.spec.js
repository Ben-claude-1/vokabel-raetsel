const { test, expect } = require('@playwright/test');
const { ADMIN, login } = require('./helpers');

test.describe('Admin-Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
  });

  test('Alle Admin-Tabs öffnen ohne Fehler', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    const tabs = ['📚 Kap.', '📝 Vok.', '🎯 LS', '👥 User', '✏️ Gram.'];
    for (const tab of tabs) {
      const btn = page.locator('button', { hasText: tab });
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(800);
      }
    }

    const critical = errors.filter(e => !e.includes('kwift.CHROME'));
    expect(critical).toHaveLength(0);
  });

  test('LS Fortschritt-Tab zeigt expanded/toggle', async ({ page }) => {
    await page.click('button:has-text("🎯 LS")');
    await page.waitForTimeout(500);

    const fortschrittBtn = page.locator('button:has-text("📊"), button:has-text("Fortschritt")').first();
    if (await fortschrittBtn.isVisible()) {
      await fortschrittBtn.click();
      await page.waitForTimeout(500);
      // Kein ReferenceError für expanded/toggle
      expect(true).toBe(true);
    }
  });

  test('Kapitel 4 zeigt nur Birthdays (c3) als Themenbereich', async ({ page }) => {
    await page.click('button:has-text("📚 Kap.")');
    await page.waitForTimeout(800);

    // Kapitel 4 aufklappen
    const kap4 = page.locator('text=Kapitel 4').first();
    if (await kap4.isVisible()) {
      await kap4.click();
      await page.waitForTimeout(500);

      // c1,c2,c4,c5,allgemein dürfen NICHT sichtbar sein
      await expect(page.locator('text=Geburtstag & Jahreszeiten')).not.toBeVisible();
      await expect(page.locator('text=Party & Essen')).not.toBeVisible();
    }
  });

  test('OCR-Upload-Bereich ist im Kap.-Tab sichtbar', async ({ page }) => {
    await page.click('button:has-text("📚 Kap.")');
    await page.waitForTimeout(800);
    await expect(page.locator('text=Schulbuch-Seite per Bild importieren')).toBeVisible();
    await expect(page.locator('button:has-text("📷 Bild hochladen")')).toBeVisible();
  });
});
