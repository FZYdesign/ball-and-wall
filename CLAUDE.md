# Ball And Wall — developer guide

Arkanoid-style HTML5 canvas game. Originally written in 2015 against Bower + Grunt;
the toolchain was modernised in 2026 while the game code was deliberately left intact.

## Commands

```sh
npm install       # installs deps and syncs vendor/ (postinstall)
npm run dev       # static server -> http://localhost:8080/index_dev.html
npm run build     # dist/ bundles (obfuscated) + regenerates the HTML pages
npm run preview   # checks and serves the build -> http://localhost:8081/index.html
npm run guide     # redraws the first-run tour's dashboard diagram
npm run lint      # ESLint
npm run test:unit # collision geometry and ball physics, in Node
npm run e2e       # Playwright end-to-end suite
npm test          # lint + unit + build + e2e
```

`npm run dev -- --port 3000` changes the port; so does `npm run preview -- --port`.
`npm run preview -- --build` rebuilds first.
`npm run build -- --no-obfuscate` produces a readable bundle with source maps,
for reproducing a production bug locally. `--env dev|prod` picks the environment
file a command reads; `npm run dev` defaults to `.env.dev` and `npm run build`
to `.env.prod`.
`npm run e2e:headed` watches the browser; `npm run e2e:ui` opens the Playwright UI.

Open `index_dev.html` while developing: the browser loads the ES modules straight
from disk, so a reload picks up an edit with no build step. `index.html` is
**generated** by `npm run build` — never edit it by hand; edit `index_dev.html`
instead. The same applies to `levels-editor.html`.

## Architecture

The game is ~99 ES modules. Development loads them natively
(`<script type="module">`) with no bundler and no transform; `npm run build` hands
the entry points to esbuild, which follows the import graph and emits one bundle
per page.

Most modules `export default` a **singleton** (the file ends with `new X()`). The
exceptions export constructors: `app/game`, `app/entity/_base`,
`app/entities/_base`, `app/window/_base`, `app/core/builder`. Where a test needs
the constructor behind a singleton, `instance.constructor` reaches it.

There are no dependency cycles. Several modules import each other only to call
methods later -- `stage` and `levels`, `entities/balls` and `entity/ball` -- which
live bindings handle, because nothing dereferences an import while the modules are
still evaluating.

```
js/
  index.js               entry point: language, episode from #hash, boots app/Game
  _config_dev.js         globals: SS, API_ADDR, VERSION, REVISION, EPISODES, ENV
  browser-lang.js        shared language detection for the entry points
  lib/                   vendored CreateJS/SoundJS (not on npm)
  app/
    game.js              orchestrator: owns windows, wires all events, drives update()
    stage.js             CreateJS stage wrapper, parallax backgrounds, earthquake fx
    levels.js            parses a level string into blocks
    preloader.js         per-episode asset loading via createjs.LoadQueue
    facade.js            full-screen overlay text ("Round 1", "Game over")
    game-options.js      persisted settings, emits change:<key>
    wallet.js            coin balance + consumable inventory, own storage key
    coin-hud.js          the balance readout, top-right of the viewport
    item-bar.js          the strip of bought items beside the field
    sound.js  dashboard.js  levels-editor.js
    core/                framework-ish helpers: EventEmitter, mediator, math,
                         storage (localStorage / chrome.storage), browser + app
                         detection, DOM builder, tab
    entity/              a single game object (ball, paddle, bullet, bonus, block,
                         particle, tail, explosion, score, cloud)
    entities/            the collection managing many of one entity type
    dashboard/           score / lives / round / speed / time / shop widgets,
                         drawn on a second canvas (#a-game-dashboard)
    window/              modal dialogs built as DOM (not canvas)
    input/               keyboard + pointer
    shop/                catalog (items + coin packs), the effects an item
                         applies, and what clearing a round pays out
    payment/             the gateway the shop buys through, its providers
                         (MoneyCollect, and a mock), and the card-form modal
    episodes/            per-episode content: blocks, bonuses, levels, manifest,
                         resources, splash-screen
    i18/                 en-us, zh-cn and pl string tables
```

### Frame loop

`createjs.Ticker` calls `Game.prototype.update`, which updates each entity
collection and finally `stage.update()`. Update order matters — paddles before
balls, blocks last. FPS comes from `gameOptions.get('fps')`.

### Coordinate systems

Three different pixel spaces are in play, and mixing them up is the single most
common source of bugs here:

| Space | What it is | Where it appears |
| --- | --- | --- |
| **stage** | canvas backing store, `798 x 462 x devicePixelRatio` | all game geometry, `stage.getWidth()`, `input.pointer.x/y` |
| **CSS** | the element's on-screen size | `getBoundingClientRect()`, event `clientX/clientY` |
| **authored** | the fixed `798 x 462` field | levels, sprite offsets, the breakpoint stylesheets |

