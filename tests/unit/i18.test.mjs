/**
 * Translation tables.
 *
 * The interesting property is completeness. `i18.setLanguage` extends one flat
 * table over the strings already loaded, so a key a translation forgot does not
 * fall back to English -- it reads as `undefined` on screen. That is invisible
 * until someone switches language, which is exactly when nobody is looking.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import enUs from '../../js/app/i18/languages/en-us.js';
import pl from '../../js/app/i18/languages/pl.js';
import zhCn from '../../js/app/i18/languages/zh-cn.js';
import i18 from '../../js/app/i18/i18.js';

const TRANSLATIONS = { pl, 'zh-cn': zhCn };

test('translations', async (t) => {
    for (const [code, table] of Object.entries(TRANSLATIONS)) {
        await t.test(`${code} translates every key`, () => {
            const missing = Object.keys(enUs).filter((key) => !(key in table));

            assert.deepEqual(missing, [], `${code} is missing: ${missing.join(', ')}`);
        });

        await t.test(`${code} has no keys the game never asks for`, () => {
            const extra = Object.keys(table).filter((key) => !(key in enUs));

            assert.deepEqual(extra, [], `${code} has stale keys: ${extra.join(', ')}`);
        });

        await t.test(`${code} keeps the placeholders it was given`, () => {
            // '{price}', '{coins}' and friends are substituted by the caller;
            // a translation that drops or renames one prints the braces.
            const placeholders = (value) => (
                typeof value === 'string' ? (value.match(/\{[a-z]+\}/g) || []).sort() : []
            );

            for (const [key, value] of Object.entries(enUs)) {
                assert.deepEqual(
                    placeholders(table[key]),
                    placeholders(value),
                    `${code} "${key}" changed its placeholders`
                );
            }
        });

        await t.test(`${code} keeps the list keys as lists`, () => {
            for (const [key, value] of Object.entries(enUs)) {
                if (Array.isArray(value)) {
                    assert.ok(Array.isArray(table[key]), `${code} "${key}" must stay an array`);
                    assert.equal(table[key].length, value.length, `${code} "${key}" length`);
                }
            }
        });
    }
});

test('language resolution', async (t) => {
    await t.test('resolves the codes a browser actually reports', () => {
        // navigator.language gives a region tag; a zh-TW reader is better
        // served by Simplified than by falling through to English.
        assert.equal(i18.resolve('zh'), 'zh-cn');
        assert.equal(i18.resolve('zh-TW'), 'zh-cn');
        assert.equal(i18.resolve('zh-hk'), 'zh-cn');
        assert.equal(i18.resolve('zh-cn'), 'zh-cn');
        assert.equal(i18.resolve('en-us'), 'en-us');
        assert.equal(i18.resolve('pl'), 'pl');
    });

    await t.test('reports an unknown code rather than guessing', () => {
        assert.equal(i18.resolve('de'), null);
        assert.equal(i18.resolve(''), null);
        assert.equal(i18.resolve(undefined), null);
        assert.equal(i18.exists('de'), false);
        assert.equal(i18.exists('zh-tw'), true);
    });

    await t.test('an unknown language still leaves the game readable', () => {
        i18.setLanguage('de');

        assert.equal(i18.getLanguageCode(), 'en-us');
        assert.equal(i18._('shop-header'), enUs['shop-header']);
    });

    await t.test('an alias applies the table it resolved to', () => {
        i18.setLanguage('zh-TW');

        // Stored resolved, so the options window marks the right radio.
        assert.equal(i18.getLanguageCode(), 'zh-cn');
        assert.equal(i18._('shop-header'), zhCn['shop-header']);
    });
});
