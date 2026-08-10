import i18 from './app/i18/_.js';
import app from './app/_.js';
import getBrowserLang from './browser-lang.js';

var init = function() {
    if ( i18.exists(getBrowserLang()) ) {
        if ( !app.gameOptions.get('window-options:lang') ) {
            app.gameOptions.set('window-options', {lang: getBrowserLang()});
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
