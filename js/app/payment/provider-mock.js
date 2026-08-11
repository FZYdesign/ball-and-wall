var
    /**
     * Long enough that the shop's pending state is visible, short enough that
     * the end-to-end suite does not have to wait on it.
     *
     * @property SETTLE_DELAY
     * @static
     * @private
     */
    SETTLE_DELAY = 600;

/**
 * A stand-in for the real payment provider, and the reference implementation
 * of the provider contract documented in payment/gateway.js.
 *
 * It settles every order as paid after a short delay. That is exactly what a
 * provider must never be trusted to do for real money -- the point of this file
 * is to let the shop, the wallet and the tests exercise the whole flow before
 * the third-party SDK exists. Swap it out in payment/_.js; nothing else in the
 * game refers to it.
 */
function ProviderMock() {
    this.name = 'mock';
    this._sequence = 0;
}

/**
 * @method isAvailable
 * @return {Boolean}
 */
ProviderMock.prototype.isAvailable = function() {
    return true;
};

/**
 * @method createOrder
 * @param {Object} order
 * @return {Promise}
 */
ProviderMock.prototype.createOrder = function(order) {
    this._sequence ++;

    return Promise.resolve($.extend({}, order, {
        providerOrderId: 'mock-' + order.orderId + '-' + this._sequence
    }));
};

/**
 * @method pay
 * @param {Object} order
 * @return {Promise}
 */
ProviderMock.prototype.pay = function(order) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve({
                status: 'paid',
                orderId: order.orderId,
                transactionId: 'mock-txn-' + order.orderId,
                raw: {provider: 'mock'}
            });
        }, SETTLE_DELAY);
    });
};

/**
 * A real provider asks its own backend here, which in turn asks the payment
 * network. Anything that answers from the browser alone -- like this -- is a
 * placeholder by definition.
 *
 * @method verify
 * @param {Object} order
 * @return {Promise}
 */
ProviderMock.prototype.verify = function(order) {
    return Promise.resolve({status: 'paid', orderId: order.orderId});
};

export default ProviderMock;
