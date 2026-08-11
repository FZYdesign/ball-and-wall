/**
 * Production build. Bundles the ES modules with esbuild and rewrites the
 * development pages into their production counterparts.
 *
 *   js/index.js         -> dist/index.js         (+ .map)
 *   js/levels-editor.js -> dist/levels-editor.js (+ .map)
 *   css/*               -> dist/*.css
 *   *_dev.html          -> *.html                (build blocks resolved)
 */
import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import writeSecrets, { ensureEnvFiles, targetFromArgs } from './env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

const banner =
    '/*!\n' +
    ' * Copyright (c) Budnix.\n' +
    ' * Licensed under the MIT license.\n' +
    ' * https://github.com/budnix/ball-and-wall\n' +
    ' *\n' +
    ` * Date: ${new Date().toISOString().slice(0, 10)}\n` +
    ' */\n';

/** Stylesheet bundles, mirroring the media-query split used by the HTML. */
const cssBundles = {
    'fonts.css': ['css/fonts.css'],
    'fonts-chrome.css': ['css/fonts-chrome.css'],
    'common.css': ['css/gumby.css', 'css/common.css', 'css/import.css'],
    '1280.css': ['css/1280.css'],
    '1280-wide.css': ['css/1280-wide.css'],
    '1024.css': ['css/1024.css'],
    '1024-wide.css': ['css/1024-wide.css'],
    '800.css': ['css/800.css'],
    '800-wide.css': ['css/800-wide.css'],
    '640.css': ['css/640.css'],
    '640-wide.css': ['css/640-wide.css'],
    '480.css': ['css/480.css'],
    'iphone5-landscape.css': ['css/iphone5-landscape.css'],
    'iphone5-portrait.css': ['css/iphone5-portrait.css'],
    'ipad.css': ['css/ipad.css'],
    'ipad-retina.css': ['css/ipad-retina.css'],
    'levels-editor.css': ['css/levels-editor.css']
};

/**
 * Per-episode stylesheets, which preloader.js loads by name at runtime rather
 * than through a build block. Discovered rather than listed, so adding an
 * episode does not mean remembering to add it here too. They keep their
 * directory: the url()s inside are written relative to css/episodes/, and
 * dist/episodes/ is the same depth from the repo root.
 */
for (const file of readdirSync(join(root, 'css/episodes')).filter((n) => n.endsWith('.css'))) {
    cssBundles[`episodes/${file}`] = [`css/episodes/${file}`];
}

/**
 * `npm run build -- --no-obfuscate` produces a readable bundle with source maps.
 * For reproducing a production bug locally, not for shipping.
 */
const obfuscate = !process.argv.includes('--no-obfuscate');

/**
 * How the shipped JavaScript is obfuscated.
 *
 * Two things this is *not*. It is not a security boundary: everything here runs
 * in the player's browser and anything the browser can execute, a determined
 * person can read. And it does not protect the payment secret -- only moving
 * that to a server does (`orderEndpoint`; see the payments section of
 * CLAUDE.md). What it does is raise the cost of casual tampering, which for a
 * game with a client-side wallet is the realistic threat: someone opening the
 * console to call `wallet.credit()` or to hand themselves items.
 *
 * The options are chosen against a 60fps canvas game, which rules out most of
 * what the tool offers:
 *
 * - `controlFlowFlattening` and `deadCodeInjection` are the two features that
 *   actually frustrate a reader, and both are off. They cost a documented
 *   1.5x/2x in run time and up to 4x in size. The frame loop runs sixteen
 *   collision sweeps a tick; that budget does not exist.
 * - `debugProtection` is off. It fights devtools, which breaks legitimate
 *   support work far more reliably than it stops anyone.
 * - `renameGlobals` is off and must stay off: `_config_prod.js` and
 *   `_config_secrets.js` declare globals (`EPISODES`, `PAYMENT`, `ASSETS`,
 *   `PAYMENT_SECRETS`) that the bundle reads by name across file boundaries.
 * - Property names survive, so `window.BallAndWall.wallet.getCoins()` still
 *   works -- which is what the end-to-end suite drives the game through.
 *
 * What is left is identifier mangling plus a rotated, base64-encoded string
 * array, which is what makes a bundle unreadable at a glance and un-greppable
 * for things like `credit` or `live_pr_`.
 *
 * `stringArrayWrappers` is off here and on for the credential files below.
 * Measured on this bundle, gzipped: 77 kB plain, 113 kB with the string array,
 * 168 kB once the wrappers are added. The wrappers buy one more hop between a
 * call site and the array -- not 55 kB worth on a file every player downloads.
 * On a 4 kB config file the same setting costs nothing, so it is used there.
 */
