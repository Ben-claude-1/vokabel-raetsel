const { test, expect } = require('@playwright/test');
const { EMMA, login, blockWrites } = require('./helpers');

// Tagesaufgaben auf der Startseite: 5 Minuten Grammatik, 10 Minuten Englisch,
// 10 Minuten Spanisch — dazu Fortschrittsbalken und eine Belohnung, die genau
// einmal abgeholt werden kann.
//
// Der Testserver ist schreibgeschützt (tests/dev-server.js), zusätzlich fängt
// blockWrites im Browser ab — es kann nichts in Emmas Lernstand gelangen.

// Tagesstand fälschen. `min` = {grammatik, en, es} in Minuten,
// `richtig` = {grammatik, en, es} richtige Antworten (verkürzen die Zeit).
async function tagesstand(page, min, extra) {
  const m = min || {}, x = extra || {};
  await page.route('**/rest/v1/learn_sessions*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const now = new Date().toISOString();
    const sessions = [];
    const add = (n, row) => { for (let i = 0; i < (n || 0); i++) sessions.push(Object.assign({ active_seconds: 60, started_at: now, correct_count: 0, wrong_count: 0, skipped_count: 0 }, row)); };
    add(m.grammatik, { game: 'grammatik', language: 'en' });
    add(m.en, { game: 'leiterspiel', language: 'en' });
    add(m.es, { game: 'leiterspiel', language: 'es' });
    // Antworten als eigene Sitzung ohne Zeit, damit Minuten und Antworten
    // unabhängig voneinander gesetzt werden können.
    const r = x.richtig || {};
    if (r.grammatik) sessions.push({ game: 'grammatik', language: 'en', active_seconds: 0, started_at: now, correct_count: r.grammatik, wrong_count: 0, skipped_count: 0 });
    if (r.en) sessions.push({ game: 'leiterspiel', language: 'en', active_seconds: 0, started_at: now, correct_count: r.en, wrong_count: 0, skipped_count: 0 });
    if (r.es) sessions.push({ game: 'leiterspiel', language: 'es', active_seconds: 0, started_at: now, correct_count: r.es, wrong_count: 0, skipped_count: 0 });
    // Ein Überspringer zählt in der App als falsche Antwort UND als Skip.
    if (x.falsch || x.uebersprungen) sessions.push({ game: 'leiterspiel', language: 'en', active_seconds: 0, started_at: now,
      correct_count: 0, wrong_count: (x.falsch || 0) + (x.uebersprungen || 0), skipped_count: x.uebersprungen || 0 });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) });
  });
}

async function startseite(page, min, extra) {
  await blockWrites(page);
  await tagesstand(page, min, extra);
  await login(page, EMMA);
  await page.locator('text=Tippe zum Schließen').click({ timeout: 3000 }).catch(() => {});
  await expect(page.locator('text=Deine 3 Aufgaben heute')).toBeVisible({ timeout: 15000 });
}

test.describe('Tagesaufgaben', () => {
  test('drei feste Aufgaben, ohne Lernzeit gibt es nichts abzuholen', async ({ page }) => {
    await startseite(page, {});

    await expect(page.locator('text=0 von 3 geschafft')).toBeVisible();
    await expect(page.locator('text=5 Minuten Grammatik üben')).toBeVisible();
    await expect(page.locator('text=10 Minuten Englisch lernen')).toBeVisible();
    await expect(page.locator('text=10 Minuten Spanisch lernen')).toBeVisible();
    await expect(page.locator('text=0 / 5 Min')).toBeVisible();
    await expect(page.locator('button:has-text("Punkte abholen")')).toHaveCount(0);
  });

  test('Grammatikminuten haken nur die Grammatikaufgabe ab', async ({ page }) => {
    // 6 Minuten Grammatik: Ziel 5 erreicht. Die Zeit darf nicht zusätzlich in
    // die Englisch-Aufgabe laufen, obwohl Grammatik englisch ist.
    await startseite(page, { grammatik: 6 });

    await expect(page.locator('text=1 von 3 geschafft')).toBeVisible();
    await expect(page.locator('text=0 / 10 Min')).toHaveCount(2);
    const abholen = page.locator('button:has-text("Punkte abholen")');
    await expect(abholen).toBeVisible();
    await expect(abholen).toContainText('60');
  });

  test('Sprachminuten zählen getrennt und der Bonus kommt erst am Ende', async ({ page }) => {
    await startseite(page, { grammatik: 5, en: 12, es: 4 });

    await expect(page.locator('text=2 von 3 geschafft')).toBeVisible();
    await expect(page.locator('text=4 / 10 Min')).toBeVisible();      // Spanisch offen
    await expect(page.locator('text=Alle drei geschafft')).toHaveCount(0);
    await expect(page.locator('button:has-text("Punkte abholen")')).toContainText('160'); // 60 + 100
  });

  test('alles geschafft: Bonus wird angeboten', async ({ page }) => {
    await startseite(page, { grammatik: 5, en: 10, es: 10 });

    await expect(page.locator('text=alles erledigt')).toBeVisible();
    await expect(page.locator('text=Alle drei geschafft: +150 Bonus')).toBeVisible();
    await expect(page.locator('button:has-text("Punkte abholen")')).toContainText('410'); // 60+100+100+150
  });

  test('richtige Antworten verkürzen die Zeit', async ({ page }) => {
    // 20 richtige Antworten auf Englisch → Ziel 8 statt 10 Minuten, mit 8
    // Minuten Lernzeit ist die Aufgabe damit erledigt.
    await startseite(page, { en: 8 }, { richtig: { en: 20 } });

    await expect(page.locator('text=8 Minuten Englisch lernen')).toBeVisible();
    await expect(page.locator('text=2 Min gespart')).toBeVisible();
    await expect(page.locator('text=1 von 3 geschafft')).toBeVisible();
  });

  test('nur Zeit ohne Antworten reicht für den Streak nicht', async ({ page }) => {
    await startseite(page, { grammatik: 5, en: 10, es: 10 });

    await expect(page.locator('text=alles erledigt')).toBeVisible();
    await expect(page.locator('text=für den Streak fehlen noch ein paar beantwortete Vokabeln')).toBeVisible();
  });

  test('zu viel übersprungen: der Tag zählt nicht', async ({ page }) => {
    await startseite(page, { grammatik: 5, en: 10, es: 10 }, { falsch: 5, uebersprungen: 25 });

    await expect(page.locator('text=Viel übersprungen heute')).toBeVisible();
  });

  test('die Spanisch-Aufgabe schaltet die Sprache um', async ({ page }) => {
    await startseite(page, {});

    await page.locator('text=10 Minuten Spanisch lernen').click();
    await expect(page.locator('text=🇪🇸 Spanisch').first()).toBeVisible({ timeout: 10000 });
  });
});
