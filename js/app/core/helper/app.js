/**
 * Highest artwork variant that ships: images exist at 1x and @2x, nothing more.
 */
var MAX_ASSET_SCALE = 2;

export default {

    /**
     * @method version
     * @return {String}
     */
    version: function() {
        return '1.0.0';
    },

    /**
     * @method platform
     * @return {String}
     */
    platform: function() {
        var l = location;

        //chrome-extension://...
        if ( l.href.match(/^chrome\-extension:\/\//) ) {
            return 'chrome';
        }
        //widget://...
        if ( l.href.match(/^widget:\/\//) ) {
            return 'opera';
        }
        //resource://...
        if ( l.href.match(/^resource:\/\//) ) {
            return 'firefox';
        }
        //ios://...
        if ( l.href.match(/^ios:\/\//) ) {
            return 'ios';
        }
        //ms-appx://...
        if ( l.href.match(/^ms\-appx:\/\//) ) {
            return 'wp8';
        }
        //x-wmapp...
        if ( l.href.match(/^x\-wmapp/) ) {
            return 'wp8phone';
        }

        return 'web';
    },

    /**
     * The scale every piece of geometry in the game is derived from: canvas
     * backing store, sprite frame sizes, block dimensions, speeds.
     *
     * Capped at MAX_ASSET_SCALE because that is the largest artwork that ships.
     * `episode.getResources()` can only ever load the 1x or the @2x image, so on
     * a 3x screen an uncapped ratio made the frame maths describe a sprite sheet
     * that does not exist -- 38*3 = 114px frames read out of a 76px-per-frame
     * @2x sheet, giving zero frames, a null getBounds() and a TypeError thrown
     * on every tick as soon as a ball swept over an animated block.
     *
     * Raising this means adding @3x art and teaching getResources() to pick it.
     *
     * @method pixelRatio
     * @return {Number}
     */
    pixelRatio: function() {
        var backingStore = window.backingStorePixelRatio ||
                window.webkitBackingStorePixelRatio ||
                window.mozBackingStorePixelRatio ||
                window.msBackingStorePixelRatio ||
                window.oBackingStorePixelRatio ||
                window.backingStorePixelRatio || 1;

        return Math.min((window.devicePixelRatio || 1) / backingStore, MAX_ASSET_SCALE);
    }
};
