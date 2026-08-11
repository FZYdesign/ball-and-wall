/**
 * Environment files, and the generated credentials file the pages load.
 *
 * `js/_config_secrets.js` used to be hand-edited, with the production block
 * commented out -- so switching environments meant editing a file and
 * remembering to edit it back. Now it is *generated*: `.env.dev` and `.env.prod`
 * hold the values, the command decides which one is read, and nothing is
 * commented in or out by hand.
 *
 *   npm run dev      -> .env.dev
 *   npm run build    -> .env.prod
 *   ... -- --env dev|prod   or  BAW_ENV=dev   overrides either
 *
 * ## This does not make anything secret
 *
 * The values end up in a file the browser loads, and in production in `dist/`.
 * Environment files keep credentials out of the repository and out of each
 * other's way; they do not hide them from anyone who opens the page. The only
 * arrangement that keeps a secret key secret is `PAYMENT_ORDER_ENDPOINT` --
 * see the payments section of CLAUDE.md.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Which file each target reads. */
export const ENV_FILES = {
    dev: '.env.dev',
    prod: '.env.prod'
};

const EXAMPLE = join(root, '.env.example');
const GENERATED = join(root, 'js/_config_secrets.js');

/**
 * Environment variable -> the `PAYMENT` field it overrides.
 *
 * Everything is optional. An empty value is left out entirely rather than
 * written as an empty string, so the defaults in js/_config_dev.js and
 * js/_config_prod.js still apply -- which is what lets the game run, and the
 * test suite pass, with no environment file filled in at all.
 *
 * The dotted names build the nested `billing` object; a flat file cannot
 * express one, and inventing a syntax for it would be worse than five keys.
 */
const FIELDS = {
    PAYMENT_PROVIDER: 'provider',
    PAYMENT_MODE: 'mode',
    PAYMENT_SDK_URL: 'sdkUrl',
    PAYMENT_SERVER_URL: 'serverUrl',
    PAYMENT_API_KEY: 'apiKey',
    PAYMENT_SECRET_KEY: 'secretKey',
    PAYMENT_ORDER_ENDPOINT: 'orderEndpoint',
    PAYMENT_NOTIFY_URL: 'notifyUrl',
    PAYMENT_DESCRIPTION: 'description',
    PAYMENT_BILLING_EMAIL: 'billing.email',
    PAYMENT_BILLING_FIRST_NAME: 'billing.firstName',
    PAYMENT_BILLING_LAST_NAME: 'billing.lastName',
    PAYMENT_BILLING_PHONE: 'billing.phone',
    PAYMENT_BILLING_COUNTRY: 'billing.address.country',
    PAYMENT_BILLING_STATE: 'billing.address.state',
    PAYMENT_BILLING_CITY: 'billing.address.city',
    PAYMENT_BILLING_LINE1: 'billing.address.line1',
    PAYMENT_BILLING_LINE2: 'billing.address.line2',
    PAYMENT_BILLING_POSTAL_CODE: 'billing.address.postalCode'
};

/**
 * `KEY=value` per line, `#` comments, optional surrounding quotes.
 *
 * Deliberately not dotenv: this reads two files at build time and adding a
 * dependency to parse nineteen lines is not a trade worth making.
 *
 * @param {string} text
 * @return {Object<string, string>}
 */
export function parseEnv(text) {
    const values = {};

    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const split = trimmed.indexOf('=');

        if (split === -1) {
            continue;
        }
        const key = trimmed.slice(0, split).trim();
        const value = trimmed.slice(split + 1).trim();

        values[key] = value.replace(/^(['"])(.*)\1$/, '$2');
    }

    return values;
}

/**
 * `--env <target>`, then $BAW_ENV, then the caller's default.
 *
 * @param {string} fallback
 * @return {string}
 */
export function targetFromArgs(fallback) {
    const flag = process.argv.indexOf('--env');
    const target = flag !== -1 ? process.argv[flag + 1] : process.env.BAW_ENV || fallback;

    if (!ENV_FILES[target]) {
        console.error(`Unknown environment "${target}". Use one of: ${Object.keys(ENV_FILES).join(', ')}.`);
        process.exit(1);
    }

    return target;
}

/**
 * Seeds any missing environment file from the committed example.
 *
 * Both are git-ignored, so a fresh checkout has neither, and the pages load the
 * generated file unconditionally -- an empty one is a valid answer, a missing
 * one is a 404.
 *
 * @return {string[]} the files that had to be created
 */
export function ensureEnvFiles() {
    const created = [];

    for (const file of Object.values(ENV_FILES)) {
        const target = join(root, file);

        if (!existsSync(target)) {
            copyFileSync(EXAMPLE, target);
            created.push(file);
        }
    }

    return created;
}

/**
 * @param {Object} target
 * @param {string} path dotted
 * @param {string} value
 */
function assign(target, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    let node = target;

    for (const key of keys) {
        node[key] = node[key] || {};
        node = node[key];
    }
    node[last] = value;
}

/**
 * Generates js/_config_secrets.js from an environment file.
 *
 * @param {string} target `dev` or `prod`
 * @param {boolean} [quiet]
 * @return {string} the env file it read
 */
export default function writeSecrets(target, quiet = false) {
    const file = ENV_FILES[target];
    const path = join(root, file);
    const values = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
    const secrets = {};

    // Insertion order follows FIELDS, not the file, so the generated output --
    // and therefore the content hash the build gives it -- depends only on the
    // values, never on how the file happens to be arranged.
    for (const [variable, field] of Object.entries(FIELDS)) {
        if (values[variable]) {
            assign(secrets, field, values[variable]);
        }
    }
    writeFileSync(GENERATED, [
        '/*',
        ' * GENERATED by scripts/env.mjs -- do not edit.',
        ` * Source: ${file}. Regenerated by \`npm run dev\` and \`npm run build\`.`,
        ' *',
        ' * Loaded by the browser, so nothing here is secret; see .env.example.',
        ' */',
        `var PAYMENT_SECRETS = ${JSON.stringify(secrets, null, 4)};`,
        ''
    ].join('\n'));

    if (!quiet) {
        const configured = Object.keys(secrets).length;

        console.log(`env:  ${file} -> js/_config_secrets.js (${configured} field${configured === 1 ? '' : 's'})`);
    }

    return file;
}

// Only when run directly, so importing this from the build stays side-effect
// free until the build actually asks.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    ensureEnvFiles().forEach((file) => console.log(`env:  created ${file} from .env.example`));
    writeSecrets(targetFromArgs('dev'));
}