`input/pointer.js` converts client coordinates to **stage** pixels once, so
consumers never scale anything themselves. On a phone the two spaces differ by up
to 3x (device pixel ratio times the fit-to-viewport factor); when the pointer
still reported CSS pixels, the paddle could only reach the first third of the
field on a retina screen.

### Mobile

`stage.fit()` scales the play field to the viewport with one CSS transform on
`#a-game-canvases`, never above 1:1. Anything wide enough for the original layout
is untouched, so desktop renders exactly as it always did.

Uniform scaling, rather than the per-breakpoint reflow the 2015 stylesheets do,
is what keeps the dashboard canvas — absolutely positioned against the 798px
field — glued to the field at every size. Because the two approaches conflict,
`#a-game-wrapper.a-scaled` in `css/common.css` neutralises the breakpoint offsets
for the canvas area (`800-wide.css` adds 89px of top padding, for instance).

**On a scaled layout the dashboard is hidden, and slides in on demand.** Its
artwork is opaque edge to edge across the full 417×214 canvas, so keeping it on
screen either covers bricks or costs the field the width it needs. Hidden, the
field gets the entire viewport.

The mechanism is deliberately simple: the dashboard is parked at `left: -417px`,
just outside the wrapper, whose `overflow: hidden` clips it. Showing it is a
`translateX` of its own width, which the CSS transition animates. It also gets
`pointer-events: none` while parked, because clipping does not reliably stop a
clipped element swallowing taps.

`#a-hud-toggle` drives it. The button is `position: fixed` in the top-left, which
on a landscape phone lands in the letterbox margin beside the field — the field
is height-constrained there, so that margin exists on every phone and the button
never covers play area. `stage.fit()` puts `a-scaled-layout` on the body, and the
toggle is only displayed under that class.

A viewport large enough to render at 1:1 keeps the original composition, where
the dashboard is always on screen and the toggle is hidden.

Because the panel covers the field, a round cannot continue behind it.
`showDashboard()` emits `hud:visibility` on the mediator and `game.js` decides
what that means: `holdRound()` pauses the ticker **and** stops the clock. Those
are two separate things — the timer in `dashboard/time.js` is a plain
`setInterval`, so pausing the ticker alone would leave it counting and quietly
inflate the player's time. `start()` with no argument resumes rather than
resetting. The shop window goes through the same `holdRound()`, for the same
reason: it covers the field too.

Two consequences worth keeping in mind when touching this:

- Starting a round goes through `resumeForNewRound()`, which closes the panel
  and the shop and force-unpauses. A round must never begin behind either, or
  frozen.
- Returning to the tab must not resume a round that is being held, so the focus
  and visibility handlers check `isPausedByOverlay()` first.

### Modals are scaled to fit, not reflowed

Every `.lbx-window` is laid out at a fixed pixel size chosen by a breakpoint,
and the breakpoints are picked by viewport **width**. A landscape phone is wide
and short, so it lands on a wide breakpoint and gets a dialog taller than its
own screen — on a 863×360 Pixel 7 the round chooser was 410px tall and its
*Start game* button sat below the fold, unreachable. Clamping the position to
`top: 0`, which is what `_center()` used to do, only chooses which end is lost.

`window/_base.js::_fit()` therefore does for dialogs what `stage.fit()` does for
the play field: one uniform `transform: scale()`, never above 1:1, so a dialog
that already fitted is untouched. The transform's origin is the centre, which is
why `_center()` no longer clamps to zero — clamping would push the *layout* box
back on screen and take the visible, scaled one off-centre. `.lbx-window` carries
an unprefixed `transform`/`transition` for this: the inline scale and the open
animation have to be the same property.

The fit reserves `OUTSET` pixels on every side, and that is not padding for
looks. `#exit` and `#minimize` are positioned at `top: -5px; right: -5px` —
deliberately *outside* the window box — so a window scaled to exactly the
viewport puts the only way to close it off screen. `iphone5-landscape.css` makes
the window 100% × 100%, where it was off screen at every size. Measuring the box
alone and calling it fitted is what made this look fixed when it was not.

The fit is redone on `resize`/`orientationchange`, so rotating the device with a
dialog open re-centres it instead of leaving it where the old viewport put it.

### Interface pointer events do not move the paddle

`input/pointer.js` listens on `document`, and the paddle follows `pointer.x`
every frame, clamped to the field. Anything that reads a position from a tap on
the interface therefore drags the paddle with it — the dashboard toggle sits at
the far left, so opening the panel used to throw the paddle to `x = 0` the moment
the round resumed. Events landing on `UI_CHROME` (the toggle, modal windows and
their overlay, and the item strip) are skipped, leaving the position untouched.

This matters for tests too: a modal closes with a transition, so for a few
hundred milliseconds after a round starts it is still covering the field and
touches aim at it rather than the game. `waitForOverlayGone()` in
`tests/game-page.mjs` is what makes touch-driven specs deterministic — without it
they passed by moving the paddle through a stray tap on the modal.

