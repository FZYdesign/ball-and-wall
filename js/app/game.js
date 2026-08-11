import stage from './stage.js';
import entities from './entities/_.js';
import entity from './entity/_.js';
import dashboard from './dashboard.js';
import core from './core/_.js';
import preloader from './preloader.js';
import i18 from './i18/_.js';
import sound from './sound.js';
import levels from './levels.js';
import input from './input/_.js';
import facade from './facade.js';
import _window from './window/_.js';
import gameOptions from './game-options.js';
import episode from './episodes/_.js';
import rewards from './shop/rewards.js';
import coinHud from './coin-hud.js';

var
    /**
     * @property _options
     * @static
     * @private
     * @type {Object}
     */
    _options = {
        splashscreen: false,
        customLevel: null
    };

function Game(options) {
    // na mobile off
    document.onmousedown = function() { return false; };

    core.helperFont.injectDefault();
    this.options = options || _options;
    this.isGameStarted = false;
    this.isGameLoaded = false;
    this.episodeLevel = 0;

    if ( this.options.splashscreen ) {
        dashboard.disabled(true);
    }
    if ( this.options.customLevel ) {
        episode.use(this.options.customLevel.split(':')[0]).lock(true);
    }
    preloader.load();

    this.windowFirstTime = new _window.FirstTime();
    this.windowGames = new _window.Games();
    this.windowHelp = new _window.Help();
    this.windowOptions = new _window.Options();
    this.windowOrientationIndicator = new _window.OrientationIndicator();
    this.windowRounds = new _window.Rounds();
    this.windowRoundWin = new _window.RoundWin();
    this.windowShop = new _window.Shop();

    this.onWindowResize();
    this.onWindowOrientationChange();
    this.initEvents();
}

/**
 * @method initEvents
 */
Game.prototype.initEvents = function() {
    var w = $(window), d = $(document);

    w.bind('resize', $.proxy(this.onWindowResize, this));
    // `orientationchange` is deprecated and does not fire for every case that
    // changes orientation -- split screen, a resized browser window, desktop
    // device emulation. `resize` covers all of them, so the prompt is driven
    // off both rather than getting stuck on screen.
    w.bind('resize orientationchange', $.proxy(this.onWindowOrientationChange, this));

    if ( window === window.top && core.helperApp.platform() != 'wp8' ) {
        w.bind('focus', $.proxy(this.onWindowFocus, this));
        w.bind('blur', $.proxy(this.onWindowBlur, this));
        d.bind('webkitvisibilitychange', $.proxy(this.onWindowVisibilityChange, this));
        d.bind('webkitvisibilitychange', $.proxy(this.onWindowVisibilityChange, this));
    }
    $('#' + stage.stage.canvas.id).bind('click', $.proxy(this.onStageClick, this));
    this.windowFirstTime.addListener('close', $.proxy(this.onWindowFirstTimeClose, this));
    this.windowGames.addListener('selectEpisode', $.proxy(this.onWindowGamesSelectEpisode, this));
    this.windowRounds.addListener('back', $.proxy(this.onWindowRoundsBack, this));
    this.windowRounds.addListener('play', $.proxy(this.onWindowRoundsPlayGame, this));
    this.windowRoundWin.addListener('goToEpisodes', $.proxy(this.onWindowStatsGoToEpisodes, this));
    this.windowRoundWin.addListener('goToRounds', $.proxy(this.onWindowGamesSelectEpisode, this));
    this.windowRoundWin.addListener('nextRound', $.proxy(this.onWindowRoundWinNextRound, this));
    this.windowRoundWin.addListener('retryRound', $.proxy(this.onWindowRoundWinRetryRound, this));
    // The shop covers the field like the dashboard panel does, so a round is
    // held for it in exactly the same way.
    this.windowShop.addListener('open', $.proxy(this.onWindowShopOpen, this));
    this.windowShop.addListener('close', $.proxy(this.onWindowShopClose, this));
    core.mediator.addListener('game:game-over', $.proxy(this.onGameOver, this));
    core.mediator.addListener('hud:visibility', $.proxy(this.onDashboardVisibility, this));
    core.mediator.addListener('game:stage-clear', $.proxy(this.onGameClearStage, this));
    dashboard.addListener('clickHelp', $.proxy(this.onBtnHelpClick, this));
    dashboard.addListener('clickOptions', $.proxy(this.onBtnOptionsClick, this));
    dashboard.addListener('clickPlay', $.proxy(this.onBtnStartGameClick, this));
    dashboard.addListener('clickShop', $.proxy(this.onBtnShopClick, this));
    gameOptions.addListener('change:window-games', $.proxy(this.onEpisodeChange, this));
    preloader.addListener('complete', $.proxy(this.onPreloaderComplete, this));
};

