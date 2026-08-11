import core from './core/_.js';
import wallet from './wallet.js';
import catalog from './shop/catalog.js';
import powerups from './shop/powerups.js';
import i18 from './i18/_.js';

/**
 * The strip of bought items, and the only way to spend one.
 *
 * It is DOM rather than another canvas layer for two reasons: it has to be
 * tappable at a sensible size on a phone whatever the play field is scaled to,
 * and it must survive the dashboard being parked off-screen -- which is exactly
 * when a player most needs to reach an item.
 *
 * It sits in the letterbox margin beside the field. The field is landscape and
 * a phone held landscape is wider still, so it is height-constrained and that
 * margin always exists; the dashboard toggle uses the same reasoning on the
 * other side. It is registered as interface chrome in input/pointer.js, so
 * tapping an item does not drag the paddle across the field with it.
 */
function ItemBar() {
    this.element = null;
    this.visible = false;
    this.muted = false;
    this.initEvents();
}

/**
 * @method initEvents
 */
ItemBar.prototype.initEvents = function() {
    core.mediator.addListener('game:game-start', $.proxy(this.onGameStart, this));
    core.mediator.addListener('game:level-start', $.proxy(this.onGameStart, this));
    core.mediator.addListener('game:game-over', $.proxy(this.onGameOver, this));
    core.mediator.addListener('game:stage-clear', $.proxy(this.onGameOver, this));
    // The panel covers the field and holds the round; items must not be
    // usable while it is open, or they would fire into a paused game.
    core.mediator.addListener('hud:visibility', $.proxy(this.onDashboardVisibility, this));
    core.mediator.addListener('windowOpen', $.proxy(this.onWindowOpen, this));
    core.mediator.addListener('windowClose', $.proxy(this.onWindowClose, this));
    wallet.addListener('change', $.proxy(this.render, this));
};

/**
 * @method show
 * @param {Boolean} visible
 * @return {ItemBar}
 */
ItemBar.prototype.show = function(visible) {
    this.visible = Boolean(visible);
    this.render();

    return this;
};

/**
 * @method isVisible
 * @return {Boolean}
 */
ItemBar.prototype.isVisible = function() {
    return this.visible;
};

/**
 * @method render
 * @return {ItemBar}
 */
ItemBar.prototype.render = function() {
    var _this = this,
        owned = wallet.getItems(),
        ids = Object.keys(owned);

    this._element();

    // Nothing owned means nothing to show. An empty strip beside the field is
    // just clutter over the game.
    if ( !this.visible || !ids.length ) {
        this.element.css('display', 'none').empty();

        return this;
    }
    this.element.empty();

    $.each(catalog.getItems(), function(i, item) {
        var count = owned[item.id];

        if ( !count ) {
            return;
        }
        $('<button>')
                .attr({type: 'button', 'data-item': item.id,
                    title: catalog.getItemName(item),
                    'aria-label': catalog.getItemName(item) + ' (' + count + ')'})
                .addClass('a-item')
                .append($('<span>').addClass('a-item-icon').text(item.icon))
                .append($('<span>').addClass('a-item-count').text(count))
                .bind('click', function(event) {
                    event.preventDefault();
                    _this.use(item.id);
                })
                .appendTo(_this.element);
    });
    this.element.css('display', 'flex');

    return this;
};

/**
 * Spends one item, if the game can take it. The item is only deducted once the
 * effect has actually been applied -- a tap that lands between rounds must not
 * cost the player anything.
 *
 * @method use
 * @param {String} id
 * @return {Boolean}
 */
ItemBar.prototype.use = function(id) {
    if ( !this.visible || this.muted || wallet.getItemCount(id) <= 0 ) {
        return false;
    }
    if ( !powerups.apply(id) ) {
        return false;
    }
    wallet.useItem(id);

    return true;
};

/**
 * @method onGameStart
 */
ItemBar.prototype.onGameStart = function() {
    this.show(true);
};

/**
 * @method onGameOver
 */
ItemBar.prototype.onGameOver = function() {
    this.show(false);
};

/**
 * @method onDashboardVisibility
 * @param {Boolean} visible
 */
ItemBar.prototype.onDashboardVisibility = function(visible) {
    this._mute(visible);
};

/**
 * @method onWindowOpen
 */
ItemBar.prototype.onWindowOpen = function() {
    this._mute(true);
};

/**
 * @method onWindowClose
 */
ItemBar.prototype.onWindowClose = function() {
    this._mute(false);
};

/**
 * @method _mute
 * @param {Boolean} muted
 * @private
 */
ItemBar.prototype._mute = function(muted) {
    this.muted = Boolean(muted);

    if ( this.element ) {
        this.element.toggleClass('a-item-bar-muted', this.muted);
    }
};

/**
 * Built on demand rather than in the page markup, so the two entry-point HTML
 * files -- one of which is generated -- do not both have to carry it.
 *
 * @method _element
 * @return {jQuery}
 * @private
 */
ItemBar.prototype._element = function() {
    if ( !this.element || !this.element.parent().length ) {
        this.element = $('<div>')
                .attr({id: 'a-item-bar', 'aria-label': i18._('shop-items-bar')})
                .css('display', 'none')
                .appendTo(document.body);
    }

    return this.element;
};

var instance = null;

if ( instance === null ) {
    instance = new ItemBar();
}

export default instance;
