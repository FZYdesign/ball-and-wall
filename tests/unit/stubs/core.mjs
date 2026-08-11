import EventEmitter from '../../../js/app/core/event-emitter.js';

/**
 * The real core/storage/local.js probes localStorage the moment it is
 * constructed. This keeps the same promise-returning shape, in memory, so the
 * modules that persist through it -- wallet.js -- can be tested in Node.
 */
function StorageLocal(ns) {
    this._ns = ns;
    this._value = null;
}

StorageLocal.prototype.get = function() {
    return Promise.resolve(this._value);
};

StorageLocal.prototype.set = function(value) {
    this._value = value;

    return this;
};

/**
 * app/core/_.js pulls in localStorage and user-agent probing at module scope.
 * EventEmitter is the real one -- the entity prototypes inherit from it.
 */
export default {
    EventEmitter,
    StorageLocal,
    mediator: new EventEmitter(),
    helperApp: {
        pixelRatio: () => 1,
        platform: () => 'web'
    },
    helperBrowser: {
        isMobile: false,
        name: 'node',
        platform: { name: 'other', iosDevice: null }
    }
};
