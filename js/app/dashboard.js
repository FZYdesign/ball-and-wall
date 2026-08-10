import core from './core/_.js';
import dashboard from './dashboard/_.js';
import preloader from './preloader.js';
import episode from './episodes/_.js';

function Dashboard() {
    core.EventEmitter.call(this);
    this.canvas = $('#a-game-dashboard');
    this._disabled = false;

    if ( this.canvas.attr('id') ) {
        this.stage = new createjs.Stage(this.canvas.attr('id'));
    }
    this.initEvents();
}

Dashboard.prototype = Object.create(core.EventEmitter.prototype, {
    constructor: {
        value: Dashboard,
        enumerable: false
    }
});

/**
 * @method initEvents
 */
Dashboard.prototype.initEvents = function() {
    preloader.addListener('complete', $.proxy(this.onPreloaderComplete, this));
};

/**
 * @method show
 */
Dashboard.prototype.show = function() {
    this.canvas.show();
};

/**
 * @method hide
 */
Dashboard.prototype.hide = function() {
    this.canvas.hide();
};

/**
 * @method isDisabled
 * @return {Boolean}
 */
Dashboard.prototype.isDisabled = function() {
    return this._disabled;
};

/**
 * @method disabled
 * @param {Boolean} disabled
 */
Dashboard.prototype.disabled = function(disabled) {
    this._disabled = disabled;
};

/**
 * @method getTime
 * @return {DashboardTime}
 */
Dashboard.prototype.getTime = function() {
    return this.time;
};

/**
 * @method getScore
 * @return {DashboardScore}
 */
Dashboard.prototype.getScore = function() {
    return this.score;
};

/**
 * @method getSpeed
 * @return {DashboardSpeed}
 */
Dashboard.prototype.getSpeed = function() {
    return this.speed;
};

/**
 * @method getLives
 * @return {DashboardLives}
 */
Dashboard.prototype.getLives = function() {
    return this.lives;
};

/**
 * @method getRound
 * @return {DashboardRound}
 */
Dashboard.prototype.getRound = function() {
    return this.round;
};

/**
 * @method update
 */
Dashboard.prototype.update = function() {
    if ( this.stage ) {
        this.stage.update();
    }
};

/**
 * @method onPreloaderComplete
 */
Dashboard.prototype.onPreloaderComplete = function() {
    // temp fix / level-editor
    if ( this.stage ) {
        this.stage.clear();
        this.stage.removeAllChildren();
    }
    this.canvas.attr('width', episode.getManifest().dashboard.width * core.helperApp.pixelRatio());
    this.canvas.attr('height', episode.getManifest().dashboard.height * core.helperApp.pixelRatio());

    if ( core.helperApp.pixelRatio() >= 2 ) {
        this.canvas.css('width', episode.getManifest().dashboard.width + 'px');
        this.canvas.css('height', episode.getManifest().dashboard.height + 'px');
    }
    this.show();
    this._build();
};

/**
 * @method _build
 */
Dashboard.prototype._build = function() {
    this.time = new dashboard.Time(this);
    this.score = new dashboard.Score(this);
    this.speed = new dashboard.Speed(this);
    this.lives = new dashboard.Lives(this);
    this.round = new dashboard.Round(this);

    if ( !this.stage ) {
        return;
    }
    var _this = this,
        bg = new createjs.Bitmap(preloader.get('c-dashboard-bg').src);

    this.stage.addChild(bg);
    this.stage.addChild(this.time.entity);
    this.stage.addChild(this.score.entity);
    this.stage.addChild(this.speed.entity);
    this.stage.addChild(this.round.entity);

    $.each(episode.getManifest().dashboard.buttons, function(i, obj) {
        var o = new createjs[obj.type]();

        if ( obj.type == 'Bitmap' ) {
            obj.args = preloader.get(obj.args).src;
        }
        createjs[obj.type].apply(o, $.isArray(obj.args) ? obj.args : [obj.args]);
        $.each(obj, function(key, value) {
            if ( key == 'event' ) {
                o.addEventListener('click', function() {
                    _this.emit(value);
                });
            }
            if ( key == 'args' || key == 'type' ) {
                return;
            }
            o[key] = value;
        });
        _this.stage.addChild(o);
    });

    // @todo
    if ( this.lives.entity ) {
        this.stage.addChild(this.lives.entity);
    }
    // The dashboard is a static canvas: it paints once and only repaints when a
    // value changes. Canvas text takes whatever font is available at draw time,
    // so painting before the web fonts land bakes in the fallback and nothing
    // ever corrects it. Repaint when the fonts are actually ready.
    if ( document.fonts && document.fonts.ready ) {
        document.fonts.ready.then(function() {
            _this.stage.update();
        });
    }
    // Kept for browsers without the font loading API.
    setTimeout(function() {
        _this.stage.update();
    }, 1000);
};

var instance = null;

if ( instance === null ) {
    instance = new Dashboard();
}

export default instance;
