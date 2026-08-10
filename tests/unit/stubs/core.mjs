import EventEmitter from '../../../js/app/core/event-emitter.js';

/**
 * app/core/_.js pulls in localStorage and user-agent probing at module scope.
 * EventEmitter is the real one -- the entity prototypes inherit from it.
 */
export default {
    EventEmitter,
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
