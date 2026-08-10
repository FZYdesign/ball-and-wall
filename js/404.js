import i18 from './app/i18/_.js';
import app from './app/_.js';
import getBrowserLang from './browser-lang.js';

var init = function() {
    if ( !app.gameOptions.get('window-options:lang') ) {
        app.gameOptions.set('window-options', {lang: getBrowserLang()});
    }
    app.gameOptions.set('window-games', {game: 'space', showOnStartup: false});
    i18.setLanguage(app.gameOptions.get('window-options:lang'));
    app.preloader.showIndicator();

    new app.Game({
        splashscreen: '404'
    });
};

if ( app.gameOptions.isLoaded() ) {
    init();
} else {
    app.gameOptions.addListener('loaded', init);
}
