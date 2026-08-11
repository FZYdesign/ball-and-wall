/**
 * Stands in for MoneyCollect's hosted SDK.
 *
 * The real one is a third-party script that renders a card form in an iframe on
 * their domain -- untestable here, and not ours to test. What *is* ours is the
 * sequence around it: create a payment, render the form, confirm the payment
 * method, charge it, then confirm the status out of band before crediting
 * anything. This exposes the same three methods with the same shapes so that
 * sequence can be driven end to end.
 *
 * `window.__mcStub` is the control surface: a spec can record what the provider
 * called, or make a step fail, without reaching into the game.
 */
(function() {
    var stub = window.__mcStub = window.__mcStub || {};

    stub.calls = [];
    stub.confirmPaymentMethodResult = stub.confirmPaymentMethodResult || null;
    stub.confirmChargeResult = stub.confirmChargeResult || null;

    /**
     * @param {String} name
     * @param {Object} params
     */
    function record(name, params) {
        stub.calls.push({ name: name, params: params });
    }

    window.MoneycollectPay = function(apiKey) {
        record('init', { apiKey: apiKey });

        return {
            /**
             * The real SDK injects an iframe here and the provider waits for it,
             * so the stub has to produce one or the wait times out.
             */
            elementInit: function(type, params) {
                record('elementInit', { type: type, params: params });

                var wrapper = document.getElementById(params.formWrapperId);
                var frame = document.createElement('iframe');

                frame.id = params.frameId;
                frame.setAttribute('title', 'card form');
                frame.style.width = '100%';
                // The real SDK sizes the iframe to frameMaxHeight, which is why
                // the dialog has to be told how much room there actually is --
                // a fixed height here would test nothing about that.
                frame.style.height = ((params.layout
                    && params.layout.style
                    && params.layout.style.frameMaxHeight) || 320) + 'px';
                frame.style.border = '0';
                wrapper.appendChild(frame);

                return Promise.resolve({ code: 'success' });
            },

            confirmPaymentMethod: function(params) {
                record('confirmPaymentMethod', params);

                return Promise.resolve(stub.confirmPaymentMethodResult || {
                    data: { code: 'success', data: { id: 'pm_stub_1' } }
                });
            },

            confirmCharge: function(params) {
                record('confirmCharge', params);

                return Promise.resolve(stub.confirmChargeResult || {
                    data: { code: 'success', data: { id: 'pay_stub_1', status: 'succeeded' } }
                });
            }
        };
    };
}());
