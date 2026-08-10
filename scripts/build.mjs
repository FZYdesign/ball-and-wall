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
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
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
        sourcemap: true,
        target: ['es2017'],
        legalComments: 'none',
        logLevel: 'warning'
    });

    console.log(`js:   ${entry} -> dist/${outname} (${size(outfile)})`);
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
}

console.log(`css:  ${Object.keys(cssBundles).length} bundles -> dist/`);

// --- HTML -------------------------------------------------------------------
for (const [from, to] of Object.entries(htmlPages)) {
    const html = readFileSync(join(root, from), 'utf8');

    writeFileSync(join(root, to), resolveBuildBlocks(html));
    console.log(`html: ${from} -> ${relative(root, join(root, to))}`);
}

console.log('build: done');