Input is Pointer Events only — one path for mouse, touch and pen. There is no
touch/mouse fork and no UA sniffing in the input layer.

The field is landscape, so portrait phones get the rotate prompt. That prompt is
driven off `resize` as well as `orientationchange`, because the latter is
deprecated and misses split screen, window resizes and device emulation.

### Events

Two mechanisms, both built on `core/event-emitter`:

- **direct** — `dashboard.addListener('clickPlay', ...)`, `windowRounds.addListener('play', ...)`
- **`core.mediator`** — global bus for game-wide moments: `game:game-start`,
  `game:game-over`, `game:stage-clear`, `game:level-start`

### Shop, wallet and payments

One currency — coins — and three layers that do not know about each other.

```
dashboard/shop.js  the trolley icon drawn on the dashboard canvas
coin-hud.js        the coin balance, fixed to the viewport, not the dashboard
window/shop.js     the two-tab dialog: spend coins on items, spend money on coins
shop/catalog.js    what is for sale, and at what price
shop/rewards.js    what clearing a round pays out
shop/powerups.js   what an item actually does to the running game
item-bar.js        the strip of owned items beside the field, and the only way
                   to spend one
wallet.js          the balance and inventory, persisted under baw-storage:wallet
payment/gateway.js the contract a payment provider is written to
```

Points worth knowing before changing any of it:

- **Every item's effect already exists as a falling bonus.** `shop/powerups.js`
  reaches for the same `paddle.glue()`, `paddle.gun()`, `ball.steel()` and
  `balls.create()` calls that `entity/bonus.js` does. Buying an item *chooses*
  an effect rather than adding a power that non-paying players cannot get. The
  one exception is `shield`, which flips `ball.bounceBottom` — the flag the
  splash screen already uses to keep its balls in play.
- **An item is deducted only once its effect has been applied.** `powerups.apply()`
  returns false when the game cannot take it (no paddle, or a ball still glued to
  the paddle with no direction to split along) and `item-bar.js` then leaves the
  inventory alone. A tap that lands between rounds must not cost anything.
- **The dashboard's trolley icon is drawn, not blitted.** A sprite would have to
  ship in every episode's resource manifest at 1x *and* @2x before the feature
  could be switched on anywhere; strokes and two circles need no new art, and
  are sharp at whatever backing-store scale the device asks for. Everything in
  `_cart()` is a fraction of `icon.size` for that reason. Its placement is
  per-episode, under `dashboard.shop` in the manifest, and an episode without
  that key simply does not get the icon. The drawn strokes are thin, so the
  container carries an explicit square `hitArea` — without it, opening the shop
  is a test of aim.
- **`dashboard/shop.js` must not import `stage` or `entities`.** `dashboard.js`
  is already imported by `entity/bonus.js`, so reaching back into the stage from
  a dashboard widget is what would give this codebase its first dependency cycle.
  The widget only knows about the wallet; `shop/powerups.js` is where the game
  is touched, and nothing in the stage graph imports that.
- **The item strip is DOM, in the right letterbox margin.** Same reasoning as the
  dashboard toggle on the left: the field is landscape and a landscape phone is
  wider still, so it is height-constrained and that margin always exists. It is
  in `UI_CHROME`, so tapping an item does not also throw the paddle sideways.
- **The balance is not on the dashboard.** It was, next to the clock, and that
  made it invisible for the whole round on a phone -- the dashboard is parked
  off screen by default. `coin-hud.js` fixes it to the top-right of the
  viewport: the mirror of the dashboard toggle, and the same letterbox-margin
  argument. It takes **no** pointer events at all -- it is a readout, the trolley
  is the way into the shop, and a tap there should drive the paddle exactly as a
  tap on the field does. That is why it is not in `UI_CHROME`: there is nothing
  to exclude.

#### MoneyCollect

The live provider is `payment/provider-moneycollect.js`, driving MoneyCollect's
in-page checkout in the three documented steps: create the payment, render the
card form with `elementInit('payment_steps', …)`, then `confirmPaymentMethod()`
followed by `confirmCharge()` on submit. The two-step confirm rather than the
one-shot `confirmPayment` is what lets the card be stored for a repeat purchase.

Configuration is the `PAYMENT` block in `js/_config_dev.js` and
`js/_config_prod.js`. **It ships with no credentials**, and `payment/_.js` falls
back to the mock when `apiKey` is empty — which is why the game still runs, and
the whole suite still passes, on a checkout with no account.

Credentials come from **environment files**: `.env.dev` and `.env.prod`, both
git-ignored and seeded from the committed `.env.example` by `scripts/env.mjs`.
`npm run dev` reads `.env.dev`, `npm run build` reads `.env.prod`, and
`--env dev|prod` or `$BAW_ENV` overrides either. Switching between the test and
production accounts is therefore a matter of which command you run — nothing is
commented in or out by hand, which is what the arrangement replaced.

