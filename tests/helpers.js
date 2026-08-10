// Shared helpers für alle Tests
//
// Die Tests laufen gegen die echte Datenbank (über den Proxy aus
// tests/dev-server.js). Passwörter lassen sich per Umgebungsvariable
// überschreiben, damit sie nicht im Repo stehen müssen:
//   TEST_ADMIN_PW=... TEST_EMMA_PW=... npm test

const ADMIN = { name: 'admin', password: process.env.TEST_ADMIN_PW || 'Magda1982' };
const EMMA  = { name: 'Emma',  password: process.env.TEST_EMMA_PW  || '130615' };

// Schreibsperre für alle Tests, die sich anmelden.
//
// Ohne sie schreibt schon das bloße Öffnen eines Spielbildschirms echte
// Einträge in `learn_sessions` — am 10.08.2026 sind so 24 Kunst-Sitzungen in
// Emmas Lernzeit gelandet. Lesende Requests laufen normal durch; jeder
// schreibende wird abgefangen und im zurückgegebenen Protokoll vermerkt.
async function blockWrites(page) {
  const protokoll = [];
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.continue();
    protokoll.push(req.method() + ' ' + req.url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return protokoll;
}

async function login(page, user) {
  await page.goto('/');
  await page.waitForSelector('input[placeholder="Dein Name"]', { timeout: 25000 });
  await page.fill('input[placeholder="Dein Name"]', user.name);
  await page.fill('input[placeholder="Passwort"]', user.password);
  await page.click('button:has-text("→ Anmelden")');
  // Warten bis Login erfolgreich
  await page.waitForSelector('button:has-text("Abmelden")', { timeout: 10000 });
}

async function getConsoleErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

module.exports = { ADMIN, EMMA, login, blockWrites, getConsoleErrors };
