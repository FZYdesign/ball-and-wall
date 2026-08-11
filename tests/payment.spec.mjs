/**
 * The MoneyCollect integration, end to end -- minus MoneyCollect.
 *
 * The provider is configured for real (js/_config_dev.js is rewritten on the
 * way to the browser), its SDK is served from tests/fixtures/, and its API is
 * intercepted. What that leaves under test is precisely the half this repo
 * owns: create the payment, render the form, confirm the method, charge it,
 * confirm the status out of band, and only then move the balance.
 *
 * The most important assertion here is the negative one: a charge that has not
 * been confirmed must not credit a single coin.
 */
import { test, expect, devices } from '@playwright/test';
import { prepare, waitForBoot } from './game-page.mjs';

/** A host that exists only inside page.route; nothing ever leaves the browser. */
const API = 'https://mc.test/api/services/v1/payment';

const CONFIG = `
var SS = '', FULLADDR = '', API_ADDR = '', VERSION = '1.0.0', REVISION = '?v=1',
    EPISODES = ['space', 'pegasus'], ENV = 'dev',
    PAYMENT = {
        provider: 'moneycollect',
        mode: 'test',
        sdkUrl: '/tests/fixtures/moneycollect-stub.js',
        serverUrl: '${API}',
        apiKey: 'test_pu_stub',
        secretKey: 'test_pr_stub',
        orderEndpoint: '',
        description: 'Ball And Wall coins'
    };
`;

/**
 * Boots the game with MoneyCollect configured and its API intercepted.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [options] {status} the status verification will report
 * @return {Promise<Object>} the requests the provider made
 */
async function withMoneyCollect(page, options = {}) {
    const requests = { create: [], status: [] };

    await page.route('**/js/_config_dev.js', (route) => route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: CONFIG
    }));

    await page.route(`${API}/create`, async (route) => {
        requests.create.push(JSON.parse(route.request().postData()));
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 'success',
                data: { id: 'pay_stub_1', clientSecret: 'cs_stub_1', customerId: 'cus_stub_1' }
            })
        });
    });

    await page.route(`${API}/pay_stub_1`, async (route) => {
        requests.status.push(route.request().url());
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 'success',
                data: { id: 'pay_stub_1', status: options.status || 'succeeded' }
            })
        });
    });

    return requests;
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function openCoinTab(page) {
    await page.evaluate(() => window.BallAndWall.dashboard.emit('clickShop'));
    await page.waitForSelector('.lbx-shop', { state: 'visible' });
    await page.click('.lbx-shop .tab-buttons a:nth-child(2)');
}

/**
 * @param {import('@playwright/test').Page} page
 * @return {Promise<number>}
 */
function coins(page) {
    return page.evaluate(() => window.BallAndWall.wallet.getCoins());
}

/**
 * Playwright refuses `defaultBrowserType` inside a describe block; the rest of
 * the descriptor is what these cases need.
 *
 * @param {string} name
 * @return {Object}
 */
function emulate(name) {
    const { defaultBrowserType, ...rest } = devices[name];

    return rest;
}

