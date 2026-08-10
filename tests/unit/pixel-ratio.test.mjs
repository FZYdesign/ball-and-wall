/**
 * Every piece of geometry in the game is derived from helperApp.pixelRatio():
 * the canvas backing store, sprite frame sizes, block dimensions, speeds.
 *
 * It has to stay within the artwork that actually ships. Images exist at 1x and
 * @2x only, so on a 3x phone an uncapped ratio made the sprite maths describe a
 * sheet that does not exist -- 38*3 = 114px frames read out of a 76px-per-frame
 * @2x image, which yields zero frames, a null getBounds() and a TypeError on
 * every tick the moment a ball swept over an animated block.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import helperApp from '../../js/app/core/helper/app.js';

describe('pixelRatio', () => {
    beforeEach(() => {
        globalThis.window.devicePixelRatio = 1;
    });

    test('passes through a standard-density screen', () => {
        globalThis.window.devicePixelRatio = 1;

        assert.equal(helperApp.pixelRatio(), 1);
    });

    test('passes through a 2x screen, which has matching artwork', () => {
        globalThis.window.devicePixelRatio = 2;

        assert.equal(helperApp.pixelRatio(), 2);
    });

    test('caps a 3x phone at the largest artwork that ships', () => {
        globalThis.window.devicePixelRatio = 3;

        assert.equal(helperApp.pixelRatio(), 2);
    });

    test('caps the fractional ratios Android devices report', () => {
        // A Pixel 7 reports 2.625.
        globalThis.window.devicePixelRatio = 2.625;

        assert.equal(helperApp.pixelRatio(), 2);
    });

    test('falls back to 1 when the browser reports nothing', () => {
        delete globalThis.window.devicePixelRatio;

        assert.equal(helperApp.pixelRatio(), 1);
    });

    test('never exceeds the ratio the sprite sheets are cut for', () => {
        for (const dpr of [1, 1.5, 2, 2.625, 3, 4]) {
            globalThis.window.devicePixelRatio = dpr;

            const ratio = helperApp.pixelRatio();

            assert.ok(ratio <= 2, `dpr ${dpr} produced ${ratio}`);
            assert.ok(ratio > 0, `dpr ${dpr} produced ${ratio}`);
        }
    });
});
