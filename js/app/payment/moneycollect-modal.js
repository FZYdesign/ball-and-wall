import i18 from '../i18/_.js';

var
    /**
     * The card form is an iframe the SDK injects, and it is not usable the
     * instant the element appears. Polled rather than raced, because showing
     * the player an empty white box is worse than a moment more of "preparing".
     *
     * @property IFRAME_POLL
     * @static
     * @private
     */
    IFRAME_POLL = 100,

    /**
     * @property IFRAME_ATTEMPTS
     * @static
     * @private
     */
    IFRAME_ATTEMPTS = 30,

    /**
     * @property IFRAME_SETTLE
     * @static
     * @private
     */
    IFRAME_SETTLE = 600,

    /**
     * Room the card iframe is never squeezed below, and never grows past.
     *
     * The floor keeps the fields usable when there is barely any viewport at
     * all -- a very short landscape phone -- at the cost of scrolling inside
     * the iframe, which is the right thing to give up before the Pay button.
     * The ceiling is the provider's own suggested maximum.
     *
     * @property FRAME_MIN
     * @static
     * @private
     */
    FRAME_MIN = 150,

    /**
     * The card area never shrinks below this, however short the viewport is.
     * Past that point there is nothing usable left to show and scrolling inside
     * it is all that is on offer -- still a better trade than a Pay button
     * nobody can reach.
     *
     * @property CARD_MIN
     * @static
     * @private
     */
    CARD_MIN = 60,

    /**
     * @property FRAME_MAX
     * @static
     * @private
     */
    FRAME_MAX = 320,

    /**
     * Kept clear of the viewport edges, so the dialog never looks cropped.
     *
     * @property VIEWPORT_MARGIN
     * @static
     * @private
     */
    VIEWPORT_MARGIN = 12;

/**
 * The card form MoneyCollect renders into, and the only DOM the payment
 * provider needs.
 *
 * It is built from JavaScript rather than sitting in the page markup for the
 * same reason the item strip is: there are two entry-point HTML files, one of
 * them generated, and neither should have to carry markup for a feature most
 * sessions never reach. The element ids match the ones the SDK's documentation
 * uses, because `elementInit` is given them by name.
 *
 * This file owns presentation only. What a submitted form means -- whether the
 * money moved -- is the provider's decision, handed in as `submit`.
 */
function MoneyCollectModal() {
    this.root = null;
    this.settle = null;
}

/**
 * @method open
 * @param {Object} order
 * @param {Object} options {mode, clientSecret, customerId, sdk, submit}
 * @return {Promise} resolves with the provider's result, or a cancellation
 */
MoneyCollectModal.prototype.open = function(order, options) {
    var _this = this;

    this._build();
    this._loading(true);
    this._error('');
    this._amount(order);
    this._fit();

    return this._initForm(options).then(function() {
        _this._loading(false);
        _this.root.addClass('mc-open');

        return new Promise(function(resolve) {
            _this.settle = resolve;
            _this._bindSubmit(options, resolve);
        });
    });
};

/**
 * @method close
 * @param {Object} [result] what to settle a waiting purchase with
 */
MoneyCollectModal.prototype.close = function(result) {
    var settle = this.settle;

    this.settle = null;

    if ( this.root ) {
        this.root.removeClass('mc-open');
        // The SDK will not reuse an iframe, so the next purchase starts from an
        // empty container.
        this.root.find('#card-element').empty();
        this.root.find('#card-errors').text('');
        this._loading(false);
        this._button(false);
    }
    if ( settle ) {
        settle(result || {status: 'cancelled'});
    }
};

/**
 * @method isOpen
 * @return {Boolean}
 */
MoneyCollectModal.prototype.isOpen = function() {
    return Boolean(this.root && this.root.hasClass('mc-open'));
};

/**
 * How tall the dialog may be, and how much of that is left for the iframe.
 *
 * `visualViewport` is preferred where it exists because on a phone
 * `innerHeight` can include the strip behind the browser's own toolbars --
 * space the player cannot see, and exactly the space a Pay button ends up in.
 *
 * The chrome is measured rather than assumed: the title, the amount, any error
 * line and the button are all in the DOM before the iframe is asked for, and
 * their real heights depend on font loading and translation length.
 *
 * @method _budget
 * @return {Object} {container, frame} in CSS pixels
 * @private
 */
