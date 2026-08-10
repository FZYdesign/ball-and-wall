/**
 * core/math.js is the geometry the whole game rests on: every ball/block and
 * ball/paddle hit resolves through intersect(), intercept() and entityIntersect().
 * It has no dependencies at all, so it is tested directly.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeEntity } from './entity-double.mjs';
import math from '../../js/app/core/math.js';

describe('move', () => {
    test('advances by velocity times delta and reports the step taken', () => {
        const result = math.move(10, 20, 3, -4, 2);

        assert.equal(result.x, 16);
        assert.equal(result.y, 12);
        assert.equal(result.nx, 6);
        assert.equal(result.ny, -8);
        // Velocity is carried through untouched -- move() does not bounce.
        assert.equal(result.dx, 3);
        assert.equal(result.dy, -4);
    });

    test('a zero delta leaves the position alone', () => {
        const result = math.move(10, 20, 3, -4, 0);

        assert.equal(result.x, 10);
        assert.equal(result.y, 20);
    });
});

describe('magnitudes', () => {
    test('pointMagnitude is the distance from the origin', () => {
        assert.equal(math.pointMagnitude(3, 4), 5);
        assert.equal(math.pointMagnitude(0, 0), 0);
        assert.equal(math.pointMagnitude(-3, -4), 5);
    });

    test('vectorMagnitude is the distance between two points', () => {
        assert.equal(math.vectorMagnitude(1, 1, 4, 5), 5);
        assert.equal(math.vectorMagnitude(2, 2, 2, 2), 0);
        // Direction must not matter.
        assert.equal(math.vectorMagnitude(4, 5, 1, 1), 5);
    });
});

describe('intercept', () => {
    test('returns the crossing point of two segments', () => {
        const point = math.intercept(0, 0, 10, 10, 0, 10, 10, 0);

        assert.ok(point);
        assert.equal(point.x, 5);
        assert.equal(point.y, 5);
    });

    test('returns null for parallel segments', () => {
        // The `n === 0` guard in the source is an early-out, not a correctness
        // requirement: without it the division yields +/-Infinity or NaN, and the
        // range checks below reject those anyway.
        assert.equal(math.intercept(0, 0, 10, 0, 0, 5, 10, 5), null);
    });

    test('returns null when the lines cross beyond the segments', () => {
        // The infinite lines meet at (10, 10), past the end of both segments.
        assert.equal(math.intercept(0, 0, 5, 5, 0, 20, 5, 15), null);
    });

    test('returns null when the crossing lies beyond the second segment only', () => {
        // The first segment does span the crossing at (5, 0), so checking that
        // alone is not enough -- the second segment stops short of it. This is
        // what keeps a ball from bouncing off a block face it is not level with.
        assert.equal(math.intercept(0, 0, 10, 0, 5, 1, 5, 5), null);
    });

    test('counts a touch at a segment endpoint as a crossing', () => {
        const point = math.intercept(0, 0, 10, 0, 10, -5, 10, 5);

        assert.ok(point, 'a ball arriving exactly on the boundary must still register');
        assert.equal(point.x, 10);
        assert.equal(point.y, 0);
    });
});

describe('intersect', () => {
    const block = makeEntity({ x: 100, y: 100, width: 40, height: 20 });

    test('returns null when the projected position stays clear', () => {
        const ball = makeEntity({ x: 0, y: 0, width: 10, height: 10 });

        assert.equal(math.intersect(ball, block, 5, 5), null);
    });

    test('detects an overlap only after the step is applied', () => {
        // Resting just left of the block, moving right into it.
        const ball = makeEntity({ x: 85, y: 105, width: 10, height: 10 });

        assert.equal(math.intersect(ball, block, 0, 0), null, 'not yet touching');
        assert.ok(math.intersect(ball, block, 10, 0), 'overlapping once the step lands');
    });

    test('pushes the ball back out on the side it came from', () => {
        const fromLeft = math.intersect(
            makeEntity({ x: 85, y: 105, width: 10, height: 10 }), block, 10, 0
        );
        const fromRight = math.intersect(
            makeEntity({ x: 145, y: 105, width: 10, height: 10 }), block, -10, 0
        );

        assert.ok(fromLeft.x < 95, 'a ball entering from the left is pushed further left');
        assert.ok(fromRight.x > 135, 'a ball entering from the right is pushed further right');
    });

    test('a grazing corner contact does not count as a hit', () => {
        // Exactly corner-to-corner: dx and dy are 0, and the separation test
        // requires both to be strictly negative.
        const ball = makeEntity({ x: 90, y: 90, width: 10, height: 10 });

        assert.equal(math.intersect(ball, block, 0, 0), null);
    });
});

describe('entityIntersect', () => {
    const block = makeEntity({ x: 100, y: 100, width: 40, height: 20 });

    test('reports a horizontal approach as the side the ball is heading for', () => {
        const hit = math.entityIntersect(
            makeEntity({ x: 85, y: 105, width: 10, height: 10 }), block, 10, 0
        );

        assert.ok(hit);
        assert.equal(hit.dir, 'left', 'moving right means it strikes the left face');
    });

    test('reports the opposite face for the opposite approach', () => {
        const hit = math.entityIntersect(
            makeEntity({ x: 145, y: 105, width: 10, height: 10 }), block, -10, 0
        );

        assert.ok(hit);
        assert.equal(hit.dir, 'right');
    });

    test('reports a purely vertical approach against the top face', () => {
        const hit = math.entityIntersect(
            makeEntity({ x: 110, y: 85, width: 10, height: 10 }), block, 0, 10
        );

        assert.ok(hit);
        assert.equal(hit.dir, 'top');
    });

    test('reports a purely upward approach against the bottom face', () => {
        const hit = math.entityIntersect(
            makeEntity({ x: 110, y: 125, width: 10, height: 10 }), block, 0, -10
        );

        assert.ok(hit);
        assert.equal(hit.dir, 'bottom');
    });

    test('returns null when the step does not reach', () => {
        assert.equal(
            math.entityIntersect(makeEntity({ x: 0, y: 0, width: 10, height: 10 }), block, 1, 1),
            null
        );
    });

    test('resolves a diagonal approach by which face the path actually crosses', () => {
        // Direction is decided in two stages. intersect() is only the cheap gate
        // -- "does the projected box overlap at all". entityIntercept() then
        // traces the ball's path against each face, and when it finds a crossing
        // its answer wins. Here the ball moves down-and-right but arrives over
        // the top face, and 'top' is what it must report: bouncing it off the
        // left face would send it back the way it came.
        const hit = math.entityIntersect(
            makeEntity({ x: 95, y: 85, width: 10, height: 10 }), block, 10, 10
        );

        assert.ok(hit);
        assert.equal(hit.dir, 'top');
    });

    test('falls back to the direction of travel when already inside the block', () => {
        // A ball that starts overlapping crosses no face, so entityIntercept()
        // finds nothing and the sign of the step is all there is to go on. This
        // is the path that unsticks a ball spawned or teleported into a block.
        const inside = makeEntity({ x: 105, y: 105, width: 10, height: 10 });

        assert.equal(math.entityIntercept(inside, block, 1, 0), null);
        assert.equal(math.entityIntersect(inside, block, 1, 0).dir, 'left');
        assert.equal(math.entityIntersect(inside, block, 0, -1).dir, 'bottom');
    });
});
