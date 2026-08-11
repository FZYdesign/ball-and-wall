import i18 from './app/i18/_.js';
import app from './app/_.js';
import getBrowserLang from './browser-lang.js';

var init = function() {
    if ( i18.exists(getBrowserLang()) ) {
        if ( !app.gameOptions.get('window-options:lang') ) {
            // Stored resolved, not raw: the browser reports a region tag
            // (zh-TW, zh-HK) that no table is keyed by.
            app.gameOptions.set('window-options', {lang: i18.resolve(getBrowserLang())});
        }
    } else {
        if ( !app.gameOptions.get('window-options:lang') || !i18.exists(app.gameOptions.get('window-options:lang')) ) {
            app.gameOptions.set('window-options', {lang: 'en-us'});
        }
    }
    i18.setLanguage(app.gameOptions.get('window-options:lang'));
    app.preloader.showIndicator();

    new app.LevelsEditor();
};

if ( app.gameOptions.isLoaded() ) {
    init();
} else {
    app.gameOptions.addListener('loaded', init);
}
