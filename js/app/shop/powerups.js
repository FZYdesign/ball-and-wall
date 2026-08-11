import stage from '../stage.js';
import dashboard from '../dashboard.js';
import sound from '../sound.js';
import core from '../core/_.js';

var
    /**
     * How long the bought shield keeps the floor solid, in milliseconds.
     * The paddle's own effects time out in entity/paddle.js instead; only the
     * ones with no existing timer are held here.
     *
     * @property SHIELD_DURATION
     * @static
     * @private
     */
    SHIELD_DURATION = 20000,

    /**
     * A ball spawned while the shield is up -- by multi-ball, or after a life
     * is lost -- would otherwise fall straight through it, so the flag is put
     * back on every live ball at this interval until the shield expires.
     *
     * @property SHIELD_REFRESH
     * @static
     * @private
     */
    SHIELD_REFRESH = 500,

    /**
     * @property _shield
     * @static
     * @private
     * @type {Object}
     */
    _shield = {timer: null, interval: null};

/**
 * Turns a bought item into an effect on the running game.
 *
 * Every effect is one the game already implements for its falling bonuses --
 * `entity/bonus.js` reaches for the same paddle and ball methods. Buying an
 * item picks an effect instead of waiting for one to drop; it does not
 * introduce a power the game does not otherwise have.
 *
 * The one exception is `shield`, which has no bonus equivalent: it flips the
 * ball's existing `bounceBottom` flag, the same one the splash screen uses to
 * keep its balls in play.
 */
function Powerups() {}

/**
 * Whether an item can be used at all right now. Effects need a paddle to act
 * on, which only exists once a round is running.
 *
 * @method isPlayable
 * @return {Boolean}
 */
Powerups.prototype.isPlayable = function() {
    return Boolean(stage.getPaddle());
};

/**
 * @method apply
 * @param {String} id an item id from shop/catalog
 * @return {Boolean} false when the effect could not be applied, in which case
 *                   the caller must not spend the item
 */
Powerups.prototype.apply = function(id) {
    var paddle = stage.getPaddle(),
        balls = stage.getBalls(),
        ball = balls ? balls.reset().current() : null,
        applied = false;

    if ( !paddle ) {
        return false;
    }
    switch ( id ) {
        case 'extra-life':
            dashboard.getLives().incr();
            applied = true;
            break;

        case 'grow-paddle':
            paddle.growSize();
            applied = true;
            break;

        case 'glue-paddle':
            paddle.glue();
            applied = true;
            break;

        case 'laser':
            paddle.gun();
            applied = true;
            break;

        case 'multi-ball':
            applied = this._multiBall(balls, ball);
            break;

        case 'steel-ball':
            if ( ball ) {
                ball.steel(true);
                applied = true;
            }
            break;

        case 'shield':
            this._shield();
            applied = true;
            break;
    }
    if ( applied ) {
        sound.play('bonus-catch');
        core.mediator.emit('shop:item-used', id);
    }

    return applied;
};

/**
 * Splits the ball in two extra copies, the way the 3-balls bonus does.
 *
 * @method _multiBall
 * @param {Balls} balls
 * @param {Ball} ball
 * @return {Boolean}
 * @private
 */
Powerups.prototype._multiBall = function(balls, ball) {
    var angle;

    // A ball still glued to the paddle has no direction to split along, and
    // the copies would sit on top of each other.
    if ( !ball || !ball.isAlive() ) {
        return false;
    }
    angle = ball.getAngle();

    balls.create()
            .setAlive(true)
            .setPos(ball.getX(), ball.getY())
            .setSpeed(ball.getSpeed(), angle + 2.09);
    balls.create()
            .setAlive(true)
            .setPos(ball.getX(), ball.getY())
            .setSpeed(ball.getSpeed(), angle - 2.09);

    return true;
};

/**
 * @method _shield
 * @private
 */
Powerups.prototype._shield = function() {
    var apply = function(flag) {
        $.each(stage.getBalls().getChilds(), function(i, ball) {
            if ( ball ) {
                ball.bounceBottom(flag);
            }
        });
    };

    this.clearShield();
    apply(true);
    _shield.interval = setInterval(function() {
        apply(true);
    }, SHIELD_REFRESH);
    _shield.timer = setTimeout(function() {
        clearInterval(_shield.interval);
        _shield.interval = null;
        _shield.timer = null;
        apply(false);
    }, SHIELD_DURATION);
};

/**
 * @method hasShield
 * @return {Boolean}
 */
Powerups.prototype.hasShield = function() {
    return Boolean(_shield.timer);
};

/**
 * Drops the shield immediately. A round that ends while it is up must not
 * leave the floor solid for the next one.
 *
 * @method clearShield
 * @return {Powerups}
 */
Powerups.prototype.clearShield = function() {
    if ( _shield.timer ) {
        clearTimeout(_shield.timer);
    }
    if ( _shield.interval ) {
        clearInterval(_shield.interval);
    }
    _shield.timer = _shield.interval = null;

    return this;
};

var instance = null;

if ( instance === null ) {
    instance = new Powerups();

    // A shield outlives nothing: the balls it was applied to are destroyed
    // between rounds, and a fresh round must start with an open floor.
    core.mediator.addListener('game:level-start', function() {
        instance.clearShield();
    });
    core.mediator.addListener('game:game-start', function() {
        instance.clearShield();
    });
    core.mediator.addListener('game:game-over', function() {
        instance.clearShield();
    });
}

export default instance;
