const { test, expect } = require('@playwright/test');
const { ADMIN, EMMA, login, blockWrites } = require('./helpers');

test.describe('Login', () => {
  test('Admin-Login funktioniert', async ({ page }) => {
    await blockWrites(page);
    await login(page, ADMIN);
    // Admin hat zusätzliche Tabs sichtbar
    await expect(page.locator('button:has-text("👥 User")')).toBeVisible();
  });

  test('Spieler-Login funktioniert (Emma)', async ({ page }) => {
    await blockWrites(page);
    await login(page, EMMA);
    await expect(page.locator('button:has-text("Abmelden")')).toBeVisible();
  });

  test('Falsches Passwort zeigt Fehlermeldung', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('input[placeholder="Dein Name"]', { timeout: 25000 });
    await page.fill('input[placeholder="Dein Name"]', 'admin');
    await page.fill('input[placeholder="Passwort"]', 'falsch');
    await page.click('button:has-text("→ Anmelden")');
    await expect(page.locator('text=/falsch|Fehler|ungültig|nicht gefunden/i')).toBeVisible({ timeout: 8000 });
  });
});