test.describe('MoneyCollect', () => {
    test('is the provider once it is configured', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });
        await withMoneyCollect(page);

        await page.goto('/index_dev.html');
        await waitForBoot(page);

        expect(await page.evaluate(
            () => window.BallAndWall.app.shop && window.BallAndWall.payment.gateway.getProvider().name
        )).toBe('moneycollect');
    });

    test('a confirmed payment credits the pack exactly once', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });

        const requests = await withMoneyCollect(page);

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openCoinTab(page);
        await page.click('.lbx-shop .shop-list-packs li[data-pack="coins-s"] .shop-pay');

        // The provider's own card form, rendered by the stubbed SDK.
        await expect(page.locator('#mc-payment-container')).toBeVisible();
        await expect(page.locator('#card-element iframe')).toBeVisible();
        await expect(page.locator('#mc-payment-amount')).toHaveText('USD 1.00');

        await page.click('#mc-submit-btn');
        await expect(page.locator('.lbx-shop .shop-message-ok')).toBeVisible({ timeout: 15_000 });

        const pack = await page.evaluate(() => {
            const catalog = window.BallAndWall.shop.catalog;

            return catalog.getPackCoins(catalog.getPack('coins-s'));
        });

        expect(await coins(page)).toBe(pack);
        // Money is sent in minor units; a pack priced at $1.00 must arrive as 100.
        expect(requests.create).toHaveLength(1);
        expect(requests.create[0]).toMatchObject({ amount: 100, currency: 'USD', confirm: false });
        // Nothing is credited on the browser's word alone.
        expect(requests.status.length).toBeGreaterThan(0);
        await expect(page.locator('#mc-payment-container')).toBeHidden();
    });

    test('follows the documented order: create, render, save the card, charge', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });
        await withMoneyCollect(page);

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openCoinTab(page);
        await page.click('.lbx-shop .shop-list-packs li[data-pack="coins-s"] .shop-pay');
        await expect(page.locator('#card-element iframe')).toBeVisible();
        await page.click('#mc-submit-btn');
        await expect(page.locator('.lbx-shop .shop-message-ok')).toBeVisible({ timeout: 15_000 });

        const calls = await page.evaluate(() => window.__mcStub.calls);

        expect(calls.map((call) => call.name))
                .toEqual(['init', 'elementInit', 'confirmPaymentMethod', 'confirmCharge']);
        // The client secret from the created payment is what ties the form to
        // the order; without it the form renders against nothing.
        expect(calls[1].params.params).toMatchObject({
            clientSecret: 'cs_stub_1',
            formWrapperId: 'card-element',
            errorWrapperId: 'card-errors',
            mode: 'test'
        });
        expect(calls[3].params).toMatchObject({
            payment_id: 'pay_stub_1',
            clientSecret: 'cs_stub_1'
        });
    });

    test('credits nothing when the payment is not confirmed', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });
        // The charge call succeeds; the out-of-band status says otherwise. The
        // status is the one that decides.
        await withMoneyCollect(page, { status: 'failed' });

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openCoinTab(page);
        await page.click('.lbx-shop .shop-list-packs li[data-pack="coins-s"] .shop-pay');
        await expect(page.locator('#card-element iframe')).toBeVisible();
        await page.click('#mc-submit-btn');

        await expect(page.locator('.lbx-shop .shop-message-error')).toBeVisible({ timeout: 15_000 });
        expect(await coins(page)).toBe(0);
        expect(await page.evaluate(() => window.BallAndWall.wallet.getOrders())).toEqual([]);
    });

    test('a declined card leaves the form open and charges nothing', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });
        await withMoneyCollect(page);

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await page.evaluate(() => {
            window.__mcStub = window.__mcStub || {};
            window.__mcStub.confirmChargeResult = {
                data: { code: 'fail', msg: 'Your card was declined.' }
            };
        });
        await openCoinTab(page);
        await page.click('.lbx-shop .shop-list-packs li[data-pack="coins-s"] .shop-pay');
        await expect(page.locator('#card-element iframe')).toBeVisible();
        await page.click('#mc-submit-btn');

        // Recoverable: another card can be tried without re-creating the order.
        await expect(page.locator('#mc-error-message')).toHaveText('Your card was declined.');
        await expect(page.locator('#mc-payment-container')).toBeVisible();
        await expect(page.locator('#mc-submit-btn')).toBeEnabled();
        expect(await coins(page)).toBe(0);
    });

    test('closing the form cancels rather than fails', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });
        await withMoneyCollect(page);

        await page.goto('/index_dev.html');
        await waitForBoot(page);
        await openCoinTab(page);
        await page.click('.lbx-shop .shop-list-packs li[data-pack="coins-s"] .shop-pay');
        await expect(page.locator('#card-element iframe')).toBeVisible();
        await page.click('#mc-close-btn');

        await expect(page.locator('.lbx-shop .shop-message')).toContainText(/cancel/i);
        expect(await coins(page)).toBe(0);
        // And the shop is buyable again -- a cancelled order must not wedge it.
        await expect(page.locator('.lbx-shop .shop-list-packs li[data-pack="coins-s"]'))
                .not.toHaveClass(/shop-disabled/);
    });

    test('takes its credentials from the git-ignored secrets file', async ({ page }) => {
        await prepare(page);
        // js/_config_secrets.js is the file that is not in the repository, and
        // the only one anyone should be pasting a key into. The shipped config
        // carries none, so this is the whole mechanism that turns MoneyCollect
        // on -- worth a test of its own, since a checkout cannot contain one.
        await page.route('**/js/_config_secrets.js', (route) => route.fulfill({
            status: 200,
            contentType: 'text/javascript; charset=utf-8',
            body: "var PAYMENT_SECRETS = { apiKey: 'pu_from_secrets',"
                + " secretKey: 'pr_from_secrets', orderEndpoint: '' };"
        }));

        await page.goto('/index_dev.html');
        await waitForBoot(page);

        expect(await page.evaluate(() => window.BallAndWall.payment.gateway.getProvider().name))
                .toBe('moneycollect');
        expect(await page.evaluate(() => window.PAYMENT.apiKey)).toBe('pu_from_secrets');
        // An empty field must not blank out what the config already had.
        expect(await page.evaluate(() => window.PAYMENT.serverUrl)).toContain('moneycollect.com');
    });

    test('falls back to the mock provider when nothing is configured', async ({ page }) => {
        await prepare(page, {}, { coins: 0, items: {}, orders: [] });

        await page.goto('/index_dev.html');
        await waitForBoot(page);

        // The shipped config carries no credentials, so the game still runs and
        // the shop still works without a payment account.
        expect(await page.evaluate(() => window.BallAndWall.payment.gateway.getProvider().name))
                .toBe('mock');
    });
});

