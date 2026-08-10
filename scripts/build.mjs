/**
 * Production build. Replaces the original Grunt pipeline
 * (concat + uglify + cssmin + processhtml + clean) with esbuild.
 *
 *   js/app/**  -> dist/output.min.js  (+ .map)
 *   css/*      -> dist/*.css
 *   *_dev.html -> *.html              (build blocks resolved)
 *
 * Every module under js/app declares a *named* AMD module -- `define('app/x', ...)` --
 * so RequireJS resolves them out of the single concatenated bundle and the
 * concatenation order does not affect correctness. That is why the source list is
 * globbed rather than hand-maintained: the old Grunt list had drifted from the
 * files on disk and silently referenced a file that no longer existed.
 */
import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const htmlPages = {
    'index_dev.html': 'index.html',
    'levels-editor_dev.html': 'levels-editor.html'
};

/**
 * @param {string} dir
 * @param {string} [ext]
 * @return {string[]} absolute paths, sorted for reproducible output
 */
function walk(dir, ext = '.js') {
    return readdirSync(dir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))
            .flatMap((entry) => {
                const full = join(dir, entry.name);

                if (entry.isDirectory()) {
                    return walk(full, ext);
                }

                return entry.name.endsWith(ext) ? [full] : [];
            });
}

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
        (match, type, target) => (
            type === 'js'
                ? `    <script src="${target}"></script>`
                : `    <link rel="stylesheet" href="${target}">`
        )
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

/** Module ids resolved through require.config paths rather than the bundle. */
const externalModules = new Set(['q', 'md5', 'fancyselect', 'require', 'exports', 'module']);

/**
 * Fails the build if a `define()` dependency has no matching `define('id', ...)`
 * anywhere in the bundle.
 *
 * RequireJS resolves a missing id by fetching `js/<id>.js` over the network,
 * which in a production build means a silent 404 and a game that stops loading
 * with no error at the point of the mistake. Checking it here turns a typo in a
 * new module id into an immediate build failure.
 *
 * Dependencies assembled at runtime (`'app/episodes/' + name + '/blocks'` in
 * app/episodes/episode.js) cannot be checked statically and are not covered.
 *
 * @param {string} source concatenated bundle source
 */
function assertModulesResolve(source) {
    const defined = new Set(
        [...source.matchAll(/define\(\s*'([^']+)'/g)].map((match) => match[1])
    );
    const required = new Set();

    for (const call of source.matchAll(/define\(\s*'[^']+'\s*,\s*\[([^\]]*)\]/g)) {
        for (const dep of call[1].matchAll(/'([^']+)'/g)) {
            required.add(dep[1]);
        }
    }
    const missing = [...required]
            .filter((id) => !defined.has(id) && !externalModules.has(id))
            .sort();

    if (missing.length) {
        throw new Error(
            `Unresolved AMD module id(s): ${missing.join(', ')}.\n` +
            'Either the module is not defined under js/app, or the id is misspelled.'
        );
    }

    return { defined: defined.size, required: required.size };
}

/**
 * @param {string} path absolute
 * @return {string} e.g. "42.1 kB"
 */
function size(path) {
    return `${(statSync(path).size / 1000).toFixed(1)} kB`;
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// --- JavaScript -------------------------------------------------------------
const sources = walk(join(root, 'js', 'app'));

if (!sources.length) {
    throw new Error('No sources found under js/app -- refusing to emit an empty bundle.');
}

const jsOut = join(distDir, 'output.min.js');
const jsSource = sources.map((file) => readFileSync(file, 'utf8')).join('\n');
const modules = assertModulesResolve(jsSource);

await build({
    stdin: {
        contents: jsSource,
        loader: 'js',
        sourcefile: 'js/app/*.js',
        resolveDir: root
    },
    outfile: jsOut,
    banner: { js: banner },
    minify: true,
    sourcemap: true,
    target: ['es2017'],
    legalComments: 'none',
    logLevel: 'warning'
});

console.log(
    `js:   ${sources.length} files, ${modules.defined} AMD modules, ` +
    `${modules.required} deps resolved -> dist/output.min.js (${size(jsOut)})`
);

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
}

console.log(`css:  ${Object.keys(cssBundles).length} bundles -> dist/`);

// --- HTML -------------------------------------------------------------------
for (const [from, to] of Object.entries(htmlPages)) {
    const html = readFileSync(join(root, from), 'utf8');

    writeFileSync(join(root, to), resolveBuildBlocks(html));
    console.log(`html: ${from} -> ${relative(root, join(root, to))}`);
}

console.log('build: done');
