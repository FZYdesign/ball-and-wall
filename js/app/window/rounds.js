import WindowBase from './_base.js';
import core from '../core/_.js';
import gameOptions from '../game-options.js';
import i18 from '../i18/_.js';

function Rounds() {
    WindowBase.call(this);
    this.name = 'rounds';
    this.className = 'lbx-rounds';
    this.showOverlay = true;
    this.options = {
        game: 'space',
        levels: []
    };
    this.selectedLevel = 0;
    this.initialize();
}

Rounds.prototype = Object.create(WindowBase.prototype, {
    constructor: {
        value: Rounds,
        enumerable: false
    }
});

/**
 * @method header
 */
Rounds.prototype.header = function() {
    return i18._('rounds-header');
};

/**
 * @method model
 */
Rounds.prototype.model = function() {
    var onPlayClick = $.proxy(this.onPlayClick, this),
        onBackClick = $.proxy(this.onBackClick, this),
        onRoundsScroll = $.proxy(this.onRoundsScroll, this);

    return {
        tag: 'div', className: 'games-wrapper', childs: [
            {tag: 'div', className: 'games-window', childs: [], events: [{scroll: onRoundsScroll}]},
            {tag: 'div', className: 'row buttons', styles: {marginTop: 24, paddingBottom: 44},
                childs: [
                    EPISODES.length > 1 ? {tag: 'div', className: 'medium primary btn icon-left icon-arrow-left ' +
                                (this.options.game == 'pegasus' ? 'warning' : ''), childs: [
                        {tag: 'a', href: '#', html: i18._('rounds-choose-episode'), events: [{click: onBackClick}]}
                    ]} : {},
                    {tag: 'div', className: 'medium secondary btn icon-right icon-arrow-right', childs: [
                        {tag: 'a', href: '#', html: i18._('rounds-choose-round'), events: [{click: onPlayClick}]}
                    ]}
            ]}
        ]
    };
};

Rounds.prototype.initialize = function() {
    WindowBase.prototype.initialize.call(this);
};

/**
 * @method open
 * @param {Object} options
 */
Rounds.prototype.open = function(options) {
    this.unlockLevel(options.game, 0);
    this.unlockLevel(options.game, 1);
    WindowBase.prototype.open.call(this, options);
    this.setScrollableContent('.games-window');

    if ( core.helperApp.platform() == 'chrome' ) {
        document.querySelector('webview').addEventListener('newwindow', function(event) {
            event.preventDefault();
            window.open(event.targetUrl);
        });
    }
//        for ( var i = 0; i < 50; i++ ) {
//            this.unlockLevel(this.options.game, i);
//        }
};

/**
 * @method close
 * @param {Object} options
 */
Rounds.prototype.close = function(options) {
    WindowBase.prototype.close.call(this, options);
};

/**
 * @method unlockLevel
 * @param {String} episode
 * @param {Number} round
 */
Rounds.prototype.unlockLevel = function(episode, round) {
    var data = gameOptions.get('window-' + this.name, {});

    if ( !data[episode] ) {
        data[episode] = [];
    }
    data[episode][round] = 1;
    gameOptions.set('window-' + this.name, data);
};

/**
 * @method loadSelectedLevel
 * @return {Number}
 */
Rounds.prototype.loadSelectedLevel = function() {
    return gameOptions.get('window-' + this.name + '-' + this.options.game + ':selectedLevel') >> 0;
};

/**
 * @method saveSelectedLevel
 */
Rounds.prototype.saveSelectedLevel = function() {
    gameOptions.set('window-' + this.name + '-' + this.options.game, {selectedLevel: this.selectedLevel});
};

/**
 * @method onOptionClick
 * @param {DOMEvent} event
 */
Rounds.prototype.onOptionClick = function(event) {
    var clicked, itemEntry;

    clicked = $(event.target);

    if ( !clicked.hasClass('option-item-entry') ) {
        itemEntry = clicked.parents('.option-item-entry');
    } else {
        itemEntry = clicked;
    }
    if ( !clicked.hasClass('option-item') ) {
        clicked = clicked.parents('.option-item');
    }
    event.preventDefault();

    if ( itemEntry.hasClass('disabled') ) {
        return;
    }

    clicked.find('a.option-item-entry').each($.proxy(function(i, element) {
        element = $(element);
        element.removeClass('selected');

        // jQuery removed the `.context` property in 3.0; comparing it was
        // silently always false, so no round could ever be selected.
        if ( element[0] === itemEntry.get(0) ) {
            element.addClass('selected');
            this.selectedLevel = itemEntry.attr('data-id') >> 0;
            this.saveSelectedLevel();
        }
    }, this));
};

/**
 * @method onPlayClick
 * @param {Object} event
 */
Rounds.prototype.onPlayClick = function(event) {
    event.preventDefault();
    this.close();
    this.emit('play', {episode: this.options.game, level: this.selectedLevel});
};

/**
 * @method onBackClick
 * @param {Object} event
 */
Rounds.prototype.onBackClick = function(event) {
    event.preventDefault();
    this.close();
    this.emit('back');
};

/**
 * @method onRoundsScroll
 * @param {Object} event
 */
Rounds.prototype.onRoundsScroll = function(event) {
//        var scrollTop = this.content.find('.games-window').scrollTop();
//        core.mediator.emit('');
};

/**
 * @method _buildHtml
 */
Rounds.prototype._buildHtml = function() {
    var unlockData = gameOptions.get('window-' + this.name, {}),
        model, unlocked;

    this.selectedLevel = this.loadSelectedLevel();
    model = {tag: 'ul', className: 'option-item four_up tiles', childs: []};
    unlockData = unlockData[this.options.game] || [];

    $.each(this.options.levels, $.proxy(function(i, name) {
        var levelPreview, lockPreview;

        unlocked = unlockData[i];
        levelPreview = SS + 'images/games/' + this.options.game +
                                    '/' + i + (core.helperApp.pixelRatio() >= 2 ? '@2x' : '') + '.jpg';
        lockPreview = SS + 'images/games/locked' + (core.helperApp.pixelRatio() >= 2 ? '@2x' : '') + '.jpg';
        model.childs.push(
            {tag: 'li', childs: [
                {tag: 'a', 'data-id': i,
                    className: 'option-item-entry ' + (i === this.selectedLevel ? 'selected' : '') +
                            (unlocked ? '' : 'disabled'),
                    events: [{click: $.proxy(this.onOptionClick, this)}],
                    childs: [
                        {tag: 'img', className: 'round-preview', src: unlocked ? levelPreview : lockPreview},
                        {tag: 'span', className: 'round-name', html: '&nbsp;' + (i + 1) + ') ' + name + ''}
                    ]
                }
            ]}
        );
    }, this));
    this.workingModel.childs[0].childs.push(model);

    WindowBase.prototype._buildHtml.call(this);
};

export default Rounds;
