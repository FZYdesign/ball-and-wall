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
change a dependency.

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
