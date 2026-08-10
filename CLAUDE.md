# Ball And Wall — developer guide

Arkanoid-style HTML5 canvas game. Originally written in 2015 against Bower + Grunt;
the toolchain was modernised in 2026 while the game code was deliberately left intact.

## Commands

```sh
npm install       # installs deps and syncs vendor/ (postinstall)
npm run dev       # static server -> http://localhost:8080/index_dev.html
npm run build     # dist/ bundles + regenerates index.html / levels-editor.html
npm run lint      # ESLint
npm run test:unit # collision geometry and ball physics, in Node
npm run e2e       # Playwright end-to-end suite
npm test          # lint + unit + build + e2e
```

`npm run dev -- --port 3000` changes the port.
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
    player.js            backend auth against API_ADDR (see caveat below)
    sound.js  dashboard.js  indicator.js  levels-editor.js
    core/                framework-ish helpers: EventEmitter, mediator, math,
                         storage (localStorage / chrome.storage), browser + app
                         detection, DOM builder, tab
    entity/              a single game object (ball, paddle, bullet, bonus, block,
                         particle, tail, explosion, score, cloud)
    entities/            the collection managing many of one entity type
    dashboard/           score / lives / round / speed / time / auth widgets,
                         drawn on a second canvas (#a-game-dashboard)
    window/              modal dialogs built as DOM (not canvas)
    input/               keyboard + pointer
    episodes/            per-episode content: blocks, bonuses, levels, manifest,
                         resources, splash-screen
    i18/                 en-us and pl string tables
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
for the canvas area (`800-wide.css` adds 89px of top padding, for instance) and
overlays the dashboard on the field instead of letting it hang off the left,
where a phone has no room for it.

Input is Pointer Events only — one path for mouse, touch and pen. There is no
touch/mouse fork and no UA sniffing in the input layer.

The field is landscape, so portrait phones get the rotate prompt. That prompt is
driven off `resize` as well as `orientationchange`, because the latter is
deprecated and misses split screen, window resizes and device emulation.

### Events

Two mechanisms, both built on `core/event-emitter`:

- **direct** — `dashboard.addListener('clickPlay', ...)`, `player.addListener('login', ...)`
- **`core.mediator`** — global bus for game-wide moments: `game:game-start`,
  `game:game-over`, `game:stage-clear`, `game:level-start`

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

### Registries instead of computed module paths

Three lookups used to build a module path at runtime — the episode's content, the
interactive block entities, and the language tables. No bundler can follow that,
so each is now an explicit map: `episodes/_registry.js`,
`entity/block/_registry.js`, and `LANGUAGES` in `i18/i18.js`. Adding an episode,
a block entity or a language means adding an entry. The upside is that a typo is
a missing key at build time rather than a 404 at runtime.

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
- **`player.js` talks to a backend that is not in this repo** (`API_ADDR`, empty by
  default). With `API_ADDR` empty every auth request fails and the game falls back to
  guest play, which is why login appears to do nothing locally. It sends `md5(password)`
  over the wire — if you stand up a real backend, replace that with a proper scheme
  (TLS + server-side password hashing); MD5 is not an acceptable password hash.

## Testing

Two layers. `npm test` runs lint, then both.

### Unit tests — `tests/unit/`, `npm run test:unit`

Node's built-in runner over the collision geometry (`core/math.js`) and the ball's
bounce and speed logic (`entity/ball.js`). No browser, so it gates every push
cheaply.

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

- **Seeded state.** `prepare(page)` writes the game's single localStorage key
  (`baw-storage:game-options`) before any page script runs, which switches off the
  first-run tour, the cookie banner and audio. Driving those overlays through the DOM
  instead would couple every spec to the tour's markup. Sub-objects are merged
  shallowly by `game-options.js`, so each one must be supplied in full.
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

- Unit coverage stops at `core/math.js` and `entity/ball.js`. Bonuses, bullets and
  the black-hole blocks have none; the end-to-end layer only smoke-tests them.
- `css/mobile.css` and `css/ie.css` are orphans -- nothing references them. The
  breakpoint stylesheets still reflow the old layout for viewports the scaled
  field now handles, so they could be pared back considerably.
- The breakpoint stylesheets are chosen by viewport width, which no longer
  matches the field's rendered size once it is scaled. They only still apply to
  chrome outside the field (modals, buttons).
- `js/404.js` and the `dashboard/auth`, `window/auth`, `window/games` flows assume the
  original hosted backend.
- Ads (`core/helper/ads.js`) and share URLs point at the original `ballandwall.com`
  deployment.
