const { test, expect } = require('@playwright/test');

// Die Tagesziel-Regel aus src/core/goal.js — reine Rechen-Tests, sie laufen im
// Browser, weil src/ ESM ist und das Projekt sonst CommonJS nutzt.
//
//   Zeit      5 Min Grammatik, 10 Min Englisch, 10 Min Spanisch
//   Belohnung gewichtet nach Schwierigkeit — 40 Gutschriftpunkte sind eine
//             Minute, höchstens bis auf die Hälfte
//   Ehrlichkeit mindestens 20 Antworten, höchstens die Hälfte davon
//             „nicht gewusst"
async function goal(page, fn) {
  await page.goto('/tests/leer.html');
  return page.evaluate(async (src) => {
    const g = await import('/src/core/goal.js');
    return new Function('g', 'return (' + src + ')(g)')(g);
  }, fn.toString());
}

// Eine Sitzung, wie sie in learn_sessions steht.
const S = (o) => Object.assign({ started_at: new Date().toISOString(), active_seconds: 0,
  correct_count: 0, wrong_count: 0, skipped_count: 0, credit_points: 0 }, o);

test.describe('Tagesziel', () => {
  test('ohne Belohnung gelten 5 / 10 / 10 Minuten', async ({ page }) => {
    const r = await goal(page, (g) => g.dayGoalState({ sec: 0, secBy: {}, corBy: {}, ans: 0, skip: 0 })
      .areas.map((a) => a.key + ':' + a.goal).join(' '));
    expect(r).toBe('grammatik:5 englisch:10 spanisch:10');
  });

  test('Gutschrift: 40 Punkte sind eine Minute, höchstens bis zur Hälfte', async ({ page }) => {
    const r = await goal(page, (g) => ({
      vierzig: g.areaGoalMin({ min: 10 }, 40),
      hundertzwanzig: g.areaGoalMin({ min: 10 }, 120),
      viele: g.areaGoalMin({ min: 10 }, 2000),
      grammatikViele: g.areaGoalMin({ min: 5 }, 2000),
      knappDrunter: g.areaGoalMin({ min: 10 }, 39),
    }));
    expect(r).toEqual({ vierzig: 9, hundertzwanzig: 7, viele: 5, grammatikViele: 3, knappDrunter: 10 });
  });

  test('Multiple Choice zählt weniger als freies Abrufen', async ({ page }) => {
    // Eine Minute Gutschrift kostet 40 Antworten in Topf 1, aber nur 10 in
    // Topf 3 und 5 in der Wiederholung.
    await page.goto('/tests/leer.html');
    const r = await page.evaluate(async () => {
      const { CREDIT, potCredit } = await import('/src/core/leitner.js');
      const g = await import('/src/core/goal.js');
      const proMinute = (c) => Math.ceil(g.CREDIT_PER_MIN / c);
      return {
        topf1: proMinute(potCredit(1)), topf2: proMinute(potCredit(2)),
        topf3: proMinute(potCredit(3)), topf5: proMinute(potCredit(5)),
        wiederholung: proMinute(CREDIT.review0),
      };
    });
    expect(r).toEqual({ topf1: 40, topf2: 20, topf3: 10, topf5: 7, wiederholung: 5 });
  });

  test('Belohnung gilt nur im eigenen Bereich', async ({ page }) => {
    // 80 Gutschriftpunkte auf Englisch (= 16 Antworten in Topf 4) verkürzen
    // Englisch um 2 Minuten, Spanisch bleibt bei 10.
    const r = await goal(page, (g) => {
      const st = g.dayGoalState({ sec: 480, secBy: { englisch: 480 }, creBy: { englisch: 80 }, ans: 25, skip: 0 });
      const en = st.areas.find((a) => a.key === 'englisch');
      const es = st.areas.find((a) => a.key === 'spanisch');
      return { enZiel: en.goal, enHat: en.have, enFertig: en.done, esZiel: es.goal };
    });
    expect(r).toEqual({ enZiel: 8, enHat: 8, enFertig: true, esZiel: 10 });
  });

  test('Zeit allein reicht nicht: zu wenig Antworten, zu viel übersprungen', async ({ page }) => {
    const r = await goal(page, (g) => {
      const voll = { grammatik: 300, englisch: 600, spanisch: 600 };
      const zeitOk = (extra) => g.dayGoalState(Object.assign({ sec: 1500, secBy: voll, corBy: {} }, extra));
      return {
        wenigAntworten: zeitOk({ ans: 8, skip: 0 }).erfuellt,
        vielUebersprungen: zeitOk({ ans: 40, skip: 30 }).erfuellt,
        knappOk: zeitOk({ ans: 40, skip: 20 }).erfuellt,
        // falsche Antworten schaden nie — nur nicht versuchen
        vieleFalsche: zeitOk({ ans: 40, skip: 0 }).erfuellt,
      };
    });
    expect(r).toEqual({ wenigAntworten: false, vielUebersprungen: false, knappOk: true, vieleFalsche: true });
  });

  test('Sitzungen werden je Bereich verbucht — Grammatik nicht als Englisch', async ({ page }) => {
    const sessions = [
      S({ game: 'grammatik', language: 'en', active_seconds: 300, correct_count: 5, credit_points: 20 }),
      // 12 richtige in Topf 4 = 60 Punkte → 1 Minute Gutschrift
      S({ game: 'leiterspiel', language: 'en', active_seconds: 600, correct_count: 12, wrong_count: 3, credit_points: 60 }),
      S({ game: 'leiterspiel', language: 'es', active_seconds: 540, correct_count: 4, wrong_count: 2, skipped_count: 2, credit_points: 4 }),
    ];
    await page.goto('/tests/leer.html');
    const r = await page.evaluate(async (rows) => {
      const g = await import('/src/core/goal.js');
      const { dayKey } = await import('/src/core/util.js');
      const st = g.buildDayStats(rows)[dayKey()];
      const state = g.dayGoalState(st);
      return {
        sec: st.secBy, cor: st.corBy, ans: st.ans, skip: st.skip,
        ziele: state.areas.map((a) => a.key + ':' + a.have + '/' + a.goal).join(' '),
      };
    }, sessions);
    expect(r.sec).toEqual({ grammatik: 300, englisch: 600, spanisch: 540 });
    expect(r.cor).toEqual({ grammatik: 5, englisch: 12, spanisch: 4 });
    expect(r.ans).toBe(26);
    expect(r.skip).toBe(2);
    // Englisch: 60 Punkte → 1 Minute gespart → 10 von 9 Min geschafft
    expect(r.ziele).toBe('grammatik:5/5 englisch:10/9 spanisch:9/10');
  });

  test('Streak: alter Tag nach alter Regel, neuer Tag nach der neuen', async ({ page }) => {
    const r = await goal(page, (g) => {
      const voll = { sec: 1500, secBy: { grammatik: 300, englisch: 600, spanisch: 600 }, corBy: {}, ans: 30, skip: 0 };
      return {
        altGenug: g.dayCounts('2026-08-01', { sec: 900, secBy: {}, corBy: {}, ans: 0, skip: 0 }),
        altZuWenig: g.dayCounts('2026-08-01', { sec: 800, secBy: {}, corBy: {}, ans: 0, skip: 0 }),
        neuVoll: g.dayCounts('2026-08-20', voll),
        neuNurZeit: g.dayCounts('2026-08-20', { sec: 1500, secBy: { grammatik: 300, englisch: 600 }, corBy: {}, ans: 30, skip: 0 }),
      };
    });
    expect(r).toEqual({ altGenug: true, altZuWenig: false, neuVoll: true, neuNurZeit: false });
  });

  test('Streak zählt zusammenhängende Tage bis heute', async ({ page }) => {
    await page.goto('/tests/leer.html');
    const r = await page.evaluate(async () => {
      const g = await import('/src/core/goal.js');
      const { dayKey } = await import('/src/core/util.js');
      const voll = { sec: 1500, secBy: { grammatik: 300, englisch: 600, spanisch: 600 }, corBy: {}, ans: 30, skip: 0 };
      const tag = (n) => dayKey(Date.now() - n * 86400000);
      return {
        zwei: g.calcStreakFromStats({ [tag(0)]: voll, [tag(1)]: voll }),
        heuteOffen: g.calcStreakFromStats({ [tag(1)]: voll }),   // gestern zählt weiter
        luecke: g.calcStreakFromStats({ [tag(0)]: voll, [tag(2)]: voll }),
      };
    });
    expect(r.zwei).toBe(2);
    expect(r.heuteOffen).toBe(1);
    expect(r.luecke).toBe(1);
  });
});

// Im Wiederholungslauf wird die Sprache nicht gewechselt: erst Englisch,
// danach Spanisch. Geprüft an der Sortierregel selbst.
test.describe('Wiederholung: Reihenfolge', () => {
  test('erst Englisch, dann Spanisch', async ({ page }) => {
    await page.goto('/tests/leer.html');
    const r = await page.evaluate(async () => {
      const { langRank } = await import('/src/core/scope.js');
      const items = [{ lang: 'es' }, { lang: 'en' }, { lang: 'es' }, { lang: 'en' }, { lang: 'fr' }];
      return items.slice().sort((a, b) => langRank(a.lang) - langRank(b.lang)).map((x) => x.lang).join(',');
    });
    expect(r).toBe('en,en,es,es,fr');
  });
});
