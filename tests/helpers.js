// Shared helpers für alle Tests
//
// Die Tests laufen gegen die echte Datenbank (über den Proxy aus
// tests/dev-server.js). Passwörter lassen sich per Umgebungsvariable
// überschreiben, damit sie nicht im Repo stehen müssen:
//   TEST_ADMIN_PW=... TEST_EMMA_PW=... npm test

const ADMIN = { name: 'admin', password: process.env.TEST_ADMIN_PW || 'Magda1982' };
const EMMA  = { name: 'Emma',  password: process.env.TEST_EMMA_PW  || '130615' };

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

module.exports = { ADMIN, EMMA, login, getConsoleErrors };
