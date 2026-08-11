import mcModal from './moneycollect-modal.js';

var
    /**
     * How long to wait for the SDK's script tag before giving up.
     *
     * @property SDK_TIMEOUT
     * @static
     * @private
     */
    SDK_TIMEOUT = 15000,

    /**
     * A charge that comes back `processing` is settled asynchronously, so the
     * result is polled. Twenty attempts three seconds apart is a minute of
     * waiting, which is longer than a card authorisation ever legitimately
     * takes; past that the player is told it is still in flight rather than
     * being given coins on a guess.
     *
     * @property POLL_ATTEMPTS
     * @static
     * @private
     */
    POLL_ATTEMPTS = 20,

    /**
     * @property POLL_INTERVAL
     * @static
     * @private
     */
    POLL_INTERVAL = 3000,

    /**
     * 3-D Secure opens the issuer's own page, and on a cross-origin host the
     * SDK's promise never settles -- the answer arrives as a postMessage
     * instead. This is how long that is waited for.
     *
     * @property THREE_D_SECURE_TIMEOUT
     * @static
     * @private
     */
    THREE_D_SECURE_TIMEOUT = 120000,

    /**
     * Statuses the provider will not change its mind about.
     *
     * @property TERMINAL
     * @static
     * @private
     */
    TERMINAL = {succeeded: 'paid', failed: 'failed', canceled: 'cancelled'};

/**
 * MoneyCollect, through its in-page checkout.
 *
 * Written to the provider contract in payment/gateway.js, so the shop, the
 * wallet and the game know nothing about any of this. The flow follows
 * MoneyCollect's documented three steps:
 *
 * 1. create a payment, which yields a `clientSecret`
 * 2. `elementInit('payment_steps', ...)` renders the card form into an iframe
 * 3. on submit, `confirmPaymentMethod()` then `confirmCharge()`
 *
 * The two-step confirm (rather than the one-shot `confirmPayment`) is what
 * lets the card be stored for a repeat purchase, which is the common case here
 * -- a player who buys coins once usually buys them again.
 *
 * ## Where the money is actually decided
 *
 * `pay()` reports what the browser saw. `verify()` polls the payment resource
 * for its terminal status, and the gateway only credits on that. With
 * `orderEndpoint` configured both calls go to a server holding the secret key
 * and the browser is never trusted with it; without one they go straight to
 * MoneyCollect with the key from the config, which is the reference
 * integration's arrangement and is fine for a test account but ships a secret
 * that can charge and refund. That choice is one config field.
 */
function ProviderMoneyCollect(config) {
    this.name = 'moneycollect';
    this.config = config || {};
    this.sdk = null;
    this.sdkPromise = null;
}

/**
 * @method isAvailable
 * @return {Boolean}
 */
ProviderMoneyCollect.prototype.isAvailable = function() {
    return Boolean(this.config.apiKey && (this.config.orderEndpoint || this.config.secretKey));
};

/**
 * Loads the SDK the first time something is bought.
 *
 * A script tag in the page would cost every player a third-party request on
 * boot, including the ones who never open the shop; the game's own assets are
 * what the connection should be spent on.
 *
 * @method _loadSdk
 * @return {Promise}
 * @private
 */
ProviderMoneyCollect.prototype._loadSdk = function() {
    var _this = this;

    if ( this.sdkPromise ) {
        return this.sdkPromise;
    }
    this.sdkPromise = new Promise(function(resolve, reject) {
        var script, timer;

        if ( window.MoneycollectPay ) {
            resolve(window.MoneycollectPay);

            return;
        }
        script = document.createElement('script');
        timer = setTimeout(function() {
            reject(new Error('moneycollect-sdk-timeout'));
        }, SDK_TIMEOUT);

        script.async = true;
        script.src = _this.config.sdkUrl;
        script.onload = function() {
            clearTimeout(timer);

            if ( window.MoneycollectPay ) {
                resolve(window.MoneycollectPay);
            } else {
                reject(new Error('moneycollect-sdk-missing'));
            }
        };
        script.onerror = function() {
            clearTimeout(timer);
            reject(new Error('moneycollect-sdk-unreachable'));
        };
        document.head.appendChild(script);
    });

    // A failed load must not be cached as a permanent failure: the player may
    // simply have been offline, and the next attempt should try again.
    this.sdkPromise.catch(function() {
        _this.sdkPromise = null;
    });

    return this.sdkPromise;
};

