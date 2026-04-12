const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  webServer: {
    command: 'npx http-server . -p 3333 --cors -c-1',
    url: 'http://localhost:3333',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:3333',
    headless: false,          // sichtbar im Browser
    slowMo: 200,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
  ],
  reporter: [['list'], ['html', { open: 'on-failure' }]],
});