`js/_config_secrets.js` is **generated** from whichever file applies; it carries
a do-not-edit header and is regenerated on every dev-server start and every
build. Anything non-empty in the env file overrides the matching `PAYMENT`
field; the config files merge it off `window` in a loop. An empty value is left
out of the generated file entirely rather than written as `''`, so it falls back
to the default in `js/_config_dev.js` / `js/_config_prod.js` instead of
overriding a working host with nothing.

Fields are mapped by the `FIELDS` table in `scripts/env.mjs`, and the generated
object is built in that table's order rather than the file's — so the content
hash the build gives it depends on the values, never on how someone happened to
arrange the file.

Do not mistake any of this for the keys being secret. The generated file is
loaded by the browser and, in production, copied into `dist/` and served —
anyone who opens the page can read it. Environment files keep credentials out of
the repository and out of each other's way; they do not hide them. The only way
not to ship a secret at all is `orderEndpoint`.

Things worth knowing before touching it:

- **`secretKey` in the browser is the reference integration's arrangement, not a
  safe one.** It can create *and refund* charges, and anyone can read it out of
  the bundle — git-ignoring the file it lives in changes nothing about that.
  `orderEndpoint` is the way out: point it at a server that holds the key, and
  `createOrder`/`verify` go there instead. That is `PAYMENT_ORDER_ENDPOINT` in
  the environment file, and `PAYMENT_SECRET_KEY` can then stay empty.
- **The SDK is loaded on first purchase, not on boot.** A script tag in the page
  would cost every player a third-party request, including the ones who never
  open the shop. A failed load is not cached as a permanent failure.
- **`pay()` reports what the browser saw; `verify()` decides.** A charge that
  comes back `processing` is reported as paid on purpose, because `verify()` is
  called next and polls to a terminal status — the gateway credits on *that*.
  When polling runs out the result is `pending`: the player is told it is still
  being confirmed, and nothing is credited on a maybe.
- **A decline throws rather than resolving.** The card form stays open so another
  card can be tried without creating a second order.
- **3-D Secure on a cross-origin host answers by `postMessage`.** The issuer's
  page takes over an iframe the SDK can no longer read, so its promise never
  settles. `_chargeViaPostMessage` is that path, and `localhost` and plain
  `http:` are treated as cross-origin because that is where it shows up.
- The card form's element ids (`card-element`, `card-errors`, `PrivateFrame`)
  are handed to `elementInit` by name and are not free to rename.
- **The card form is a column, and only the card area scrolls.** The provider
  sizes its iframe to whatever `frameMaxHeight` says, routinely taller than the
  fields inside it, so a dialog that scrolls as a whole puts *Pay now* below the
  fold on a phone — there is no fixed height at which that is safe.
  `moneycollect-modal.js::_budget()` measures the real chrome (title, amount,
  error line, button — their heights depend on font loading and translation
  length), works out what is left, and tells the SDK that instead of the
  provider's 320px default. `_fit()` also lowers the card area's own
  `min-height`, because a `max-height` on the dialog cannot pull a child below
  its minimum — that was the second half of the same bug.
- `visualViewport` is preferred over `innerHeight` where it exists: on a phone
  `innerHeight` can include the strip behind the browser's toolbars, which is
  exactly the space a button ends up hiding in.
- **`#mc-payment-container` must not set `display` in its base rule.**
  `#mc-payment-root > *` hides the panels by default at the same specificity, so
  a `display: flex` there wins on source order and leaves the card form on
  screen permanently. `.mc-open` is what makes it a flex column.

#### Plugging in another provider

`payment/gateway.js` documents the four-method contract in full; the reference
implementations are `provider-mock.js` and `provider-moneycollect.js`, and
`payment/_.js` is the single place a provider is chosen. The shop, the wallet
and the game are written against the gateway and do not change.

The part a provider swap does **not** cover:

- `wallet.js` is a client-side cache — a player can edit localStorage. Real money
  must be credited by a server that has seen the provider's own notification, and
  `wallet.setServerState()` is the hook waiting for that answer.
- Coin prices live in `shop/catalog.js` as `amountMinor`, in the currency's minor
  unit. Money is never a float here; keep it that way.

### Level format

A level is a single string: `'<name>:<x>,<y>,<type>;<x>,<y>,<type>;...'`

Coordinates are canvas pixels on a 21×19 grid of 38×21 px cells (798×399 within a
798×462 canvas). `<type>` indexes the episode's block table in
`js/app/episodes/<episode>/blocks.js`, which defines texture, hardness,
destroyable, score and bonus eligibility.

`levels-editor_dev.html` is a visual editor for these strings; it stores the result
via `core.storageGlobal` under `level` and the game picks it up as a custom level.

### Adding an episode

1. Create `js/app/episodes/<name>/` with `blocks.js`, `bonuses.js`, `levels.js`,
   `manifest.js`, `resources.js`, `splash-screen.js` (copy `space/` as a template).
