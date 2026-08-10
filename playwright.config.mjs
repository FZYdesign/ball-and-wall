import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 8080);

export default defineConfig({
    testDir: './tests',
    // Rebuilds dist/ on every run. It cannot live in webServer.command, which is
    // skipped whenever an existing dev server is reused -- see tests/global-setup.mjs.
    globalSetup: './tests/global-setup.mjs',
    // The game is a single global stage driven by one createjs.Ticker, and the
    // tests share one dev server, so they stay serial rather than fighting over
    // CPU with a canvas that is measured for frame progress.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : [['list']],
    timeout: 60_000,
    expect: { timeout: 15_000 },

    use: {
        baseURL: `http://localhost:${PORT}`,
        viewport: { width: 1280, height: 800 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },

    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Use the installed Google Chrome rather than Playwright's bundled
                // Chromium: Playwright no longer ships Chromium builds for macOS 13,
                // which is what this project is developed on. CI installs Chrome the
                // same way, so both run the same browser.
                channel: 'chrome'
            }
        }
    ],

    webServer: {
        command: `node scripts/dev.mjs --port ${PORT}`,
        url: `http://localhost:${PORT}/index_dev.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe'
    }
});
