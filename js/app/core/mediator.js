import EventEmitter from './event-emitter.js';

function Mediator() {
    EventEmitter.call(this);
}

Mediator.prototype = Object.create(EventEmitter.prototype, {
    constructor: {
        value: Mediator,
        enumerable: false
    }
});

var instance = null;

if ( instance === null ) {
    instance = new Mediator();
}

export default instance;
