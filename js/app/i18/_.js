import i18 from './i18.js';

/**
 * Bound to the instance: `setLanguage` and `exists` both go through
 * `resolve()`, and an unbound method picked off this object would take the
 * object as its `this`.
 */
export default {
    _: i18._.bind(i18),
    resolve: i18.resolve.bind(i18),
    setLanguage: i18.setLanguage.bind(i18),
    getLanguageCode: i18.getLanguageCode.bind(i18),
    getLanguageName: i18.getLanguageName.bind(i18),
    exists: i18.exists.bind(i18)
};
