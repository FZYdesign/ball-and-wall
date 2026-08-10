/** Captures the speed readings the ball pushes to the HUD. */
export const speedReadings = [];

export default {
    getSpeed: () => ({
        set(value) { speedReadings.push(value); },
        reset() { speedReadings.length = 0; }
    })
};
