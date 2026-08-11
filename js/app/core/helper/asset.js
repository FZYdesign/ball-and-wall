/**
 * Turns a stylesheet path into the URL that actually serves it.
 *
 * Most of the page's assets are named by a build block, which the build rewrites
 * to the hashed filename. Two are not: the font sheet, picked at runtime from
 * the browser, and the per-episode sheet, picked from the chosen episode. Both
 * are built strings, so the build cannot rewrite them -- it publishes the map
 * instead, as `ASSETS` in the generated config, and this resolves against it.
 *
 * Development has no build and therefore no map, so paths fall through
 * unchanged with `REVISION` appended -- the manual cache buster that a hashed
 * filename makes unnecessary, and that a hashed filename must not carry (the
 * whole point is that the name changes on its own).
 */
export default {
    /**
     * @method url
     * @param {String} path repo-relative, exactly as the build recorded it
     * @return {String}
     */
    url: function(path) {
        var hashed = typeof ASSETS !== 'undefined' && ASSETS ? ASSETS[path] : null;

        return SS + (hashed || path + REVISION);
    }
};
