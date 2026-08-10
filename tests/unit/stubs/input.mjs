/** app/input/_.js binds DOM events at module scope. */
export default {
    keyboard: { isPressed: () => false },
    pointer: { x: 0, y: 0, isClick: () => false, updateStageCoords() {} }
};
