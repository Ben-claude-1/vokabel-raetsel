const { test, expect } = require('@playwright/test');
const { EMMA, ADMIN, login, blockWrites } = require('./helpers');

// Der 🔄-Knopf im Kopf lädt Spieler und Lernfortschritt neu, ohne Abmelden.
for (const user of [EMMA, ADMIN]) {
  test('Aktualisieren lädt Fortschritt neu ohne Abmelden (' + user.name + ')', async ({ page }) => {
    const protokoll = await blockWrites(page);
    await login(page, user);
    await page.waitForTimeout(1500);

    const nachher = [];
    page.on('request', (req) => {
      if (req.method() === 'GET' && req.url().includes('/rest/v1/')) nachher.push(req.url());
    });
    await page.locator('button[aria-label="Aktualisieren"]').click();
    await page.waitForTimeout(2500);

    // weiterhin angemeldet, kein Login-Bild
    await expect(page.locator('button:has-text("Abmelden")')).toBeVisible();
    await expect(page.locator('input[placeholder="Passwort"]')).toHaveCount(0);
    // Spieler und Lernfortschritt wurden frisch geholt
    expect(nachher.some((u) => /\/players\?id=eq\./.test(u))).toBe(true);
    expect(nachher.some((u) => u.includes('/ls_progress'))).toBe(true);
    // nur der Online-Status (presence) darf schreiben wollen — abgefangen
    expect(protokoll.filter((x) => !x.includes('presence_'))).toEqual([]);
  });
}