const OBFUSCATOR_OPTIONS = {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'mangled',
    numbersToExpressions: false,
    renameGlobals: false,
    // Breaks the code if it is beautified, which is the first thing anyone
    // poking at a bundle does.
    selfDefending: true,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.8,
    stringArrayWrappersCount: 0,
    target: 'browser',
    transformObjectKeys: false,
    unicodeEscapeSequence: false
};

/**
 * Where a build block's target ends up once it has been hashed, keyed by the
 * path exactly as the development HTML writes it. Filled in as artifacts are
 * emitted; `resolveBuildBlocks` reads it when rewriting the pages.
 *
 * @type {Object<string, string>}
 */
const manifest = {};

/**
 * Content hash for a cache-busting filename.
 *
 * The banner is stripped first because it carries the build date: hashing it
 * would give every artifact a new name once a day whether or not anything
 * changed, which is the opposite of what a content hash is for.
 *
 * @param {string} contents
 * @return {string} 8 hex characters
 */
function hash(contents) {
    const body = contents.startsWith(banner) ? contents.slice(banner.length) : contents;

    return createHash('sha256').update(body).digest('hex').slice(0, 8);
}

/**
 * The extra indirection, for files small enough that its cost does not matter.
 * Used on the generated config and credentials, not on the game bundles.
 */
const OBFUSCATOR_OPTIONS_SMALL = {
    ...OBFUSCATOR_OPTIONS,
    stringArrayIndexShift: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersType: 'function'
};

/**
 * Obfuscates a file in place, if this build is obfuscating at all.
 *
 * The seed is derived from the file's own contents rather than left to chance.
 * The tool randomises string-array order on every run, so an unseeded build
 * would emit different bytes -- and therefore a different content hash -- from
 * identical sources, which would have every deploy invalidate every cache for
 * nothing. Same input, same output, same filename.
 *
 * @param {string} outfile absolute
 * @param {boolean} [small] apply the heavier settings a small file can afford
 */
function obfuscateFile(outfile, small = false) {
    if (!obfuscate) {
        return;
    }
    const contents = readFileSync(outfile, 'utf8');
    const body = contents.startsWith(banner) ? contents.slice(banner.length) : contents;
    const result = JavaScriptObfuscator.obfuscate(body, {
        ...(small ? OBFUSCATOR_OPTIONS_SMALL : OBFUSCATOR_OPTIONS),
        seed: parseInt(createHash('sha256').update(body).digest('hex').slice(0, 8), 16)
    });

    // Re-prepended because the obfuscator strips comments, and the licence
    // header is the one comment that has to survive.
    writeFileSync(outfile, banner + result.getObfuscatedCode());
}

/**
 * Renames an emitted file to carry its content hash, and records the move.
 *
 * Long-lived caching only works if a changed file arrives under a name the
 * browser has never seen. The pages themselves stay unhashed -- they are the
 * entry points, and are what a deployment serves with a short cache lifetime.
 *
 * @param {string} outfile absolute path to the emitted file
 * @param {string} key the path the HTML refers to it by
 * @return {string} the new dist-relative path
 */
function fingerprint(outfile, key) {
    const contents = readFileSync(outfile, 'utf8');
    const name = basename(outfile);
    const dot = name.indexOf('.');
    const hashed = `${name.slice(0, dot)}.${hash(contents)}${name.slice(dot)}`;
    // Renamed in place, not flattened into dist/: the episode stylesheets carry
    // url()s written relative to their own directory, and dist/episodes/ is the
    // only place those still resolve.
    const target = join(dirname(outfile), hashed);

    renameSync(outfile, target);
    manifest[key] = relative(root, target).split(sep).join('/');

    return hashed;
}

/**
 * Moves a bundle's source map alongside its hashed bundle.
 *
 * esbuild writes `//# sourceMappingURL=<name>.map` while the bundle still has
 * its unhashed name, so both the comment and the map's own `file` field have to
 * be pointed at the new one or devtools quietly loses the sources.
 *
 * @param {string} outfile absolute path the bundle was emitted to
 * @param {string} hashed the bundle's hashed basename
 */
