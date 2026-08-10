/**
 * A duck-typed collision participant. core/math.js only ever asks an entity for
 * these six accessors, which is what makes the geometry testable in isolation.
 *
 * @param {{x: number, y: number, width: number, height: number}} box
 * @return {Object}
 */
export function makeEntity({ x, y, width, height }) {
    return {
        getX: () => x,
        getY: () => y,
        getWidth: () => width,
        getHeight: () => height,
        getHalfWidth: () => width / 2,
        getHalfHeight: () => height / 2
    };
}
