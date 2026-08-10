import i18 from './app/i18/_.js';
import core from './app/core/_.js';
import app from './app/_.js';
import entities from './app/entities/_.js';
import input from './app/input/_.js';
import episode from './app/episodes/_.js';
import getBrowserLang from './browser-lang.js';

/**
 * A handle on the running game for automated tests and console debugging.
 *
 * Under RequireJS anything could be pulled out of the loader with
 * `require('app/levels')`. A bundle has no such registry, so the singletons are
 * published deliberately instead. Everything here is already a live singleton --
 * this exposes them, it does not create anything.
 */
window.BallAndWall = {
    app: app,
    core: core,
    dashboard: app.dashboard,
    entities: entities,
    episode: episode,
    gameOptions: app.gameOptions,
    i18: i18,
    input: input,
    levels: app.levels,
    stage: app.stage
};

var options = {},
    regExpEpisode = /#?episode-([a-z0-9-]+)/,
    isChromeApp = core.helperApp.platform() == 'chrome',
    hashEpisode,
    init;

init = function() {
    if ( i18.exists(getBrowserLang()) ) {
        if ( !app.gameOptions.get('window-options:lang') ) {
            app.gameOptions.set('window-options', {lang: getBrowserLang()});
        }
    } else {
        if ( !app.gameOptions.get('window-options:lang') || !i18.exists(app.gameOptions.get('window-options:lang')) ) {
            app.gameOptions.set('window-options', {lang: 'en-us'});
        }
    }
    if ( location.hash.match(regExpEpisode) ) {
        hashEpisode = location.hash.match(regExpEpisode)[1];
        location.hash = '';

        if ( EPISODES.indexOf(hashEpisode) !== -1 ) {
            app.gameOptions.set('window-games', {game: hashEpisode});
        }
    }
    i18.setLanguage(app.gameOptions.get('window-options:lang'));
    app.preloader.showIndicator();

    if ( core.storageGlobal.get('level') ) {
        options.customLevel = core.storageGlobal.get('level');
    }
    new app.Game(options);

};

if ( app.gameOptions.isLoaded() ) {
    init();
} else {
    app.gameOptions.addListener('loaded', init);
}
