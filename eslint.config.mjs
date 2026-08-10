/**
 * Replaces the original JSHint setup. The rule set is deliberately tuned to the
 * existing code style (4 spaces, `function` declarations, AMD) so that lint
 * failures mean "this is a bug", not "this is old". Style opinions that would
 * rewrite 15k lines of working game code are left off.
 */
import js from '@eslint/js';
import globals from 'globals';

/** Globals defined by js/_config_dev.js and js/_config_prod.js. */
const configGlobals = {
    API_ADDR: 'readonly',
    ENV: 'readonly',
    EPISODES: 'writable',
    FULLADDR: 'readonly',
    REVISION: 'readonly',
    SS: 'readonly',
    VERSION: 'readonly'
};

/** Globals provided by the vendored libraries loaded via <script>. */
const vendorGlobals = {
    $: 'readonly',
    chrome: 'readonly',
    createjs: 'readonly',
    define: 'readonly',
    jQuery: 'readonly',
    require: 'readonly'
};

export default [
    {
        ignores: [
            'dist/**',
            'vendor/**',
            'node_modules/**',
            'js/lib/**',
            'css/**',
            'test-results/**',
            'playwright-report/**'
        ]
    },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2017,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...configGlobals,
                ...vendorGlobals
            }
        },
        rules: {
            // Errors -- these catch real defects and must keep CI red.
            curly: 'error',
            'new-cap': ['error', { capIsNew: false }],
            'no-caller': 'error',
            'no-debugger': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-irregular-whitespace': 'error',
            'no-redeclare': 'error',
            'no-shadow-restricted-names': 'error',
            'no-use-before-define': ['error', { functions: false, classes: false }],
            // Feature detection here intentionally swallows exceptions.
            'no-empty': ['error', { allowEmptyCatch: true }],

            // Warnings -- pre-existing 2015 style. Flagged so new code can do
            // better, not errors, because mechanically rewriting `==` to `===`
            // across 15k lines of untested game logic risks changing behaviour
            // wherever the two operands are of different types.
            eqeqeq: ['warn', 'smart'],
            'no-console': 'warn',
            'no-prototype-builtins': 'warn',
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-useless-escape': 'warn'
        }
    },
    {
        // These files *declare* the configuration globals, so they must not also
        // receive them as predefined globals.
        files: ['js/_config_dev.js', 'js/_config_prod.js'],
        languageOptions: {
            globals: Object.fromEntries(
                Object.keys(configGlobals).map((name) => [name, 'off'])
            )
        }
    },
    {
        files: ['scripts/**/*.mjs', 'eslint.config.mjs', 'playwright.config.mjs'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.node
        },
        rules: {
            'no-console': 'off'
        }
    },
    {
        // Specs run in Node but their page.evaluate() callbacks are serialised and
        // executed in the browser, so both global sets are legitimately in scope.
        files: ['tests/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
                require: 'readonly'
            }
        },
        rules: {
            'no-console': 'off',
            // Rest-destructuring is the idiomatic way to drop a key; the named
            // binding it leaves behind is deliberately unused.
            'no-unused-vars': ['error', { ignoreRestSiblings: true }]
        }
    }
];
