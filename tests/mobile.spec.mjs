/**
 * The play field is authored at a fixed 798x462. On a phone it is scaled to fit,
 * which is where the two classes of mobile bug live: the field escaping the
 * viewport, and input landing in the wrong place because CSS pixels, device
 * pixels and stage pixels all differ.
 */
import { test, expect, devices } from '@playwright/test';
import { prepare, waitForBoot, readState, startRound, touchDrag, paintedRatio } from './game-page.mjs';

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

        test('keeps the dashboard clear of the play field', async ({ page }) => {
            // Portrait is told to rotate, and has no width to spare for a
            // gutter, so the dashboard stays overlaid there.
            test.skip(label === 'iPhone 15', 'portrait shows the orientation prompt');

            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            // A viewport big enough to render the field at 1:1 keeps the
            // original composition, dashboard overlap included. Only the scaled
            // layout moves it into a gutter.
            const scale = await page.evaluate(() => window.BallAndWall.stage.scale);

            test.skip(scale === 1, 'renders at 1:1, so the desktop composition applies');

            const boxes = await page.evaluate(() => {
                const rect = (id) => {
                    const { left, top, right, bottom } = document.getElementById(id).getBoundingClientRect();

                    return { left, top, right, bottom };
                };

                return { field: rect('a-game-canvas'), dashboard: rect('a-game-dashboard') };
            });

            // The dashboard artwork is opaque edge to edge, so any intersection
            // hides bricks. It used to be overlaid on the field's top-left,
            // covering roughly the first third of the wall.
            const overlaps = !(
                boxes.dashboard.right <= boxes.field.left + 1
                    || boxes.dashboard.left >= boxes.field.right - 1
                    || boxes.dashboard.bottom <= boxes.field.top + 1
                    || boxes.dashboard.top >= boxes.field.bottom - 1
            );

            expect(overlaps, `dashboard ${JSON.stringify(boxes.dashboard)} over field ${JSON.stringify(boxes.field)}`)
                    .toBe(false);
            expect(boxes.dashboard.left).toBeGreaterThanOrEqual(0);
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

        test('plays a released ball without runtime errors', async ({ page }) => {
            test.skip(label === 'iPhone 15', 'portrait shows the orientation prompt');

            const { consoleErrors } = await prepare(page);

            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await startRound(page, 0);

            // Releasing the ball is what starts the collision sweep, and the
            // sweep is what measures every block. Leaving the ball glued to the
            // paddle -- as the touch test above does -- never reaches that code,
            // which is how a crash on every tick of a high-density screen went
            // unnoticed: the frame maths asked for sprite frames larger than the
            // @2x sheet, so getBounds() came back null.
            const played = await page.evaluate(async () => {
                const entities = window.BallAndWall.entities;
                const before = window.BallAndWall.levels.getBlocks().getLength();
                const ball = entities.balls.reset().current();
                const from = { x: ball.getX(), y: ball.getY() };

                document.getElementById('a-game-canvas').click();
                await new Promise((resolve) => setTimeout(resolve, 2500));

                return {
                    alive: ball.alive,
                    travelled: Math.hypot(ball.getX() - from.x, ball.getY() - from.y),
                    blocksBefore: before,
                    blocksAfter: window.BallAndWall.levels.getBlocks().getLength()
                };
            });

            expect(played.alive).toBe(true);
            expect(played.travelled).toBeGreaterThan(20);
            // The ball starts under the wall, so a few blocks must have gone.
            expect(played.blocksAfter).toBeLessThan(played.blocksBefore);

            expect(consoleErrors, `console:\n${consoleErrors.slice(0, 5).join('\n')}`).toEqual([]);
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
