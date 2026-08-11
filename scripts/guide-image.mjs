/**
 * Regenerates the first slide of the first-run tour from the live game.
 *
 *   npm run guide
 *
 * The tour's first slide is a diagram of the dashboard buttons, and the
 * original was a hand-made screenshot -- so when the login button was replaced
 * by the shop, the diagram went on describing a button that no longer exists.
 * Screenshotting the running game instead means the picture cannot drift from
 * what it depicts: move a button in the episode manifest, run this, and the
 * arrows follow.
 *
 * What is *not* regenerated is the torn-paper silhouette. That is artwork, and
 * it is lifted out of the original slide by flood-filling the white surround --
 * which is also why the new slide still sits next to slides 2 and 3 without
 * looking like it came from somewhere else.
 *
 * The labels beside the picture are HTML (`first-time-slide-1-desc-list` in the
 * i18 tables), not part of the image. Their vertical positions come from CSS,
 * so the connector dots stay where the original put them; change the label list
 * and these dots have to move with it.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, root } from './static-server.mjs';

const PORT = 8099;
const SOURCE = 'images/episodes/space/first-time/slide-1.jpg';
const OUTPUT = 'images/episodes/space/first-time/slide-1-shop.jpg';

/**
 * Where the dashboard capture sits inside the 490x265 frame.
 *
 * Chosen so the four buttons land roughly where the original put them -- the
 * labels are laid out against those positions -- and so the capture reaches far
 * enough into the torn shape that the join between it and the backing colour
 * does not read as an edge.
 */
const PLACEMENT = { scale: 1.08, x: 24, y: 16 };

/**
 * Left-hand ends of the four connectors, in image pixels.
 *
 * Measured off the original slide: they line up with the four HTML labels,
 * whose positions are CSS and not ours to choose here.
 */
const DOTS = [
    { x: 11.7, y: 48.9 },
    { x: 11.8, y: 107.9 },
    { x: 9.8, y: 161.9 },
    { x: 9.4, y: 217.3 }
];

const RED = '#d1281f';

/** Seeded so the picture shows a game that has not been played yet. */
const STORAGE = {
    'baw-storage:game-options': {
        'window-games': { showOnStartup: false, game: 'space' },
        'window-options': { music: 'off', sound: 'off', lang: 'en-us', fps: 60 },
        'window-first-time': { needToShow: false },
        'window-rounds': { data: [] }
    }
};

const server = serve({
    port: PORT,
    indexPage: 'index_dev.html',
    cacheControl: () => 'no-store'
});

const browser = await chromium.launch({ channel: 'chrome' });

// --- the dashboard, as the game draws it today ------------------------------
// Captured at 2x so the downscale into the frame stays crisp.
const gameContext = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2
});
const game = await gameContext.newPage();

await game.addInitScript((entries) => {
    Object.entries(entries).forEach(([key, value]) => {
        window.localStorage.setItem(key, JSON.stringify(value));
    });
}, STORAGE);
await game.goto(`http://localhost:${PORT}/index_dev.html`);
await game.waitForFunction(
    () => window.BallAndWall && window.createjs.Ticker.hasEventListener('tick'),
    null,
    { timeout: 45_000 }
);
await game.waitForTimeout(1600);

// The splash screen leaves bricks in the field, which show through the empty
// half of the dashboard and read as clutter in a diagram about menus.
await game.evaluate(() => {
    const app = window.BallAndWall;

    app.levels.destroy();
    app.entities.balls.destroy();
    app.entities.paddles.destroy();
    app.stage.clear();
    app.stage.update({});
});
await game.waitForTimeout(400);

/** Button centres in authored dashboard pixels, asked of the game. */
const icons = await game.evaluate(() => {
    const app = window.BallAndWall;
    const ratio = app.core.helperApp.pixelRatio();
    const shop = app.episode.getManifest().dashboard.shop.icon;
    const buttons = app.dashboard.stage.children
            .filter((child) => child._listeners && child._listeners.click)
            .map((child) => {
                const bounds = typeof child.getBounds === 'function' ? child.getBounds() : null;

                return bounds
                    ? {
                        x: (child.x + bounds.width / 2) / ratio,
                        y: (child.y + bounds.height / 2) / ratio
                    }
                    // The shop is a Container of drawn shapes and reports no
                    // bounds; the manifest knows its box.
                    : { x: (shop.x + shop.size / 2) / ratio, y: (shop.y + shop.size / 2) / ratio };
            });

    // Top to bottom is the order the labels are written in.
    return buttons.sort((a, b) => a.y - b.y);
});

const rect = await game.evaluate(() => {
    const bounds = document.getElementById('a-game-dashboard').getBoundingClientRect();

    return { left: bounds.left, top: bounds.top };
});
const dashboard = await game.screenshot({
    clip: { x: rect.left, y: rect.top, width: 417, height: 214 }
});

await gameContext.close();

// --- compose ----------------------------------------------------------------
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();

await page.goto(`http://localhost:${PORT}/index_dev.html`);
await page.waitForTimeout(400);

