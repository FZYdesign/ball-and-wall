/**
 * Copies the browser-facing files of our npm dependencies into `vendor/`.
 *
 * The game is loaded straight from disk by a static server (no bundler in dev),
 * so it needs stable, predictable URLs. `vendor/` is that stable surface:
 * `node_modules/` layouts change between releases, `vendor/` does not.
 *
 * `vendor/` is generated and git-ignored. Run `npm run vendor` after changing a
 * dependency; `npm install` runs it automatically via `postinstall`.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = join(root, 'vendor');

/**
 * Each entry lists candidate source paths (relative to the package root); the
 * first one that exists wins. Candidates make the copy survive upstream
 * repackaging without pinning us to one release's directory layout.
 */
const assets = [
    {
        pkg: 'jquery',
        candidates: ['dist/jquery.min.js'],
        dest: 'jquery/jquery.min.js'
    },
    {
        pkg: 'q',
        candidates: ['q.js'],
        dest: 'q/q.js'
    },
    {
        pkg: 'js-md5',
        candidates: ['build/md5.min.js', 'src/md5.js'],
        dest: 'js-md5/md5.min.js'
    },
    {
        pkg: 'fancyselect',
        candidates: ['script.js'],
        dest: 'fancyselect/fancySelect.js'
    },
    {
        pkg: 'fancyselect',
        candidates: ['style.css'],
        dest: 'fancyselect/fancySelect.css'
    }
];

/**
 * Resolves a package's root directory without requiring it to have a valid
 * `main` entry point (several of these are browser globals, not CommonJS).
 */
function packageRoot(pkg) {
    return dirname(require.resolve(`${pkg}/package.json`));
}

rmSync(vendorDir, { recursive: true, force: true });

let copied = 0;

for (const asset of assets) {
    const base = packageRoot(asset.pkg);
    const source = asset.candidates
            .map((candidate) => join(base, candidate))
            .find((candidate) => existsSync(candidate));

    if (!source) {
        throw new Error(
            `Cannot vendor "${asset.dest}": none of [${asset.candidates.join(', ')}] ` +
            `exist in ${asset.pkg}. Check whether the package layout changed.`
        );
    }
    const target = join(vendorDir, asset.dest);

    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied += 1;
}

console.log(`vendor: copied ${copied} files into vendor/`);
