import EntitiesBase from './_base.js';
import paddle from '../entity/paddle.js';

function Paddles() {
    EntitiesBase.call(this);
    this.id = 'paddles';
    this.initialize();
}

Paddles.prototype = Object.create(EntitiesBase.prototype, {
    constructor: {
        value: Paddles,
        enumerable: false
    }
});

/**
 * @method initialize
 */
Paddles.prototype.initialize = function() {

};

/**
 * @method create
 */
Paddles.prototype.create = function() {
    return EntitiesBase.prototype.create.call(this, paddle.createNew());
};

/**
 * @method hide
 */
Paddles.prototype.hide = function() {
    this.reset();

    if ( this.current() ) {
        this.current().hide();
    }
};

/**
 * @method update
 * @param {Object} event
 */
Paddles.prototype.update = function(event) {
    this.reset();

    while ( this.current() ) {
        this.current().setAsMainEntity(this.index === 0);
        this.current().update(event);

        if ( !this.current().isExists() ) {
            this.removeChildByIndex(this.index);
        }
        this.next();
    }
};

var instance = null;

if ( instance === null ) {
    instance = new Paddles();
}

export default instance;
