const { test, expect } = require('@playwright/test');

// Grammatik-Sätze müssen eindeutig und korrekt sein. validateGrammarQuestion ist
// die feste Prüfung, die Spiel/Klassenarbeit (loadGrammarPool) und die Admin-
// Generierung verwenden. Dieser Test hält sie an bekannten Fehlerfällen fest und
// verlangt, dass jeder Satz in den Live-Pools sie besteht.

test('Satzprüfung erkennt bekannte Fehlerfälle', async ({ page }) => {
  await page.goto('/tests/leer.html');
  const r = await page.evaluate(async () => {
    const g = await import('/src/core/grammar.js');
    const v = (q, t) => g.validateGrammarQuestion(q, t);
    return {
      // die Fälle, die Emma tatsächlich begegnet sind bzw. in den Pools steckten
      rainRain: v({ sentence: 'Look at the clouds! It ___ rain later. (to rain)', answer: 'is going to rain', distractors: ['are going to rain', 'is going rain', 'is going to raining'] }, 'gf'),
      gfOhneZukunft: v({ sentence: 'He ___ a letter to his friend. (to write)', answer: 'is going to write', distractors: ['are going to write', 'is going write', 'is going to writing'] }, 'gf'),
      gfProgAblenker: v({ sentence: 'She ___ football tomorrow. (to play)', answer: 'is going to play', distractors: ['is playing', 'are going to play', 'is going play'] }, 'gf'),
      spVergangenheit: v({ sentence: 'She ___ football every day. (to play)', answer: 'plays', distractors: ['play', 'played', 'playing'] }, 'sp'),
      spOhneSignal: v({ sentence: 'We ___ in a small house. (to live)', answer: 'live', distractors: ['lives', 'living', 'to live'] }, 'sp'),
      ppTonight: v({ sentence: 'We ___ a movie tonight. (to watch)', answer: 'are watching', distractors: ['watch', 'watches', 'is watching'] }, 'pp'),
      ppNurNow: v({ sentence: 'She ___ to music in her room now. (to listen)', answer: 'is listening', distractors: ['listen', 'listens', 'am listening'] }, 'pp'),
      cmpBeidesErlaubt: v({ sentence: 'Tom is ___ than Ben. (friendly)', answer: 'friendlier', distractors: ['more friendly', 'friendliest', 'friendly'] }, 'cmp'),
      saFrageSome: v({ sentence: 'Are there ___ cookies left?', answer: 'some', distractors: ['any'] }, 'sa'),
      mmUnzaehlbar: v({ sentence: 'How ___ water do you drink?', answer: 'many', distractors: ['much'] }, 'mm'),
      lfPlural: v({ sentence: 'I have ___ friends in London.', answer: 'a little', distractors: ['a few'] }, 'lf'),
      zweiLuecken: v({ sentence: 'She ___ and ___ every day. (to sing)', answer: 'sings', distractors: ['sing'] }, 'sp'),
      loesungAlsAblenker: v({ sentence: 'She ___ football every day. (to play)', answer: 'plays', distractors: ['plays', 'play', 'playing'] }, 'sp'),
      // korrekte Sätze dürfen nicht anschlagen
      gutGf: v({ sentence: 'She ___ football tomorrow. (to play)', answer: 'is going to play', distractors: ['is going play', 'are going to play', 'is going to playing'] }, 'gf'),
      gutSp: v({ sentence: 'She ___ football every day. (to play)', answer: 'plays', distractors: ['play', 'playing', 'to play'] }, 'sp'),
      gutPp: v({ sentence: 'Look! She ___ football. (to play)', answer: 'is playing', distractors: ['plays', 'play', 'are playing'] }, 'pp'),
      gutCmp: v({ sentence: 'A bike is ___ than a car. (cheap)', answer: 'cheaper', distractors: ['more cheap', 'cheapest', 'the cheaper'] }, 'cmp'),
      gutSa: v({ sentence: "I don't have ___ money.", answer: 'any', distractors: ['some'] }, 'sa'),
      gutMm: v({ sentence: 'How ___ apples do you want?', answer: 'many', distractors: ['much'] }, 'mm'),
    };
  });
  for (const [k, p] of Object.entries(r)) {
    if (k.startsWith('gut')) expect(p, k + ' sollte bestehen').toEqual([]);
    else expect(p.length, k + ' sollte beanstandet werden').toBeGreaterThan(0);
  }
});

test('Admin: Grammatik-Tab zeigt Pool mit Prüfknopf, ohne Fehler', async ({ page }) => {
  const { ADMIN, login, blockWrites } = require('./helpers');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('kwift.CHROME')) errors.push(m.text()); });
  await blockWrites(page);
  await login(page, ADMIN);
  await page.locator('button', { hasText: '✏️ Gram.' }).click();
  await expect(page.locator('button', { hasText: '🔍 Pool prüfen' }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=Lade…')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('text=/___/').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/grammatik-admin.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('jeder Satz in den Live-Pools besteht die Prüfung', async ({ page }) => {
  await page.goto('/tests/leer.html');
  const r = await page.evaluate(async () => {
    const g = await import('/src/core/grammar.js');
    const out = { total: 0, bad: [], dup: [], hidden: 0 };
    for (const t of Object.keys(g.GRAMMAR_KEYS)) {
      const raw = await g.loadGrammarPoolRaw(t);
      const shown = await g.loadGrammarPool(t);
      out.hidden += raw.length - shown.length;
      const seen = new Set();
      for (const q of raw) {
        out.total++;
        const p = g.validateGrammarQuestion(q, t);
        if (p.length) out.bad.push(t + ': ' + q.sentence + ' → ' + p.join('; '));
        if (q.review && q.review.ok === false) out.bad.push(t + ': ' + q.sentence + ' → KI: ' + q.review.problem);
        const k = (q.sentence || '').toLowerCase();
        if (seen.has(k)) out.dup.push(t + ': ' + q.sentence);
        seen.add(k);
      }
    }
    return out;
  });
  console.log('Sätze geprüft:', r.total, '| beanstandet:', r.bad.length, '| Dubletten:', r.dup.length);
  r.bad.forEach((b) => console.log('  ✗', b));
  expect(r.total).toBeGreaterThan(150);
  expect(r.bad).toEqual([]);
  expect(r.dup).toEqual([]);
  expect(r.hidden).toBe(0);
});