/**
 * @method _request
 * @param {String} url
 * @param {Object} [options]
 * @return {Promise}
 * @private
 */
ProviderMoneyCollect.prototype._request = function(url, options) {
    var headers = {'Content-Type': 'application/json'};

    options = options || {};

    // Only the direct-to-provider flow needs the key; a server endpoint
    // authenticates the player however it already does.
    if ( !this.config.orderEndpoint && this.config.secretKey ) {
        headers.Authorization = 'Bearer ' + this.config.secretKey;
    }

    return fetch(url, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function(response) {
        return response.json().catch(function() {
            throw new Error('payment-bad-response');
        });
    });
};

/**
 * Step 1: register the payment and get the client secret the card form needs.
 *
 * @method createOrder
 * @param {Object} order
 * @return {Promise}
 */
ProviderMoneyCollect.prototype.createOrder = function(order) {
    var base = this.config.orderEndpoint || this.config.serverUrl;

    return this._request(base + '/create', {
        method: 'POST',
        body: {
            amount: order.amountMinor,
            currency: order.currency,
            orderNo: order.orderId,
            description: this.config.description || 'coins',
            confirmationMethod: 'automatic',
            // The card form confirms it; confirming here would charge before
            // the player has entered anything.
            confirm: false
        }
    }).then(function(response) {
        var payment = response && response.data;

        if ( !response || response.code !== 'success' || !payment ) {
            throw new Error((response && (response.msg || response.message)) || 'payment-create-failed');
        }

        return $.extend({}, order, {
            paymentId: payment.id,
            clientSecret: payment.clientSecret,
            customerId: payment.customerId || ''
        });
    });
};

/**
 * Steps 2 and 3: show the card form, and settle whatever the player does with
 * it.
 *
 * @method pay
 * @param {Object} order
 * @return {Promise}
 */
ProviderMoneyCollect.prototype.pay = function(order) {
    var _this = this;

    return this._loadSdk()
            .then(function(factory) {
                _this.sdk = factory(_this.config.apiKey);

                return mcModal.open(order, {
                    mode: _this.config.mode,
                    clientSecret: order.clientSecret,
                    customerId: order.customerId,
                    sdk: _this.sdk,
                    submit: function() {
                        return _this._confirm(order).then(function(payment) {
                            return _this._toResult(order, payment);
                        });
                    }
                });
            })
            .catch(function(error) {
                mcModal.close();

                return {
                    status: 'failed',
                    orderId: order.orderId,
                    reason: (error && error.message) || 'payment-failed'
                };
            });
};

/**
 * Store the card, then charge it.
 *
 * @method _confirm
 * @param {Object} order
 * @return {Promise} resolves with the provider's payment resource
 * @private
 */
ProviderMoneyCollect.prototype._confirm = function(order) {
    var _this = this;

    return this.sdk.confirmPaymentMethod({
        autoJump: false,
        // MoneyCollect validates billing details against the card, and some
        // acquirers decline outright without them. What is sent comes from the
        // config rather than being hard-coded here, so it can be filled in per
        // account -- and, when there is a real player account to draw on,
        // replaced by their details instead of a placeholder.
        paymentMethod: {billingDetails: this.config.billing || {}}
    }).then(function(response) {
        var data = response && response.data;

        if ( !data || data.code !== 'success' || !data.data ) {
            throw new Error((data && data.msg) || 'payment-method-failed');
        }

        return _this._charge(order, data.data.id);
    });
};

/**
 * @method _charge
 * @param {Object} order
 * @param {String} paymentMethodId
 * @return {Promise}
 * @private
 */
ProviderMoneyCollect.prototype._charge = function(order, paymentMethodId) {
    var billing = this.config.billing || {},
        params = {
            autoJump: false,
            payment_id: order.paymentId,
            clientSecret: order.clientSecret,
            confirmDetail: {
                amount: order.amountMinor,
                paymentMethod: paymentMethodId,
                returnUrl: window.location.origin + '/',
                website: window.location.origin,
                // Saves the card so a repeat purchase is one tap, which for a
                // coin pack is the common case.
                setupFutureUsage: 'on'
            }
        };

    if ( billing.email ) {
        params.confirmDetail.receiptEmail = billing.email;
    }
    if ( this.config.notifyUrl ) {
        params.confirmDetail.notifyUrl = this.config.notifyUrl;
    }

    // On a cross-origin host the 3-D Secure step navigates an iframe the SDK
    // can no longer read, so its promise never settles and the answer arrives
    // by postMessage instead.
    if ( this._isCrossOrigin() ) {
        return this._chargeViaPostMessage(params);
    }

    return this.sdk.confirmCharge(params).then(function(response) {
        var data = response && response.data;

        if ( !data || data.code !== 'success' || !data.data ) {
            throw new Error((data && (data.msg || data.message)) || 'payment-charge-failed');
        }

        return data.data;
    });
};

