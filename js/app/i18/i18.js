import pl from './languages/pl.js';
import enUs from './languages/en-us.js';

/**
 * Available translations, keyed by language code. Replaces a runtime-built
 * module path; adding a language means adding an import and an entry here.
 */
var LANGUAGES = {
    'en-us': enUs,
    pl: pl
};

var
    _strings = {
        'lang-full-name:pl': 'Polish - Polski',
        'lang-full-name:en-us': 'English (US) - English (US)'
    },
    _code;

function Lang() {

}

/**
 * @method _
 * @param {String} key
 * @return {String}
 */
Lang.prototype._ = function(key) {
    return _strings[key];
};

/**
 * @method setLanguage
 * @param {String} code
 */
Lang.prototype.setLanguage = function(code) {
    _code = code;

    $.extend(_strings, LANGUAGES[code] || LANGUAGES['en-us']);
};

/**
 * @method getLanguageCode
 * @return {String}
 */
Lang.prototype.getLanguageCode = function() {
    return _code;
};

/**
 * @method getLanguageName
 * @param {String} code
 * @return {String}
 */
Lang.prototype.getLanguageName = function(code) {
    return _strings['lang-full-name:' + (code || _code)];
};

/**
 * @method exists
 * @param {String} code
 * @return {Boolean}
 */
Lang.prototype.exists = function(code) {
    return Object.prototype.hasOwnProperty.call(LANGUAGES, code);
};

var instance = null;

if ( instance === null ) {
    instance = new Lang();
}

export default instance;
