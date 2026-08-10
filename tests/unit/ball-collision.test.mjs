/**
 * entity/ball.js decides what a hit does: which way the ball leaves a paddle,
 * blocks and other balls, and how its speed builds up. That is the logic a
 * player feels, and none of it needs a canvas -- the module takes every
 * collaborator through its define() list, so the real source runs here against
 * stubs.
 *
 * The real entity/_base.js is used rather than a fake, because the collision
 * code leans on its width/half-width accessors and their caching.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './amd-harness.mjs';

const PIXEL_RATIO = 1;
const BALL_SIZE = 10;

let Ball;
let createjs;
let speedReadings;

/**
 * Builds a Ball with the real prototype but without init(), which would need a
 * canvas, a preloaded sprite sheet and a live stage.
 *
 * @param {Object} [options]
 * @return {Object}
 */
function makeBall({ x = 0, y = 0, speedX = 0, speedY = 0, speedStep = 2 } = {}) {
    const ball = new Ball();
    const bitmap = new createjs.Bitmap({ width: BALL_SIZE, height: BALL_SIZE });

    bitmap.x = x;
    bitmap.y = y;
    ball.bitmap = bitmap;
    ball.speedX = speedX;
    ball.speedY = speedY;
    ball.speedStep = speedStep;
    ball.alive = true;

    return ball;
}

/** @return {Object} a paddle as ball.js consumes it */
function makePaddle({ x = 100, y = 200, width = 80, height = 12, glue = false } = {}) {
    return {
        id: 'paddle',
        getX: () => x,
        getY: () => y,
        getWidth: () => width,
        getHeight: () => height,
        isVisible: () => true,
        isCollidable: () => true,
        hasGlue: () => glue
    };
}

/** @return {Object} a block as ball.js consumes it */
function makeBlock({
    x = 100, y = 100, width = 38, height = 21,
    hardness = 1, destroyable = true, visible = true, collidable = true
} = {}) {
    return {
        id: 'block',
        getX: () => x,
        getY: () => y,
        getWidth: () => width,
        getHeight: () => height,
        getHardness: () => hardness,
        isDestroyable: () => destroyable,
        isVisible: () => visible,
        isCollidable: () => collidable
    };
}

beforeEach(() => {
    speedReadings = [];

    const loader = createLoader({
        'app/entity/tail': { createNew: () => null },
        'app/entity/explosion': { createNew: () => null },
        'app/sound': { play() {}, stop() {} },
        'app/game-options': { get: (key) => (key === 'fps_ratio' ? 1 : 60) },
        'app/stage': { add() {}, remove() {} },
        'app/preloader': { get: () => ({ width: BALL_SIZE, height: BALL_SIZE, src: '' }) },
        'app/input/_': { keyboard: { isPressed: () => false }, pointer: { x: 0, y: 0 } },
        'app/episodes/_': { getManifest: () => ({ ball: { tail: false, explosion: false } }) },
        'app/dashboard': {
            getSpeed: () => ({ set: (value) => speedReadings.push(value) })
        }
    });

    const EventEmitter = loader.load('js/app/core/event-emitter.js');

    loader.registry['app/core/_'] = {
        EventEmitter,
        helperApp: { pixelRatio: () => PIXEL_RATIO }
    };
    loader.load('js/app/entity/_base.js');

    createjs = loader.createjs;
    // The module exports a ready-made singleton; the constructor behind it is
    // what these tests need so each case gets an independent ball.
    Ball = loader.load('js/app/entity/ball.js').constructor;
});

describe('isCollision', () => {
    test('detects overlapping boxes', () => {
        const ball = makeBall({ x: 95, y: 95 });

        assert.equal(ball.isCollision(makeBlock({ x: 100, y: 100 })), true);
    });

    test('rejects boxes that are clear of each other', () => {
        const ball = makeBall({ x: 0, y: 0 });

        assert.equal(ball.isCollision(makeBlock({ x: 100, y: 100 })), false);
    });

    test('rejects a block that is hidden or has been switched off', () => {
        const ball = makeBall({ x: 95, y: 95 });

        assert.equal(ball.isCollision(makeBlock({ x: 100, y: 100, visible: false })), false);
        assert.equal(ball.isCollision(makeBlock({ x: 100, y: 100, collidable: false })), false);
    });

    test('counts edges that exactly touch', () => {
        // Ball spans 90..100, block starts at 100. The test is inclusive, so this
        // is a hit -- a ball must not slip through a wall of adjacent blocks.
        const ball = makeBall({ x: 90, y: 100 });

        assert.equal(ball.isCollision(makeBlock({ x: 100, y: 100 })), true);
    });
});

