/**
 * The wallet is the only place in the game where a number stands for money the
 * player either earned or paid for, so its arithmetic is the part that must not
 * be wrong: a debit that goes through when it should not is a free item, and a
 * purchase that debits without delivering is a player who paid for nothing.
 *
 * The real module runs; only core/_.js is stubbed (tests/unit/stubs/core.mjs),
 * which is what keeps localStorage out of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import wallet from '../../js/app/wallet.js';
import catalog from '../../js/app/shop/catalog.js';
import rewards from '../../js/app/shop/rewards.js';

/** The stored state loads on a promise, so let it settle before asserting. */
async function fresh() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    wallet.reset();
}

test('wallet', async (t) => {
    await t.test('credits and debits', async () => {
        await fresh();
        const start = wallet.getCoins();

        wallet.credit(100, 'test');
        assert.equal(wallet.getCoins(), start + 100);

        assert.equal(wallet.debit(40, 'test'), true);
        assert.equal(wallet.getCoins(), start + 60);
    });

    await t.test('refuses a debit it cannot cover, and changes nothing', async () => {
        await fresh();
        const start = wallet.getCoins();

        assert.equal(wallet.debit(start + 1, 'test'), false);
        assert.equal(wallet.getCoins(), start);
    });

    await t.test('a debit for exactly the balance goes through', async () => {
        await fresh();

        assert.equal(wallet.debit(wallet.getCoins(), 'test'), true);
        assert.equal(wallet.getCoins(), 0);
    });

    await t.test('ignores a negative credit rather than debiting through it', async () => {
        await fresh();
        const start = wallet.getCoins();

        wallet.credit(-500, 'test');
        assert.equal(wallet.getCoins(), start);
    });

    await t.test('buying an item pays for it and delivers it', async () => {
        await fresh();
        const item = catalog.getItem('grow-paddle');
        const start = wallet.getCoins();

        assert.equal(wallet.buyItem(item), true);
        assert.equal(wallet.getCoins(), start - item.price);
        assert.equal(wallet.getItemCount(item.id), 1);
    });

    await t.test('an unaffordable item is neither charged for nor delivered', async () => {
        await fresh();
        const item = catalog.getItem('shield');

        wallet.debit(wallet.getCoins(), 'empty it');

        assert.equal(wallet.buyItem(item), false);
        assert.equal(wallet.getCoins(), 0);
        assert.equal(wallet.getItemCount(item.id), 0);
    });

    await t.test('an item can only be used as often as it is owned', async () => {
        await fresh();
        wallet.addItem('laser', 2);

        assert.equal(wallet.useItem('laser'), true);
        assert.equal(wallet.useItem('laser'), true);
        assert.equal(wallet.useItem('laser'), false);
        assert.equal(wallet.getItemCount('laser'), 0);
    });

    await t.test('getItems reports only what is actually owned', async () => {
        await fresh();
        wallet.addItem('laser', 1);
        wallet.useItem('laser');

        assert.deepEqual(wallet.getItems(), {});
    });

    await t.test('a server balance overrides the local one', async () => {
        await fresh();
        wallet.setServerState({ coins: 4242, items: { shield: 3 } });

        assert.equal(wallet.getCoins(), 4242);
        assert.equal(wallet.getItemCount('shield'), 3);
    });
});

test('round rewards', async (t) => {
    await t.test('pay more for a better round', () => {
        const scrappy = rewards.calculate({ score: 200, lives: 1, round: 1 });
        const clean = rewards.calculate({ score: 900, lives: 3, round: 1 });

        assert.ok(clean > scrappy);
    });

    await t.test('always pay something', () => {
        assert.ok(rewards.calculate({ score: 0, lives: 0, round: 1 }) > 0);
        assert.ok(rewards.calculate({}) > 0);
    });

    await t.test('the later-round bonus is capped', () => {
        const early = rewards.calculate({ score: 0, lives: 0, round: 30 });
        const late = rewards.calculate({ score: 0, lives: 0, round: 300 });

        assert.equal(early, late);
    });

    await t.test('granting credits exactly what it calculated', async () => {
        await fresh();
        const stats = { score: 500, lives: 2, round: 4 };
        const start = wallet.getCoins();
        const granted = rewards.grant(stats);

        assert.equal(granted, rewards.calculate(stats));
        assert.equal(wallet.getCoins(), start + granted);
    });
});

test('catalog', async (t) => {
    await t.test('a pack is worth its coins plus its bonus', () => {
        const pack = catalog.getPack('coins-m');

        assert.equal(catalog.getPackCoins(pack), pack.coins + pack.bonus);
    });

    await t.test('prices are formatted from minor units', () => {
        assert.equal(catalog.formatPrice({ amountMinor: 99, currency: 'USD' }), '$0.99');
        assert.equal(catalog.formatPrice({ amountMinor: 1999, currency: 'USD' }), '$19.99');
        assert.equal(catalog.formatPrice({ amountMinor: 500, currency: 'USD' }), '$5');
    });

    await t.test('no pack is priced below the minimum charge', () => {
        // A charge smaller than this is refused by the provider, or settles for
        // less than it cost to take.
        catalog.getPacks().forEach((pack) => {
            assert.ok(
                pack.amountMinor >= catalog.getMinimumAmount(),
                `${pack.id} is priced below the minimum charge`
            );
        });
    });

    await t.test('every pack is priced in the same currency', () => {
        // The gateway sends one currency per order and the wallet credits one
        // kind of coin; a mixed catalogue would price the shop in two units.
        const currencies = new Set(catalog.getPacks().map((pack) => pack.currency));

        assert.deepEqual([...currencies], ['USD']);
    });

    await t.test('a bigger pack is never worse value', () => {
        // What the "best value" tag claims. Coins per unit of money must not
        // fall as the packs get bigger.
        const rates = catalog.getPacks().map(
            (pack) => catalog.getPackCoins(pack) / pack.amountMinor
        );

        rates.forEach((rate, index) => {
            if (index) {
                assert.ok(rate > rates[index - 1], `pack ${index} is worse value than the one below`);
            }
        });
    });

    await t.test('every item the shop sells has an effect powerups can apply', () => {
        // shop/powerups.js switches on these ids; a typo in either list would
        // otherwise be a bought item that silently does nothing.
        const applicable = [
            'extra-life', 'grow-paddle', 'glue-paddle', 'laser',
            'multi-ball', 'steel-ball', 'shield'
        ];

        catalog.getItems().forEach((item) => {
            assert.ok(applicable.includes(item.id), item.id + ' has no effect');
            assert.ok(item.price > 0, item.id + ' is free');
        });
    });
});
