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

  test('Streak zählt den heutigen Lerntag mit', async ({ page }) => {
    await util(page);
    const r = await page.evaluate(async () => {
      const { dayKey, calcStreakFromByDay } = await import('/src/core/util.js');
      const { dailyGoalSec } = await import('/src/core/theme.js');
      const heute = dayKey();
      const gestern = dayKey(Date.now() - 86400000);
      const ziel = (k) => dailyGoalSec(k);
      return {
        zwei: calcStreakFromByDay({ [heute]: ziel(heute), [gestern]: ziel(gestern) }),
        eins: calcStreakFromByDay({ [heute]: ziel(heute) }),
        knapp: calcStreakFromByDay({ [heute]: ziel(heute) - 60 }),
      };
    });
    expect(r.zwei).toBe(2);
    expect(r.eins).toBe(1); // vorher 0, weil "heute" auf gestern zeigte
    expect(r.knapp).toBe(0);
  });

  // Das Tagesziel ist am 13.08.2026 von 15 auf 25 Minuten gestiegen (Summe der
  // drei Tagesaufgaben). Für frühere Tage muss der alte Wert gelten, sonst
  // würde die Umstellung die Streak-Historie rückwirkend entwerten.
  test('Tagesziel: 25 Minuten, davor 15', async ({ page }) => {
    await util(page);
    const r = await page.evaluate(async () => {
      const { dailyGoalSec, dailyGoalMin } = await import('/src/core/theme.js');
      return {
        davor: dailyGoalSec('2026-08-12'),
        abDann: dailyGoalSec('2026-08-13'),
        heute: dailyGoalSec(),
        minuten: dailyGoalMin(),
      };
    });
    expect(r.davor).toBe(900);
    expect(r.abDann).toBe(1500);
    expect(r.heute).toBe(1500);
    expect(r.minuten).toBe(25);
  });

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
