/**
 * Zero-dependency static server for local development.
 *
 * The game is ES modules loaded natively from disk, so development needs
 * nothing more than correct MIME types and disabled caching -- there is no
 * transform step to run. Serving over HTTP (rather than opening file://) matters:
 * module loading and canvas image reads are blocked on the file protocol.
 *
 *   npm run dev             -> http://localhost:8080/index_dev.html
 *   npm run dev -- --port 3000
 *
 * For the *built* pages, use `npm run preview` instead.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import writeSecrets, { ensureEnvFiles, targetFromArgs } from './env.mjs';
import { serve, portFromArgs, root } from './static-server.mjs';

// index_dev.html loads the generated credentials with a plain script tag, so a
// checkout without one would 404 on every page load. Regenerated on every start
// rather than only when missing: editing .env.dev should take effect on the
// next restart without anyone remembering a separate command.
ensureEnvFiles();
writeSecrets(targetFromArgs('dev'));

const port = portFromArgs(8080);

if (!existsSync(join(root, 'vendor'))) {
    console.error('vendor/ is missing. Run `npm install` (or `npm run vendor`) first.');
    process.exit(1);
}

serve({
    port,
    indexPage: 'index_dev.html',
    // Development only: always re-read from disk so edits show up on reload.
    cacheControl: () => 'no-store',
    onListen() {
        console.log('Ball And Wall dev server');
        console.log(`  game:          http://localhost:${port}/index_dev.html`);
        console.log(`  levels editor: http://localhost:${port}/levels-editor_dev.html`);
    }
});