2. Add the six modules to `js/app/episodes/_registry.js`.
3. Add the name to `EPISODES` in `js/_config_dev.js` and `js/_config_prod.js`.
4. Add `css/episodes/<name>.css` — `preloader.js` loads it by convention.
5. Add assets under `images/episodes/<name>/` and `sounds/episodes/<name>/`.

### The build fingerprints everything it emits

`npm run build` renames every artifact to carry a content hash —
`dist/index.ce690847.js`, `dist/common.27e9ebbe.css` — and rewrites the build
blocks in the generated pages to point at the new names. A changed file
therefore arrives under a name the browser has never seen, which is what lets
`dist/*` be served with a far-future cache lifetime while the two pages stay
short-lived. `dist/manifest.json` records the mapping for a deployment.

Details that are load-bearing:

- **The banner is stripped before hashing.** It carries the build date, so
  hashing it would rename every artifact once a day whether or not anything
  changed — the opposite of what a content hash is for. Same input, same name:
  the build is idempotent, and a rebuild that changes a hash means the input
  changed.
- **Source maps follow their bundle.** esbuild writes
  `//# sourceMappingURL=index.js.map` while the bundle still has its plain name,
  so both that comment and the map's own `file` field are repointed.
- **Two stylesheets are named at runtime, not by a build block** — the font sheet
  (`core/helper/font.js`, chosen from the browser) and the per-episode sheet
  (`preloader.js`, chosen from the episode). The build cannot rewrite a string
  the code assembles, so it publishes the map instead: `ASSETS`, appended to the
  copied config file, resolved through `core/helper/asset.js`. Anything else that
  builds an asset path at runtime has to go through that helper or it will 404
  against a hashed filename. This is exactly how it broke the first time.
- **Episode stylesheets keep their directory** (`dist/episodes/space.<hash>.css`).
  Their `url()`s are written relative to `css/episodes/`, and that is the only
  depth at which they still resolve.
- `js/_config_prod.js` and the generated `js/_config_secrets.js` are copied into
  `dist` and hashed too — both are classic scripts loaded before the bundle, so
  left where they were, an edit would be served from cache. The build regenerates
  the credentials file from the target environment first, because the pages
  reference it unconditionally and an empty one is a valid answer.
- A build block naming a target no build step emitted is a build error, not a
  silent link to a 404.

`vendor/` is *not* hashed. It is regenerated from `node_modules` by
`scripts/vendor.mjs` and its filenames are fixed, so a jQuery upgrade would be
served stale — see the known gaps.

### The shipped bundle is obfuscated

`npm run build` runs the bundles through `javascript-obfuscator` before hashing
them. Two things this is **not**, and both matter more than what it is:

- **It is not a security boundary.** Everything here runs in the player's
  browser; anything the browser can execute, a determined person can read.
- **It does not protect the payment secret.** Only moving that to a server does
  (`orderEndpoint` — see the payments section).

What it does is raise the cost of casual tampering, which for a game with a
client-side wallet is the realistic threat: opening the console to call
`wallet.credit()`, or grepping the bundle for `live_pr_`.

The options are chosen against a 60fps canvas game, which rules out most of what
the tool offers:

- **`controlFlowFlattening` and `deadCodeInjection` are off.** They are the two
  features that genuinely frustrate a reader, and they cost a documented
  1.5x/2x in run time and up to 4x in size. The frame loop sweeps every block
  every tick; that budget does not exist. Measured with them off, the game holds
  59fps either way.
- **`debugProtection` is off.** It fights devtools, which breaks support work far
  more reliably than it stops anyone.
- **`renameGlobals` is off and must stay off.** `_config_prod.js` and
  `_config_secrets.js` declare globals (`EPISODES`, `PAYMENT`, `ASSETS`,
  `PAYMENT_SECRETS`) that the bundle reads by name across file boundaries.
- **Property names survive**, so `window.BallAndWall.wallet.getCoins()` still
  works — which is how the end-to-end suite drives the game. Only top-level
  bindings inside the bundle are mangled.
- **String-array wrappers are off for the bundles and on for the config files.**
  Measured gzipped on this bundle: 77 kB plain, 113 kB with the string array,
  168 kB once wrappers are added. One more hop between a call site and the array
  is not worth 55 kB on a file every player downloads; on a 4 kB credentials
  file the same setting is free.

Two build-level consequences:

- **No source maps.** A map ships the original sources in full and would hand
  back everything the obfuscator just took away. `sourcemap` follows the
  obfuscation flag, and `tests/production.spec.mjs` asserts the served bundle
  carries no `sourceMappingURL` and that no `.map` is reachable next to it.
- **The seed is derived from the file's own contents.** The tool randomises
  string-array order per run, so an unseeded build would emit different bytes —
  and a different content hash — from identical sources, invalidating every
  cache on every deploy for nothing. Same input, same output, same filename.

### The tour's dashboard diagram is generated, not drawn

