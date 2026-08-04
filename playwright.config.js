const { defineConfig } = require('@playwright/test');

const HEADED = !!process.env.PWDEBUG || process.argv.includes('--headed');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  webServer: {
    // Eigener Server statt http-server: er liefert die App aus UND proxyt
    // /rest/v1/* an die API, damit beides dieselbe Herkunft hat.
    // Ohne das blockt der CORS-Preflight jeden Login (siehe tests/dev-server.js).
    command: 'node tests/dev-server.js',
    url: 'http://localhost:3333',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:3333',
    // setzt sb_url auf den Proxy, damit die App same-origin spricht
    storageState: './tests/storage-state.json',
    headless: !HEADED,
    slowMo: HEADED ? 200 : 0,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
