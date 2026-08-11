/**
 * Serves the *built* pages, the way a deployment would, for a last look before
 * shipping.
 *
 *   npm run build && npm run preview   -> http://localhost:8081/index.html
 *   npm run preview -- --port 3000
 *   npm run preview -- --build         rebuilds first
 *
 * This is not the dev server with a different index. Two things are deliberately
 * different, and both are the point:
 *
 * - **Caching is real.** `dist/*` is served immutable with a year-long lifetime,
 *   the pages with `no-cache`. That is the arrangement content hashing exists to
 *   make safe, and previewing without it would not exercise it. If a rebuild
 *   changes something and the preview still shows the old version, the hashing
 *   is broken -- which is exactly what you want to find out here.
 * - **It checks the build before serving it.** A page referencing an artifact no
 *   longer in dist/ is the failure mode hashing introduces: rebuild, forget to
 *   redeploy a page, and every asset 404s. Serving that silently would defeat
 *   the purpose of looking.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, portFromArgs, root } from './static-server.mjs';

const PAGES = ['index.html', 'levels-editor.html'];
const YEAR = 60 * 60 * 24 * 365;

/**
 * Artifacts no page links to because the code builds their path at runtime:
 * the font sheet (core/helper/font.js, chosen from the browser) and the
 * per-episode sheet (preloader.js, chosen from the episode). Both resolve
 * through the map in the generated config -- see core/helper/asset.js.
 *
 * Anything else in dist/ that no page references is genuinely unused, and the
 * report says so rather than lumping the two together.
 */
const RUNTIME_RESOLVED = [/^dist\/fonts(-chrome)?\.[0-9a-f]{8}\.css$/, /^dist\/episodes\//];

if (process.argv.includes('--build')) {
    const built = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
        stdio: 'inherit'
    });

    if (built.status !== 0) {
        process.exit(built.status || 1);
    }
    console.log('');
}

/**
 * Every local file a page links to or loads with a script tag.
 *
 * @param {string} html
 * @return {string[]} repo-relative paths
 */
function references(html) {
    return [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
            .map((match) => match[1])
            .filter((href) => !/^(https?:)?\/\/|^data:|^#/.test(href));
}

/**
 * @param {string} dir absolute
 * @return {string[]} repo-relative paths
 */
function filesIn(dir) {
    if (!existsSync(dir)) {
        return [];
    }

    return readdirSync(dir).flatMap((name) => {
        const target = join(dir, name);

        return statSync(target).isDirectory()
            ? filesIn(target)
            : [relative(root, target).split(sep).join('/')];
    });
}

/**
 * @param {string} path absolute
 * @return {string}
 */
function size(path) {
    return `${(statSync(path).size / 1024).toFixed(1)} kB`;
}

const missingPages = PAGES.filter((page) => !existsSync(join(root, page)));

if (missingPages.length) {
    console.error(`Not built: ${missingPages.join(', ')} is missing. Run \`npm run build\`.`);
    process.exit(1);
}

const referenced = new Set();
const missing = [];

for (const page of PAGES) {
    for (const href of references(readFileSync(join(root, page), 'utf8'))) {
        referenced.add(href);

        if (!existsSync(join(root, href))) {
            missing.push(`${page} -> ${href}`);
        }
    }
}

if (missing.length) {
    console.error('The built pages reference files that are not there:\n');
    missing.forEach((line) => console.error(`  ${line}`));
    console.error('\nThe pages are stale. Run `npm run build`.');
    process.exit(1);
}

// Not fatal, but worth seeing before a deploy: source maps and the manifest are
// build metadata rather than page assets, so they are excluded outright.
const unreferenced = filesIn(join(root, 'dist'))
        .filter((path) => !referenced.has(path))
        .filter((path) => !path.endsWith('.map') && !path.endsWith('manifest.json'));
const runtime = unreferenced.filter((path) => RUNTIME_RESOLVED.some((rule) => rule.test(path)));
const unused = unreferenced.filter((path) => !runtime.includes(path));

console.log('Build check');

for (const page of PAGES) {
    console.log(`  ${page}`);

    for (const href of references(readFileSync(join(root, page), 'utf8'))) {
        if (href.startsWith('dist/')) {
            console.log(`    ${href}  (${size(join(root, href))})`);
        }
    }
}
if (runtime.length) {
    console.log('  resolved at runtime (no page links to these by design)');
    runtime.forEach((path) => console.log(`    ${path}`));
}
if (unused.length) {
    console.log('  unused -- nothing references these, they need not be deployed');
    unused.forEach((path) => console.log(`    ${path}`));
}

const port = portFromArgs(8081);

serve({
    port,
    indexPage: 'index.html',
    /**
     * What a deployment should send. Hashed artifacts can be cached forever
     * because their name changes when they do; the pages that point at them
     * must not be, or a deploy is invisible.
     *
     * @param {string} path repo-relative
     * @return {string}
     */
    cacheControl(path) {
        if (path.startsWith('dist/')) {
            return `public, max-age=${YEAR}, immutable`;
        }
        if (path.endsWith('.html')) {
            return 'no-cache';
        }

        // Images, sounds, fonts and vendor/ are not hashed, so they get a short
        // lifetime rather than a permanent one. See the known gaps in CLAUDE.md.
        return 'public, max-age=3600';
    },
    onListen() {
        console.log('\nBall And Wall preview (production build, production caching)');
        console.log(`  game:          http://localhost:${port}/index.html`);
        console.log(`  levels editor: http://localhost:${port}/levels-editor.html`);
    }
});