/**
 * @method _isCrossOrigin
 * @return {Boolean}
 * @private
 */
ProviderMoneyCollect.prototype._isCrossOrigin = function() {
    return window.location.protocol === 'http:' || window.location.hostname === 'localhost';
};

/**
 * @method _chargeViaPostMessage
 * @param {Object} params
 * @return {Promise}
 * @private
 */
ProviderMoneyCollect.prototype._chargeViaPostMessage = function(params) {
    var sdk = this.sdk;

    return new Promise(function(resolve, reject) {
        var settled = false, timer;

        function settle(fn, value) {
            if ( settled ) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            window.removeEventListener('message', onMessage);
            fn(value);
        }

        function onMessage(event) {
            var message = event.data;

            if ( typeof message === 'string' ) {
                try {
                    message = JSON.parse(message);
                } catch (ex) {
                    return;
                }
            }
            if ( message && message.type === '3dAuth' && message.data && message.data.paymentRes ) {
                settle(resolve, message.data.paymentRes);
            }
        }

        window.addEventListener('message', onMessage);
        timer = setTimeout(function() {
            settle(reject, new Error('payment-3ds-timeout'));
        }, THREE_D_SECURE_TIMEOUT);

        sdk.confirmCharge(params).then(function(response) {
            var data = response && response.data;

            // No body means the 3-D Secure page took over; wait for the message.
            if ( !data ) {
                return;
            }
            if ( data.code === 'success' && data.data ) {
                settle(resolve, data.data);
            } else {
                settle(reject, new Error(data.msg || data.message || 'payment-charge-failed'));
            }
        }).catch(function() {
            // Rejects when the 3-D Secure iframe goes cross-origin; the
            // postMessage listener is still the one that will answer.
        });
    });
};

/**
 * What the browser saw, in the gateway's vocabulary.
 *
 * A charge that is still `processing` is reported as paid on purpose: the
 * gateway calls `verify()` next and credits on that answer, so an
 * asynchronously settled payment is followed through rather than abandoned.
 * A refusal throws, because the card form is still open and a different card
 * can be tried without starting the order again.
 *
 * @method _toResult
 * @param {Object} order
 * @param {Object} payment the provider's payment resource
 * @return {Object}
 * @private
 */
ProviderMoneyCollect.prototype._toResult = function(order, payment) {
    var status = String((payment && payment.status) || '').toLowerCase();

    if ( TERMINAL[status] === 'paid' || status === 'processing' || status === 'requires_action' ) {
        return {
            status: 'paid',
            orderId: order.orderId,
            transactionId: payment.id || order.paymentId,
            raw: payment
        };
    }

    throw new Error(
        (payment && (payment.errorMessage || payment.cancellationReason)) || 'payment-declined'
    );
};

/**
 * The out-of-band confirmation the gateway credits on: polls the payment until
 * the provider commits to a status.
 *
 * @method verify
 * @param {Object} order
 * @return {Promise}
 */
ProviderMoneyCollect.prototype.verify = function(order) {
    var _this = this,
        base = this.config.orderEndpoint || this.config.serverUrl,
        attempt = 0;

    function poll() {
        return _this._request(base + '/' + order.paymentId).then(function(response) {
            var status = response && response.data
                    && String(response.data.status || '').toLowerCase();

            if ( status && TERMINAL[status] ) {
                return {
                    status: TERMINAL[status],
                    orderId: order.orderId,
                    transactionId: order.paymentId,
                    raw: response.data
                };
            }
            attempt ++;

            if ( attempt >= POLL_ATTEMPTS ) {
                // Still in flight. Not paid as far as this game is concerned --
                // the player is told, and nothing is credited on a maybe.
                return {status: 'pending', orderId: order.orderId};
            }

            return new Promise(function(resolve) {
                setTimeout(resolve, POLL_INTERVAL);
            }).then(poll);
        });
    }

    return poll();
};

export default ProviderMoneyCollect;
