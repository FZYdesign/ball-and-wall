# ball-and-wall

Ball And Wall - Arkanoid style game

## Demo

Demo available at http://budnix.github.io/ball-and-wall/ and extended version using this code at http://ballandwall.com.

## Requirements

Node.js 20 or newer (see `.nvmrc`). Nothing else — Bower is no longer used.

## Install

```sh
git clone https://github.com/budnix/ball-and-wall.git
cd ball-and-wall
npm install
```

`npm install` also copies the browser-facing files of the dependencies into
`vendor/`, which is what the pages load. Re-run it with `npm run vendor` if you
change a dependency. It also creates `js/_config_secrets.js` from
`.env.dev` and `.env.prod` from `.env.example` — see [Payments](#payments).

## Develop

```sh
npm run dev
```

Then open http://localhost:8080/index_dev.html (or
http://localhost:8080/levels-editor_dev.html for the level editor). The `_dev.html`
pages load the ES modules natively from disk, so a reload is enough to pick up an
edit — there is no bundler, watcher or rebuild step in development.

Serving over HTTP matters: opening the files directly with `file://` breaks module
loading and canvas image access.

## Preview the build

```sh
npm run build
npm run preview
```

Then open http://localhost:8081/index.html. This serves the *built* pages with
the cache headers a deployment should use — `dist/*` immutable for a year, the
pages `no-cache` — so the content hashing is actually exercised. It also checks
the build first and refuses to start if the pages reference anything missing,
and prints the bundle sizes and any artifact nothing references.

`npm run preview -- --build` rebuilds first; `--port N` changes the port.

The build obfuscates the JavaScript and emits no source maps. That raises the
cost of casual tampering — the wallet lives in the browser — but it is not a
security boundary, and it does not protect a payment secret. Use
`npm run build -- --no-obfuscate` for a readable bundle with source maps when
reproducing a production bug.

## Languages

English (`en-us`), Simplified Chinese (`zh-cn`) and Polish (`pl`), switchable in
the options window and picked from the browser on first run. `zh`, `zh-TW` and
`zh-HK` all resolve to Simplified Chinese.

Adding one: a table in `js/app/i18/languages/`, an entry in `LANGUAGES` in
`js/app/i18/i18.js`, a `lang-full-name:<code>` string, and an option in
`Options.prototype.languages`. It has to translate every key —
`npm run test:unit` fails on a missing one, because a key with no translation
prints as `undefined` rather than falling back to English.

## Payments

The shop can take real money through MoneyCollect. Out of the box it does not:
`js/_config_secrets.js` ships empty and the game falls back to a mock payment
provider, so everything runs — and the tests pass — with no account.

To turn it on, fill in the environment files. Both are git-ignored and created
for you by `npm install` (or `npm run env`) from the committed `.env.example`:

```sh
.env.dev     # read by `npm run dev`
.env.prod    # read by `npm run build`
```

```ini
PAYMENT_MODE=test
PAYMENT_SDK_URL=https://test-static.moneycollect.com/jssdk/js/MoneyCollect.min.js
PAYMENT_SERVER_URL=https://test-api.moneycollect.com/api/services/v1/payment
PAYMENT_API_KEY=test_pu_…
PAYMENT_SECRET_KEY=            # see below -- prefer leaving this empty
PAYMENT_ORDER_ENDPOINT=        # your server, if you have one
```

Switching between the test and production accounts is a matter of which command
you run; `--env dev|prod` overrides that, and `$BAW_ENV` does too.
`js/_config_secrets.js` is generated from whichever file applies — do not edit
it by hand.

**A secret key in an env file is still public.** It is loaded by the browser and
served from `dist/` in production, so anyone who opens the page can read it, and
a MoneyCollect secret key can create charges and issue refunds. Git-ignoring the
files keeps them out of the repository; it does not keep them secret. Set
`PAYMENT_ORDER_ENDPOINT` to a server of yours that holds the key and proxies
MoneyCollect's create and status calls, and no secret needs to ship at all.

## Build

```sh
npm run build
```

Produces `dist/` (minified JS bundle with a source map, and the CSS bundles) and
regenerates the production `index.html` and `levels-editor.html` from their
`_dev.html` counterparts. Those two generated files are committed; do not edit them
by hand.

## Lint

```sh
npm run lint       # report
npm run lint:fix   # apply the auto-fixable subset
```

Errors are real defects and fail CI. Warnings are pre-existing 2015-era style
(mostly `==` vs `===`) that is left alone deliberately — see `CLAUDE.md`.

## Test

```sh
npm run test:unit    # collision geometry and ball physics, in Node
npm run e2e          # Playwright suite (headless)
npm run e2e:headed   # watch it run in a browser
npm run e2e:ui       # Playwright UI mode
npm run e2e:report   # open the last HTML report
```

The unit tests need nothing but Node. The end-to-end suite drives a real browser
through boot, a round of gameplay, mobile layout and touch input across emulated
phones and tablets, the level editor, and the built production page — it uses the
installed Google Chrome; if you do not have it, `npx playwright install chrome`.

`npm test` runs lint, unit tests, build and the browser suite together.

## Mobile

The play field scales to fit the viewport while keeping its 798x462 aspect ratio,
so phones and tablets get the whole field rather than a slice of it. On a phone
the dashboard is hidden so the field gets the full screen, and slides in from the
button in the top-left corner when you want the score and time — which pauses the
round, clock included, until you close it again. Input runs on
Pointer Events, so mouse, touch and pen all take the same path. The field is
landscape, so portrait phones are prompted to rotate.

Desktop layout is unchanged: the field is never scaled above 1:1.

## Episodes

Game has 2 episodes called space and pegasus. Space assets (images) were made by me and they are totally FREE.
Pegasus images were bought from http://graphicriver.net/item/platformer-game-tile-set/3677579 so if you want use
this images you must pay for it's license.

## Architecture

See [CLAUDE.md](CLAUDE.md) for the module layout, the level string format, how to
add an episode, and the constraints to keep in mind when changing the game code.

## License

[MIT License](http://opensource.org/licenses/MIT)