describe('bounce off a block', () => {
    test('a hit on the left or right face reverses horizontal travel only', () => {
        for (const dir of ['left', 'right']) {
            const ball = makeBall({ speedX: 3, speedY: 2 });

            assert.equal(ball.bounce(makeBlock(), dir), true);
            assert.ok(ball.speedX < 0, `${dir} must send it back the other way`);
            assert.ok(ball.speedY > 0, `${dir} must leave vertical travel alone`);
        }
    });

    test('a hit on the top or bottom face reverses vertical travel only', () => {
        for (const dir of ['top', 'bottom']) {
            const ball = makeBall({ speedX: 3, speedY: 2 });

            assert.equal(ball.bounce(makeBlock(), dir), true);
            assert.ok(ball.speedX > 0, `${dir} must leave horizontal travel alone`);
            assert.ok(ball.speedY < 0, `${dir} must send it back the other way`);
        }
    });

    test('an indestructible block still bounces the ball', () => {
        const ball = makeBall({ speedX: 3, speedY: 2 });

        assert.equal(ball.bounce(makeBlock({ destroyable: false, hardness: 0 }), 'top'), true);
        assert.ok(ball.speedY < 0);
    });

    test('a hidden or non-collidable block is ignored entirely', () => {
        const ball = makeBall({ speedX: 3, speedY: 2 });

        assert.equal(ball.bounce(makeBlock({ visible: false }), 'top'), false);
        assert.equal(ball.speedY, 2, 'velocity must be untouched');
        assert.equal(ball.bounce(makeBlock({ collidable: false }), 'top'), false);
        assert.equal(ball.speedY, 2);
    });

    test('a steel ball passes straight through a destructible block', () => {
        const ball = makeBall({ speedX: 3, speedY: 2 });

        ball.steelMode = true;

        // bounce() still reports the hit so the block can be destroyed, but the
        // trajectory is deliberately left alone.
        assert.equal(ball.bounce(makeBlock({ hardness: 1, destroyable: true }), 'top'), true);
        assert.equal(ball.speedY > 0, true, 'a steel ball keeps going');
    });
});

describe('bounce off the paddle', () => {
    const paddle = makePaddle({ x: 100, y: 200, width: 80 });

    /**
     * Places the ball's centre at a fraction across the paddle, above it.
     *
     * @param {number} fraction 0 = left edge, 0.5 = middle, 1 = right edge
     * @return {Object}
     */
    function ballOverPaddle(fraction) {
        return makeBall({
            x: 100 + 80 * fraction - BALL_SIZE / 2,
            y: 180,
            speedX: 1,
            speedY: 2
        });
    }

    test('sends the ball straight up from the middle', () => {
        const ball = ballOverPaddle(0.5);

        ball.bounce(paddle, 'top');

        assert.ok(Math.abs(ball.speedX) < 1e-9, 'no sideways component from a centre hit');
        assert.ok(ball.speedY < 0, 'and it must travel upwards');
    });

    test('steers left off the left half and right off the right half', () => {
        const left = ballOverPaddle(0.1);
        const right = ballOverPaddle(0.9);

        left.bounce(paddle, 'top');
        right.bounce(paddle, 'top');

        assert.ok(left.speedX < 0, 'the left of the paddle deflects the ball left');
        assert.ok(right.speedX > 0, 'the right of the paddle deflects the ball right');
        assert.ok(left.speedY < 0);
        assert.ok(right.speedY < 0);
    });

    test('deflects further the closer to the edge the hit is', () => {
        const near = ballOverPaddle(0.35);
        const far = ballOverPaddle(0.05);

        near.bounce(paddle, 'top');
        far.bounce(paddle, 'top');

        assert.ok(
            Math.abs(far.speedX) > Math.abs(near.speedX),
            'this angle control is the whole skill of the game'
        );
    });

    test('a glued paddle catches the ball without speeding it up', () => {
        const plain = ballOverPaddle(0.5);
        const glued = ballOverPaddle(0.5);

        plain.bounce(paddle, 'top');
        glued.bounce(makePaddle({ x: 100, y: 200, width: 80, glue: true }), 'top');

        assert.ok(plain.getSpeed() > 2, 'a normal return ramps the speed up');
        assert.equal(glued.getSpeed(), 2, 'a catch must not');
    });

    test('a ball striking from below only reverses horizontally', () => {
        // The paddle is above the ball, so the angled return does not apply.
        const ball = makeBall({ x: 130, y: 220, speedX: 3, speedY: -2 });

        ball.bounce(makePaddle({ x: 100, y: 200 }), 'bottom');

        assert.ok(ball.speedX < 0);
    });
});

