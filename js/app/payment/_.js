import gateway from './gateway.js';
import ProviderMock from './provider-mock.js';
import ProviderMoneyCollect from './provider-moneycollect.js';

/**
 * The one place a payment provider is chosen.
 *
 * MoneyCollect is used when `PAYMENT` in js/_config_*.js has been filled in;
 * without credentials the game falls back to the mock, so it still runs -- and
 * the end-to-end suite still passes -- on a checkout with no account. Adding a
 * second real provider is another entry here and nothing else: the shop, the
 * wallet and the game are written against payment/gateway.js.
 */
var PROVIDERS = {
        moneycollect: ProviderMoneyCollect
    },

    /** `PAYMENT` is declared by js/_config_dev.js, which loads before the bundle. */
    config = typeof PAYMENT === 'undefined' ? {} : PAYMENT,

    Provider = PROVIDERS[config.provider],
    provider = Provider ? new Provider(config) : null;

if ( !provider || !provider.isAvailable() ) {
    provider = new ProviderMock();
}
gateway.use(provider);

export default {
    gateway: gateway,
    ProviderMock: ProviderMock,
    ProviderMoneyCollect: ProviderMoneyCollect
};
