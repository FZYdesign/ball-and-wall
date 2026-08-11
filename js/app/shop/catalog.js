import i18 from '../i18/_.js';

var
    /**
     * Consumables, priced in coins.
     *
     * Every effect here already exists in the game as a falling bonus, which is
     * deliberate: buying one is a way to *choose* an effect the player would
     * otherwise have to wait for, not a power the game does not otherwise
     * offer. Nothing sold is unavailable to a player who never spends.
     *
     * `icon` is a glyph rather than a sprite so the shop needs no new artwork
     * and no per-episode asset. `duration` is documentation for the UI -- the
     * effect timers themselves live in entity/paddle.js and shop/powerups.js.
     *
     * @property ITEMS
     * @static
     * @private
     * @type {Array}
     */
    ITEMS = [
        {id: 'extra-life', icon: '♥', price: 120},
        {id: 'grow-paddle', icon: '↔', price: 80, duration: 20},
        {id: 'glue-paddle', icon: '◎', price: 100, duration: 20},
        {id: 'laser', icon: '⇑', price: 150, duration: 20},
        {id: 'multi-ball', icon: '⁂', price: 180},
        {id: 'steel-ball', icon: '◉', price: 200, duration: 12},
        {id: 'shield', icon: '▬', price: 250, duration: 20}
    ],

    /**
     * Coin packs, priced in real money.
     *
     * `amountMinor` is in the currency's minor unit -- cents for USD -- because
     * that is what every payment API takes, and floating point money is how
     * rounding bugs get in. `bonus` is the extra thrown in on top of `coins`:
     * shown separately so the value of the bigger packs is legible rather than
     * something the player has to work out.
     *
     * Coins-per-dollar rises with every step -- 1000, 1104, 1151, 1501 -- so
     * "best value" is a fact rather than a label. A pack that broke that
     * ordering would be selling the biggest bundle as the worst deal.
     *
     * The entry tier is a round dollar rather than the 0.99 an app store would
     * use: nothing here may be priced below `MINIMUM_AMOUNT_MINOR`.
     *
     * @property PACKS
     * @static
     * @private
     * @type {Array}
     */
    PACKS = [
        {id: 'coins-s', coins: 1000, bonus: 0, amountMinor: 100, currency: 'USD'},
        {id: 'coins-m', coins: 3000, bonus: 300, amountMinor: 299, currency: 'USD'},
        {id: 'coins-l', coins: 10000, bonus: 1500, amountMinor: 999, currency: 'USD', tag: 'popular'},
        {id: 'coins-xl', coins: 25000, bonus: 5000, amountMinor: 1999, currency: 'USD', tag: 'best-value'}
    ],

    /**
     * The least a pack may be sold for, in minor units.
     *
     * A card charge carries a fixed cost whoever is acquiring it, so a very
     * small one is worth little to anyone and payment providers set a floor of
     * their own. Priced under this, a pack is either refused outright or
     * settles for less than it cost to take.
     *
     * `tests/unit/wallet.test.mjs` holds the catalogue to it.
     *
     * @property MINIMUM_AMOUNT_MINOR
     * @static
     */
    MINIMUM_AMOUNT_MINOR = 100,

    /**
     * Only for display. The provider is the authority on what it actually
     * charges, and the amount it is asked for is always `amountMinor`.
     *
     * @property SYMBOLS
     * @static
     * @private
     * @type {Object}
     */
    SYMBOLS = {USD: '$', EUR: '€', CNY: '¥', PLN: 'zł'};

function Catalog() {}

/**
 * @method getItems
 * @return {Array}
 */
Catalog.prototype.getItems = function() {
    return ITEMS.slice();
};

/**
 * @method getItem
 * @param {String} id
 * @return {Object|null}
 */
Catalog.prototype.getItem = function(id) {
    var found = null;

    $.each(ITEMS, function(i, item) {
        if ( item.id === id ) {
            found = item;

            return false;
        }
    });

    return found;
};

/**
 * @method getMinimumAmount
 * @return {Number} minor units
 */
Catalog.prototype.getMinimumAmount = function() {
    return MINIMUM_AMOUNT_MINOR;
};

/**
 * @method getPacks
 * @return {Array}
 */
Catalog.prototype.getPacks = function() {
    return PACKS.slice();
};

/**
 * @method getPack
 * @param {String} id
 * @return {Object|null}
 */
Catalog.prototype.getPack = function(id) {
    var found = null;

    $.each(PACKS, function(i, pack) {
        if ( pack.id === id ) {
            found = pack;

            return false;
        }
    });

    return found;
};

/**
 * Total coins a pack hands over, headline plus bonus.
 *
 * @method getPackCoins
 * @param {Object} pack
 * @return {Number}
 */
Catalog.prototype.getPackCoins = function(pack) {
    return pack ? (pack.coins >> 0) + (pack.bonus >> 0) : 0;
};

/**
 * @method getItemName
 * @param {Object} item
 * @return {String}
 */
Catalog.prototype.getItemName = function(item) {
    return i18._('shop-item-name:' + item.id) || item.id;
};

/**
 * @method getItemDescription
 * @param {Object} item
 * @return {String}
 */
Catalog.prototype.getItemDescription = function(item) {
    return i18._('shop-item-desc:' + item.id) || '';
};

/**
 * @method formatPrice
 * @param {Object} pack
 * @return {String}
 */
Catalog.prototype.formatPrice = function(pack) {
    var symbol = SYMBOLS[pack.currency] || (pack.currency + ' '),
        major = pack.amountMinor / 100;

    return symbol + (major % 1 === 0 ? major.toFixed(0) : major.toFixed(2));
};

var instance = null;

if ( instance === null ) {
    instance = new Catalog();
}

export default instance;