describe('speed', () => {
    test('velocity magnitude tracks the speed step', () => {
        const ball = makeBall();

        ball.setSpeed(3, 0);

        assert.ok(Math.abs(Math.hypot(ball.speedX, ball.speedY) - 3 * 1.5) < 1e-3);
    });

    test('setAngle turns the ball without changing its speed', () => {
        const ball = makeBall({ speedStep: 3 });

        ball.setAngle(Math.PI / 4);

        const speed = Math.hypot(ball.speedX, ball.speedY);

        ball.setAngle(-Math.PI / 3);

        assert.ok(Math.abs(Math.hypot(ball.speedX, ball.speedY) - speed) < 1e-3);
        assert.ok(Math.abs(ball.getAngle() - -Math.PI / 3) < 1e-3);
    });

    test('each hit speeds the ball up', () => {
        const ball = makeBall({ speedX: 1, speedY: 1, speedStep: 2 });
        const before = ball.getSpeed();

        ball.bounce(makeBlock(), 'top');

        assert.ok(ball.getSpeed() > before);
    });

    test('speed is capped so the ball cannot outrun the paddle', () => {
        const ball = makeBall({ speedX: 1, speedY: 1, speedStep: 2 });

        for (let i = 0; i < 500; i++) {
            ball.increaseSpeed();
        }

        assert.equal(ball.getSpeed(), ball.maxSpeed);
    });

    test('steel mode builds speed faster', () => {
        const plain = makeBall({ speedX: 1, speedY: 1, speedStep: 2 });
        const steel = makeBall({ speedX: 1, speedY: 1, speedStep: 2 });

        steel.steelMode = true;
        plain.increaseSpeed();
        steel.increaseSpeed();

        assert.ok(steel.getSpeed() > plain.getSpeed());
    });

    test('decreaseSpeed is the inverse of increaseSpeed', () => {
        const ball = makeBall({ speedX: 1, speedY: 1, speedStep: 3 });

        ball.increaseSpeed(0.5);
        ball.decreaseSpeed(0.5);

        assert.ok(Math.abs(ball.getSpeed() - 3) < 1e-9);
    });

    test('the dashboard is only fed by the ball the player is controlling', () => {
        const ball = makeBall({ speedX: 1, speedY: 1 });

        ball.setSpeed(3, 0);
        assert.deepEqual(speedReadings, [], 'a spare ball must not drive the readout');

        ball.setAsMainEntity(true);
        ball.setSpeed(4, 0);
        assert.deepEqual(speedReadings, [4]);
    });
});

describe('bounce between two balls', () => {
    test('reverses the axis the hit came from', () => {
        const ball = makeBall({ speedX: 2, speedY: 3 });
        const other = makeBall({ x: 20, y: 0 });

        other.id = 'ball';
        other.isVisible = () => true;
        other.isCollidable = () => true;

        assert.equal(ball.bounce(other, 'left'), true);
        assert.ok(ball.speedX < 0);
        assert.ok(ball.speedY > 0);
    });
});
