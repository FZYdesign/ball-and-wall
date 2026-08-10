import WindowBase from './_base.js';
import utilsNumber from '../core/utils/number.js';
import i18 from '../i18/_.js';
import WindowEpisodeWin from './episode-win.js';
import core from '../core/_.js';

var
    /**
     * @property _data
     * @type {Object}
     * @static
     * @protected
     */
    _data = {};

function RoundWin() {
    WindowBase.call(this);
    this.name = 'win-round';
    this.className = 'lbx-win';
    this.showOverlay = true;
    this.showCloseButton = false;
    this.options = {
        isCustom: false,
        episode: 'space',
        round: 0,
        maxRound: 0,
        time: 10,
        lives: 0,
        score: 0
    };
    this.initialize();
}

RoundWin.prototype = Object.create(WindowBase.prototype, {
    constructor: {
        value: RoundWin,
        enumerable: false
    }
});

/**
 * @method header
 */
RoundWin.prototype.header = function() {
    return i18._('round-win-header');
};

/**
 * @method model
 */
RoundWin.prototype.model = function() {
    return {
        tag: 'div', className: 'tab-contents', childs: [
            {tag: 'div', className: 'win-cont', childs: [
                {tag: 'table', childs: [
                    {tag: 'tr', childs: [
                        {tag: 'td', className: 'name td-episode',
                            html: i18._('episode')},
                        {tag: 'td', id: 'win-episode', className: 'value td-episode',
                            html: '?'}
                    ]},
                    {tag: 'tr', childs: [
                        {tag: 'td', className: 'name td-round',
                            html: i18._('round')},
                        {tag: 'td', id: 'win-round', className: 'value td-round', html: '1/50'}
                    ]},
                    {tag: 'tr', childs: [
                        {tag: 'td', className: 'name td-lives',
                            html: i18._('lives')},
                        {tag: 'td', id: 'win-lives', className: 'value td-lives', html: '0'}
                    ]},
                    {tag: 'tr', childs: [
                        {tag: 'td', className: 'name td-time',
                            html: i18._('time')},
                        {tag: 'td', id: 'win-time', className: 'value td-time', html: '00:00:00'}
                    ]},
                    {tag: 'tr', childs: [
                        {tag: 'td', className: 'name td-score',
                            html: i18._('score')},
                        {tag: 'td', id: 'win-score', className: 'value td-score', html: '0'}
                    ]}
                ]}
            ]},
            {tag: 'div', className: 'row buttons', childs: [
                {tag: 'div', className: 'medium primary btn ' +
                            (this.options.episode == 'pegasus' ? 'warning' : ''), childs: [
                    {tag: 'a', html: i18._('round-win-retry'),
                        events: [{click: $.proxy(this.onClickRetryButton, this)}]}
                ]},
                {tag: 'div', className: 'medium secondary btn', childs: [
                    {tag: 'a', html: i18._('round-win-next-round'),
                        events: [{click: $.proxy(this.onClickNextRoundButton, this)}]}
                ]}
            ]}
        ]
    };
};

/**
 * @param {Object} options
 */
RoundWin.prototype.initialize = function(options) {
    WindowBase.prototype.initialize.call(this, options);
};

/**
 * @method open
 * @param {Object} data
 */
RoundWin.prototype.open = function(data) {
    var episodeWindow = new WindowEpisodeWin();

    _data = data;
    WindowBase.prototype.open.call(this, data);

    if ( _data.round === _data.maxRound && !data.isCustom && EPISODES.length > 1 ) {
        setTimeout(function() {
            episodeWindow.open(data);
        }, 500);
    }
};

/**
 * @method onRequestComplete
 * @param {Object} resp
 */
RoundWin.prototype.onRequestComplete = function(resp) {};

/**
 * @method onRequestFailure
 */
RoundWin.prototype.onRequestFailure = function() {};

/**
 * @method onClickNewGame
 */
RoundWin.prototype.onClickNewGame = function() {};

/**
 * @method onClickRetryButton
 */
RoundWin.prototype.onClickRetryButton = function() {
    this.close();
    this.emit('retryRound');
};

/**
 * @method onClickNextRoundButton
 */
RoundWin.prototype.onClickNextRoundButton = function() {
    this.close();

    if ( this.options.round >= this.options.maxRound ) {
        this.emit(EPISODES.length > 1 ? 'goToEpisodes' : 'goToRounds');
    } else {
        this.emit('nextRound');
    }

};

/**
 * @method _buildHtml
 */
RoundWin.prototype._buildHtml = function() {
    var that = this, chain, timer;

    WindowBase.prototype._buildHtml.call(this);
    this.content.find('table #win-episode').text(_data.episode);
    this.content.find('table #win-round').text(_data.round + '/' + _data.maxRound);
    this.content.find('table #win-lives').text(_data.lives);

    if ( this.options.round >= this.options.maxRound ) {
        this.content.find('.buttons .secondary a').text(i18._('round-win-select-episode'));
    }
    chain = [];

    $.each(['time', 'score'], $.proxy(function(i, prop) {
        var fn = $.proxy(function() {
            var j = 0, el;

            if ( !that.content ) {
                return;
            }
            el = that.content.find('table #win-' + this.context);

            var setValue = function(directly) {
                var v;

                if ( !that.options[this.context] ) {
                    j = 1;
                }
                v = Math.floor(Math.pow(j, 2) * that.options[this.context]);

                if ( this.context == 'time' ) {
                    v = utilsNumber.toTime(v);
                    v = v.hour + ':' + v.min + ':' + v.sec;
                }
                el.text(v);
                j += 0.02;

                if ( j >= 1 || directly ) {
                    j = 0;
                    v = that.options[this.context];

                    if ( this.context == 'time' ) {
                        v = utilsNumber.toTime(v);
                        v = v.hour + ':' + v.min + ':' + v.sec;
                    }
                    el.text(v);
                    clearInterval(timer);

                    if ( chain.length ) {
                        chain.splice(0, 1)[0].call(that);
                    }
                }
            };
            timer = setInterval($.proxy(setValue, this), 20);
        }, {context: prop});

        chain.push(fn);
    }, this));
    chain.splice(0, 1)[0].call(this);

    return this;
};

export default RoundWin;
