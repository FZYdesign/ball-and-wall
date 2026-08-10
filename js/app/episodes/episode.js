import helperApp from '../core/helper/app.js';
import registry from './_registry.js';

function Episode() {
    this.episode = null;
    this.lockChangeEpisode = false;
    this.grid = [];
}

/**
 * @method use
 * @param {String} episode
 * @return {Episode}
 */
Episode.prototype.use = function(episode) {
    if ( this.lockChangeEpisode ) {
        return this;
    }
    if ( this.episode != episode ) {
        this.grid = [];
    }
    this.episode = episode;

    return this;
};

/**
 * @method lock
 * @param {Boolean} lock
 * @return {Episode}
 */
Episode.prototype.lock = function(lock) {
    this.lockChangeEpisode = lock ? true : false;

    return this;
};

/**
 * @method load
 * @param {Function} callback
 */
Episode.prototype.load = function(callback) {
    // Episode content is bundled rather than fetched, so there is nothing to
    // wait for. The callback is still deferred to a microtask: callers were
    // written against RequireJS, which never invoked it synchronously.
    Promise.resolve().then(callback);
};

/**
 * @method _content
 * @param {String} name one of blocks, bonuses, levels, manifest, resources, splash-screen
 * @return {Function}
 */
Episode.prototype._content = function(name) {
    var content = registry[this.episode];

    if ( !content ) {
        throw new Error('Unknown episode "' + this.episode + '"');
    }

    return content[name];
};

/**
 * @method getName
 * @return {String}
 */
Episode.prototype.getName = function() {
    return this.episode;
};

/**
 * @method getGrid
 * @return {Array}
 */
Episode.prototype.getGrid = function() {
    if ( this.grid.length ) {
        return this.grid;
    }
    var manifest = this.getManifest(),
        grid = [],
        x, y, lenX, lenY, xStep, yStep;

    xStep = manifest.cell.width;
    yStep = manifest.cell.height;

    for ( y = 0, lenY = manifest.grid.height * yStep; y < lenY; y = y + yStep ) {
        for ( x = 0, lenX = manifest.grid.width * xStep; x < lenX; x = x + xStep ) {
            grid.push({
                x: x,
                y: y
            });
        }
    }
    this.grid = grid;

    return this.grid;
};

/**
 * @method getManifest
 * @return {Object}
 */
Episode.prototype.getManifest = function() {
    return this._content('manifest').call(this);
};

/**
 * @method getBlocks
 * @return {Array}
 */
Episode.prototype.getBlocks = function() {
    return this._content('blocks').call(this);
};

/**
 * @method getBonuses
 * @return {Array}
 */
Episode.prototype.getBonuses = function() {
    return this._content('bonuses').call(this);
};

/**
 * @method getLevels
 * @return {Array}
 */
Episode.prototype.getLevels = function() {
    return this._content('levels').call(this);
};

/**
 * @method getLevels
 * @return {Array}
 */
Episode.prototype.getResources = function() {
    var resources = this._content('resources').call(this);

    resources = $.map(resources, function(value) {
        if ( helperApp.pixelRatio() >= 2 ) {
            value.src = value.src.replace(/(\.(png))$/, '@2x$1');
        }
        value.src = value.src + REVISION;

        return value;
    });

    return resources;
};

/**
 * @method getSplashScreen
 * @return {Array}
 */
Episode.prototype.getSplashScreen = function(type) {
    var levels = this._content('splash-screen').call(this),
        result;

    if ( !type ) {
        return levels[0];
    }
    $.each(levels, function(index, level) {
        var name = level.split(':')[0];

        if ( name == type ) {
            result = level;
        }
    });

    return result;
};

var instance = null;

if ( instance === null ) {
    instance = new Episode();
}

export default instance;