for (const label of ['Pixel 7 landscape', 'iPhone 15 landscape', 'iPhone SE landscape']) {
    test.describe(`card form on ${label}`, () => {
        test.use(emulate(label));

        test('shows Pay now without scrolling', async ({ page }) => {
            await prepare(page, {}, { coins: 0, items: {}, orders: [] });

            const requests = await withMoneyCollect(page);

            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await openCoinTab(page);
            await page.click('.lbx-shop .shop-list-packs li[data-pack="coins-s"] .shop-pay');
            await expect(page.locator('#card-element iframe')).toBeVisible();
            await page.waitForTimeout(400);

            const box = await page.evaluate(() => {
                const dialog = document.getElementById('mc-payment-container');
                const button = document.getElementById('mc-submit-btn').getBoundingClientRect();
                const rect = dialog.getBoundingClientRect();

                return {
                    viewport: window.innerHeight,
                    dialog: { top: rect.top, bottom: rect.bottom },
                    button: { top: button.top, bottom: button.bottom },
                    // The dialog itself must never be the thing that scrolls:
                    // the button lives outside the scrolling area by design.
                    dialogScrolls: dialog.scrollHeight > dialog.clientHeight + 1,
                    frameRequested: Number(window.__mcStub.calls
                            .find((call) => call.name === 'elementInit')
                            .params.params.layout.style.frameMaxHeight)
                };
            });

            // The whole point: reachable where it is, not after a scroll.
            expect(Math.round(box.button.top), 'Pay now is above the viewport')
                    .toBeGreaterThanOrEqual(0);
            expect(Math.round(box.button.bottom), 'Pay now is below the fold')
                    .toBeLessThanOrEqual(box.viewport);
            expect(box.dialogScrolls, 'the dialog scrolls instead of its card area').toBe(false);
            expect(Math.round(box.dialog.top)).toBeGreaterThanOrEqual(0);
            expect(Math.round(box.dialog.bottom)).toBeLessThanOrEqual(box.viewport);
            // And the iframe was asked for a height this screen can afford,
            // rather than the provider's 320px default.
            expect(box.frameRequested).toBeLessThan(320);
            expect(requests.create).toHaveLength(1);
        });

        test('keeps Pay now visible after the viewport shrinks', async ({ page }) => {
            await prepare(page, {}, { coins: 0, items: {}, orders: [] });
            await withMoneyCollect(page);

            await page.goto('/index_dev.html');
            await waitForBoot(page);
            await openCoinTab(page);
            await page.click('.lbx-shop .shop-list-packs li[data-pack="coins-s"] .shop-pay');
            await expect(page.locator('#card-element iframe')).toBeVisible();

            // A browser toolbar appearing, or the device rotating: the iframe
            // cannot be re-initialised, but the column can give it less room.
            const size = page.viewportSize();

            await page.setViewportSize({ width: size.width, height: size.height - 80 });
            await page.waitForTimeout(400);

            const button = await page.locator('#mc-submit-btn').boundingBox();

            expect(Math.round(button.y + button.height))
                    .toBeLessThanOrEqual(size.height - 80);
        });
    });
}
