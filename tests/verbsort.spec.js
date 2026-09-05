// Muster-Detektiv (Zuordnungsspiel unregelmäßige Verben, src/ui/verbsort.jsx).
//
// Läuft schreibgeschützt gegen die echte Datenbank (blockWrites) — das Spiel
// speichert seinen Fortschritt ohnehin nur in localStorage.
//
// Navigation direkt über die Home-Kachel, nicht über den "Spiele"-Tab: dessen
// Textsuche ist mehrdeutig, weil "Quiz … spielen" und "… Spielen" (Rangliste)
// beide die Teilzeichenkette "Spiele" enthalten.
const { test, expect } = require('@playwright/test');
const { EMMA, login, blockWrites } = require('./helpers');

const MUSTER = ['Chicken', 'Hamburger', 'Echo', 'Miau', 'Sonstige'];

async function openSpiel(page) {
  await page.locator('button:has-text("Muster-Detektiv")').first().click();
  // Nicht auf die Kopfzeile warten — die steht sofort da (screenTitles), während
  // der eigentliche Spielinhalt per React.lazy nachlädt und kurz "Lade…" zeigt.
  await page.waitForSelector('text=Wie viele Verben?', { timeout: 15000 });
}

test.describe('Muster-Detektiv', () => {
  test.beforeEach(async ({ page }) => {
    await blockWrites(page);
    await login(page, EMMA);
  });

  test('Startbildschirm zeigt Verben-Bestand und Muster-Übersicht', async ({ page }) => {
    await openSpiel(page);

    const text = await page.locator('body').innerText();
    // "0 von 83 Verben sitzen" — die Zahl hinter "von" ist der echte Bestand.
    // \s+ statt eines festen Leerzeichens: innerText bricht die Zeile bei
    // ausreichend Fließtext um und liefert dann ein "\n" statt eines Space.
    const m = text.match(/von\s+(\d+)\s+Verben sitzen/);
    expect(m, 'Fortschrittszeile fehlt').toBeTruthy();
    expect(Number(m[1])).toBeGreaterThan(20);

    await page.locator('button:has-text("Muster-Übersicht anzeigen")').click();
    for (const label of MUSTER) {
      await expect(page.locator('text=' + label).first()).toBeVisible();
    }
  });

  test('Runde: Verb + Bedeutung, fünf Gruppen, Auflösung mit allen Formen', async ({ page }) => {
    await openSpiel(page);
    await page.locator('button:has-text("10 Verben")').click();

    await expect(page.locator('text=In welche Gruppe gehört dieses Verb?')).toBeVisible();
    await expect(page.locator('text=/1\\/10/')).toBeVisible();
    // Alle fünf Gruppen stehen zur Auswahl
    for (const label of MUSTER) {
      await expect(page.locator('button:has-text("' + label + '")').first()).toBeVisible();
    }

    await page.locator('button:has-text("Chicken")').first().click();
    // Auflösung: richtig oder falsch, in jedem Fall das echte Muster + Weiter
    const feedback = await page.locator('body').innerText();
    expect(feedback).toMatch(/✓ Richtig!|Das ist ein .*-Verb/);
    await expect(page.locator('button:has-text("Weiter")')).toBeVisible();

    await page.locator('button:has-text("Weiter")').click();
    await expect(page.locator('text=/2\\/10/')).toBeVisible();
  });

  test('Runde bis zur Auswertung, Fortschritt wird lokal gemerkt', async ({ page }) => {
    await openSpiel(page);
    await page.locator('button:has-text("10 Verben")').click();

    for (let i = 0; i < 10; i++) {
      // reihum eine andere Gruppe wählen, damit auch Treffer dabei sind
      await page.locator('button:has-text("' + MUSTER[i % MUSTER.length] + '")').first().click();
      await page.locator('button:has-text("Weiter"), button:has-text("Auswertung")').first().click();
    }

    await expect(page.locator('text=/von 10 richtig einsortiert/')).toBeVisible();

    const stats = await page.evaluate(() => {
      const k = Object.keys(localStorage).find(x => x.startsWith('lernapp_verbsort_'));
      return k ? JSON.parse(localStorage.getItem(k)) : null;
    });
    expect(stats, 'kein Fortschritt in localStorage').toBeTruthy();
    expect(Object.keys(stats.words).length).toBe(10);

    await page.locator('button:has-text("Noch eine Runde")').click();
    await expect(page.locator('text=/von\\s+\\d+\\s+Verben sitzen/')).toBeVisible();
  });
});
