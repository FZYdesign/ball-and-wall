import storageGlobal from '../storage/global.js';
import browser from './browser.js';

export default {
    isSupport: function() {
        var de = document.documentElement;

        if ( browser.isMobile || (storageGlobal.get('platform') != 'web' && storageGlobal.get('platform') != 'chrome') ) {
            return false;
        }

        return de.mozRequestFullScreen || de.mozRequestFullScreen || de.webkitRequestFullscreen;
    },

    isFullscreen: function() {
        var d = document;

        if ( !this.isSupport() ) {
            return false;
        }

        return d.webkitIsFullScreen || d.mozFullScreen;
    }
};
