// Shared helpers für alle Tests

const ADMIN = { name: 'admin', password: 'Magda1982' };
const EMMA  = { name: 'Emma',  password: '130615' };

async function login(page, user) {
  await page.goto('/');
  // Babel braucht Zeit zum Rendern
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
