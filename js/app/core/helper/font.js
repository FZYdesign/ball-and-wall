import helperBrowser from './browser.js';
import helperAsset from './asset.js';

export default {
    /**
     * @method injectDefault
     */
    injectDefault: function() {
        var fontsCss = 'fonts.css',
            link = document.createElement('link');

        if ( helperBrowser.platform.name == 'win' && helperBrowser.name == 'chrome' ) {
           fontsCss = 'fonts-chrome.css';
        }
        link.rel = 'stylesheet';

        // Named at runtime, so the build cannot rewrite it to the hashed
        // filename -- asset.js looks it up in the map the build publishes.
        link.href = helperAsset.url((ENV == 'prod' ? 'dist/' : 'css/') + fontsCss);
        link.type = 'text/css';
        link.media = 'screen';
        $(document.head).append(link);
    }
};
