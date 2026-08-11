/**
 * The environment-file parser.
 *
 * This is the file that decides which payment account a build charges against,
 * so the failure that matters is a quiet one: a key that does not make it
 * through, or an empty value written out as an empty string and overriding a
 * working default with nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEnv, ENV_FILES } from '../../scripts/env.mjs';

test('environment files', async (t) => {
    await t.test('reads plain key/value lines', () => {
        assert.deepEqual(
            parseEnv('PAYMENT_MODE=test\nPAYMENT_API_KEY=pu_123'),
            { PAYMENT_MODE: 'test', PAYMENT_API_KEY: 'pu_123' }
        );
    });

    await t.test('ignores comments and blank lines', () => {
        assert.deepEqual(
            parseEnv('# a comment\n\n  # indented\nA=1\n'),
            { A: '1' }
        );
    });

    await t.test('keeps the whole value when it contains "="', () => {
        // A URL with a query string, which is what an order endpoint may be.
        assert.deepEqual(
            parseEnv('PAYMENT_ORDER_ENDPOINT=https://x.test/pay?a=1&b=2'),
            { PAYMENT_ORDER_ENDPOINT: 'https://x.test/pay?a=1&b=2' }
        );
    });

    await t.test('strips surrounding quotes but nothing inside them', () => {
        assert.deepEqual(
            parseEnv(`A="quoted"\nB='single'\nC=has "quotes" inside`),
            { A: 'quoted', B: 'single', C: 'has "quotes" inside' }
        );
    });

    await t.test('trims the whitespace around both halves', () => {
        assert.deepEqual(parseEnv('  A =  1  '), { A: '1' });
    });

    await t.test('keeps an empty value empty', () => {
        // Empty means "leave the default alone", and writeSecrets() drops it.
        // Turning it into anything else would override a working host with
        // nothing at all.
        assert.deepEqual(parseEnv('PAYMENT_SECRET_KEY='), { PAYMENT_SECRET_KEY: '' });
    });

    await t.test('skips a line with no assignment rather than guessing', () => {
        assert.deepEqual(parseEnv('NOT_AN_ASSIGNMENT\nA=1'), { A: '1' });
    });

    await t.test('names one file per environment the commands know about', () => {
        assert.deepEqual(Object.keys(ENV_FILES).sort(), ['dev', 'prod']);
    });
});
