/**
 * Helpers shared by the specs.
 *
 * The game persists everything through one localStorage key, so seeding that key
 * before the page scripts run is what gives a test a deterministic starting
 * state -- no first-run tour, no audio. Driving the tour through the DOM instead
 * would make every spec depend on its markup.
 */

/** Matches core/storage/local.js: base namespace + the game-options namespace. */
export const STORAGE_KEY = 'baw-storage:game-options';

/**
 * Sub-objects are merged shallowly by game-options.js, so each one has to be
 * given in full or the defaults for its siblings are lost.
 */
export const CLEAN_STATE = {
    'window-games': { showOnStartup: false, game: 'space' },
    'window-options': {
        music: 'off',
        sound: 'off',
        lang: 'en-us',
        fps: 60
    },
    'window-first-time': { needToShow: false },
    'window-rounds': { data: [] }
};

/**
 * Console messages that are environment noise rather than defects.
 * - Autoplay: Chrome blocks WebAudio until a user gesture; the game starts music
 *   on load, so this always fires under automation.
 */
const IGNORED_CONSOLE = [
    /The AudioContext was not allowed to start/,
    /willReadFrequently/
];

/**
 * Seeds a clean profile and starts collecting console errors and failed requests.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [state] overrides merged over CLEAN_STATE
 * @return {{consoleErrors: string[], failedRequests: string[]}}
 */
export async function prepare(page, state = {}) {
    const consoleErrors = [];
    const failedRequests = [];

    await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
        [STORAGE_KEY, { ...CLEAN_STATE, ...state }]
    );

    page.on('console', (message) => {
        if (message.type() !== 'error' && message.type() !== 'warning') {
            return;
        }
        const text = message.text();

        if (!IGNORED_CONSOLE.some((pattern) => pattern.test(text))) {
            consoleErrors.push(`[${message.type()}] ${text}`);
        }
    });
    page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${error.message}`));
    page.on('requestfailed', (request) => {
        failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`);
    });
    page.on('response', (response) => {
        if (response.status() >= 400) {
            failedRequests.push(`${response.status()} ${response.url()}`);
        }
    });

    return { consoleErrors, failedRequests };
}

/**
 * Waits until the frame loop is attached and the episode has been applied --
 * the two things `Game.onPreloaderComplete` does last.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function waitForBoot(page) {
    await page.waitForFunction(
        () => Boolean(window.createjs)
            && window.createjs.Ticker.hasEventListener('tick')
            && document.body.id !== '',
        null,
        { timeout: 45_000 }
    );
}

/**
 * Reads live game state out of the page through window.BallAndWall, the handle
 * js/index.js publishes for exactly this purpose.
 *
 * @param {import('@playwright/test').Page} page
 * @return {Promise<Object>}
 */
export function readState(page) {
    return page.evaluate(() => {
        const levels = window.BallAndWall.levels;
        const entities = window.BallAndWall.entities;
        const dashboard = window.BallAndWall.dashboard;

        return {
            episode: document.body.id,
            blocks: levels.getBlocks().getLength(),
            balls: entities.balls.getLength(),
            paddles: entities.paddles.getLength(),
            round: dashboard.getRound().get(),
            lives: dashboard.getLives().get(),
            ticking: window.createjs.Ticker.hasEventListener('tick')
        };
    });
}

/**
 * Proportion of sampled canvas pixels that are non-transparent. Used as a
 * "something was actually rendered" signal that does not depend on internals.
 *
 * @param {import('@playwright/test').Page} page
 * @return {Promise<number>}
 */
export function paintedRatio(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('a-game-canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let painted = 0;
        let sampled = 0;

        for (let i = 3; i < data.length; i += 400) {
            sampled += 1;
            if (data[i] > 0) {
                painted += 1;
            }
        }

        return sampled ? painted / sampled : 0;
    });
}

/**
 * Drags a single touch contact across the play field.
 *
 * Playwright's touchscreen only taps, so this goes through CDP to get real
 * touch-derived pointer events -- the path a phone actually takes, and the one
 * that would regress if the input layer went back to mouse-only listeners.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number[]} fractions horizontal positions across the canvas, 0..1
 * @return {Promise<number[]>} pointer.x in stage pixels after each step
 */
export async function touchDrag(page, fractions) {
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('#a-game-canvas').boundingBox();
    const y = box.y + box.height * 0.9;
    const readings = [];

    for (const [index, fraction] of fractions.entries()) {
        const x = box.x + box.width * fraction;

        await cdp.send('Input.dispatchTouchEvent', {
            type: index === 0 ? 'touchStart' : 'touchMove',
            touchPoints: [{ x, y }]
        });
        await page.waitForTimeout(250);
        readings.push(await page.evaluate(() => window.BallAndWall.input.pointer.x));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    return readings;
}

/**
 * Starts a specific round from the rounds window, the way a player would.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [level] zero-based
 */
export async function startRound(page, level = 0) {
    await page.click('#a-game-canvas');
    await page.waitForSelector('.lbx-rounds', { state: 'visible' });
    await page.click(`.lbx-rounds .option-item-entry[data-id="${level}"]`);
    await page.click('.lbx-rounds .btn.secondary a');
    await page.waitForFunction(
        () => window.BallAndWall.entities.balls.getLength() > 0,
        null,
        { timeout: 20_000 }
    );
}
