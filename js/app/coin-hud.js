import core from './core/_.js';
import wallet from './wallet.js';
import i18 from './i18/_.js';

/**
 * The coin balance, as a permanent readout rather than a dashboard widget.
 *
 * It used to be painted on the dashboard canvas next to the clock, which meant
 * it only existed while the dashboard did -- and on a phone the dashboard is
 * parked off screen by default, so a player could not see what they had without
 * pausing the round to slide it in. A balance is not a per-round statistic like
 * the score or the clock; it is worth knowing at any moment, including while
 * deciding whether to spend an item.
 *
 * It is fixed to the top-right of the viewport, mirroring the dashboard toggle
 * at the top-left and for the same reason: the play field is landscape and the
 * viewport it is fitted into is wider still, so that corner is letterbox margin
 * rather than play area. It takes no pointer events at all -- it is a readout,
 * the trolley on the dashboard is the way into the shop -- so a tap that lands
 * on it still drives the paddle exactly as a tap on the field would.
 */
function CoinHud() {
    this.element = null;
    this.attached = false;
    wallet.addListener('change', $.proxy(this.render, this));
}

/**
 * Puts the readout on screen. Called once the game is up, so that the pages
 * that share these modules but have no wallet -- the levels editor -- do not
 * get one.
 *
 * @method attach
 * @return {CoinHud}
 */
CoinHud.prototype.attach = function() {
    this.attached = true;
    this.render();

    return this;
};

/**
 * @method render
 * @return {CoinHud}
 */
CoinHud.prototype.render = function() {
    if ( !this.attached ) {
        return this;
    }
    this._element().find('.a-coin-value').text(this.format(wallet.getCoins()));

    return this;
};

/**
 * Thousands separated, because a five-figure balance read as one run of digits
 * is a number nobody parses at a glance.
 *
 * @method format
 * @param {Number} coins
 * @return {String}
 */
CoinHud.prototype.format = function(coins) {
    return String(coins).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * @method _element
 * @return {jQuery}
 * @private
 */
CoinHud.prototype._element = function() {
    if ( !this.element || !this.element.parent().length ) {
        this.element = $('<div>')
                .attr({id: 'a-coin-hud', 'aria-label': i18._('shop-balance')})
                .append($('<span>').addClass('a-coin-icon').text('◈'))
                .append($('<span>').addClass('a-coin-value'))
                .appendTo(document.body);
    }

    return this.element;
};

var instance = null;

if ( instance === null ) {
    instance = new CoinHud();
    // The balance survives a round, so nothing here listens to the game's own
    // lifecycle; the wallet is the only thing it follows.
    core.mediator.addListener('game:game-start', $.proxy(instance.render, instance));
}

export default instance;
