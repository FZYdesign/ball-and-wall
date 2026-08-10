/**
 * The play field is authored at a fixed 798x462. On a phone it is scaled to fit,
 * which is where the two classes of mobile bug live: the field escaping the
 * viewport, and input landing in the wrong place because CSS pixels, device
 * pixels and stage pixels all differ.
 */
import { test, expect, devices } from '@playwright/test';
import { prepare, waitForBoot, readState, touchDrag, paintedRatio } from './game-page.mjs';

/**
 * Playwright refuses `defaultBrowserType` inside a describe block because it
 * would force a new worker; the rest of the descriptor (viewport, DPR, touch,
 * user agent) is what these specs actually need.
 *
 * @param {string} name
 * @return {Object}
 */
function emulate(name) {
    const { defaultBrowserType, ...rest } = devices[name];

    return rest;
}

const PHONES = [
    'iPhone 15 landscape',
    'Pixel 7 landscape',
    'iPhone 15',
    'iPad (gen 7) landscape'
];

for (const label of PHONES) {
    test.describe(label, () => {
        test.use(emulate(label));

        test('fits the play field inside the viewport', async ({ page }) => {
            const { consoleErrors } = await prepare(page);

            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            const layout = await page.evaluate(() => {
                const canvas = document.getElementById('a-game-canvas');
                const rect = canvas.getBoundingClientRect();

                return {
                    rect: {
                        left: rect.left, top: rect.top,
                        right: rect.right, bottom: rect.bottom,
                        width: rect.width, height: rect.height
                    },
                    viewport: { width: window.innerWidth, height: window.innerHeight },
                    documentWidth: document.documentElement.scrollWidth
                };
            });

            expect(layout.rect.left).toBeGreaterThanOrEqual(0);
            expect(layout.rect.top).toBeGreaterThanOrEqual(0);
            expect(Math.round(layout.rect.right)).toBeLessThanOrEqual(layout.viewport.width);
            expect(Math.round(layout.rect.bottom)).toBeLessThanOrEqual(layout.viewport.height);

            // The whole point: no sideways scrolling to reach the rest of the field.
            expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport.width);

            expect(consoleErrors, `console:\n${consoleErrors.join('\n')}`).toEqual([]);
        });

        test('keeps the authored aspect ratio', async ({ page }) => {
            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            const ratio = await page.evaluate(() => {
                const rect = document.getElementById('a-game-canvas').getBoundingClientRect();

                return rect.width / rect.height;
            });

            // 798 / 462. A stretched field would distort the ball's trajectory.
            expect(ratio).toBeCloseTo(798 / 462, 1);
        });

        test('renders the field', async ({ page }) => {
            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);

            await expect.poll(() => paintedRatio(page), { timeout: 20_000 })
                    .toBeGreaterThan(0.5);
        });

        test('maps touch across the full width of the field', async ({ page }) => {
            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            const stageWidth = await page.evaluate(() => window.BallAndWall.stage.getWidth());
            const readings = await touchDrag(page, [0.1, 0.5, 0.9]);

            // pointer.x is reported in stage pixels, so each contact must land at
            // the same fraction of the backing store however the canvas is scaled.
            // Before input spoke stage coordinates the paddle could only reach the
            // first third of the field on a device-pixel-scaled canvas.
            expect(readings[0] / stageWidth).toBeCloseTo(0.1, 1);
            expect(readings[1] / stageWidth).toBeCloseTo(0.5, 1);
            expect(readings[2] / stageWidth).toBeCloseTo(0.9, 1);
        });

        test('drives the paddle with touch after starting a round', async ({ page }) => {
            // Portrait deliberately shows the rotate prompt instead of the game,
            // which is asserted separately below.
            test.skip(label === 'iPhone 15', 'portrait shows the orientation prompt');

            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            // The rounds window is reachable by tapping the field.
            await page.locator('#a-game-canvas').tap();
            await page.waitForSelector('.lbx-rounds', { state: 'visible' });
            await page.locator('.lbx-rounds .option-item-entry[data-id="0"]').tap();
            await page.locator('.lbx-rounds .btn.secondary a').tap();
            await page.waitForFunction(
                () => window.BallAndWall.entities.balls.getLength() > 0,
                null,
                { timeout: 20_000 }
            );

            const state = await readState(page);

            expect(state.blocks).toBeGreaterThan(0);

            const paddleAt = () => page.evaluate(() => {
                const paddle = window.BallAndWall.entities.paddles.reset().current();

                return paddle ? paddle.getX() : null;
            });

            await touchDrag(page, [0.15]);
            const left = await paddleAt();

            await touchDrag(page, [0.85]);
            const right = await paddleAt();

            expect(right).toBeGreaterThan(left);
        });
    });
}

test.describe('orientation guidance', () => {
    test.use(emulate('iPhone 15'));

    test('asks for landscape in portrait and clears it in landscape', async ({ page }) => {
        await prepare(page);
        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await page.waitForTimeout(500);

        // The field is landscape, so a portrait phone should be told to rotate.
        await expect(page.locator('.lbx-orientation-indicator')).toHaveCount(1);

        await page.setViewportSize({ width: 734, height: 343 });
        await page.waitForTimeout(800);

        await expect(page.locator('.lbx-orientation-indicator')).toHaveCount(0);
    });
});
