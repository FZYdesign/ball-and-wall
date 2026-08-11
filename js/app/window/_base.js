import core from '../core/_.js';

var
    /**
     * Room left around a fitted window, in CSS pixels.
     *
     * The close and minimise buttons are positioned at `top: -5px; right: -5px`
     * -- deliberately outside the window box -- so a window scaled to exactly
     * the viewport puts them off screen. That is not a rounding error: on any
     * short landscape phone the close button was the one control the player
     * could not reach, and `iphone5-landscape.css` makes the window 100% x 100%,
     * where it is off screen at every size.
     *
     * Reserving the outset unscaled is deliberately conservative -- the buttons
     * are inside the transform, so they need less than this once scaled.
     *
     * @property OUTSET
     * @static
     * @private
     */
    OUTSET = 8;

function Base() {
    core.EventEmitter.call(this);
    this.name = '';
    this.className = '';
    this.showOverlay = false;
    this.showMinimizeButton = false;
    this.showCloseButton = true;
    this.options = {};
    this.closeTimer = null;
    this.scale = 1;
    // A window is laid out once, at its authored size, and then fitted to the
    // viewport. Rotating the device or resizing the window changes what it has
    // to fit into, so the fit is redone rather than left where it was.
    $(window).bind('resize orientationchange', $.proxy(this._onViewportChange, this));
}

Base.prototype = Object.create(core.EventEmitter.prototype, {
    constructor: {
        value: Base,
        enumerable: false
    }
});

/**
 * @method initialize
 * @param {Object} options
 */
Base.prototype.initialize = function(options) {
    this.options = $.extend(this.options, options || {});
    this.builder = new core.Builder();
    this.workingHeader = this.header();
    this.workingModel = this.model();
};

/**
 * @method open
 * @param {Object} options
 */
Base.prototype.open = function(options) {
    clearTimeout(this._closeTimer);
    this.options = $.extend(this.options, options || {});

    if ( this.isMinimized() ) {
        this.content.show();

        if ( this.overlay ) {
            this.overlay.show();
        }
        this._fit();
    } else {
        this.workingHeader = this.header();
        this.workingModel = this.model();
        this._buildHtml();
        this.content.addClass('lbx-showed');
        // After the class, not before: the open animation runs from the
        // stylesheet's scale(0.1) to whatever scale actually fits, and an
        // inline transform set first would be the starting point instead.
        this._fit();
        this.emit('open');
    }
    document.onmousedown = function() { return true; };
    core.mediator.emit('windowOpen', this.isMinimized());
};

/**
 * @method close
 */
Base.prototype.close = function() {
    if ( !this.content ) {
        return;
    }
    this.content.removeClass('lbx-showed');
    this._closeTimer = setTimeout($.proxy(function() {
        this.content.remove();
        this.content = null;

        if ( this.overlay ) {
            this.overlay.remove();
            this.overlay = null;
        }
        window.scrollTo(0, 0);
        this.emit('close');

        if ( !$('.lbx-window').length ) {
            document.onmousedown = function() { return false; };
        }
        core.mediator.emit('windowClose');
    }, this), 400);
};

/**
 * @method minimize
 */
Base.prototype.minimize = function() {
    this.content.hide();

    if ( this.overlay ) {
        this.overlay.hide();
    }
    this.fireEvent('minimize');
};

/**
 * @method toggle
 * @param {Object} options
 */
Base.prototype.toggle = function(options) {
    this[this.isOpened() && !this.isMinimized() ? 'close' : 'open'](options);
};

/**
 * @method isOpened
 * @return {Boolean}
 */
Base.prototype.isOpened = function() {
    return this.content && this.content.hasClass('lbx-showed') ? true : false;
};

/**
 * @method isMinimized
 * @return {Boolean}
 */
Base.prototype.isMinimized = function() {
    return this.content && this.content.css('display') == 'none';
};

/**
 * @method setTitle
 * @param {String} title
 */
Base.prototype.setTitle = function(title) {
    if ( this.isOpened() ) {
        this.content.find('.lbx-header').html(title);
    }
};

/**
 * @method setScrollableContent
 * @param {String} selector
 */