The first slide of the first-run tour is a picture of the dashboard with four
labelled arrows. The original was a hand-made screenshot, so when the login
button was replaced by the shop the diagram carried on describing a button that
no longer exists — and nothing could have caught that.

`npm run guide` redraws it from the running game: it screenshots the live
dashboard at 2x, asks the stage where the clickable buttons actually are, and
draws the connectors to those coordinates. Move a button in an episode manifest,
run it again, and the arrows follow. Output is
`images/episodes/space/first-time/slide-1-shop.jpg`; the original `slide-1.jpg`
is kept beside it.

Three things about it are worth knowing:

- **The torn-paper silhouette is artwork and is not regenerated.** It is lifted
  out of the original by flood-filling the white surround from the border —
  flooded rather than thresholded, so the starfield's own white stars stay part
  of the picture. That is also what keeps the new slide looking like it belongs
  next to slides 2 and 3.
- **The labels are not in the image.** They are `first-time-slide-1-desc-list`
  in the i18 tables, laid out by CSS beside it. The connector dots are fixed at
  the positions the original used, because that is where the labels land —
  changing the list means moving `DOTS` in the script to match.
- The dashboard capture is backed by a colour sampled from its own edge, because
  it does not fill the frame and the silhouette only reads against something
  dark.

### `npm run preview` is the pre-release check

`npm run dev` serves the source pages with `Cache-Control: no-store`, which is
right for development and wrong for a last look before shipping.
`scripts/preview.mjs` serves the *built* pages the way a deployment should:
`dist/*` immutable with a year-long lifetime, the pages `no-cache`. That is the
arrangement content hashing exists to make safe, and previewing without it does
not exercise it -- if a rebuild changes something and the preview still shows
the old version, the hashing is broken, which is what you want to find here
rather than in production.

Before serving, it checks the build and refuses to start if the pages reference
anything that is not there. That is the failure mode hashing introduces: rebuild,
deploy `dist/` but not the pages, and every asset 404s at once. It also reports
bundle sizes, which artifacts are resolved at runtime rather than linked by a
page (the font sheet and the episode sheets), and which are referenced by
nothing at all.

That last list is worth reading. The breakpoint bundles -- `dist/1280.css`,
`dist/640-wide.css` and the rest -- are inlined into `dist/common.css` by
`css/import.css`, so production never fetches them separately. They are emitted
and deployed for nothing. Removing them from `cssBundles` in `scripts/build.mjs`
would be safe as far as this repo is concerned; it is left alone in case a
deployment outside it links them directly.

`scripts/static-server.mjs` is the server both use. They differ in exactly two
things -- which page `/` lands on, and what `Cache-Control` says -- and both are
passed in rather than branched on.

### Registries instead of computed module paths

Three lookups used to build a module path at runtime — the episode's content, the
interactive block entities, and the language tables. No bundler can follow that,
so each is now an explicit map: `episodes/_registry.js`,
`entity/block/_registry.js`, and `LANGUAGES` in `i18/i18.js`. Adding an episode,
a block entity or a language means adding an entry. The upside is that a typo is
a missing key at build time rather than a 404 at runtime.

### Languages

`en-us`, `zh-cn` and `pl`, registered in `LANGUAGES` in `i18/i18.js`. Adding one
means an import, an entry, a `lang-full-name:<code>` string, and an option in
`Options.prototype.languages`.

Two things make this less obvious than it looks:

- **A translation must be complete.** `setLanguage` extends one flat table over
  the strings already loaded, so a key a translation forgot reads as `undefined`
  on screen -- it does *not* fall back to English. `tests/unit/i18.test.mjs`
  asserts key parity in both directions, that `{placeholder}` names survive
  translation, and that the keys whose value is a list stay lists.
- **A browser reports a region tag, not a language.** `navigator.language` gives
  `zh-CN`, `zh-TW`, `zh-HK`; there is no reason for each to be its own table, so
  `ALIASES` folds them onto `zh-cn` -- Simplified serves a Traditional reader far
  better than the English fallback does. `resolve()` is the single place that
  mapping happens, and `exists()` and `setLanguage()` both go through it. The
  entry points store the *resolved* code, so the options window marks the right
  radio and a reload picks the same table.

Canvas text needs no special handling: the game's display fonts have no CJK
glyphs, and the browser falls back per glyph, so Chinese renders in the system
font inside an otherwise Orion-Pax label.

### window.BallAndWall

`js/index.js` publishes the live singletons on `window.BallAndWall` — the stage,
entities, levels, dashboard, options and input. RequireJS used to let anything be
pulled out of the loader with `require('app/levels')`; a bundle has no registry,
so the handle is deliberate. The end-to-end tests read game state through it, and
it is handy from the console.

## Constraints worth knowing

- **jQuery is pinned to 3.7.1, not `^3`.** The code uses `$.proxy` (116 call sites),
  `.bind()` (37), `$.isArray` and `$.isFunction`. jQuery 4 removed all of them, so
  upgrading requires replacing those first.
