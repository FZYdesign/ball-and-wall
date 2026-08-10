import EntitiesBase from './_base.js';
import scoreEntity from '../entity/score.js';

function Scores() {
    EntitiesBase.call(this);
    this.id = 'scores';
    this.initialize();
}

Scores.prototype = Object.create(EntitiesBase.prototype, {
    constructor: {
        value: Scores,
        enumerable: false
    }
});

/**
 * @method initialize
 */
Scores.prototype.initialize = function() {

};

/**
 * @method create
 * @param {String|Number} score
 * @param {Object} options
 */
Scores.prototype.create = function(score, options) {
    var entity = EntitiesBase.prototype.create.call(this, scoreEntity.createNew(score, options));

    entity.addToStage();

    return entity;
};

/**
 * @method update
 * @param {Object} event
 */
Scores.prototype.update = function(event) {
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
    instance = new Scores();
}

export default instance;
