var
    // Static server
    SS = '',
    FULLADDR = '',
    // Backend API address
    API_ADDR = '',
    // Game version
    VERSION = '1.0.0',
    // Revision of your all static files (after update you should increase this value)
    REVISION = '?v=1',
    // Availables episodes
    EPISODES = ['space', 'pegasus'],
    ENV = 'dev',
    /**
     * MoneyCollect payment. The shop reaches this through
     * js/app/payment/gateway.js and never touches the SDK itself; leaving
     * `apiKey` empty falls the gateway back to the mock provider, so the game
     * still runs -- and the end-to-end suite still passes -- with no account.
     *
     * `secretKey` is only read when `orderEndpoint` is empty, i.e. when the
     * browser creates and polls the payment itself. That is the flow the
     * reference integration uses and it is fine for a test account, but the key
     * is readable by anyone who opens the bundle: it can create and refund
     * charges. Point `orderEndpoint` at a server that holds the key and the
     * secret never has to ship at all -- see the payments section of CLAUDE.md.
     */
    PAYMENT = {
        provider: 'moneycollect',
        // 'test' or 'pro'; picks the SDK build and the API host below.
        mode: 'test',
        sdkUrl: 'https://test-static.moneycollect.com/jssdk/js/MoneyCollect.min.js',
        serverUrl: 'https://test-api.moneycollect.com/api/services/v1/payment',
        apiKey: '',
        secretKey: '',
        // Server that creates the payment and reports its status. When set, the
        // browser never sees the secret key.
        orderEndpoint: '',
        // What the player is told they are buying, on the provider's own form.
        description: 'Ball And Wall coins',
        // Sent with the card. Fill in via js/_config_secrets.js -- some
        // acquirers decline a charge with no billing details at all.
        billing: null,
        // Optional async notification URL for your own backend.
        notifyUrl: ''
    };

// Payment credentials live outside the repository -- js/_config_secrets.js,
// git-ignored and seeded from the committed example. Anything non-empty there
// wins, so a checkout with no credentials falls back to the mock provider.
if ( window.PAYMENT_SECRETS ) {
    for ( var paymentKey in window.PAYMENT_SECRETS ) {
        if ( window.PAYMENT_SECRETS[paymentKey] ) {
            PAYMENT[paymentKey] = window.PAYMENT_SECRETS[paymentKey];
        }
    }
}
