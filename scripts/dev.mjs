/**
 * Zero-dependency static server for local development.
 *
 * The game is plain AMD modules loaded by RequireJS from disk, so development
 * needs nothing more than correct MIME types and disabled caching -- there is no
 * transform step to run. Serving over HTTP (rather than opening file://) matters:
 * XHR module loading and canvas image reads are blocked on the file protocol.
 *
 *   npm run dev             -> http://localhost:8080/index_dev.html
 *   npm run dev -- --port 3000
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const port = Number(portArg !== -1 ? process.argv[portArg + 1] : process.env.PORT || 8080);

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

if (!existsSync(join(root, 'vendor'))) {
    console.error('vendor/ is missing. Run `npm install` (or `npm run vendor`) first.');
    process.exit(1);
}

createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // normalize() collapses "..", then the prefix check rejects anything that
    // still escaped the project directory.
    const target = normalize(join(root, requested === '/' ? '/index_dev.html' : requested));

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
        // Development only: always re-read from disk so edits show up on reload.
        'Cache-Control': 'no-store'
    });
    createReadStream(target).pipe(res);
}).listen(port, () => {
    console.log(`Ball And Wall dev server`);
    console.log(`  game:          http://localhost:${port}/index_dev.html`);
    console.log(`  levels editor: http://localhost:${port}/levels-editor_dev.html`);
});