MoneyCollectModal.prototype._budget = function() {
    var container = this.root.find('#mc-payment-container'),
        visual = window.visualViewport,
        viewport = Math.min(
            window.innerHeight || Infinity,
            visual && visual.height ? visual.height : Infinity
        ),
        // The iframe has to be asked for before the dialog is shown, and a
        // child of a hidden parent measures zero. Laid out but transparent for
        // the length of the measurement instead.
        hidden = !this.isOpen(),
        available,
        chrome = 0;

    if ( !isFinite(viewport) || viewport <= 0 ) {
        viewport = 480;
    }
    available = Math.max(FRAME_MIN, viewport - VIEWPORT_MARGIN * 2);

    if ( hidden ) {
        container.css({display: 'flex', visibility: 'hidden'});
    }
    // Everything in the column except the iframe itself: padding, and each of
    // the fixed rows at whatever height its font and translation give it.
    chrome += container.outerHeight(true) - container.height();
    $.each(['#mc-payment-title', '#mc-payment-amount', '#card-errors', '#mc-error-message',
        '#mc-submit-btn'], function(index, selector) {
        var element = container.find(selector);

        chrome += element.length && element.css('display') !== 'none'
            ? element.outerHeight(true) : 0;
    });
    // The iframe wrapper's own margins.
    chrome += 20;

    if ( hidden ) {
        container.css({display: '', visibility: ''});
    }

    return {
        container: available,
        chrome: chrome,
        // The card area's floor: what is left once everything fixed has had its
        // share, but never more than the iframe could use. Without that ceiling
        // a tall desktop window stretches the dialog to fill the screen. It may
        // come out smaller than the iframe we ask for, in which case the card
        // area scrolls -- the button does not move either way.
        card: Math.round(Math.max(CARD_MIN, Math.min(FRAME_MAX, available - chrome))),
        frame: Math.round(Math.max(FRAME_MIN, Math.min(FRAME_MAX, available - chrome)))
    };
};

/**
 * @method _fit
 * @private
 */
MoneyCollectModal.prototype._fit = function() {
    var budget;

    if ( !this.root ) {
        return;
    }
    budget = this._budget();
    this.root.find('#mc-payment-container').css('maxHeight', budget.container + 'px');
    // A max-height on the dialog cannot pull a child below its own min-height,
    // so the card area's floor has to come down with it or the dialog stays
    // taller than the screen and takes the button off the bottom again.
    this.root.find('#card-element').css('minHeight', budget.card + 'px');
};

/**
 * @method _initForm
 * @param {Object} options
 * @return {Promise}
 * @private
 */
MoneyCollectModal.prototype._initForm = function(options) {
    var _this = this;

    return options.sdk.elementInit('payment_steps', {
        formId: 'mc-payment-form',
        formWrapperId: 'card-element',
        frameId: 'PrivateFrame',
        mode: options.mode,
        clientSecret: options.clientSecret,
        customerId: options.customerId || '',
        needCardList: false,
        autoValidate: true,
        // Without this the SDK writes validation errors through innerText on an
        // element it assumes exists, and throws when it does not.
        errorWrapperId: 'card-errors',
        modelType: 'normal',
        layout: {
            pageMode: 'block',
            style: {
                // Told what is actually available rather than a constant: the
                // SDK sizes the iframe to this, and a value taller than the
                // viewport is how the Pay button ends up needing a scroll.
                frameMaxHeight: String(this._budget().frame),
                input: {
                    FontSize: '16',
                    FontFamily: 'Arial',
                    FontWeight: '400',
                    Color: '#32325d',
                    ContainerBorder: '1px solid #e0e0e0',
                    ContainerBg: '#ffffff',
                    InputHeight: '40px',
                    InputMargin: '12',
                    InputBorderRadius: '6px'
                }
            }
        }
    }).then(function() {
        return _this._waitForIframe();
    });
};

/**
 * @method _waitForIframe
 * @return {Promise}
 * @private
 */
MoneyCollectModal.prototype._waitForIframe = function() {
    var wrapper = this.root.find('#card-element');

    return new Promise(function(resolve, reject) {
        var attempts = 0;

        function check() {
            if ( wrapper.find('iframe').length ) {
                setTimeout(resolve, IFRAME_SETTLE);

                return;
            }
            attempts ++;

            if ( attempts >= IFRAME_ATTEMPTS ) {
                reject(new Error('payment-form-timeout'));

                return;
            }
            setTimeout(check, IFRAME_POLL);
        }

        check();
    });
};

