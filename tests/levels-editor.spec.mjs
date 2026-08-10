import { test, expect } from '@playwright/test';
import { prepare } from './game-page.mjs';

/**
 * The editor is no longer linked from the game page -- it is a tool, not part of
 * playing -- so it is reached by URL. That it still boots on its own is what
 * these cover; boot.spec.mjs asserts the link is gone.
 */
test.describe('levels editor', () => {
    test('boots and renders the block palette', async ({ page }) => {
        const { consoleErrors, failedRequests } = await prepare(page);

        await page.goto('/levels-editor_dev.html');

        // The editor builds its palette once the episode assets have loaded.
        await expect(page.locator('#editor-static-blocks img').first())
                .toBeVisible({ timeout: 45_000 });
        await expect(page.locator('#editor-interactive-blocks img').first()).toBeVisible();
        await expect(page.locator('.episodes-select')).toHaveCount(1);

        expect(failedRequests, `failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
        expect(consoleErrors, `console:\n${consoleErrors.join('\n')}`).toEqual([]);
    });

});
