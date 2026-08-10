/**
 * Best guess at the browser's language, as a code the i18 tables can match.
 *
 * Shared by the three entry points, which each carried their own copy under AMD.
 *
 * @return {String} e.g. "en-us" or "pl"
 */
export default function getBrowserLang() {
    var raw = ((navigator.language || navigator.browserLanguage) + '').toLowerCase(),
        parts = raw.split('-');

    // Some browsers report a doubled tag such as "pl-pl"; the i18 tables key
    // those off the bare language.
    if ( parts.length >= 2 && parts[0] === parts[1] ) {
        return parts[0];
    }

    return raw;
}
