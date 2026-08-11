import core from './core/_.js';

var
    /**
     * How many orders are kept for reconciliation. The list is only a local
     * receipt trail -- the payment provider's own records are authoritative --
     * so it is capped rather than allowed to grow forever in localStorage.
     *
     * @property ORDER_HISTORY_LENGTH
     * @static
     * @private
     */
    ORDER_HISTORY_LENGTH = 20,

    /**
     * A new player starts with enough coins to try one cheap item. Nothing in
     * the game is gated behind a purchase; coins are earned by clearing rounds
     * and buying them only skips the grind.
     *
     * @property _defaults
     * @static
     * @private
     * @type {Object}
     */
    _defaults = {
        coins: 300,
        items: {},
        orders: []
    },

    /**
     * @property _state
     * @static
     * @private
     * @type {Object}
     */
    _state = $.extend(true, {}, _defaults);

/**
 * The player's coin balance and consumable inventory.
 *
 * Coins are a soft currency: rounds pay them out, the shop spends them, and a
 * top-up converts real money into them. Keeping one currency means the payment
 * layer never has to know what an item is -- it only ever credits coins.
 *
 * **The balance stored here is a client-side cache, not a source of truth.**
 * Anything the player pays for has to be credited by whatever server the
 * payment provider notifies, and `setServerState()` is where that answer lands.
 * Until the provider is wired up, `credit()` is called straight from the shop
 * so the flow is testable end to end.
 */
function Wallet() {
    core.EventEmitter.call(this);
    this.storage = new core.StorageLocal('wallet');
    this.loaded = false;
    this.storage.get().then($.proxy(function(data) {
        var stored = null;

        try {
            stored = JSON.parse(data || 'null');
        } catch (ex) {
            stored = null;
        }
        _state = $.extend(true, {}, _defaults, stored || {});
        this.loaded = true;
        this.emit('loaded');
        this.emit('change', [this.getState()]);
    }, this));
}

Wallet.prototype = Object.create(core.EventEmitter.prototype, {
    constructor: {
        value: Wallet,
        enumerable: false
    }
});

/**
 * @method isLoaded
 * @return {Boolean}
 */
Wallet.prototype.isLoaded = function() {
    return this.loaded;
};

/**
 * @method getState
 * @return {Object} a copy -- callers must go through the methods to mutate
 */
Wallet.prototype.getState = function() {
    return $.extend(true, {}, _state);
};

/**
 * @method getCoins
 * @return {Number}
 */
Wallet.prototype.getCoins = function() {
    return _state.coins >> 0;
};

/**
 * @method canAfford
 * @param {Number} amount
 * @return {Boolean}
 */
Wallet.prototype.canAfford = function(amount) {
    return this.getCoins() >= (amount >> 0);
};

/**
 * @method credit
 * @param {Number} amount
 * @param {String} reason free-text tag, kept only for the local receipt trail
 * @return {Wallet}
 */
Wallet.prototype.credit = function(amount, reason) {
    amount = Math.max(0, amount >> 0);

    if ( !amount ) {
        return this;
    }
    _state.coins = this.getCoins() + amount;
    this._save();
    this.emit('credit', [amount, reason]);
    this.emit('change', [this.getState()]);

    return this;
};

/**
 * @method debit
 * @param {Number} amount
 * @param {String} reason
 * @return {Boolean} false when the player cannot afford it, and nothing changes
 */
Wallet.prototype.debit = function(amount, reason) {
    amount = Math.max(0, amount >> 0);

    if ( !this.canAfford(amount) ) {
        return false;
    }
    _state.coins = this.getCoins() - amount;
    this._save();
    this.emit('debit', [amount, reason]);
    this.emit('change', [this.getState()]);

    return true;
};

/**
 * @method getItems
 * @return {Object} item id -> count, only the ones actually owned
 */
Wallet.prototype.getItems = function() {
    var owned = {};

    $.each(_state.items || {}, function(id, count) {
        if ( count > 0 ) {
            owned[id] = count;
        }
    });

    return owned;
};

/**
 * @method getItemCount
 * @param {String} id
 * @return {Number}
 */
Wallet.prototype.getItemCount = function(id) {
    return (_state.items && _state.items[id]) >> 0;
};

/**
 * @method addItem
 * @param {String} id
 * @param {Number} count
 * @return {Wallet}
 */
Wallet.prototype.addItem = function(id, count) {
    count = count === undefined ? 1 : count >> 0;

    if ( !id || count <= 0 ) {
        return this;
    }
    _state.items[id] = this.getItemCount(id) + count;
    this._save();
    this.emit('change', [this.getState()]);

    return this;
};

/**
 * Spends one of an owned item.
 *
 * @method useItem
 * @param {String} id
 * @return {Boolean} false when none are owned, and nothing changes
 */
Wallet.prototype.useItem = function(id) {
    if ( this.getItemCount(id) <= 0 ) {
        return false;
    }
    _state.items[id] = this.getItemCount(id) - 1;
    this._save();
    this.emit('use', [id]);
    this.emit('change', [this.getState()]);

    return true;
};

/**
 * Pays for an item and puts it in the inventory. Both halves happen or
 * neither does, so a failed debit cannot hand out a free item.
 *
 * @method buyItem
 * @param {Object} item an entry from shop/catalog
 * @param {Number} [count]
 * @return {Boolean}
 */
Wallet.prototype.buyItem = function(item, count) {
    count = count === undefined ? 1 : Math.max(1, count >> 0);

    if ( !item || !this.debit(item.price * count, 'item:' + item.id) ) {
        return false;
    }
    this.addItem(item.id, count);

    return true;
};

/**
 * @method getOrders
 * @return {Array}
 */
Wallet.prototype.getOrders = function() {
    return (_state.orders || []).slice();
};

/**
 * Records a settled top-up. Crediting the coins is deliberately separate:
 * once a real server confirms the payment it is the server's balance that
 * wins, and this list is then only a local receipt.
 *
 * @method recordOrder
 * @param {Object} order
 * @return {Wallet}
 */
Wallet.prototype.recordOrder = function(order) {
    _state.orders = this.getOrders();
    _state.orders.unshift(order);
    _state.orders = _state.orders.slice(0, ORDER_HISTORY_LENGTH);
    this._save();

    return this;
};

/**
 * The hook for a server-authoritative balance: when the payment provider's
 * backend is wired up it answers with the player's real holdings, and that
 * answer replaces whatever this client believed.
 *
 * @method setServerState
 * @param {Object} state {coins, items}
 * @return {Wallet}
 */
Wallet.prototype.setServerState = function(state) {
    if ( !state ) {
        return this;
    }
    if ( state.coins !== undefined ) {
        _state.coins = state.coins >> 0;
    }
    if ( state.items ) {
        _state.items = $.extend({}, state.items);
    }
    this._save();
    this.emit('change', [this.getState()]);

    return this;
};

/**
 * @method reset
 * @return {Wallet}
 */
Wallet.prototype.reset = function() {
    _state = $.extend(true, {}, _defaults);
    this._save();
    this.emit('change', [this.getState()]);

    return this;
};

/**
 * @method _save
 * @private
 */
Wallet.prototype._save = function() {
    this.storage.set(JSON.stringify(_state));
};

var instance = null;

if ( instance === null ) {
    instance = new Wallet();
}

export default instance;