/**
 * @method update
 * @param {Object} event
 */
Game.prototype.update = function(event) {
    if ( event.paused ) {
        return;
    }
    if ( !this.isGameStarted ) {
        entities.paddles.hide();
    }
    entities.paddles.update(event);
    levels.getBonuses().update(event);
    entities.balls.update(event);
    entities.scores.update(event);
    entities.clouds.update(event);
    entities.blocks.update(event);
    stage.update(event);
};

/**
 * @method startGame
 * @param {String} episode
 * @param {Number} level
 */
Game.prototype.startNewGame = function(episode, level) {
    this.resumeForNewRound();
    sound.resetSettings();
    $('#a-game-canvas').addClass('a-playing');
    this.clearStage();
    levels.loadLevel(level).build();
    entities.balls.create().setAlive(false);
    entities.paddles.create();

    this.isGameStarted = true;
    core.mediator.emit('game:game-start');
    dashboard.getTime().reset();
    dashboard.getScore().reset();
    dashboard.getSpeed().reset();
    dashboard.getLives().reset();

    if ( levels.isCustom() ) {
        dashboard.getRound().setMax(1).set(1);
    } else {
        dashboard.getRound().setMax(levels.getLevelsLength()).set(levels.getCurrentLevelIndex() + 1);
        facade.clear().show(i18._('round') + ' ' + (levels.getCurrentLevelIndex() + 1)
                + '\n(' + levels.getCurrentLevelName() + ')');
    }
    dashboard.getTime().start();
    sound.stopMusic();
};

/**
 * @method startLevelGame
 * @param {Number} level
 */
Game.prototype.startLevelGame = function(level) {
    this.resumeForNewRound();
    this.clearStage();
    levels.loadLevel(level).build();
    entities.balls.create();
    entities.paddles.create();
    dashboard.getTime().reset();
    dashboard.getScore().reset();
    dashboard.getSpeed().reset();
    dashboard.getRound().set(levels.getCurrentLevelIndex() + 1);
    dashboard.getTime().start();
    this.windowRounds.unlockLevel(episode.getName(), levels.getCurrentLevelIndex());

    if ( !levels.isCustom() ) {
        facade.clear().show(i18._('round') + ' ' + (levels.getCurrentLevelIndex() + 1)
                + '\n(' + levels.getCurrentLevelName() + ')');
    }
    core.mediator.emit('game:level-start', levels.getCurrentLevelIndex() + 1);
    sound.stopMusic();
};

/**
 * @method gameOver
 */
Game.prototype.gameOver = function() {
    if ( !this.isGameLoaded ) {
        return;
    }
    $('#a-game-canvas').removeClass('a-playing');
    this.isGameStarted = false;
    dashboard.getTime().stop();
    entities.balls.destroy();
    facade.clear().show(i18._('game-over'), {autohide: false});
    sound.playMusic();
};

/**
 * @method splashScreen
 */
Game.prototype.splashScreen = function() {
    sound.disableSounds(true);
    this.clearStage();
    levels.loadSplashScreen(this.options.splashscreen).build();
    entities.balls.create().setAlive(true).setSpeed(core.helperApp.pixelRatio(), Math.random() * Math.PI / 2 + Math.PI).bounceBottom(true);
    entities.balls.create().setAlive(true).setSpeed(core.helperApp.pixelRatio(), Math.random() * Math.PI).bounceBottom(true);
    entities.paddles.create();

    if ( !this.options.splashscreen ) {
        facade.clear().show(i18._('splash-screen-welcome-text'), {autohide: false});
    }
};

