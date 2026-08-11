import wallet from '../wallet.js';

var
    /**
     * Coins per point scored. The pay-out is deliberately tied to score rather
     * than to simply finishing: a round cleared carefully is worth more than
     * one scraped through, which is what makes the currency a reward for
     * playing well instead of a reward for showing up.
     *
     * @property COINS_PER_POINT
     * @static
     * @private
     */
    COINS_PER_POINT = 0.1,

    /**
     * Lives are worth keeping: they are the resource an item can restore, so
     * paying for them closes the loop between playing well and affording help.
     *
     * @property COINS_PER_LIFE
     * @static
     * @private
     */
    COINS_PER_LIFE = 25,

    /**
     * Clearing a round always pays something, however scrappy it was. A player
     * who never earns anything has no reason to look at the shop at all.
     *
     * @property COINS_MINIMUM
     * @static
     * @private
     */
    COINS_MINIMUM = 25,

    /**
     * Later rounds pay more, so the currency keeps pace with the item prices
     * a player at that point can actually use. Capped so a long episode does
     * not turn into an inflation curve.
     *
     * @property ROUND_BONUS
     * @static
     * @private
     */
    ROUND_BONUS = 5,

    /**
     * @property ROUND_BONUS_MAX
     * @static
     * @private
     */
    ROUND_BONUS_MAX = 150;

/**
 * What clearing a round pays out.
 *
 * Kept separate from the window that shows it and the wallet that stores it,
 * because the numbers are the part worth arguing about and tuning them should
 * not mean touching either.
 */
function Rewards() {}

/**
 * @method calculate
 * @param {Object} stats {score, lives, round}
 * @return {Number} coins
 */
Rewards.prototype.calculate = function(stats) {
    var coins;

    stats = stats || {};
    coins = Math.round((stats.score >> 0) * COINS_PER_POINT)
            + (stats.lives >> 0) * COINS_PER_LIFE
            + Math.min((stats.round >> 0) * ROUND_BONUS, ROUND_BONUS_MAX);

    return Math.max(coins, COINS_MINIMUM);
};

/**
 * @method grant
 * @param {Object} stats
 * @return {Number} coins credited
 */
Rewards.prototype.grant = function(stats) {
    var coins = this.calculate(stats);

    wallet.credit(coins, 'round-clear');

    return coins;
};

var instance = null;

if ( instance === null ) {
    instance = new Rewards();
}

export default instance;
