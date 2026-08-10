import EntitiesBase from './_base.js';
import bulletEntity from '../entity/bullet.js';

function Bullets() {
    EntitiesBase.call(this);
    this.id = 'bullets';
    this.initialize();
}

Bullets.prototype = Object.create(EntitiesBase.prototype, {
    constructor: {
        value: Bullets,
        enumerable: false
    }
});

/**
 * @method initialize
 */
Bullets.prototype.initialize = function() {

};

/**
 * @method create
 * @param {Object} options
 */
Bullets.prototype.create = function(options) {
    var bullet = EntitiesBase.prototype.create.call(this, bulletEntity.createNew(options));

    bullet.addToStage();

    return bullet;
};

/**
 * @method update
 * @param {Object} event
 */
Bullets.prototype.update = function(event) {
    this.reset();

    while ( this.current() ) {
        this.current().update(event);

        if ( !this.current().isExists() ) {
            this.removeChildByIndex(this.index);
        }
        this.next();
    }
};

var instance = null;

if ( instance === null ) {
    instance = new Bullets();
}

export default instance;