Base.prototype.setScrollableContent = function(selector) {
    var needStopPropagation = false;

    $('body').on('touchstart', selector, function(event) {
        var target = event.currentTarget;

        needStopPropagation = target.scrollHeight > target.offsetHeight;

        if ( target.scrollTop <= 2 ) {
            target.scrollTop = 2;
        } else if ( target.scrollHeight >= target.scrollTop + target.offsetHeight - 2 ) {
            target.scrollTop -= 2;
        }
    });
    $('body').on('touchmove', selector, function(event) {
        if ( needStopPropagation ) {
            event.stopPropagation();
        }
    });
};

/**
 * @method _buildHtml
 */
Base.prototype._buildHtml = function() {
    var content, overlay, contentClass;

    if ( this.content ) {
        return this;
    }
    overlay = {tag: 'div', className: 'lbx-overlay lbx-overlay-' + this.className.replace('lbx-', '')};

    if ( this.showOverlay ) {
        this.overlay = this.builder.buildDomModel(document.body, overlay);
    }
    // The layout has always resolved to no-ads; the ad slots are gone entirely
    // now, but the class still carries the sizing rules the modals depend on.
    contentClass = 'lbx-window no-ads ' + (this.className || '');
    content = {tag: 'div', className: contentClass, styles: {visibility: 'hidden'},
        childs: [
            this.showCloseButton ? {tag: 'a', id: 'exit', events: [{click: this.close.bind(this)}]} : {},
            this.showMinimizeButton ? {tag: 'a', id: 'minimize', events: [{click: this.minimize}]} : {},
            {tag: 'span', className: 'lbx-header', html: this.workingHeader},
            {tag: 'div', className: 'lbx-content',
                childs: [/** Wypelniane html-em lub modelem **/]
            },
            {tag: 'span', className: 'lbx-footer'}
        ]
    };
    if ( $.isPlainObject(this.workingModel) ) {
        content.childs[3].childs[0] = this.workingModel;
    } else {
        content.childs[3].childs.push({tag: 'p', className: 'simple-text', html: this.workingModel});
    }

    this.content = this.builder.buildDomModel(document.body, content);
    this.content.css(this._center());
    this.content.css('visibility', 'visible');

    return this;
};

/**
 * Centres the window and, when it is bigger than the viewport, scales it down
 * until it fits.
 *
 * Every modal is laid out at a fixed pixel size chosen per breakpoint, and the
 * breakpoints are picked by viewport *width*. A landscape phone is wide and
 * short -- a 863x360 Pixel 7 gets the 800-wide rules, whose round chooser is
 * 410px tall -- so the window was taller than the screen and the button at the
 * bottom of it could not be reached. Clamping the position to `top: 0`, as this
 * used to, only decides which end gets cut off.
 *
 * Scaling rather than reflowing is the same trade the play field makes in
 * app/stage.js: one factor keeps the composition the artwork was drawn for,
 * where re-laying-out fifteen fixed-size dialogs would not. It never scales
 * up, so anything that already fitted is untouched.
 *
 * @method _fit
 * @return {Base}
 */
Base.prototype._fit = function() {
    var w, width, height, scale;

    if ( !this.content ) {
        return this;
    }
    w = $(window);
    // The window plus the margin its overhanging controls need on every side.
    width = this.content.outerWidth() + OUTSET * 2;
    height = this.content.outerHeight() + OUTSET * 2;
    scale = Math.min(w.width() / width, w.height() / height, 1);

    if ( !isFinite(scale) || scale <= 0 ) {
        scale = 1;
    }
    this.scale = scale;
    this.content.css(this._center());
    // scale(1) is left to the stylesheet so an untouched window keeps exactly
    // the transform -- and the transition -- it always had.
    this.content.css('transform', scale === 1 ? '' : 'scale(' + scale + ')');

    return this;
};

/**
 * The layout position, before scaling. The transform's origin is the centre of
 * the window, so a box centred here stays centred however far it is scaled
 * down -- which is why this no longer clamps to zero. Clamping would push the
 * *layout* box back on screen and take the visible, scaled one off-centre.
 *
 * @method _center
 */
Base.prototype._center = function() {
    var pos = {top: 0, left: 0},
        w = $(window);

    pos.left = (w.width() / 2) - (this.content.outerWidth() / 2);
    pos.top = w.scrollTop() + (w.height() / 2) - (this.content.outerHeight() / 2);

    return pos;
};

/**
 * @method _onViewportChange
 * @private
 */
Base.prototype._onViewportChange = function() {
    if ( this.content && !this.isMinimized() ) {
        this._fit();
    }
};

export default Base;