const jpeg = await page.evaluate(async (input) => {
    const load = (src) => new Promise((resolve) => {
        const image = new Image();

        image.onload = () => resolve(image);
        image.src = src;
    });
    const original = await load(input.source);
    const dash = await load(input.dashboard);
    const W = original.width;
    const H = original.height;

    // --- the torn-paper shape, lifted from the original ----------------------
    const source = document.createElement('canvas');

    source.width = W;
    source.height = H;
    source.getContext('2d').drawImage(original, 0, 0);

    const pixels = source.getContext('2d').getImageData(0, 0, W, H).data;
    const isWhite = (i) => pixels[i] > 236 && pixels[i + 1] > 236 && pixels[i + 2] > 236;
    const outside = new Uint8Array(W * H);
    const stack = [];

    // Flooded from the border rather than thresholded, so the starfield's own
    // white stars stay part of the picture.
    for (let px = 0; px < W; px++) { stack.push(px, px + (H - 1) * W); }
    for (let py = 0; py < H; py++) { stack.push(py * W, py * W + W - 1); }
    while (stack.length) {
        const i = stack.pop();

        if (outside[i] || !isWhite(i * 4)) { continue; }
        outside[i] = 1;

        const px = i % W;
        const py = (i / W) | 0;

        if (px > 0) { stack.push(i - 1); }
        if (px < W - 1) { stack.push(i + 1); }
        if (py > 0) { stack.push(i - W); }
        if (py < H - 1) { stack.push(i + W); }
    }

    const mask = document.createElement('canvas');

    mask.width = W;
    mask.height = H;

    const maskData = mask.getContext('2d').createImageData(W, H);

    for (let i = 0; i < W * H; i++) { maskData.data[i * 4 + 3] = outside[i] ? 0 : 255; }
    mask.getContext('2d').putImageData(maskData, 0, 0);

    // --- the capture, backed and clipped to that shape -----------------------
    // The dashboard does not fill the frame, so the silhouette only reads if
    // what is behind it is dark too. Sampled from the capture's own edge rather
    // than picked by eye, so the join does not show.
    const edge = document.createElement('canvas');

    edge.width = dash.width;
    edge.height = dash.height;
    edge.getContext('2d').drawImage(dash, 0, 0);

    const edgePixels = edge.getContext('2d').getImageData(0, 0, 6, dash.height).data;
    const backing = [0, 1, 2].map((channel) => {
        let total = 0;

        for (let i = channel; i < edgePixels.length; i += 4) { total += edgePixels[i]; }

        return Math.round(total / (edgePixels.length / 4));
    });

    const layer = document.createElement('canvas');

    layer.width = W;
    layer.height = H;

    const lc = layer.getContext('2d');

    lc.imageSmoothingQuality = 'high';
    lc.fillStyle = `rgb(${backing[0]}, ${backing[1]}, ${backing[2]})`;
    lc.fillRect(0, 0, W, H);
    lc.drawImage(
        dash,
        input.placement.x, input.placement.y,
        dash.width / 2 * input.placement.scale,
        dash.height / 2 * input.placement.scale
    );
    lc.globalCompositeOperation = 'destination-in';
    lc.drawImage(mask, 0, 0);

    const out = document.createElement('canvas');

    out.width = W;
    out.height = H;

    const oc = out.getContext('2d');

    oc.fillStyle = '#fff';
    oc.fillRect(0, 0, W, H);
    oc.drawImage(layer, 0, 0);

    // --- connectors ----------------------------------------------------------
    oc.lineCap = 'round';
    input.icons.forEach((icon, index) => {
        const from = input.dots[index];

        if (!from) { return; }

        const to = {
            x: icon.x * input.placement.scale + input.placement.x,
            y: icon.y * input.placement.scale + input.placement.y
        };
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        // Stopped short, so the arrow points at the button instead of covering it.
        const end = { x: to.x - Math.cos(angle) * 15, y: to.y - Math.sin(angle) * 15 };

        oc.strokeStyle = input.red;
        oc.lineWidth = 3;
        oc.beginPath();
        oc.moveTo(from.x, from.y);
        oc.lineTo(end.x, end.y);
        oc.stroke();

        oc.fillStyle = input.red;
        oc.beginPath();
        oc.arc(from.x, from.y, 4.5, 0, Math.PI * 2);
        oc.fill();

        oc.beginPath();
        oc.moveTo(end.x + Math.cos(angle) * 9, end.y + Math.sin(angle) * 9);
        oc.lineTo(end.x + Math.cos(angle + 2.5) * 8, end.y + Math.sin(angle + 2.5) * 8);
        oc.lineTo(end.x + Math.cos(angle - 2.5) * 8, end.y + Math.sin(angle - 2.5) * 8);
        oc.closePath();
        oc.fill();
    });

    return out.toDataURL('image/jpeg', 0.92);
}, {
    source: SOURCE,
    dashboard: `data:image/png;base64,${dashboard.toString('base64')}`,
    placement: PLACEMENT,
    dots: DOTS,
    icons,
    red: RED
});

const bytes = Buffer.from(jpeg.split(',')[1], 'base64');

writeFileSync(join(root, OUTPUT), bytes);
console.log(`guide: ${OUTPUT} (${(bytes.length / 1024).toFixed(1)} kB, ${icons.length} buttons)`);

await browser.close();
server.close();
