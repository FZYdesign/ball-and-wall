import appHelper from '../helper/app.js';

var BASE_NS = 'baw-storage';

/**
 * @param {String} [ns] namespace, appended to the base key
 */
function Local(ns) {
    this._ns = BASE_NS;
    this.storage = null;
    this.initialize(ns || '');
}

/**
 * @method initialize
 * @param {String} ns
 */
Local.prototype.initialize = function(ns) {
    if ( ns ) {
        this._ns += ':' + ns;
    }
    if ( appHelper.platform() != 'chrome' ) {
        this._test();
        this._migrateFromBaseKey();
    }
};

/**
 * Until the constructor honoured its `ns` argument, every instance wrote to
 * the un-namespaced base key. Existing players have their settings and
 * unlocked levels stored there, so move them across the first time.
 *
 * @method _migrateFromBaseKey
 */
Local.prototype._migrateFromBaseKey = function() {
    if ( !this.storage || this._ns === BASE_NS ) {
        return;
    }
    try {
        var legacy = this.storage.getItem(BASE_NS);

        if ( legacy !== null && this.storage.getItem(this._ns) === null ) {
            this.storage.setItem(this._ns, legacy);
        }
    } catch (ex) {}
};

/**
 * @method get
 * @return {Q}
 */
Local.prototype.get = function() {
    // Was a Q deferred; native promises cover this entirely, so the Q
    // dependency is gone. Callers only ever use .then(), which is unchanged.
    return new Promise($.proxy(function(resolve) {
        if ( appHelper.platform() == 'chrome' ) {
            chrome.storage.local.get(this._ns, $.proxy(function(res) {
                resolve(JSON.stringify(res[this._ns]));
            }, this));
        } else {
            resolve(this.storage ? this.storage.getItem(this._ns) : null);
        }
    }, this));
};

/**
 * @method set
 * @param {Mixed} value
 * @return {StorageLocal}
 */
Local.prototype.set = function(value) {
    var tmp = {};

    if ( appHelper.platform() == 'chrome' ) {
        tmp[this._ns] = JSON.parse(value);
        chrome.storage.local.set(tmp);
    } else {
        this.storage.setItem(this._ns, value);
    }

    return this;
};

/**
 * @method clear
 * @param {String} key
 */
Local.prototype.clear = function(key) {
//        if ( appHelper.platform() == 'chrome' ) {
//            chrome.storage.local.clear();
//        } else {
//            this.storage.removeItem(this._ns);
//        }

    return this;
};

Local.prototype._test = function() {
    try {
        localStorage.setItem(this._ns + ':test', 'ok');

        if ( localStorage.getItem(this._ns + ':test') == 'ok' ) {
            this.storage = localStorage;
        } else {
            throw "Error detecting local storage";
        }
    } catch (ex) {}
};

export default Local;
