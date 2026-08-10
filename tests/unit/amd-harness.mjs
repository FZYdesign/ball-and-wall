/**
 * Loads the game's AMD modules into Node so their logic can be unit tested
 * without a browser.
 *
 * The modules take every collaborator through their `define()` dependency list,
 * which makes them straightforward to isolate: register a stub under a module id
 * and the real source runs against it. The source itself is never modified or
 * re-implemented here -- these tests exercise the shipped code.
 *
 * A missing stub is an error rather than `undefined`, so a new dependency shows
 * up as "you need to decide what this should be", not as a confusing crash
 * somewhere further in.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The slice of jQuery the game modules reach for at definition and call time.
 */
function makeJQuery() {
    const $ = () => {
        throw new Error('$(selector) is not available in unit tests -- stub the module that needs the DOM.');
    };

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
    $.extend = (target, ...sources) => Object.assign(target, ...sources);
    $.isPlainObject = (value) => (
        typeof value === 'object' && value !== null && !Array.isArray(value)
    );

    return $;
}

/**
 * Constructors only need identity: the code branches on `instanceof` to decide
 * how to read a display object's size, and never calls into CreateJS itself in
 * the paths under test.
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
    function Container() {
        this.children = [];
    }
    function Text() {}
    function SpriteSheet() {}

    const tween = {
        to() { return tween; },
        call() { return tween; },
        wait() { return tween; }
    };

    return {
        Bitmap,
        BitmapAnimation,
        Container,
        Text,
        SpriteSheet,
        Ticker: { getFPS: () => 60, getMeasuredFPS: () => 60 },
        Tween: { get: () => tween },
        Ease: { cubicInOut: 'cubicInOut' },
        Shadow: function Shadow() {},
        Shape: function Shape() {}
    };
}

/**
 * @param {Object} [mocks] module id -> stub
 * @return {{load: Function, registry: Object, createjs: Object, $: Function}}
 */
export function createLoader(mocks = {}) {
    const registry = { ...mocks };
    const globals = {
        $: makeJQuery(),
        createjs: makeCreatejs(),
        window: { navigator: { userAgent: 'node' }, devicePixelRatio: 1 },
        navigator: { userAgent: 'node', maxTouchPoints: 0 },
        document: {}
    };

    /**
     * @param {string} relativePath path from the repository root
     * @return {*} the module's export
     */
    function load(relativePath) {
        const source = readFileSync(join(root, relativePath), 'utf8');
        let exported;

        const define = (id, deps, factory) => {
            const resolved = deps.map((depId) => {
                if (!(depId in registry)) {
                    throw new Error(
                        `${relativePath} depends on "${depId}", which has no stub.\n` +
                        'Add one to the mocks passed to createLoader().'
                    );
                }

                return registry[depId];
            });

            exported = factory(...resolved);
            registry[id] = exported;
        };

        const names = Object.keys(globals);
        // The module bodies are a single top-level define() call, so evaluating
        // them with the globals as parameters is enough -- no vm context needed.
        const evaluate = new Function('define', ...names, source);

        evaluate(define, ...names.map((name) => globals[name]));

        return exported;
    }

    return { load, registry, ...globals };
}

/**
 * A duck-typed collision participant. `core/math.js` only ever asks an entity
 * for these six accessors, which is what makes it testable in isolation.
 *
 * @param {{x: number, y: number, width: number, height: number}} box
 * @return {Object}
 */
export function makeEntity({ x, y, width, height }) {
    return {
        getX: () => x,
        getY: () => y,
        getWidth: () => width,
        getHeight: () => height,
        getHalfWidth: () => width / 2,
        getHalfHeight: () => height / 2
    };
}
