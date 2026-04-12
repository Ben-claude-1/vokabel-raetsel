const { test, expect } = require('@playwright/test');
const { ADMIN, login } = require('./helpers');

test.describe('RunEditor', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
  });

  test('LS-Tab öffnet ohne Crash', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.click('button:has-text("🎯 LS")');
    await page.waitForTimeout(1000);

    const critical = errors.filter(e => !e.includes('kwift.CHROME'));
    expect(critical).toHaveLength(0);
  });

  test('RunEditor öffnet ohne getRunPot Crash', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.click('button:has-text("🎯 LS")');
    await page.waitForTimeout(500);

    // Runs-Tab (erster Sub-Tab)
    const runsTab = page.locator('button:has-text("Runs"), button:has-text("🏃")').first();
    if (await runsTab.isVisible()) await runsTab.click();
    await page.waitForTimeout(500);

    // Ersten Bearbeiten-Button klicken
    const editBtn = page.locator('button:has-text("✏️"), button:has-text("Bearbeiten")').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(1000);
      // RunEditor soll geöffnet sein ohne ReferenceError
      const critical = errors.filter(e => e.includes('getRunPot') || e.includes('ReferenceError'));
      expect(critical).toHaveLength(0);
    }
  });
});
