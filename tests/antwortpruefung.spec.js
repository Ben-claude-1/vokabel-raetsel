// Regeln der Antwortprüfung (checkAnswer, Stufe 1 — ohne KI).
// Läuft ohne Browser: words.js wird über esbuild gebündelt geladen.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');

function load() {
  const out = path.join(os.tmpdir(), 'words-test-bundle.js');
  execFileSync('npx', ['esbuild', 'src/core/words.js', '--bundle', '--format=cjs',
    '--platform=node', '--outfile=' + out], { cwd: path.join(__dirname, '..') });
  global.localStorage = { getItem: () => null, setItem: () => {} };
  delete require.cache[out];
  return require(out);
}
const { checkAnswer } = load();
const ok = (r) => r === 'correct' || r === 'partial';

test.describe('großzügigere Antwortprüfung', () => {
  test('Auslassungszeichen sind egal', () => {
    expect(ok(checkAnswer('to be fond of', 'to be fond of …'))).toBe(true);
    expect(ok(checkAnswer('to be fond of …', 'to be fond of …'))).toBe(true);
    expect(ok(checkAnswer('to be fond of...', 'to be fond of ...'))).toBe(true);
    expect(ok(checkAnswer('que significa', '¿Qué significa...?'))).toBe(true);
    expect(ok(checkAnswer('¿Qué significa?', '¿Qué significa...?'))).toBe(true);
  });

  test('männliche/weibliche Form: eine Form genügt, auch ohne Artikel', () => {
    const sol = 'el/la profesor/-a (= el/la profe fam.)';
    expect(checkAnswer('el profesor', sol)).toBe('correct');
    expect(checkAnswer('la profesora', sol)).toBe('correct');
    expect(ok(checkAnswer('profesor', sol))).toBe(true);
    expect(ok(checkAnswer('profesora', sol))).toBe(true);
    expect(ok(checkAnswer('el/la profesor/-a', sol))).toBe(true);
  });

  test('fehlende Akzente und Umlaute', () => {
    expect(ok(checkAnswer('habitacion', 'la habitación'))).toBe(true);
    expect(ok(checkAnswer('la habitacion', 'la habitación'))).toBe(true);
  });

  test('ein einzelner Tippfehler bei längeren Wörtern', () => {
    expect(ok(checkAnswer('cuadermo', 'el cuaderno'))).toBe(true);
    expect(ok(checkAnswer('el cuadermo', 'el cuaderno'))).toBe(true);
    expect(ok(checkAnswer('celebratiom', 'celebration'))).toBe(true);
  });

  test('bleibt streng, wo es um Lernstoff geht', () => {
    expect(checkAnswer('misa', 'mesa')).toBe('wrong');          // kurzes Wort: kein Tippfehler-Spielraum
    expect(checkAnswer('el casa', 'la casa')).toBe('wrong');    // falscher Artikel = falsches Genus
    expect(checkAnswer('perro', 'el gato')).toBe('wrong');
    expect(checkAnswer('cuadrnos', 'el cuaderno')).toBe('wrong'); // zwei Fehler
    expect(checkAnswer('', 'la casa')).toBe('empty');
  });

  test('bisheriges Verhalten bleibt', () => {
    expect(checkAnswer('la casa', 'la casa')).toBe('correct');
    expect(checkAnswer('see', 'to see')).toBe('partial');
    expect(checkAnswer('el gato', 'el/la gato/-a')).toBe('correct');
    expect(checkAnswer('uno', 'uno, una, un')).toBe('correct');
  });
});
