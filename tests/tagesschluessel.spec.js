const { test, expect } = require('@playwright/test');

// Rechen-Tests für die Tagesschlüssel. Sie laufen im Browser, weil src/ ESM ist
// und das Projekt sonst CommonJS nutzt — die Module werden direkt vom
// Test-Server geladen, die App selbst bleibt außen vor.
//
// Hintergrund: new Date().toISOString() rechnet nach UTC. Aus lokaler
// Mitternacht wurde in Berlin dadurch immer der Vortag — der heutige Lerntag
// zählte weder in die Streak noch in die Wochenübersicht.
async function util(page) {
  await page.goto('/tests/leer.html');
}

test.describe('Tagesschlüssel', () => {
  test('dayKey liefert das lokale Datum, auch kurz vor Mitternacht', async ({ page }) => {
    await util(page);
    const r = await page.evaluate(async () => {
      const { dayKey } = await import('/src/core/util.js');
      return {
        spaet: dayKey(new Date(2026, 7, 7, 23, 30, 0)),
        frueh: dayKey(new Date(2026, 7, 8, 0, 30, 0)),
      };
    });
    expect(r.spaet).toBe('2026-08-07');
    expect(r.frueh).toBe('2026-08-08');
  });

  // Streak und Tagesziel wohnen jetzt in core/goal.js — dort auch getestet
  // (tests/tagesziel.spec.js). Hier bleibt nur, was am Tagesschlüssel hängt.

  test('Die Lernwoche beginnt am Montag', async ({ page }) => {
    await util(page);
    const r = await page.evaluate(async () => {
      const { getWeekDays, weekdayOf } = await import('/src/core/util.js');
      const tage = getWeekDays();
      return { anzahl: tage.length, erster: weekdayOf(tage[0]), letzter: weekdayOf(tage[6]) };
    });
    expect(r.anzahl).toBe(7);
    expect(r.erster).toBe(1); // Montag
    expect(r.letzter).toBe(0); // Sonntag
  });
});
