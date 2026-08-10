import { test, expect } from '@playwright/test';
import { prepare, waitForBoot, readState, paintedRatio } from './game-page.mjs';

test.describe('boot (development sources)', () => {
    test('loads every module and starts the frame loop', async ({ page }) => {
        const { consoleErrors, failedRequests } = await prepare(page);

        await page.goto('/index_dev.html');
        await waitForBoot(page);

        const state = await readState(page);

        expect(state.episode).toBe('space');
        expect(state.ticking).toBe(true);
        // The space episode shows an animated splash screen built out of blocks.
        expect(state.blocks).toBeGreaterThan(0);

        expect(failedRequests, `failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
        expect(consoleErrors, `console:\n${consoleErrors.join('\n')}`).toEqual([]);
    });

    test('reveals the stage and paints the canvas', async ({ page }) => {
        await prepare(page);
        await page.goto('/index_dev.html');
        await waitForBoot(page);

        await expect(page.locator('#a-container')).toBeVisible();

        // A blank canvas still passes a "did it load" check, so assert that a
        // meaningful share of it was actually drawn to.
        await expect.poll(() => paintedRatio(page), { timeout: 20_000 })
                .toBeGreaterThan(0.5);
    });

    test('advances the animation between frames', async ({ page }) => {
        await prepare(page);
        await page.goto('/index_dev.html');
        await waitForBoot(page);

        const measured = await page.evaluate(async () => {
            const before = window.createjs.Ticker.getTicks();

            await new Promise((resolve) => setTimeout(resolve, 1500));

            return window.createjs.Ticker.getTicks() - before;
        });

        expect(measured).toBeGreaterThan(10);
    });

    test('honours the seeded options instead of showing first-run overlays', async ({ page }) => {
        await prepare(page);
        await page.goto('/index_dev.html');
        await waitForBoot(page);

        // Guards the storage namespacing in core/storage/local.js: if the seeded
        // key stops being read, both overlays reappear and this fails.
        await expect(page.locator('#cookie')).toHaveCount(0);
        await expect(page.locator('.lbx-first-time')).toHaveCount(0);

        const options = await page.evaluate(() => require('app/game-options').get('window-options'));

        expect(options.cookieInfo).toBe(true);
        expect(options.music).toBe('off');
    });
});
