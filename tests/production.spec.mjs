/**
 * The production page is a different code path from the development one: it
 * loads a single concatenated bundle instead of 98 separate modules, and one
 * merged stylesheet instead of media-scoped links. Bugs that only exist in the
 * build -- a module missing from the bundle, responsive rules dropped while
 * inlining @import -- are invisible to the other specs.
 */
import { test, expect } from '@playwright/test';
import { prepare, waitForBoot, readState, paintedRatio } from './game-page.mjs';

test.describe('production build', () => {
    test('boots from the concatenated bundle', async ({ page }) => {
        const { consoleErrors, failedRequests } = await prepare(page);

        await page.goto('/index.html');
        await waitForBoot(page);

        const state = await readState(page);

        expect(state.episode).toBe('space');
        expect(state.ticking).toBe(true);
        expect(state.blocks).toBeGreaterThan(0);

        expect(failedRequests, `failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
        expect(consoleErrors, `console:\n${consoleErrors.join('\n')}`).toEqual([]);

        await expect.poll(() => paintedRatio(page), { timeout: 20_000 })
                .toBeGreaterThan(0.5);
    });

    test('loads exactly one application bundle, not the individual modules', async ({ page }) => {
        const scriptUrls = [];

        page.on('response', (response) => {
            if (response.url().includes('/js/app/')) {
                scriptUrls.push(response.url());
            }
        });

        await prepare(page);
        await page.goto('/index.html');
        await waitForBoot(page);

        expect(scriptUrls, 'production must not fetch individual modules').toEqual([]);
    });

    test('applies the responsive breakpoints inlined into the CSS bundle', async ({ page }) => {
        await prepare(page);

        // css/import.css is concatenated after the base rules, so its @import
        // rules have to be expanded in place by the build. If they are emitted
        // as plain @import the browser ignores them and every breakpoint is lost.
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/index.html');
        await waitForBoot(page);

        // css/1280.css puts the dashboard at left:-135px, css/800.css at left:-66px.
        // With the imports dropped, neither rule lands and both read the same.
        const dashboardOffset = () => page.evaluate(() => {
            const style = getComputedStyle(document.getElementById('a-game-dashboard'));

            return `${style.top}/${style.left}`;
        });

        const wide = await dashboardOffset();

        await page.setViewportSize({ width: 800, height: 700 });
        await page.waitForTimeout(500);

        const narrow = await dashboardOffset();

        expect(wide, 'responsive breakpoints did not apply').not.toBe(narrow);
    });

    test('references no external hosts', async ({ page }) => {
        const external = [];

        page.on('request', (request) => {
            const url = new URL(request.url());

            if (url.hostname !== 'localhost' && url.protocol !== 'data:') {
                external.push(request.url());
            }
        });

        await prepare(page);
        await page.goto('/index.html');
        await waitForBoot(page);

        // The fork-me ribbon used to pull a PNG from a dead host over plain http,
        // which https deployments blocked as mixed content.
        expect(external, `external requests:\n${external.join('\n')}`).toEqual([]);
    });
});