- **Watch for jQuery-2-era API that 3.x removed silently.** The codebase was
  written against 2.1. `$(el).context` was the trap: it now reads `undefined`, so
  `element.context == target` was always false and every selection handler
  (rounds, episodes, options, the editor palette) quietly stopped marking
  anything — you could not pick a level at all. Comparisons like that fail
  closed, with no error. Prefer `element[0] === target` or `element.is(target)`.
- **Named `define()` ids are mandatory.** An anonymous `define([...], fn)` will not
  resolve out of the concatenated production bundle. The build fails on any
  dependency id it cannot find, so a typo shows up at build time.
- **`pixelRatio()` is capped at 2, and that cap is load-bearing.** It scales the
  canvas backing store, sprite frame sizes, block dimensions and speeds. Artwork
  ships at 1x and @2x only, so an uncapped ratio on a 3x phone made the frame
  maths describe a sheet that does not exist — `38 * 3 = 114`px frames read out
  of a 76px-per-frame @2x image gives zero frames, a null `getBounds()` and a
  `TypeError` on every tick once a ball sweeps an animated block. Raising the cap
  means shipping @3x art *and* teaching `episode.getResources()` to select it.
- At pixel ratio ≥ 2, `game.js` restricts `EPISODES` to `space` — the pegasus art
  has no @2x variant.
- **Episode art licensing:** `space` assets are free (author-made). `pegasus` images
  were bought from graphicriver and are **not** covered by this repo's MIT licence.
- **Canvas text needs a repaint once web fonts land.** The dashboard is a static
  canvas that paints on load and then only when a value changes, so a paint that
  happens before Orion-Pax and segmentled arrive bakes in the fallback font
  permanently. `dashboard.js` repaints on `document.fonts.ready` for that reason —
  the timing is invisible until asset loading gets faster or slower.

## Testing

Two layers. `npm test` runs lint, then both.

### Unit tests — `tests/unit/`, `npm run test:unit`

Node's built-in runner over the collision geometry (`core/math.js`), the ball's
bounce and speed logic (`entity/ball.js`), and the shop's arithmetic
(`wallet.js`, `shop/rewards.js`, `shop/catalog.js`). No browser, so it gates
every push cheaply.

The wallet is here rather than only in the browser suite because its numbers
stand for money: a debit that goes through when it should not is a free item,
and a purchase that debits without delivering is a player who paid for nothing.
Both cases are asserted directly.

The **real** module sources run; nothing is re-implemented. Collaborators that
touch the DOM, localStorage or CreateJS at *module scope* are swapped for stubs by
`tests/unit/loader.mjs`, a Node module-resolution hook. ES modules resolve their
own imports, so substituting at resolution time is the ESM equivalent of the
dependency injection AMD gave for free. `tests/unit/setup.mjs` installs the `$` and
`createjs` globals before anything loads, and is wired in via `--import`.

Two details worth knowing before adding cases:

- `entity/ball.js` exports a ready-made singleton; the constructor is reached via
  `.constructor` so each test gets an independent ball. `init()` is skipped (it
  needs a canvas and a preloaded sprite sheet) and `bitmap` is assigned directly.
- Run them through `npm run test:unit`. By hand they need both the setup import
  and the glob; passing the bare directory makes Node treat it as one file and
  fail with MODULE_NOT_FOUND.
- The `$` stub answers to `$(array)` — `core/event-emitter.js` wraps its listener
  list that way, which has nothing to do with the DOM — and throws on anything
  else, so a module that really needs a browser still fails loudly. `$.extend`
  honours the deep flag, which `wallet.js` relies on to clone its defaults.
  `core.StorageLocal` is stubbed in memory in `tests/unit/stubs/core.mjs`.

Every assertion here was mutation-checked: flipping the paddle's steering sign,
dropping the speed cap, bouncing the wrong axis off a block, letting a glued
paddle accelerate the ball, and removing `intercept`'s segment-bounds check each
turn the suite red. The `n === 0` parallel guard in `intercept` is the one
exception — removing it changes nothing, because the division then yields
Infinity or NaN and the range checks reject those anyway.

### End-to-end tests — `tests/*.spec.mjs`, `npm run e2e`

A Playwright suite that drives a real browser. `tests/game-page.mjs` carries the
shared helpers; start there.

Two things make the specs deterministic:

- **Seeded state.** `prepare(page)` writes the game's localStorage keys before any
  page script runs, which switches off the first-run tour, the cookie banner and
  audio. Driving those overlays through the DOM instead would couple every spec to
  the tour's markup. Sub-objects are merged shallowly by `game-options.js`, so each
  one must be supplied in full. The wallet has its own key
  (`baw-storage:wallet`) and its own third argument, because a spec asserting what
  a purchase cost needs a balance it chose rather than the one a new player is
  given. It is re-seeded before *every* navigation, so a reload cannot be used to
  test persistence — `tests/shop.spec.mjs` asserts against localStorage instead.
