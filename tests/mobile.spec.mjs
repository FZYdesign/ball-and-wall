/**
 * The play field is authored at a fixed 798x462. On a phone it is scaled to fit,
 * which is where the two classes of mobile bug live: the field escaping the
 * viewport, and input landing in the wrong place because CSS pixels, device
 * pixels and stage pixels all differ.
 */
import { test, expect, devices } from '@playwright/test';
import {
    prepare, waitForBoot, readState, startRound, touchDrag, paintedRatio, waitForOverlayGone
} from './game-page.mjs';

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

        test('hides the dashboard until asked for, and gives the field the viewport', async ({ page }) => {
            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            // A viewport big enough for 1:1 keeps the original composition,
            // where the dashboard is always on screen.
            const scale = await page.evaluate(() => window.BallAndWall.stage.scale);

            test.skip(scale === 1, 'renders at 1:1, so the desktop composition applies');

            const measure = () => page.evaluate(() => {
                const rect = (id) => document.getElementById(id).getBoundingClientRect();
                const field = rect('a-game-canvas');
                const dashboard = rect('a-game-dashboard');
                const toggle = document.getElementById('a-hud-toggle').getBoundingClientRect();
                const across = (a, b) => Math.max(
                    0,
                    Math.min(a.right, b.right) - Math.max(a.left, b.left)
                );

                return {
                    fieldWidth: Math.round(field.width),
                    // How much of the field the dashboard actually covers.
                    covered: Math.round(across(dashboard, field)),
                    toggleOverField: across(toggle, field) > 0
                        && Math.min(toggle.bottom, field.bottom) - Math.max(toggle.top, field.top) > 0,
                    // Widest the field could be in this viewport.
                    maxFieldWidth: Math.round(Math.min(
                        window.innerWidth,
                        (798 / 462) * window.innerHeight
                    ))
                };
            });

            const closed = await measure();

            // The dashboard artwork is opaque edge to edge, so on screen it
            // either covers bricks or costs the field the width it needs.
            expect(closed.covered, 'dashboard must not cover the field by default').toBe(0);
            expect(closed.toggleOverField, 'the toggle belongs in the letterbox margin').toBe(false);
            // The whole point of hiding it: the field gets the full viewport.
            expect(closed.fieldWidth).toBeGreaterThanOrEqual(closed.maxFieldWidth - 2);

            await page.locator('#a-hud-toggle').click();
            await page.waitForTimeout(500);

            const opened = await measure();

            expect(opened.covered, 'opening it should slide it into view').toBeGreaterThan(50);
            expect(opened.fieldWidth, 'and must not resize the field').toBe(closed.fieldWidth);

            await page.locator('#a-hud-toggle').click();
            await page.waitForTimeout(500);

            expect((await measure()).covered, 'closing it should park it again').toBe(0);
        });

        test('keeps every dialog inside the viewport', async ({ page }) => {
            test.skip(label === 'iPhone 15', 'portrait shows the orientation prompt');

            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            // Each dialog is laid out at a fixed pixel size picked by viewport
            // *width*, so a wide, short landscape phone gets a window taller
            // than its own screen -- the round chooser on a 863x360 Pixel 7 was
            // 410px tall, and its Start button could not be reached at all.
            const dialogs = [
                ['rounds', () => window.BallAndWall.dashboard.emit('clickPlay')],
                ['shop', () => window.BallAndWall.dashboard.emit('clickShop')],
                ['options', () => window.BallAndWall.dashboard.emit('clickOptions')],
                ['help', () => window.BallAndWall.dashboard.emit('clickHelp')]
            ];

            for (const [name, open] of dialogs) {
                await page.evaluate(open);
                await page.waitForSelector('.lbx-window.lbx-showed', { state: 'visible' });
                await page.waitForTimeout(500);

                const box = await page.evaluate(() => {
                    const element = document.querySelector('.lbx-window');
                    const rect = element.getBoundingClientRect();
                    const bounds = {
                        left: rect.left, top: rect.top,
                        right: rect.right, bottom: rect.bottom
                    };

                    // The close and minimise buttons sit at top/right: -5px,
                    // deliberately outside the window box. A window scaled to
                    // exactly the viewport therefore puts the only way to close
                    // it off screen, which is what this is really guarding.
                    element.querySelectorAll('#exit, #minimize').forEach((control) => {
                        const area = control.getBoundingClientRect();

                        if (!area.width && !area.height) {
                            return;
                        }
                        bounds.left = Math.min(bounds.left, area.left);
                        bounds.top = Math.min(bounds.top, area.top);
                        bounds.right = Math.max(bounds.right, area.right);
                        bounds.bottom = Math.max(bounds.bottom, area.bottom);
                    });

                    return {
                        ...bounds,
                        viewport: { width: window.innerWidth, height: window.innerHeight }
                    };
                });

                expect(Math.round(box.top), `${name} above the viewport`).toBeGreaterThanOrEqual(0);
                expect(Math.round(box.left), `${name} left of the viewport`).toBeGreaterThanOrEqual(0);
                expect(Math.round(box.bottom), `${name} below the fold`)
                        .toBeLessThanOrEqual(box.viewport.height);
                expect(Math.round(box.right), `${name} past the right edge`)
                        .toBeLessThanOrEqual(box.viewport.width);

                await page.evaluate(() => document.querySelector('.lbx-window #exit').click());
                await waitForOverlayGone(page);
            }
        });

        test('closes the dashboard when a round starts', async ({ page }) => {
            test.skip(label === 'iPhone 15', 'portrait shows the orientation prompt');

            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            const scale = await page.evaluate(() => window.BallAndWall.stage.scale);

            test.skip(scale === 1, 'renders at 1:1, so the dashboard is always shown');

            await page.locator('#a-hud-toggle').click();
            await page.waitForTimeout(400);
            expect(await page.evaluate(() => window.BallAndWall.stage.dashboardVisible)).toBe(true);

            await startRound(page, 0);
            await page.waitForTimeout(500);

            // Nobody wants to start a round looking at the panel.
            expect(await page.evaluate(() => window.BallAndWall.stage.dashboardVisible)).toBe(false);
            expect(await page.evaluate(() => window.createjs.Ticker.getPaused())).toBe(false);
        });

        test('holds the round while the dashboard is open', async ({ page }) => {
            test.skip(label === 'iPhone 15', 'portrait shows the orientation prompt');

            await prepare(page);
            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await page.waitForTimeout(500);

            const scale = await page.evaluate(() => window.BallAndWall.stage.scale);

            test.skip(scale === 1, 'renders at 1:1, so the dashboard is always shown');

            await startRound(page, 0);
            await page.evaluate(() => document.getElementById('a-game-canvas').click());
            await page.waitForTimeout(1200);

            const sample = () => page.evaluate(() => {
                const ball = window.BallAndWall.entities.balls.reset().current();
                const paddle = window.BallAndWall.entities.paddles.reset().current();

                return {
                    x: ball ? Math.round(ball.getX()) : null,
                    y: ball ? Math.round(ball.getY()) : null,
                    paddleX: paddle ? Math.round(paddle.getX()) : null,
                    time: window.BallAndWall.dashboard.getTime().get(),
                    paused: window.createjs.Ticker.getPaused()
                };
            });

            // Park the paddle away from the left edge, which is where a pointer
            // reading taken from the toggle button would land it.
            await touchDrag(page, [0.6]);

            const before = await sample();

            expect(before.paddleX).toBeGreaterThan(0);

            await page.locator('#a-hud-toggle').click();
            await page.waitForTimeout(400);

            const opened = await sample();

            expect(opened.paused).toBe(true);

            await page.waitForTimeout(2500);

            const held = await sample();

            expect(held.x, 'the ball must not move behind the panel').toBe(opened.x);
            expect(held.y).toBe(opened.y);
            // The clock is a plain interval, so it needs stopping separately --
            // otherwise a pause quietly inflates the player's time.
            expect(held.time, 'the clock must stop too').toBe(opened.time);

            await page.locator('#a-hud-toggle').click();
            await page.waitForTimeout(2000);

            const resumed = await sample();

            expect(resumed.paused).toBe(false);
            expect(resumed.x !== held.x || resumed.y !== held.y, 'the ball must move again').toBe(true);
            expect(resumed.time, 'and the clock must carry on').toBeGreaterThan(held.time);
            // The toggle sits at the far left. Reading a paddle position from a
            // tap on it threw the paddle to x = 0 the moment the round resumed.
            expect(resumed.paddleX, 'the paddle must resume where it was left')
                    .toBe(before.paddleX);
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
            // The modal closes with a transition and input ignores taps that
            // land on it, so touching before it is gone aims at the modal.
            await waitForOverlayGone(page);

            const state = await readState(page);

            expect(state.blocks).toBeGreaterThan(0);

            const stageWidth = await page.evaluate(() => window.BallAndWall.stage.getWidth());
            const paddleAt = () => page.evaluate(() => {
                const paddle = window.BallAndWall.entities.paddles.reset().current();

                return paddle ? paddle.getX() : null;
            });

            await touchDrag(page, [0.15]);

            // The paddle follows the pointer on the next frame, so poll for it
            // rather than reading once after a fixed delay -- under the load of
            // a full suite run that delay is not always enough.
            await expect.poll(paddleAt).toBeLessThan(stageWidth * 0.4);

            const left = await paddleAt();

            await touchDrag(page, [0.85]);

            await expect.poll(paddleAt).toBeGreaterThan(left);
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
