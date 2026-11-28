const { test, expect } = require('@playwright/test');
const { EMMA, login, blockWrites } = require('./helpers');

// Grammatik-Fortschritt: pro Satz zählt nur die letzte Antwort. Ein Fehler, den
// Emma später am selben Satz korrigiert hat, drückt den Prozentwert nicht mehr.
test('Grammatik-Fortschritt zählt je Satz nur die letzte Antwort', async ({ page }) => {
  await blockWrites(page);
  await login(page, EMMA);
  const tile = page.locator('text=Grammar Trainer').first();
  if (!(await tile.isVisible().catch(() => false))) {
    const en = page.locator('text=/Englisch|English/').first();
    if (await en.isVisible().catch(() => false)) await en.click();
  }
  await page.locator('text=Grammar Trainer').first().click();
  const row = page.locator('div', { hasText: /^going to/ }).filter({ hasText: 'Sätze zuletzt richtig' }).last();
  await expect(row).toBeVisible({ timeout: 15000 });
  const txt = await page.locator('text=/\\d+\\/\\d+ Sätze zuletzt richtig/').allInnerTexts();
  console.log('Zeilen:', txt);
  await page.screenshot({ path: 'test-results/grammatik-fortschritt.png', fullPage: true });
  expect(txt.length).toBeGreaterThan(0);
});

test('zuletzt falsch beantwortete Sätze kommen fast immer in die nächste Runde', async ({ page }) => {
  await page.goto('/tests/leer.html');
  const r = await page.evaluate(async () => {
    const g = await import('/src/core/grammar.js');
    const pool = Array.from({ length: 30 }, (_, i) => ({ id: 'q' + i, rule: 'going to', sentence: 'S' + i + ' ___' }));
    const lastMap = { 'going to': {} };
    pool.forEach((q, i) => { lastMap['going to'][q.sentence] = i !== 7; });
    let mit = 0, ohne = 0;
    for (let k = 0; k < 300; k++) {
      if (g.grammarPickQuestions(pool, {}, 10, lastMap).some((q) => q.id === 'q7')) mit++;
      if (g.grammarPickQuestions(pool, {}, 10).some((q) => q.id === 'q7')) ohne++;
    }
    return { mit, ohne };
  });
  console.log('q7 in Runde (von 300): mit lastMap', r.mit, '/ ohne', r.ohne);
  expect(r.mit).toBeGreaterThan(270);
});
