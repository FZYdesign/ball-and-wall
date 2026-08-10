import BaseBlock from './_base.js';
import core from '../../../core/_.js';
import stage from '../../../stage.js';

function BlackHoleSpinning() {
    BaseBlock.call(this);
    this.id = 'black-hole/spinning';
}

BlackHoleSpinning.prototype = Object.create(BaseBlock.prototype, {
    constructor: {
        value: BlackHoleSpinning,
        enumerable: false
    }
});

/**
 * @method createNew
 * @param {Object} options
 * @return {BlackHoleSpinning}
 */
BlackHoleSpinning.prototype.createNew = function(options) {
    var blackHole = new BlackHoleSpinning();

    blackHole.init(options);
    blackHole.animateRocks(['angle-']);

    return blackHole;
};

/**
 * @method updateBalls
 * @param {Number} entityX
 * @param {Number} entityY
 */
BlackHoleSpinning.prototype.updateBalls = function(entityX, entityY) {
    var balls, ball, force = 0.04;

    balls = stage.getBalls().reset();
    ball = balls.current();

    while ( ball ) {
        var ballCenterX = ball.getX() + ball.getHalfWidth(),
            ballCenterY = ball.getY() + ball.getHalfHeight(),
            m = core.math.vectorMagnitude(entityX, entityY, ballCenterX, ballCenterY),
            ballAngle,
            blackHoleCenter;

        if ( m >= 50 ) {
            ball = balls.next().current();

            continue;
        }
        ballAngle = ball.getAngle();
        blackHoleCenter = Math.atan2(entityY - ball.getY(), entityX - ball.getX());

        if ( ballAngle >= blackHoleCenter - 0.034 && ballAngle <= blackHoleCenter + 0.034 ) {
            ball = balls.next().current();

            continue;
        }
        if ( blackHoleCenter > ballAngle || blackHoleCenter < ballAngle - Math.PI ) {
            ballAngle = ballAngle + force;

            // security for 'flat' ball angle
            if ( ballAngle < force && ballAngle > -force ) {
                ballAngle = ballAngle + force;
            }
        } else {
            ballAngle = ballAngle - force;

            // security for 'flat' ball angle
            if ( ballAngle < force && ballAngle > -force ) {
                ballAngle = ballAngle - force;
            }
        }
        ball.setAngle(ballAngle);
        ball = balls.next().current();
    }
};

var instance = null;

if ( instance === null ) {
    instance = new BlackHoleSpinning();
}

export default instance;
