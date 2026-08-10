/** Stand-in for app/stage.js, which builds a CreateJS stage against real DOM. */
export default {
    add() {},
    remove() {},
    getWidth: () => 798,
    getHeight: () => 462,
    getScale: () => 1,
    getPaddles: () => ({ reset: () => ({ current: () => null }) }),
    getBalls: () => ({ reset: () => ({ current: () => null }) }),
    getBlocks: () => ({ getChilds: () => [] })
};
