import WindowBase from './_base.js';
import core from '../core/_.js';
import i18 from '../i18/_.js';
import wallet from '../wallet.js';
import catalog from '../shop/catalog.js';
import payment from '../payment/_.js';

var
    /**
     * How long a result message stays up before the shop goes quiet again.
     *
     * @property MESSAGE_TIMEOUT
     * @static
     * @private
     */
    MESSAGE_TIMEOUT = 4000;

/**
 * The shop: consumables on one tab, coin top-ups on the other.
 *
 * The two halves are deliberately separate transactions. Buying an item is
 * settled here and now against the coin balance; buying coins hands off to
 * payment/gateway.js and only credits when that comes back `paid`. Nothing in
 * this window knows which payment provider is in use.
 */
function Shop() {
    WindowBase.call(this);
    this.name = 'shop';
    this.className = 'lbx-shop';
    this.showOverlay = true;
    this.options = {};
    this.pending = null;
    this.messageTimer = null;
    this.initialize();
}

Shop.prototype = Object.create(WindowBase.prototype, {
    constructor: {
        value: Shop,
        enumerable: false
    }
});

/**
 * @method header
 */
Shop.prototype.header = function() {
    return i18._('shop-header');
};

/**
 * @method model
 */
Shop.prototype.model = function() {
    return {
        tag: 'div', className: 'shop-window', childs: [
            {tag: 'div', className: 'tab-buttons', childs: [
                {tag: 'a', href: '#', className: 'tab-selected', html: i18._('shop-tab-items')},
                {tag: 'a', href: '#', html: i18._('shop-tab-coins')}
            ]},
            {tag: 'div', className: 'shop-balance', childs: [
                {tag: 'span', className: 'shop-balance-label', html: i18._('shop-balance')},
                {tag: 'span', className: 'shop-balance-value', html: String(wallet.getCoins())}
            ]},
            {tag: 'div', className: 'shop-message', styles: {display: 'none'}},
            {tag: 'div', className: 'tab-contents shop-items', styles: {display: 'block'},
                childs: [this._itemsModel()]},
            {tag: 'div', className: 'tab-contents shop-packs', styles: {display: 'none'},
                childs: [this._packsModel(), {tag: 'p', className: 'shop-notice',
                    html: i18._('shop-payment-notice')}]}
        ]
    };
};

/**
 * @method _itemsModel
 * @return {Object}
 * @private
 */
Shop.prototype._itemsModel = function() {
    var _this = this;

    return {tag: 'ul', className: 'shop-list shop-list-items', childs:
        $.map(catalog.getItems(), function(item) {
            return {tag: 'li', className: 'shop-entry', 'data-item': item.id, childs: [
                {tag: 'span', className: 'shop-icon', html: item.icon},
                {tag: 'span', className: 'shop-entry-body', childs: [
                    {tag: 'span', className: 'shop-name', html: catalog.getItemName(item)},
                    {tag: 'span', className: 'shop-desc', html: catalog.getItemDescription(item)}
                ]},
                {tag: 'span', className: 'shop-owned',
                    html: i18._('shop-owned').replace('{count}', wallet.getItemCount(item.id))},
                {tag: 'a', href: '#', className: 'btn medium primary shop-buy',
                    html: i18._('shop-buy').replace('{price}', item.price),
                    events: [{click: function(event) {
                        event.preventDefault();
                        _this.onBuyItem(item);
                    }}]}
            ]};
        })
    };
};

/**
 * @method _packsModel
 * @return {Object}
 * @private
 */
Shop.prototype._packsModel = function() {
    var _this = this;

    return {tag: 'ul', className: 'shop-list shop-list-packs', childs:
        $.map(catalog.getPacks(), function(pack) {
            return {tag: 'li', className: 'shop-entry' + (pack.tag ? ' shop-entry-tagged' : ''),
                'data-pack': pack.id, childs: [
                    {tag: 'span', className: 'shop-icon', html: '◈'},
                    {tag: 'span', className: 'shop-entry-body', childs: [
                        {tag: 'span', className: 'shop-name',
                            html: i18._('shop-pack-coins').replace('{coins}', pack.coins)},
                        {tag: 'span', className: 'shop-desc', html: pack.bonus
                            ? i18._('shop-pack-bonus').replace('{bonus}', pack.bonus) : '&nbsp;'}
                    ]},
                    pack.tag ? {tag: 'span', className: 'shop-tag',
                        html: i18._('shop-tag:' + pack.tag)} : {},
                    {tag: 'a', href: '#', className: 'btn medium secondary shop-pay',
                        html: catalog.formatPrice(pack),
                        events: [{click: function(event) {
                            event.preventDefault();
                            _this.onBuyPack(pack);
                        }}]}
                ]};
        })
    };
};

/**
 * @param {Object} options
 */
