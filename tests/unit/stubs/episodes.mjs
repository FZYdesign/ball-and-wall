/** Only the manifest fields the ball reads during construction. */
export default {
    getName: () => 'space',
    getManifest: () => ({ ball: { tail: false, explosion: false } }),
    getBlocks: () => [],
    getBonuses: () => []
};
