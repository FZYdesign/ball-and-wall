import BaseBlock from './_base.js';
import episode from '../../episodes/_.js';
import blockEntities from './_registry.js';

function Block() {
    BaseBlock.call(this);
    this.id = 'block';
}

Block.prototype = Object.create(BaseBlock.prototype, {
    constructor: {
        value: Block,
        enumerable: false
    }
});

/**
 * @method create
 * @param {Number} typeId
 * @return {Block}
 */
Block.prototype.create = function(typeId) {
    this.init(typeId);

    return this;
};

/**
 * @method createNew
 * @param {Number} typeId
 * @return {Block}
 */
Block.prototype.createNew = function(typeId) {
    var types = episode.getBlocks(),
        block;

    if ( types[typeId].entity ) {
        block = blockEntities[types[typeId].entity].createNew({
            type: $.extend(types[typeId], {id: typeId})
        });
    } else {
        block = new Block();
        block.init(typeId);
    }

    return block;
};

var instance = null;

if ( instance === null ) {
    instance = new Block();
}

export default instance;
