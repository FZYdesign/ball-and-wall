import { test, expect } from '@playwright/test';
import { prepare, waitForBoot, readState, startRound } from './game-page.mjs';

test.describe('gameplay', () => {
    test.beforeEach(async ({ page }) => {
        await prepare(page);
        await page.goto('/index_dev.html');
        await waitForBoot(page);
    });

    test('opens the rounds window and lists every level', async ({ page }) => {
        await page.click('#a-game-canvas');

        const rounds = page.locator('.lbx-rounds');

        await expect(rounds).toBeVisible();

        const entries = rounds.locator('.option-item-entry');
        const levelCount = await page.evaluate(() => require('app/levels').getLevelNames().length);

        await expect(entries).toHaveCount(levelCount);
        expect(levelCount).toBeGreaterThan(0);
    });

    test('starts the round the player selected, not always the first', async ({ page }) => {
        await page.click('#a-game-canvas');
        await page.waitForSelector('.lbx-rounds', { state: 'visible' });

        // Round 2 is the last one unlocked from a fresh profile.
        const entry = page.locator('.lbx-rounds .option-item-entry[data-id="1"]');

        await entry.click();

        // Selection compared jQuery's `.context`, which 3.x removed -- the check
        // was silently always false, so the click marked nothing and the game
        // always started round 1 whatever the player picked.
        await expect(entry).toHaveClass(/selected/);

        await page.click('.lbx-rounds .btn.secondary a');
        await page.waitForFunction(
            () => require('app/entities/_').balls.getLength() > 0,
            null,
            { timeout: 20_000 }
        );

        expect((await readState(page)).round).toBe(2);
    });

    test('starts round 1 with a level, a ball and a paddle', async ({ page }) => {
        await startRound(page, 0);

        const state = await readState(page);

        expect(state.balls).toBe(1);
        expect(state.paddles).toBe(1);
        expect(state.blocks).toBeGreaterThan(0);
        expect(state.round).toBe(1);
        expect(state.lives).toBeGreaterThan(0);

        await expect(page.locator('#a-game-canvas')).toHaveClass(/a-playing/);
    });

    test('releases the ball on click and moves it under physics', async ({ page }) => {
        await startRound(page, 0);

        // The ball is glued to the paddle until the player clicks the stage.
        const positions = await page.evaluate(async () => {
            const balls = require('app/entities/_').balls;
            const ball = balls.reset().current();
            const start = { x: ball.getX(), y: ball.getY() };

            document.getElementById('a-game-canvas').click();
            await new Promise((resolve) => setTimeout(resolve, 1500));

            return { start, end: { x: ball.getX(), y: ball.getY() }, alive: ball.alive };
        });

        expect(positions.alive).toBe(true);

        const travelled = Math.hypot(
            positions.end.x - positions.start.x,
            positions.end.y - positions.start.y
        );

        expect(travelled).toBeGreaterThan(5);
    });

    test('keeps the ball inside the play field', async ({ page }) => {
        await startRound(page, 0);

        const bounds = await page.evaluate(async () => {
            const balls = require('app/entities/_').balls;
            const ball = balls.reset().current();
            const canvas = document.getElementById('a-game-canvas');

            document.getElementById('a-game-canvas').click();

            let minX = Infinity;
            let maxX = -Infinity;

            for (let i = 0; i < 40; i++) {
                await new Promise((resolve) => setTimeout(resolve, 50));
                minX = Math.min(minX, ball.getX());
                maxX = Math.max(maxX, ball.getX());
            }

            return { minX, maxX, width: canvas.width };
        });

        // Walls bounce the ball, so it must never leave the canvas horizontally.
        expect(bounds.minX).toBeGreaterThanOrEqual(0);
        expect(bounds.maxX).toBeLessThanOrEqual(bounds.width);
    });
});
