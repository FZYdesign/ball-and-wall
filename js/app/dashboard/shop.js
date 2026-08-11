import Base from './_base.js';
import episode from '../episodes/_.js';

/**
 * The shop entry point on the dashboard: a trolley icon that opens the shop
 * window.
 *
 * The icon is drawn rather than blitted -- strokes and two circles -- because
 * the alternative is a new sprite in every episode's resource manifest, at both
 * 1x and @2x, before the feature can be turned on anywhere. Drawing it also
 * means it is sharp at whatever backing-store scale the device asks for, which
 * a 1x sprite would not be. Position and colours come from the manifest so an
 * episode can still make it look like its own.
 *
 * The balance itself is not here: it lives in app/coin-hud.js, outside the
 * dashboard canvas, because it has to stay readable while the dashboard is
 * parked off screen.
 */
function DashboardShop(dashboard) {
    var options = (episode.getManifest().dashboard || {}).shop;

    Base.call(this);
    this.options = options;
    this.entity = null;
    this.initialize(dashboard);

    if ( options ) {
        this._build();
    }
}

DashboardShop.prototype = Object.create(Base.prototype, {
    constructor: {
        value: DashboardShop,
        enumerable: false
    }
});

/**
 * @method initialize
 * @param {Dashboard} dashboard
 */
DashboardShop.prototype.initialize = function(dashboard) {
    Base.prototype.initialize.call(this, dashboard);
};

/**
 * @method _build
 * @private
 */
DashboardShop.prototype._build = function() {
    var _this = this,
        icon = this.options.icon,
        container = new createjs.Container();

    container.addChild(this._cart(icon));
    container.x = icon.x;
    container.y = icon.y;
    container.cursor = 'pointer';
    // The drawn strokes are thin, so a hit area covering the whole square is
    // what makes this tappable on a phone rather than a test of aim.
    container.hitArea = this._hitArea(icon.size);
    container.addEventListener('click', function() {
        _this.dashboard.emit('clickShop');
    });

    this.entity = container;
};

/**
 * A shopping trolley, drawn to fit a `size` x `size` box: basket, handle and
 * two wheels.
 *
 * @method _cart
 * @param {Object} icon manifest entry
 * @return {createjs.Shape}
 * @private
 */
DashboardShop.prototype._cart = function(icon) {
    var shape = new createjs.Shape(),
        size = icon.size,
        // Everything below is a fraction of the box, so the same drawing works
        // at 1x and at the doubled backing store of a retina screen.
        unit = size / 24,
        stroke = Math.max(1, Math.round(1.6 * unit)),
        // The basket: a trapezoid, wider at the top.
        basketTop = 7 * unit,
        basketBottom = 16 * unit,
        basketLeft = 6 * unit,
        basketRight = 21 * unit,
        wheelRadius = 1.7 * unit;

    shape.graphics
            // Handle: up and left out of the basket, the way a trolley is drawn.
            .setStrokeStyle(stroke, 'round', 'round')
            .beginStroke(icon.color)
            .moveTo(2 * unit, 3.5 * unit)
            .lineTo(4.6 * unit, 3.5 * unit)
            .lineTo(basketLeft, basketTop)
            // Basket.
            .moveTo(basketLeft, basketTop)
            .lineTo(basketRight, basketTop)
            .lineTo(19 * unit, basketBottom)
            .lineTo(9 * unit, basketBottom)
            .closePath()
            // The two dividers that make it read as a basket rather than a box.
            .moveTo(10.7 * unit, basketTop)
            .lineTo(11.6 * unit, basketBottom)
            .moveTo(15.4 * unit, basketTop)
            .lineTo(15.2 * unit, basketBottom)
            .endStroke()
            // Wheels.
            .beginFill(icon.color)
            .drawCircle(11 * unit, 19.5 * unit, wheelRadius)
            .drawCircle(17.5 * unit, 19.5 * unit, wheelRadius)
            .endFill();

    return shape;
};

/**
 * @method _hitArea
 * @param {Number} size
 * @return {createjs.Shape}
 * @private
 */
DashboardShop.prototype._hitArea = function(size) {
    var area = new createjs.Shape();

    area.graphics.beginFill('#000').drawRect(0, 0, size, size);

    return area;
};

/**
 * Nothing here changes between rounds, so the base class's blank-on-game-over
 * would only erase a static icon.
 *
 * @method reset
 */
DashboardShop.prototype.reset = function() {};

/**
 * @method update
 */
DashboardShop.prototype.update = function() {};

export default DashboardShop;
