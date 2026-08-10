/** app/game-options.js reads localStorage at module scope; this does not. */
export default {
    get: (key) => (key === 'fps_ratio' ? 1 : 60),
    set() {},
    addListener() {},
    isLoaded: () => true
};