function fingerprintSourceMap(outfile, hashed) {
    const from = `${outfile}.map`;
    const to = join(dirname(outfile), `${hashed}.map`);
    const bundle = join(dirname(outfile), hashed);
    const map = JSON.parse(readFileSync(from, 'utf8'));

    map.file = hashed;
    writeFileSync(to, JSON.stringify(map));
    rmSync(from, { force: true });
    writeFileSync(
        bundle,
        readFileSync(bundle, 'utf8').replace(
            /\/\/# sourceMappingURL=\S+/,
            `//# sourceMappingURL=${hashed}.map`
        )
    );
}

/** Page entry points; each becomes a self-contained bundle. */
const jsEntries = {
    'js/index.js': 'index.js',
    'js/levels-editor.js': 'levels-editor.js'
};

const htmlPages = {
    'index_dev.html': 'index.html',
    'levels-editor_dev.html': 'levels-editor.html'
};

/**
 * Resolves `<!-- build:js|css target --> ... <!-- /build -->` blocks into a
 * single tag pointing at the built artifact.
 *
 * @param {string} html
 * @return {string}
 */
function resolveBuildBlocks(html) {
    return html.replace(
        /[ \t]*<!--\s*build:(js|css)\s+(\S+)\s*-->[\s\S]*?<!--\s*\/build\s*-->/g,
        (match, type, target) => {
            // Every emitted artifact is hashed; a target with no entry is a
            // block referring to something this build did not produce, which is
            // a mistake worth failing on rather than silently linking to a 404.
            const href = manifest[target];

            if (!href) {
                throw new Error(
                    `Build block references "${target}", which no build step emitted.`
                );
            }

            return type === 'js'
                ? `    <script src="${href}"></script>`
                : `    <link rel="stylesheet" href="${href}">`;
        }
    );
}

/**
 * Expands `@import url(x.css) <media>;` into `@media <media> { ...x.css... }`.
 *
 * css/import.css is concatenated *after* the base rules so its breakpoint
 * overrides win the cascade, but CSS only honours `@import` at the top of a
 * file -- so left alone, every responsive stylesheet is dropped from the
 * production build. Rewriting the imports into `@media` blocks in place is what
 * keeps both the validity and the cascade order.
 *
 * @param {string} css
 * @param {string} baseDir directory the import paths are relative to
 * @return {string}
 */
function inlineImports(css, baseDir) {
    return css.replace(
        /@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)\s*([^;]*);/g,
        (match, href, media) => {
            // Remote imports cannot be inlined; leave them exactly as written.
            // (css/gumby.css carries one, commented out, for a Google font.)
            if (/^(https?:)?\/\//.test(href) || href.startsWith('data:')) {
                return match;
            }
            const target = join(baseDir, href);
            const contents = readFileSync(target, 'utf8');

            if (/@import/.test(contents)) {
                throw new Error(`Nested @import in ${href} is not supported by the build.`);
            }
            const query = media.trim();

            return query ? `@media ${query} {\n${contents}\n}` : contents;
        }
    );
}

/**
 * @param {string} path absolute
 * @return {string} e.g. "42.1 kB"
 */
function size(path) {
    return `${(statSync(path).size / 1000).toFixed(1)} kB`;
}

// Credentials come from the environment file for the target being built, and
// the pages reference the generated file unconditionally -- an empty one is a
// valid answer, a missing one is a 404. `--env dev` builds against .env.dev.
ensureEnvFiles();
const envFile = writeSecrets(targetFromArgs('prod'));

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// --- JavaScript -------------------------------------------------------------
// esbuild follows the import graph itself, so an unresolved specifier is a build
// error rather than something to hand-check. Each page gets its own bundle
// containing exactly what it reaches.
for (const [entry, outname] of Object.entries(jsEntries)) {
    const outfile = join(distDir, outname);

    await build({
        entryPoints: [join(root, entry)],
        outfile,
        bundle: true,
        format: 'iife',
        banner: { js: banner },
        minify: true,
        // A source map ships the original sources, which would hand back
        // everything the obfuscator just took away. Emitted only for the
        // readable build.
        sourcemap: !obfuscate,
        target: ['es2017'],
        legalComments: 'none',
        logLevel: 'warning'
    });

    obfuscateFile(outfile);

    const hashed = fingerprint(outfile, `dist/${outname}`);

    if (!obfuscate) {
        fingerprintSourceMap(outfile, hashed);
    }
    console.log(`js:   ${entry} -> dist/${hashed} (${size(join(distDir, hashed))})`);
}


