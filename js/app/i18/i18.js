import pl from './languages/pl.js';
import enUs from './languages/en-us.js';
import zhCn from './languages/zh-cn.js';

/**
 * Available translations, keyed by language code. Replaces a runtime-built
 * module path; adding a language means adding an import and an entry here.
 */
var LANGUAGES = {
    'en-us': enUs,
    pl: pl,
    'zh-cn': zhCn
};

/**
 * Codes a browser reports that no table is keyed by.
 *
 * `navigator.language` gives a region tag, and there is no reason for every
 * region to be its own table -- a `zh-TW` reader is far better served by
 * Simplified Chinese than by falling through to English, which is what an
 * unresolved code does.
 */
var ALIASES = {
    zh: 'zh-cn',
    'zh-hans': 'zh-cn',
    'zh-hant': 'zh-cn',
    'zh-sg': 'zh-cn',
    'zh-tw': 'zh-cn',
    'zh-hk': 'zh-cn',
    'zh-mo': 'zh-cn'
};

var
    _strings = {
        'lang-full-name:pl': 'Polish - Polski',
        'lang-full-name:en-us': 'English (US) - English (US)',
        'lang-full-name:zh-cn': 'Chinese (Simplified) - 简体中文'
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
 * The table a code actually selects, or null when there is none.
 *
 * @method resolve
 * @param {String} code
 * @return {String|null}
 */
Lang.prototype.resolve = function(code) {
    code = (code || '').toLowerCase();
    code = ALIASES[code] || code;

    return Object.prototype.hasOwnProperty.call(LANGUAGES, code) ? code : null;
};

/**
 * @method setLanguage
 * @param {String} code
 */
Lang.prototype.setLanguage = function(code) {
    // Stored under the code that was actually applied, so the options window
    // can mark the right radio and a reload picks the same table.
    _code = this.resolve(code) || 'en-us';

    $.extend(_strings, LANGUAGES[_code]);
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
    return this.resolve(code) !== null;
};

var instance = null;

if ( instance === null ) {
    instance = new Lang();
}

export default instance;