/**
 * @method clearStage
 */
Game.prototype.clearStage = function() {
    entities.balls.destroy();
    entities.paddles.destroy();
    levels.destroy();
    facade.clear();
    stage.clear();
};

/**
 * @method onGameOver
 */
Game.prototype.onGameOver = function() {
    this.gameOver();
};

/**
 * @method onGameClearStage
 */
Game.prototype.onGameClearStage = function() {
    if ( this.options.splashscreen ) {
        return;
    }
    if ( !dashboard.getTime().timer ) {
        return;
    }
    dashboard.getTime().stop();
    facade.clear().show(i18._('round-well-done'), {autohide: false});

    setTimeout(function() {
        entities.balls.destroy();
        entities.paddles.destroy();
    }, 0);
    setTimeout($.proxy(function() {
        var stats;

        if ( this.windowRoundWin.isOpened() ) {
            return;
        }
        stats = {
            isCustom: levels.isCustom(),
            episode: episode.getName(),
            round: levels.getCurrentLevelIndex() + 1,
            maxRound: levels.getLevelsLength(),
            time: dashboard.getTime().get(),
            lives: dashboard.getLives().get(),
            score: dashboard.getScore().get()
        };
        // Clearing a round is what pays for the shop. Credited here, where the
        // round is actually cleared, rather than where the summary is drawn --
        // that markup is rebuilt every time the window opens.
        stats.coins = rewards.grant(stats);
        this.windowRoundWin.open(stats);
        sound.play('win');
    }, this), 2000);
};

/**
 * @method onStageClick
 * @param {Object} event
 */
Game.prototype.onStageClick = function(event) {
    if ( this.isGameStarted || this.options.splashscreen || this.options.customLevel ) {
        return;
    }
    this.windowRounds.open({
        game: episode.getName(),
        levels: levels.getLevelNames()
    });
};

/**
 * @method onEpisodeChange
 * @param {Object} currentOptions
 * @param {Object} prevOptions
 */
Game.prototype.onEpisodeChange = function(currentOptions, prevOptions) {
    if ( currentOptions.game != prevOptions.game ) {
        sound.stopMusic(true);
        dashboard.hide();
        preloader.load();
    }
};

/**
 * @method onBtnStartGameClick
 * @param {event} event
 */
Game.prototype.onBtnStartGameClick = function(event) {
    if ( event ) {
        event.preventDefault();
    }
    if ( this.options.customLevel ) {
        this.windowGames.open({
            isCustom: true,
            game: episode.getName()
        });
    } else {
        this.windowRounds.open({
            game: episode.getName(),
            levels: levels.getLevelNames()
        });
    }
};

/**
 * @method onBtnOptionsClick
 * @param {event} event
 */
Game.prototype.onBtnOptionsClick = function(event) {
    if ( event ) {
        event.preventDefault();
    }
    this.windowOptions.open();
};

/**
 * @method onBtnShopClick
 * @param {event} event
 */
Game.prototype.onBtnShopClick = function(event) {
    if ( event ) {
        event.preventDefault();
    }
    this.windowShop.open();
};

/**
 * @method onWindowShopOpen
 */
Game.prototype.onWindowShopOpen = function() {
    this.holdRound(true);
};

/**
 * @method onWindowShopClose
 */
Game.prototype.onWindowShopClose = function() {
    this.holdRound(false);
};

/**
 * @method onBtnHelpClick
 * @param {event} event
 */
Game.prototype.onBtnHelpClick = function(event) {
    if ( event ) {
        event.preventDefault();
    }
    this.windowHelp.open();
};

// WindowStatsWin
/**
 * @method onWindowRoundWinRetryRound
 */
Game.prototype.onWindowRoundWinRetryRound = function() {
    if ( this.options.customLevel ) {
        this.startLevelGame('custom:' + this.options.customLevel.split(':')[1]);
    } else {
        this.startLevelGame(levels.getCurrentLevelIndex());
    }
};

/**
 * @method onWindowRoundWinNextRound
 */
Game.prototype.onWindowRoundWinNextRound = function() {
    this.startLevelGame(levels.getCurrentLevelIndex() + 1);
};

