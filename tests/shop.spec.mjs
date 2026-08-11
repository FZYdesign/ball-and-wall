/**
 * The shop, the wallet and the items bought from them.
 *
 * These assertions are about money and inventory, so they read the real wallet
 * through window.BallAndWall rather than the numbers printed on screen: what
 * matters is that a purchase moved the balance by exactly the price and put
 * exactly one item in the kit, not that a label happened to be repainted.
 *
 * The payment provider under test is the mock in js/app/payment/, which settles
 * every order. What is being covered here is the game's half of the flow --
 * order, settle, credit -- which is the half that stays when a real provider is
 * plugged in.
 */
import { test, expect } from '@playwright/test';
import { prepare, waitForBoot, startRound, waitForOverlayGone, WALLET_KEY } from './game-page.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @return {Promise<Object>}
 */
function readWallet(page) {
    return page.evaluate(() => ({
        coins: window.BallAndWall.wallet.getCoins(),
        items: window.BallAndWall.wallet.getItems()
    }));
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function openShop(page) {
    await page.evaluate(() => window.BallAndWall.dashboard.emit('clickShop'));
    await page.waitForSelector('.lbx-shop', { state: 'visible' });
}

test.describe('shop', () => {
    test('opens from the dashboard and shows the balance', async ({ page }) => {
        const { consoleErrors } = await prepare(page);

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openShop(page);

        const shown = await page.locator('.lbx-shop .shop-balance-value').textContent();
        const { coins } = await readWallet(page);

        expect(Number(shown)).toBe(coins);
        expect(await page.locator('.lbx-shop .shop-list-items .shop-entry').count()).toBeGreaterThan(0);
        expect(consoleErrors).toEqual([]);
    });

    test('buying an item charges its price and delivers it once', async ({ page }) => {
        await prepare(page, {}, { coins: 1000, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openShop(page);

        const price = await page.evaluate(
            () => window.BallAndWall.shop.catalog.getItem('grow-paddle').price
        );

        await page.click('.lbx-shop .shop-list-items li[data-item="grow-paddle"] .shop-buy');
        await expect(page.locator('.lbx-shop .shop-message')).toBeVisible();

        expect(await readWallet(page)).toEqual({
            coins: 1000 - price,
            items: { 'grow-paddle': 1 }
        });
    });

    test('refuses a purchase the player cannot afford, and charges nothing', async ({ page }) => {
        await prepare(page, {}, { coins: 10, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openShop(page);
        await page.click('.lbx-shop .shop-list-items li[data-item="shield"] .shop-buy');

        await expect(page.locator('.lbx-shop .shop-message-error')).toBeVisible();
        expect(await readWallet(page)).toEqual({ coins: 10, items: {} });
    });

    test('a settled top-up credits the pack in full, bonus included', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openShop(page);
        await page.click('.lbx-shop .tab-buttons a:nth-child(2)');
        await page.click('.lbx-shop .shop-list-packs li[data-pack="coins-m"] .shop-pay');

        await expect(page.locator('.lbx-shop .shop-message-ok')).toBeVisible({ timeout: 10_000 });

        const expected = await page.evaluate(() => {
            const catalog = window.BallAndWall.shop.catalog;

            return catalog.getPackCoins(catalog.getPack('coins-m'));
        });
        const { coins } = await readWallet(page);

        expect(coins).toBe(expected);
        // The receipt trail is what a support request is answered from.
        const orders = await page.evaluate(() => window.BallAndWall.wallet.getOrders());

        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({ packId: 'coins-m', coins: expected });
    });

    test('clearing a round pays coins into the wallet', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await startRound(page);
        // Clearing a level by playing would take minutes; the game emits this
        // when the last block goes, which is the moment the pay-out hangs off.
        await page.evaluate(() => {
            window.BallAndWall.levels.getBlocks().destroy();
            window.BallAndWall.core.mediator.emit('game:stage-clear');
        });
        await page.waitForFunction(() => window.BallAndWall.wallet.getCoins() > 0, null,
            { timeout: 15_000 });

        expect((await readWallet(page)).coins).toBeGreaterThan(0);
    });
});

test.describe('coin balance', () => {
    test('is on screen without opening the dashboard', async ({ page }) => {
        await prepare(page, {}, { coins: 2300, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);

        // It used to be painted on the dashboard canvas, which on a phone is
        // parked off screen for the whole round -- the balance went with it.
        await expect(page.locator('#a-coin-hud .a-coin-value')).toHaveText('2,300');
    });

    test('follows the wallet', async ({ page }) => {
        await prepare(page, {}, { coins: 1000, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openShop(page);

        const price = await page.evaluate(
            () => window.BallAndWall.shop.catalog.getItem('grow-paddle').price
        );

        await page.click('.lbx-shop .shop-list-items li[data-item="grow-paddle"] .shop-buy');

        await expect(page.locator('#a-coin-hud .a-coin-value'))
                .toHaveText(String(1000 - price));
    });

    test('never takes a pointer meant for the paddle', async ({ page }) => {
        await prepare(page, {}, { coins: 2300, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);

        // It is a readout, not a control: the trolley on the dashboard is the
        // way into the shop. Anything clickable up there would also have to
        // earn its place in UI_CHROME.
        expect(await page.evaluate(
            () => getComputedStyle(document.getElementById('a-coin-hud')).pointerEvents
        )).toBe('none');
    });
});

test.describe('bought items', () => {
    test('appear beside the field only while a round is running', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: { 'extra-life': 1 }, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);

        await expect(page.locator('#a-item-bar')).toBeHidden();
        await startRound(page);
        await expect(page.locator('#a-item-bar button[data-item="extra-life"]')).toBeVisible();
    });

    test('stay clear of the play field', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: { 'extra-life': 1 }, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await startRound(page);

        const bar = await page.locator('#a-item-bar').boundingBox();
        const field = await page.locator('#a-game-canvas').boundingBox();
        const viewport = page.viewportSize();

        expect(bar.x).toBeGreaterThanOrEqual(field.x + field.width);
        expect(bar.x + bar.width).toBeLessThanOrEqual(viewport.width);
    });

    test('using one applies its effect and spends exactly one', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: { 'extra-life': 2 }, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await startRound(page);
        await waitForOverlayGone(page);

        const before = await page.evaluate(() => window.BallAndWall.dashboard.getLives().get());

        await page.click('#a-item-bar button[data-item="extra-life"]');

        expect(await page.evaluate(() => window.BallAndWall.dashboard.getLives().get()))
                .toBe(before + 1);
        expect((await readWallet(page)).items).toEqual({ 'extra-life': 1 });
    });

    test('a tap that cannot be honoured costs nothing', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: { 'multi-ball': 1 }, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await startRound(page);
        await waitForOverlayGone(page);

        // The ball is still glued to the paddle, so there is no direction to
        // split it along and the item must not be consumed.
        const used = await page.evaluate(() => window.BallAndWall.itemBar.use('multi-ball'));

        expect(used).toBe(false);
        expect((await readWallet(page)).items).toEqual({ 'multi-ball': 1 });
    });

    test('a purchase is written through to storage, not just held in memory', async ({ page }) => {
        await prepare(page, {}, { coins: 500, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openShop(page);
        await page.click('.lbx-shop .shop-list-items li[data-item="grow-paddle"] .shop-buy');
        await expect(page.locator('.lbx-shop .shop-message')).toBeVisible();

        // Reloading would only prove the seeding works: prepare() writes the
        // wallet key before every navigation. What survives a reload is
        // whatever reached localStorage, so that is what is asserted.
        const stored = await page.evaluate(
            (key) => JSON.parse(window.localStorage.getItem(key)),
            WALLET_KEY
        );

        expect(stored).toMatchObject(await readWallet(page));
    });

    test('the shop is seeded, not carried over between tests', async ({ page }) => {
        // prepare() writes the wallet key the same way it writes the options
        // key; without that a spec would inherit whatever the last one spent.
        await prepare(page, {}, { coins: 777, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await page.waitForFunction(() => window.BallAndWall.wallet.isLoaded());

        expect((await readWallet(page)).coins).toBe(777);
        expect(WALLET_KEY).toBe('baw-storage:wallet');
    });
});
