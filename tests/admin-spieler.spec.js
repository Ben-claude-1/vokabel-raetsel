const { test, expect } = require('@playwright/test');
const { ADMIN, login, blockWrites } = require('./helpers');

// Admin-Spieleransicht: ein Spieler, Lernzeit pro Tag, Leiterspiele neueste oben,
// 100-%-Runs unter "Gelernt", keine Statistik anderer Spieler.
test.describe('Admin · Spieler-Ansicht', () => {
  test.beforeEach(async ({ page }) => {
    await blockWrites(page);
    await login(page, ADMIN);
  });

  test('Emma: Tage, Antworten, Leiterspiele, Gelernt', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    const adminBtn = page.locator('button', { hasText: 'Admin' }).first();
    if (await adminBtn.isVisible()) await adminBtn.click();
    await page.click('button:has-text("👤 Spieler")');
    await page.click('button:text-is("Emma")');
    await expect(page.locator('text=Lernzeit pro Tag · Emma')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=🪜 Leiterspiele ·')).toBeVisible();
    await expect(page.locator('text=✅ Gelernt ·')).toBeVisible();

    // Alte Gesamtübersichten über alle Spieler sind weg
    await expect(page.locator('text=Lernzeit diese Woche')).toHaveCount(0);

    // Einen Lerntag öffnen (Gestern hatte Emma Leiterspiel-Antworten)
    await page.locator('text=Gestern').first().click();
    await expect(page.locator('text=Spanisch HA').first()).toBeVisible();
    // Block aufklappen: einzelne Antworten mit Topf-Angabe und Töpfe-Button
    await page.locator('text=Spanisch HA').first().click();
    await expect(page.locator('text=Aktueller Stand der Töpfe').first()).toBeVisible();
    await expect(page.locator('text=la papelera').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/admin-spieler.png', fullPage: true });

    // Neuestes Leiterspiel steht in der Liste oben
    await expect(page.locator('text=⏳ Noch nicht begonnen ·')).toBeVisible();
    // Zusammengeführter Run zählt die neuen Wörter schon mit (41 statt 22)
    await expect(page.locator('text=/\\/41 gelernt/').first()).toBeVisible();
    await page.locator('text=Spanisch HA: Unidad').last().click();
    // Standard: alle Vokabeln in Buch-Reihenfolge mit Topf
    await expect(page.locator('button:has-text("📖 Alle Vokabeln")')).toBeVisible();
    await expect(page.locator('text=la hamaca').first()).toBeVisible();
    await page.click('button:has-text("🪜 Nach Töpfen")');
    await expect(page.locator('text=NEU').first()).toBeVisible();
    // Auch nicht begonnene Leiterspiele zeigen ihre Vokabeln
    await page.locator('text=⏳ Noch nicht begonnen ·').locator('..').locator('button:has-text("anzeigen")').click();
    await page.locator('text=/nicht begonnen · \\d+ Vok/').first().click();
    await expect(page.locator('text=/^1$/').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/admin-spieler-run.png', fullPage: true });

    // Spieler wechseln lädt nur dessen Daten
    await page.click('button:text-is("Lena")');
    await expect(page.locator('text=Lernzeit pro Tag · Lena')).toBeVisible({ timeout: 15000 });

    expect(errors.filter(e => !e.includes('kwift'))).toEqual([]);
  });
});
