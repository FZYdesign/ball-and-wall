import core from '../core/_.js';

var
    /**
     * Interface that sits over the page rather than in the play field. Pointer
     * events landing here are someone operating a control, not aiming the
     * paddle -- the dashboard toggle in particular sits at the far left, so
     * without this every tap on it threw the paddle to x = 0.
     *
     * @property UI_CHROME
     * @static
     */
    UI_CHROME = '#a-hud-toggle, .lbx-window, .lbx-overlay';

/**
 * Reports the pointer in *stage* coordinates -- the canvas backing-store
 * pixels the game's geometry is expressed in -- not CSS pixels. The canvas is
 * both device-pixel-scaled and, on small screens, scaled down to fit, so the
 * two differ by up to 3x on a phone. Doing the conversion once here keeps the
 * mapping in a single place instead of leaving each consumer to correct for
 * it (paddle.js used to; stage.js's parallax forgot to).
 */
function Pointer() {
    core.EventEmitter.call(this);
    this.canvasElement = $('#a-game-canvas');
    // Pointer Events cover mouse, touch and pen through one code path, so
    // there is nothing to feature-detect. Kept for callers that ask.
    this.isTouchDevice = navigator.maxTouchPoints > 0;
    this.x = 0;
    this.y = 0;
    this.leftClick = false;
    this.rightClick = false;
    this.canvasCoords = {};
    this.initialize();
}

Pointer.prototype = Object.create(core.EventEmitter.prototype, {
    constructor: {
        value: Pointer,
        enumerable: false
    }
});

/**
 * @method initialize
 */
Pointer.prototype.initialize = function() {
    this.onResize();
    this.initEvents();
};

/**
 * @method updateStageCoords
 */
Pointer.prototype.updateStageCoords = function() {
    this.onResize();
};

/**
 * @method initEvents
 */
Pointer.prototype.initEvents = function() {
    var _this = this, d = $(document);

    d.bind('pointerdown', function(event) {
        _this.onPointerDown(event);
    });
    d.bind('pointerup', function(event) {
        _this.onPointerUp(event);
    });
    d.bind('pointercancel', function(event) {
        _this.onPointerUp(event);
    });
    d.bind('pointermove', function(event) {
        _this.onPointerMove(event);
    });

    // The canvas rect moves when the viewport changes, and scrolling shifts
    // it relative to the client coordinates the events report.
    $(window).bind('resize orientationchange scroll', $.proxy(this.onResize, this));
    this.canvasElement.bind('click', $.proxy(this.onCanvasClick, this));
};

/**
 * @method isClick
 * @return {Boolean}
 */
Pointer.prototype.isClick = function() {
    return this.isLeftClick();
};

/**
 * @method isLeftClick
 * @return {Boolean}
 */
Pointer.prototype.isLeftClick = function() {
    return this.leftClick;
};

/**
 * @method isRightClick
 * @return {Boolean}
 */
Pointer.prototype.isRightClick = function() {
    return this.rightClick;
};

/**
 * @method onCanvasClick
 */
Pointer.prototype.onCanvasClick = function() {
//        this.fireEvent('click');
};

/**
 * @method onPointerDown
 */
Pointer.prototype.onPointerDown = function(event) {
    // Touch and pen contacts both report button 0, so this needs no branch.
    if ( event.button === 0 ) {
        this.leftClick = true;
    } else if ( event.button === 2 ) {
        this.rightClick = true;
    }
    // A touch only reports a position when it starts, so seed it here or the
    // paddle jumps from wherever the previous contact left it.
    this.onPointerMove(event);
};

/**
 * @method onPointerUp
 */
Pointer.prototype.onPointerUp = function(event) {
    // pointercancel carries no button, so clear both rather than trust it.
    if ( event.type === 'pointercancel' ) {
        this.leftClick = false;
        this.rightClick = false;

        return;
    }
    if ( event.button === 0 ) {
        this.leftClick = false;
    } else if ( event.button === 2 ) {
        this.rightClick = false;
    }
};

/**
 * @method onPointerMove
 * @param {Object} event
 */
Pointer.prototype.onPointerMove = function(event) {
    var coords = this.canvasCoords, dx, dy;

    // Secondary contacts of a multi-touch gesture would fight the primary one
    // over the paddle position.
    if ( event.isPrimary === false ) {
        return;
    }
    // Operating the interface must not move the paddle. The position is left
    // exactly as it was, so a round resumes where the player left it.
    if ( event.target && event.target.closest && event.target.closest(UI_CHROME) ) {
        return;
    }
    if ( !coords.width || !coords.height ) {
        this.onResize();
        coords = this.canvasCoords;

        if ( !coords.width || !coords.height ) {
            return;
        }
    }
    dx = event.clientX - coords.left;
    dy = event.clientY - coords.top;

    dx = dx > 0 ? (dx < coords.width ? dx : coords.width) : 0;
    dy = dy > 0 ? (dy < coords.height ? dy : coords.height) : 0;

    this.x = dx * coords.scaleX;
    this.y = dy * coords.scaleY;
};

/**
 * Caches the canvas rect and the CSS-pixel -> stage-pixel factors.
 *
 * @method onResize
 */
Pointer.prototype.onResize = function() {
    var canvas = this.canvasElement[0], rect;

    if ( !canvas ) {
        return;
    }
    // getBoundingClientRect(), unlike jQuery's width()/offset(), reflects the
    // fit-to-viewport transform and is in the same client space as the events.
    rect = canvas.getBoundingClientRect();

    this.canvasCoords = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        scaleX: rect.width ? canvas.width / rect.width : 1,
        scaleY: rect.height ? canvas.height / rect.height : 1
    };
};

var instance = null;

if ( instance === null ) {
    instance = new Pointer();
}

export default instance;
