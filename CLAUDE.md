# Ball And Wall — developer guide

Arkanoid-style HTML5 canvas game. Originally written in 2015 against Bower + Grunt;
the toolchain was modernised in 2026 while the game code was deliberately left intact.

## Commands

```sh
npm install     # installs deps and syncs vendor/ (postinstall)
npm run dev     # static server -> http://localhost:8080/index_dev.html
npm run build   # dist/ bundles + regenerates index.html / levels-editor.html
npm run lint    # ESLint
npm test        # lint + build
```

`npm run dev -- --port 3000` changes the port.

Open `index_dev.html` (uncompressed sources, loaded individually by RequireJS) while
developing. `index.html` is **generated** by `npm run build` — never edit it by hand;
edit `index_dev.html` instead. The same applies to `levels-editor.html`.

## Architecture

The game is ~98 AMD modules loaded by RequireJS. Every module declares a **named**
module — `define('app/entity/ball', [deps], factory)` — which is what lets the
production build concatenate them all into one file and still resolve.

Most modules export a **singleton** (the file ends with `new X()` and returns the
instance). The exceptions export constructors: `app/game`, `app/entity/_base`,
`app/entities/_base`, `app/window/_base`, `app/core/builder`.

```
js/
  index.js               entry point: language, episode from #hash, boots app/Game
  _config_dev.js         globals: SS, API_ADDR, VERSION, REVISION, EPISODES, ENV
  lib/                   vendored RequireJS + CreateJS/SoundJS (not from npm)
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
                         detection, DOM builder, tab, fast-click
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
2. Register it in `js/app/episodes/_.js` and in `EPISODES` in `js/_config_dev.js`
   and `js/_config_prod.js`.
3. Add `css/episodes/<name>.css` — `preloader.js` loads it by convention.
4. Add assets under `images/episodes/<name>/` and `sounds/episodes/<name>/`.

No build list to update: `npm run build` globs `js/app/**`.

## Constraints worth knowing

- **jQuery is pinned to 3.7.1, not `^3`.** The code uses `$.proxy` (116 call sites),
  `.bind()` (37), `$.isArray` and `$.isFunction`. jQuery 4 removed all of them, so
  upgrading requires replacing those first.
- **Named `define()` ids are mandatory.** An anonymous `define([...], fn)` will not
  resolve out of the concatenated production bundle. The build fails on any
  dependency id it cannot find, so a typo shows up at build time.
- **Retina:** `core.helperApp.pixelRatio()` scales the canvas and most geometry
  constants. At pixel ratio ≥ 2, `game.js` restricts `EPISODES` to `space` — the
  pegasus art has no @2x variant.
- **Episode art licensing:** `space` assets are free (author-made). `pegasus` images
  were bought from graphicriver and are **not** covered by this repo's MIT licence.
- **`player.js` talks to a backend that is not in this repo** (`API_ADDR`, empty by
  default). With `API_ADDR` empty every auth request fails and the game falls back to
  guest play, which is why login appears to do nothing locally. It sends `md5(password)`
  over the wire — if you stand up a real backend, replace that with a proper scheme
  (TLS + server-side password hashing); MD5 is not an acceptable password hash.

## Known gaps

- No automated tests. `npm test` runs lint + build only.
- `js/404.js` and the `dashboard/auth`, `window/auth`, `window/games` flows assume the
  original hosted backend.
- Ads (`core/helper/ads.js`) and share URLs point at the original `ballandwall.com`
  deployment.