// --- CSS --------------------------------------------------------------------
for (const [name, inputs] of Object.entries(cssBundles)) {
    const missing = inputs.filter((input) => {
        try {
            statSync(join(root, input));

            return false;
        } catch {
            return true;
        }
    });

    if (missing.length) {
        throw new Error(`CSS bundle "${name}" references missing files: ${missing.join(', ')}`);
    }
    const outfile = join(distDir, name);

    mkdirSync(dirname(outfile), { recursive: true });

    const contents = inputs
            .map((input) => inlineImports(readFileSync(join(root, input), 'utf8'), join(root, 'css')))
            .join('\n');

    await build({
        stdin: {
            contents,
            loader: 'css',
            sourcefile: name,
            resolveDir: join(root, 'css')
        },
        outfile,
        // Imports are already expanded above; bundling here would only try to
        // rewrite url() targets into dist/.
        bundle: false,
        minify: true,
        banner: { css: banner },
        legalComments: 'none',
        logLevel: 'warning'
    });

    // A local @import surviving into the output means the browser will ignore it
    // (it is no longer the first rule) and those styles are silently lost.
    const emitted = readFileSync(outfile, 'utf8');
    const survivors = [...emitted.matchAll(/@import\s+url\(\s*['"]?([^'")]+)/g)]
            .map((match) => match[1])
            .filter((href) => !/^(https?:)?\/\//.test(href) && !href.startsWith('data:'));

    if (survivors.length) {
        throw new Error(
            `dist/${name} still contains un-inlined @import: ${survivors.join(', ')}.\n` +
            'Those rules would be dropped by the browser.'
        );
    }
    // Episode sheets are asked for at runtime by their source path, so that is
    // the key the lookup below will be given.
    fingerprint(outfile, name.startsWith('episodes/') ? `css/${name}` : `dist/${name}`);
}

console.log(`css:  ${Object.keys(cssBundles).length} bundles -> dist/`);


// The globals file is loaded as-is rather than bundled -- it has to run before
// the bundle to define VERSION, EPISODES and the payment configuration -- so it
// is copied into dist to be hashed with everything else. Left where it is, an
// edit to it would be served from cache.
//
// It also carries the manifest, because two stylesheets are asked for by name
// at runtime rather than through a build block -- the font sheet and the
// per-episode one -- and a hashed file is unreachable unless something can map
// the name to it. Emitted last, so the map is complete. See core/helper/asset.js.
{
    const outfile = join(distDir, 'config.js');
    const source = readFileSync(join(root, 'js/_config_prod.js'), 'utf8').trimEnd();

    writeFileSync(outfile, `${source}\n\nvar ASSETS = ${JSON.stringify(manifest, null, 4)};\n`);
    obfuscateFile(outfile, true);

    const hashed = fingerprint(outfile, 'js/_config_prod.js');

    console.log(`js:   js/_config_prod.js -> dist/${hashed}`);
}

// Credentials, likewise loaded before the bundle. Copied rather than inlined
// into the config so the two stay separable: this one is the file that is not
// in the repository.
{
    const outfile = join(distDir, 'secrets.js');

    writeFileSync(outfile, readFileSync(join(root, 'js/_config_secrets.js'), 'utf8'));
    // Worth obfuscating for its own sake: the API keys stop being greppable.
    // That is a speed bump, not protection -- see the payments section of
    // CLAUDE.md for the only arrangement that keeps a secret secret.
    obfuscateFile(outfile, true);

    const hashed = fingerprint(outfile, 'js/_config_secrets.js');

    console.log(`js:   js/_config_secrets.js -> dist/${hashed}`);
}

// --- HTML -------------------------------------------------------------------
for (const [from, to] of Object.entries(htmlPages)) {
    const html = readFileSync(join(root, from), 'utf8');

    writeFileSync(join(root, to), resolveBuildBlocks(html));
    console.log(`html: ${from} -> ${relative(root, join(root, to))}`);
}

// A deployment needs to know which hashed file is which -- to preload, to purge
// a CDN, or to serve dist/* with a far-future cache lifetime while the pages
// themselves stay short-lived.
writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`build: ${envFile}`);
console.log(obfuscate
    ? 'build: done (obfuscated; --no-obfuscate for a readable build with source maps)'
    : 'build: done (readable, with source maps -- not for shipping)');
