import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds dist/ before the suite runs.
 *
 * This deliberately does not live in `webServer.command`: with
 * `reuseExistingServer` the command is skipped whenever a dev server is already
 * up, so the production specs would silently assert against a stale bundle and
 * pass no matter what the build does.
 */
export default function globalSetup() {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}
