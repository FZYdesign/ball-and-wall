import core from '../core/_.js';

/**
 * Everything the game knows about paying for something.
 *
 * The shop never talks to a payment SDK. It calls `purchase(pack)` and waits
 * for one of three outcomes, so plugging in a third-party provider is a matter
 * of writing one object to this contract and registering it in payment/_.js --
 * no window, no wallet and no gameplay code changes.
 *
 * ## Provider contract
 *
 * A provider is a plain object with four methods. Every one of them may reject;
 * the gateway turns a rejection into a `failed` outcome rather than letting it
 * escape into the UI.
 *
 * ```
 * isAvailable()      -> Boolean          can this provider run here at all
 * createOrder(order) -> Promise<order>   register the intent, return it with
 *                                        whatever ids the provider assigns
 * pay(order)         -> Promise<result>  put the provider's own UI in front of
 *                                        the player and settle
 * verify(order)      -> Promise<result>  confirm settlement out of band
 * ```
 *
 * `order` is `{orderId, packId, amountMinor, currency, coins, createdAt}`.
 * `amountMinor` is in the currency's minor unit -- money is never a float here.
 *
 * `result` is `{status, orderId, transactionId, raw}` where `status` is one of
 * `paid`, `cancelled` or `failed`. A provider that cannot tell the difference
 * between a cancel and a failure should say `failed`; the shop tells the player
 * something went wrong either way, but only `paid` ever credits coins.
 *
 * ## What a real integration still has to do
 *
 * `verify()` is called before anything is credited, and with the mock provider
 * it answers from the browser, which proves nothing. A live integration must
 * make that call reach a server that has seen the provider's own notification,
 * and that server -- not this file -- decides the player's balance. The wallet
 * has `setServerState()` waiting for exactly that answer.
 */
function Gateway() {
    core.EventEmitter.call(this);
    this.provider = null;
    this._sequence = 0;
}

Gateway.prototype = Object.create(core.EventEmitter.prototype, {
    constructor: {
        value: Gateway,
        enumerable: false
    }
});

/**
 * @method use
 * @param {Object} provider
 * @return {Gateway}
 */
Gateway.prototype.use = function(provider) {
    this.provider = provider;

    return this;
};

/**
 * @method getProvider
 * @return {Object|null}
 */
Gateway.prototype.getProvider = function() {
    return this.provider;
};

/**
 * @method isAvailable
 * @return {Boolean}
 */
Gateway.prototype.isAvailable = function() {
    return Boolean(this.provider && this.provider.isAvailable());
};

/**
 * Runs a pack through create -> pay -> verify.
 *
 * @method purchase
 * @param {Object} pack an entry from shop/catalog
 * @param {Number} coins what the pack is worth, bonus included
 * @return {Promise} always resolves; read `status`
 */
Gateway.prototype.purchase = function(pack, coins) {
    var _this = this, order;

    if ( !this.isAvailable() ) {
        return Promise.resolve({status: 'failed', reason: 'no-provider'});
    }
    order = this.createOrder(pack, coins);
    this.emit('order:created', [order]);

    return this.provider.createOrder(order)
            .then(function(created) {
                order = $.extend(order, created || {});

                return _this.provider.pay(order);
            })
            .then(function(result) {
                if ( !result || result.status !== 'paid' ) {
                    return result || {status: 'failed'};
                }

                // Never credit on the strength of the client's own word that
                // the payment sheet closed happily.
                return _this.provider.verify(order).then(function(verified) {
                    return $.extend({}, result, verified || {});
                });
            })
            .then(function(result) {
                result = $.extend({status: 'failed'}, result, {order: order});
                _this.emit('order:' + result.status, [result]);

                return result;
            })
            .catch(function(error) {
                var result = {
                    status: 'failed',
                    order: order,
                    reason: (error && error.message) || 'error'
                };

                _this.emit('order:failed', [result]);

                return result;
            });
};

/**
 * The id the game knows an order by. A provider is free to assign its own on
 * top; both travel together on the order.
 *
 * @method createOrder
 * @param {Object} pack
 * @param {Number} coins
 * @return {Object}
 */
Gateway.prototype.createOrder = function(pack, coins) {
    this._sequence ++;

    return {
        orderId: 'baw-' + Date.now().toString(36) + '-' + this._sequence,
        packId: pack.id,
        amountMinor: pack.amountMinor,
        currency: pack.currency,
        coins: coins,
        createdAt: new Date().toISOString()
    };
};

var instance = null;

if ( instance === null ) {
    instance = new Gateway();
}

export default instance;