/**
 * @method _bindSubmit
 * @param {Object} options
 * @param {Function} resolve
 * @private
 */
MoneyCollectModal.prototype._bindSubmit = function(options, resolve) {
    var _this = this,
        form = this.root.find('#mc-payment-form');

    // Rebinding would submit twice; the SDK's iframe lives inside this form, so
    // replacing the node to clear handlers is not an option either.
    form.off('submit.mc').on('submit.mc', function(event) {
        event.preventDefault();
        _this._error('');
        _this._button(true);

        options.submit().then(function(result) {
            _this.close(result);
        }).catch(function(error) {
            // Still recoverable: a declined card can be replaced without
            // starting the order again, so the form stays where it is.
            _this._button(false);
            _this._error((error && error.message) || i18._('shop-purchase-failed'));
        });
    });
};

/**
 * @method _amount
 * @param {Object} order
 * @private
 */
MoneyCollectModal.prototype._amount = function(order) {
    this.root.find('#mc-payment-amount').text(
        order.currency + ' ' + (order.amountMinor / 100).toFixed(2)
    );
};

/**
 * @method _button
 * @param {Boolean} busy
 * @private
 */
MoneyCollectModal.prototype._button = function(busy) {
    this.root.find('#mc-submit-btn')
            .prop('disabled', Boolean(busy))
            .text(i18._(busy ? 'shop-processing' : 'payment-pay-now'));
};

/**
 * @method _error
 * @param {String} message
 * @private
 */
MoneyCollectModal.prototype._error = function(message) {
    this.root.find('#mc-error-message').text(message || '')[message ? 'show' : 'hide']();
};

/**
 * @method _loading
 * @param {Boolean} visible
 * @private
 */
MoneyCollectModal.prototype._loading = function(visible) {
    this.root.find('#mc-payment-loading').toggleClass('mc-open', Boolean(visible));
};

/**
 * @method _build
 * @private
 */
MoneyCollectModal.prototype._build = function() {
    var _this = this;

    if ( this.root && this.root.parent().length ) {
        return;
    }
    this.root = $(
        '<div id="mc-payment-root">' +
            '<div id="mc-payment-loading">' +
                '<div id="mc-loading-spinner"></div>' +
                '<div id="mc-loading-text"></div>' +
            '</div>' +
            '<div id="mc-payment-overlay"></div>' +
            '<div id="mc-payment-container" role="dialog" aria-modal="true">' +
                '<button id="mc-close-btn" type="button">&times;</button>' +
                '<div id="mc-payment-title"></div>' +
                '<div id="mc-payment-amount"></div>' +
                '<form id="mc-payment-form">' +
                    '<div id="card-element" class="ab-element"></div>' +
                    '<div id="card-errors" role="alert"></div>' +
                    '<div id="mc-error-message"></div>' +
                    '<button id="mc-submit-btn" type="submit"></button>' +
                '</form>' +
            '</div>' +
        '</div>'
    ).appendTo(document.body);

    this.root.find('#mc-loading-text').text(i18._('payment-preparing'));
    this.root.find('#mc-payment-title').text(i18._('payment-title'));
    this._button(false);
    this._error('');

    // Closing is a cancellation, not a failure: nothing has been charged, and
    // the player should not be told something went wrong.
    this.root.find('#mc-close-btn').bind('click', function() {
        _this.close({status: 'cancelled'});
    });
    // The overlay closes too, but only while the form is idle -- dismissing it
    // mid-charge would leave the player with no idea whether they paid.
    this.root.find('#mc-payment-overlay').bind('click', function() {
        if ( !_this.root.find('#mc-submit-btn').prop('disabled') ) {
            _this.close({status: 'cancelled'});
        }
    });
    // Rotating the device changes the height the dialog has to live in. The
    // iframe cannot be re-initialised, but the column can give it less room and
    // keep the button where it is.
    $(window).bind('resize orientationchange', $.proxy(this._fit, this));

    if ( window.visualViewport ) {
        window.visualViewport.addEventListener('resize', $.proxy(this._fit, this));
    }
};

var instance = null;

if ( instance === null ) {
    instance = new MoneyCollectModal();
}

export default instance;