/**
 * @method onWindowRoundWinNextRound
 */
Game.prototype.onWindowStatsGoToEpisodes = function() {
    if ( this.options.customLevel ) {
        this.windowGames.open({
            isCustom: true,
            game: episode.getName()
        });
    } else {
        this.windowGames.open();
    }
};

// WindowRounds
/**
 * @method onWindowRoundsBack
 */
Game.prototype.onWindowRoundsBack = function() {
    this.windowGames.open();
};

/**
 * @method onWindowRoundsPlayGame
 * @param {Object} event
 */
Game.prototype.onWindowRoundsPlayGame = function(event) {
    this.startNewGame(event.episode, event.level);
};

// WindowGames
/**
 * @method onWindowGamesSelectEpisode
 */
Game.prototype.onWindowGamesSelectEpisode = function() {
    this.windowRounds.open({
        game: episode.getName(),
        levels: levels.getLevelNames()
    });
};

// WindowFirstTime

/**
 * @method onWindowFirstTimeClose
 */
Game.prototype.onWindowFirstTimeClose = function() {
    this.windowRounds.open({
        game: episode.getName(),
        levels: levels.getLevelNames()
    });
};

/**
 * @method onPreloaderComplete
 */
Game.prototype.onPreloaderComplete = function() {
    $('#a-container').css('visibility', 'visible');
    // Only the game gets the balance readout; the levels editor shares these
    // modules and has no wallet to speak of.
    coinHud.attach();
    // The field is sized against whatever sits above it, and that is only
    // laid out for real once the container is shown.
    stage.fit();
    $(document.body).css('backgroundImage', 'url("' + preloader.get('h-bg').src + '")')
            .attr('id', gameOptions.get('window-games:game'));
    $(document.body)
            .addClass('platform-' + core.helperBrowser.platform.name)
            .addClass('browser-' + core.helperBrowser.name)
            .addClass('app-' + core.helperApp.platform());
    facade.setOptions(episode.getManifest().facade);
    core.mediator.emit('game:game-over');
    this.clearStage();

    // TODO: For now we can only support episode 'space' for retina devices (like ipad, iphone and MacbookPro Retina)
    if ( core.helperApp.pixelRatio() >= 2 ) {
        EPISODES = ['space'];
    }
    // TODO: tmp
    if ( gameOptions.get('window-games:game') == 'space' ) {
        $('#a-game-bottom-line').css('backgroundImage', 'url("' + preloader.get('h-bottom-line').src + '")');
    }
    if ( this.options.splashscreen ) {
        createjs.Ticker.setFPS(gameOptions.get('fps'));
        this.splashScreen();

    } else if ( this.options.customLevel ) {
        if ( !this.isGameLoaded ) {
            createjs.Ticker.setFPS(gameOptions.get('fps'));
        }
        this.startNewGame(this.options.customLevel.split(':')[0], 'custom:' + this.options.customLevel.split(':')[1]);

    } else {
        if ( location.hash == '#contact' ) {
            location.hash = '';
            this.windowHelp.open();
            this.windowHelp.tab.changeTab(1);

        } else if ( gameOptions.get('window-games:game') == 'space' && gameOptions.get('window-first-time:needToShow')
                && $(window).width() >= 560 ) {
            this.windowFirstTime.open();
            gameOptions.set('window-first-time', {needToShow: false});

        } else if ( gameOptions.get('window-games').showOnStartup && !this.isGameLoaded && EPISODES.length > 1 ) {
            this.windowGames.open();

        } else if ( this.isGameLoaded ) {
            if ( this.windowGames.isOpened() ) {
                this.windowGames.close();
                this.windowRounds.open({
                    game: episode.getName(),
                    levels: levels.getLevelNames()
                });
            }
        }
        if ( !this.isGameLoaded ) {
            createjs.Ticker.setFPS(gameOptions.get('fps'));
        }
        if ( episode.getManifest().splashscreen && !core.helperBrowser.isMobile ) {
            this.splashScreen();

        } else {
            entities.paddles.create();
            facade.clear().show(i18._('splash-screen-welcome-text'), {autohide: false});
        }
        dashboard.getRound().setMax(levels.getLevelsLength());
        sound.playMusic();
    }
    if ( !createjs.Ticker.hasEventListener('tick') ) {
        var _this = this;

        createjs.Ticker.addEventListener('tick', function(event) {
            _this.update(event);
        });
    }
    this.isGameLoaded = true;
};

