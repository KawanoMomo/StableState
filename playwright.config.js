// Playwright config for ux-brushup regression + cyclic-transitions tests.
// Assumes a dev server is already running at http://localhost:8765 serving stablestate.html
// (started by the Top-level conductor). Tests must not start or stop the server.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['ux-brushup/**/*.spec.js', 'cyclic-transitions/**/*.spec.js', 'autoroute-rewrite/**/*.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8765',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