Shop.prototype.initialize = function(options) {
    WindowBase.prototype.initialize.call(this, options);
    this.setScrollableContent('.tab-contents');
    wallet.addListener('change', $.proxy(this._refresh, this));
};

/**
 * @method open
 * @param {Object} options
 */
Shop.prototype.open = function(options) {
    WindowBase.prototype.open.call(this, options);
};

/**
 * @method close
 */
Shop.prototype.close = function() {
    // An order that is still in flight settles into a window that is no longer
    // there, so the handlers check `this.content` before touching the DOM.
    clearTimeout(this.messageTimer);
    WindowBase.prototype.close.call(this);
};

/**
 * @method onBuyItem
 * @param {Object} item
 */
Shop.prototype.onBuyItem = function(item) {
    if ( !wallet.buyItem(item) ) {
        this._message(i18._('shop-not-enough-coins'), 'error');

        return;
    }
    this._message(i18._('shop-item-bought').replace('{name}', catalog.getItemName(item)), 'ok');
    this.emit('buyItem', [item]);
};

/**
 * @method onBuyPack
 * @param {Object} pack
 */
Shop.prototype.onBuyPack = function(pack) {
    var _this = this,
        coins = catalog.getPackCoins(pack);

    // One order at a time. Two payment sheets over each other is how a player
    // ends up paying twice for one pack.
    if ( this.pending ) {
        return;
    }
    if ( !payment.gateway.isAvailable() ) {
        this._message(i18._('shop-payment-unavailable'), 'error');

        return;
    }
    this.pending = pack.id;
    this._refresh();
    this._message(i18._('shop-processing'), 'pending');

    payment.gateway.purchase(pack, coins).then(function(result) {
        _this.pending = null;

        if ( result.status === 'paid' ) {
            wallet.recordOrder({
                orderId: result.order && result.order.orderId,
                transactionId: result.transactionId,
                packId: pack.id,
                amountMinor: pack.amountMinor,
                currency: pack.currency,
                coins: coins,
                createdAt: result.order && result.order.createdAt
            });
            // Where a server-backed provider would instead hand back the
            // authoritative balance for wallet.setServerState().
            wallet.credit(coins, 'topup:' + pack.id);
            _this._message(i18._('shop-purchase-ok').replace('{coins}', coins), 'ok');
            _this.emit('buyPack', [pack, result]);

        } else if ( result.status === 'pending' ) {
            // The provider took the money but has not committed to a status
            // yet. Crediting on that would be guessing, and refusing would be
            // wrong -- so the player is told what is actually true.
            _this._message(i18._('shop-purchase-pending'), 'pending');

        } else if ( result.status === 'cancelled' ) {
            _this._message(i18._('shop-purchase-cancelled'), 'error');

        } else {
            _this._message(i18._('shop-purchase-failed'), 'error');
        }
        _this._refresh();
    });
};

/**
 * Repaints the parts that change -- balance, owned counts, disabled states --
 * without rebuilding the window under the player's finger.
 *
 * @method _refresh
 * @private
 */
Shop.prototype._refresh = function() {
    var _this = this;

    if ( !this.content ) {
        return;
    }
    this.content.find('.shop-balance-value').text(wallet.getCoins());

    this.content.find('.shop-list-items .shop-entry').each(function() {
        var entry = $(this),
            item = catalog.getItem(entry.attr('data-item'));

        if ( !item ) {
            return;
        }
        entry.find('.shop-owned').text(i18._('shop-owned').replace('{count}',
                wallet.getItemCount(item.id)));
        entry.find('.shop-buy').toggleClass('shop-disabled', !wallet.canAfford(item.price));
    });

    this.content.find('.shop-list-packs .shop-entry').each(function() {
        var entry = $(this),
            isPending = _this.pending === entry.attr('data-pack');

        entry.find('.shop-pay').toggleClass('shop-pending', isPending);
        entry.toggleClass('shop-disabled', Boolean(_this.pending) && !isPending);
    });
};

/**
 * @method _message
 * @param {String} text
 * @param {String} kind ok | error | pending
 * @private
 */
Shop.prototype._message = function(text, kind) {
    var element;

    if ( !this.content ) {
        return;
    }
    element = this.content.find('.shop-message');
    element
            .removeClass('shop-message-ok shop-message-error shop-message-pending')
            .addClass('shop-message-' + kind)
            .html(text)
            .show();

    clearTimeout(this.messageTimer);

    if ( kind === 'pending' ) {
        return;
    }
    this.messageTimer = setTimeout(function() {
        element.fadeOut(200);
    }, MESSAGE_TIMEOUT);
};

/**
 * @method _buildHtml
 */
Shop.prototype._buildHtml = function() {
    WindowBase.prototype._buildHtml.call(this);
    this.tab = new core.Tab({
        buttons: this.content.find('.tab-buttons a'),
        contents: this.content.find('.tab-contents'),
        active_tab_class: 'tab-selected'
    });
    this._refresh();

    return this;
};

export default Shop;
