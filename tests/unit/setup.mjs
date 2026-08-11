/**
 * Preloaded before the unit tests (`node --import ./tests/unit/setup.mjs`).
 *
 * Does two things, both of which must happen before any game module evaluates:
 * installs the browser globals the modules expect to find already there, and
 * registers the resolution hook that swaps DOM-bound collaborators for stubs.
 */
import { register } from 'node:module';

/** The slice of jQuery the modules under test actually reach for. */
function makeJQuery() {
    // core/event-emitter.js wraps its listener array as `$(array).each(...)`,
    // which is jQuery's collection form and has nothing to do with the DOM.
    // Anything else -- a selector, an element -- means a module that needs the
    // browser slipped past the resolution hook, and should say so loudly.
    const $ = (value) => {
        if (Array.isArray(value)) {
            return {
                each(callback) {
                    value.forEach((item, index) => callback(index, item));

                    return this;
                },
                filter(predicate) {
                    return value.filter((item, index) => predicate(index, item));
                }
            };
        }

        throw new Error('$(selector) is unavailable in unit tests -- stub the module that needs the DOM.');
    };

    $.isArray = Array.isArray;

    $.isNumeric = (value) => (
        (typeof value === 'number' || typeof value === 'string')
            && !isNaN(value - parseFloat(value))
    );
    $.proxy = (fn, context) => fn.bind(context);
    $.each = (collection, callback) => {
        if (Array.isArray(collection)) {
            collection.forEach((value, index) => callback(index, value));
        } else {
            Object.keys(collection || {}).forEach((key) => callback(key, collection[key]));
        }

        return collection;
    };
    // jQuery's `$.extend(true, target, ...)` deep-merges; wallet.js relies on it
    // to clone its defaults without sharing the nested objects.
    const deepMerge = (target, source) => {
        Object.keys(source || {}).forEach((key) => {
            const value = source[key];

            if ($.isPlainObject(value)) {
                target[key] = deepMerge($.isPlainObject(target[key]) ? target[key] : {}, value);
            } else {
                target[key] = Array.isArray(value) ? value.slice() : value;
            }
        });

        return target;
    };

    $.extend = (target, ...sources) => {
        if (target === true) {
            const [real, ...rest] = sources;

            return rest.reduce(deepMerge, real);
        }

        return Object.assign(target, ...sources);
    };
    $.isPlainObject = (value) => (
        typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    $.map = (array, fn) => array.map(fn);

    return $;
}

/**
 * Constructors need identity only: the code branches on `instanceof` to decide
 * how to measure a display object, and never calls into CreateJS on these paths.
 */
function makeCreatejs() {
    function Bitmap(image) {
        this.image = image;
        this.x = 0;
        this.y = 0;
        this.visible = true;
    }
    function BitmapAnimation() {
        this.x = 0;
        this.y = 0;
        this.visible = true;
    }

    const tween = {
        to() { return tween; },
        call() { return tween; },
        wait() { return tween; }
    };

    return {
        Bitmap,
        BitmapAnimation,
        Container: function Container() { this.children = []; },
        Text: function Text() {},
        SpriteSheet: function SpriteSheet() {},
        Shadow: function Shadow() {},
        Shape: function Shape() {},
        Ticker: { getFPS: () => 60, getMeasuredFPS: () => 60 },
        Tween: { get: () => tween },
        Ease: { cubicInOut: 'cubicInOut' }
    };
}

globalThis.$ = makeJQuery();
globalThis.jQuery = globalThis.$;
globalThis.createjs = makeCreatejs();
// core/helper/app.js reads devicePixelRatio off it; tests set the value they need.
globalThis.window = { devicePixelRatio: 1, location: { href: 'http://localhost/' } };

// Node supplies its own read-only `navigator`; the modules that would read
// browser-only fields off it are stubbed, so it is left alone.

register('./loader.mjs', import.meta.url);
