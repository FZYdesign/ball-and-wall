/** Records what the game tried to play, so tests can assert on it if needed. */
export const played = [];

export default {
    play(name) { played.push(name); },
    stop() {},
    playMusic() {},
    stopMusic() {}
};
