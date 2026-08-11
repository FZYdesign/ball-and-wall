/**
 * The zero-dependency static server behind both `npm run dev` and
 * `npm run preview`.
 *
 * They differ in exactly two things -- which page `/` lands on, and what
 * `Cache-Control` says -- and those differences matter enough to be explicit.
 * Development must never cache, or an edit does not show up on reload. Preview
 * must cache the way a deployment would, or it is not previewing the thing that
 * will be shipped.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
    '.css': 'text/css; charset=utf-8',
    '.cur': 'image/x-icon',
    '.eot': 'application/vnd.ms-fontobject',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

/**
 * The port to listen on: `--port N`, then $PORT, then the default.
 *
 * @param {number} fallback
 * @return {number}
 */
export function portFromArgs(fallback) {
    const flag = process.argv.indexOf('--port');

    return Number(flag !== -1 ? process.argv[flag + 1] : process.env.PORT || fallback);
}

/**
 * @param {Object} options
 * @param {number} options.port
 * @param {string} options.indexPage served for "/"
 * @param {function(string): string} options.cacheControl given a repo-relative path
 * @param {function(): void} [options.onListen]
 * @return {import('node:http').Server}
 */
export function serve({ port, indexPage, cacheControl, onListen }) {
    return createServer((req, res) => {
        const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        // normalize() collapses "..", then the prefix check rejects anything
        // that still escaped the project directory.
        const target = normalize(join(root, requested === '/' ? `/${indexPage}` : requested));

        if (target !== root && !target.startsWith(root + sep)) {
            res.writeHead(403).end('Forbidden');

            return;
        }
        if (!existsSync(target) || statSync(target).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');

            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': cacheControl(target.slice(root.length + 1))
        });
        createReadStream(target).pipe(res);
    }).listen(port, onListen);
}