- **No local credentials.** `prepare()` also routes `js/_config_secrets.js` (and
  its built copy) to an empty table. That file is git-ignored and may hold real
  payment keys on the machine running the suite, which would switch the gateway
  off the mock provider and quietly change what every shop spec is testing.
  Playwright matches routes newest-first, so `tests/payment.spec.mjs` still
  routes in its own.
- **Real game state.** `readState(page)` reaches into the running game with the
  synchronous `require('app/levels')` form rather than scraping the canvas, so
  assertions talk about blocks, balls and rounds.

`tests/mobile.spec.mjs` runs the layout and input assertions across emulated
phones and tablets: the field must stay inside the viewport, keep its aspect
ratio, and map a touch at 10%/50%/90% of the canvas to the same fractions of the
stage. The portrait case skips the gameplay tests because portrait deliberately
shows the rotate prompt instead.

One of those cases **releases the ball** and plays for a couple of seconds. That
matters more than it looks: the collision sweep is what measures every block, and
leaving the ball glued to the paddle never reaches it. A crash on every tick of a
3x screen survived a full mobile suite for exactly that reason.

`tests/mobile.spec.mjs` also opens each dialog on every emulated device and
asserts it stays inside the viewport. That case fails on all landscape phones
without `window/_base.js::_fit()`, which is the point: the round chooser used to
put its *Start game* button below the fold.

`tests/payment.spec.mjs` configures MoneyCollect for real — it rewrites
`js/_config_dev.js` on the way to the browser — serves its SDK from
`tests/fixtures/moneycollect-stub.js` and intercepts its API. That leaves under
test exactly the half this repo owns: create, render, confirm the method, charge,
confirm the status out of band, credit. The assertion that matters most is the
negative one: a charge the provider has not confirmed must not move the balance
by a single coin.

`tests/shop.spec.mjs` covers the purchase flows against the mock payment
provider — price charged, item delivered, pack credited with its bonus, an
unaffordable purchase charging nothing — plus the item strip staying clear of the
play field and an unusable item costing nothing.

`tests/production.spec.mjs` runs against the *built* `index.html`. This is not
duplication: production loads one concatenated bundle and one merged stylesheet, so
bundle-only regressions — a module missing from the bundle, breakpoints lost while
inlining `@import` — cannot show up anywhere else. `tests/global-setup.mjs` rebuilds
`dist/` before every run; it deliberately does not live in `webServer.command`,
which is skipped whenever an existing dev server is reused and would let the
production specs assert against a stale bundle.

Playwright is pinned to `channel: 'chrome'` (the installed Google Chrome) rather
than its bundled Chromium, which is no longer published for macOS 13. CI installs
Chrome the same way, so both run the same browser.

## Browser automation via MCP

`.mcp.json` configures two MCP servers for interactive debugging:

- **chrome-devtools** — DOM snapshots, console, network, performance traces,
  Lighthouse. Best for "why is this slow / what did the network do".
- **playwright** — accessibility-tree snapshots and scripted interaction.

Both are pinned and run `--isolated` (throwaway profile). They are for exploration;
regression coverage belongs in `tests/` so CI can run it.

## Known gaps

- Unit coverage stops at `core/math.js`, `entity/ball.js` and the shop's
  arithmetic. Bonuses, bullets and the black-hole blocks have none; the
  end-to-end layer only smoke-tests them.
- The shop's payment provider is the mock in `payment/provider-mock.js`. The
  wallet is client-side and therefore trivially editable by the player — fine
  while nothing is bought for real money, and the first thing to fix when a real
  provider lands. See the payments section above.
- The bought `shield` is applied to the balls in play and re-applied on a short
  interval so a ball spawned during it is covered; if that interval is ever
  removed, multi-ball plus shield will start dropping balls through the floor.
- Obfuscation is a speed bump, not protection. The wallet is still client-side
  and still editable through localStorage; a player who wants coins can have
  them. The fix is a server, not a heavier obfuscator preset.
- `vendor/` is served under fixed filenames and is not fingerprinted, so
  upgrading jQuery or CreateJS can be served from a stale cache. Bumping
  `REVISION` in `js/_config_prod.js` is the current workaround; fingerprinting
  the vendor copy in `scripts/vendor.mjs` would remove the need for it.
- The MoneyCollect provider is covered against a stubbed SDK and an intercepted
  API (`tests/payment.spec.mjs`), which exercises this repo's half of the flow
  but proves nothing about MoneyCollect's. Nothing has been run against a real
  account from here.
- `css/mobile.css` and `css/ie.css` are orphans -- nothing references them. The
  breakpoint stylesheets still reflow the old layout for viewports the scaled
  field now handles, so they could be pared back considerably.
- The breakpoint stylesheets are chosen by viewport width, which no longer
  matches the field's rendered size once it is scaled. They only still apply to
  chrome outside the field (modals, buttons).