/**
 * @method onWindowFocus
 */
Game.prototype.onWindowFocus = function() {
    if ( !this.isPausedByOverlay() ) {
        createjs.Ticker.setPaused(false);
    }

    if ( !this.isGameStarted ) {
        sound.playMusic();
    }
};

/**
 * Closes the dashboard panel and makes sure the ticker is running, so a round
 * never starts behind it or frozen.
 *
 * @method resumeForNewRound
 */
Game.prototype.resumeForNewRound = function() {
    stage.showDashboard(false);
    this.windowShop.close();
    createjs.Ticker.setPaused(false);
};

/**
 * Whether the round is being held behind something covering the field -- the
 * dashboard panel on a small screen, or the shop. Returning to the tab must
 * not resume behind either of them.
 *
 * @method isPausedByOverlay
 * @return {Boolean}
 */
Game.prototype.isPausedByOverlay = function() {
    return this.isGameStarted && (stage.dashboardVisible || this.windowShop.isOpened());
};

/**
 * Freezes or resumes a round in progress, clock included.
 *
 * The two have to move together: the timer in dashboard/time.js is a plain
 * interval, so pausing the ticker on its own leaves it counting and quietly
 * inflates the player's time.
 *
 * @method holdRound
 * @param {Boolean} held
 */
Game.prototype.holdRound = function(held) {
    if ( !this.isGameStarted ) {
        return;
    }
    createjs.Ticker.setPaused(Boolean(held));

    if ( held ) {
        dashboard.getTime().stop();
    } else {
        // start() without an argument resumes; it does not reset the clock.
        dashboard.getTime().start();
    }
};

/**
 * The dashboard slid in or out. On a small screen it covers the field, so a
 * round in progress is held while it is open.
 *
 * @method onDashboardVisibility
 * @param {Boolean} visible
 */
Game.prototype.onDashboardVisibility = function(visible) {
    this.holdRound(visible);
};

/**
 * @method onWindowBlur
 */
Game.prototype.onWindowBlur = function() {
    createjs.Ticker.setPaused(true);
    sound.stopMusic(true);
};

/**
 * @method onWindowVisibilityChange
 */
Game.prototype.onWindowVisibilityChange = function() {
    if ( document.webkitHidden ) {
        createjs.Ticker.setPaused(true);
        sound.stopMusic(true);
    } else {
        if ( !this.isPausedByOverlay() ) {
            createjs.Ticker.setPaused(false);
        }

        if ( !this.isGameStarted ) {
            sound.playMusic();
        }
    }
};

/**
 * @method onWindowResize
 */
Game.prototype.onWindowResize = function() {
    $(document.body).css('height', window.innerHeight + 'px');
    $(document.body).css('width', window.innerWidth + 'px');
    // Rescales the play field and refreshes the pointer mapping with it.
    stage.fit();
    window.scrollTo(0, 0);
};

/**
 * @method onWindowOrientationChange
 */
Game.prototype.onWindowOrientationChange = function() {
    // The play field is 798x462 -- landscape. The original rule asked iPhones
    // for portrait, which on a modern phone squeezes the field to a third of
    // the screen; every device is better off in landscape.
    var isPortrait = window.innerWidth < window.innerHeight,
        // A tablet fits the field comfortably either way, so only prompt when
        // rotating would actually gain meaningful size.
        wouldGain = window.innerHeight / window.innerWidth > 1.2
                && window.innerHeight < 900;

    if ( !core.helperBrowser.isMobile && !input.pointer.isTouchDevice ) {
        return;
    }
    if ( isPortrait && wouldGain ) {
        this.windowOrientationIndicator.open();
    } else if ( this.windowOrientationIndicator.isOpened() ) {
        this.windowOrientationIndicator.close();
    }
};

export default Game;
