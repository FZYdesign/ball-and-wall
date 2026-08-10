/**
 * Node module-resolution hook that swaps heavyweight collaborators for stubs.
 *
 * Under AMD the modules handed their dependencies to a factory, so a test could
 * simply pass different ones. ES modules resolve imports themselves, so the
 * substitution has to happen at resolution time instead -- this hook is the ESM
 * equivalent of that injection point.
 *
 * Only the modules that touch the DOM, localStorage or CreateJS at *module
 * scope* are replaced. Everything under test -- core/math.js, entity/ball.js,
 * entity/_base.js, core/event-emitter.js -- is the real source.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolvePath(here, '..', '..');

/** Real module path (from the repo root) -> stub file, both relative. */
const SUBSTITUTIONS = {
    'js/app/stage.js': 'tests/unit/stubs/stage.mjs',
    'js/app/sound.js': 'tests/unit/stubs/sound.mjs',
    'js/app/preloader.js': 'tests/unit/stubs/preloader.mjs',
    'js/app/dashboard.js': 'tests/unit/stubs/dashboard.mjs',
    'js/app/game-options.js': 'tests/unit/stubs/game-options.mjs',
    'js/app/core/_.js': 'tests/unit/stubs/core.mjs',
    'js/app/input/_.js': 'tests/unit/stubs/input.mjs',
    'js/app/episodes/_.js': 'tests/unit/stubs/episodes.mjs',
    'js/app/entity/tail.js': 'tests/unit/stubs/noop-entity.mjs',
    'js/app/entity/explosion.js': 'tests/unit/stubs/noop-entity.mjs'
};

const substitutions = new Map(
    Object.entries(SUBSTITUTIONS).map(([from, to]) => [
        pathToFileURL(resolvePath(root, from)).href,
        pathToFileURL(resolvePath(root, to)).href
    ])
);

export async function resolve(specifier, context, nextResolve) {
    const resolved = await nextResolve(specifier, context);
    const replacement = substitutions.get(resolved.url.split('?')[0]);

    if (replacement) {
        return { ...resolved, url: replacement, shortCircuit: true };
    }

    return resolved;
}
