import WindowBase from './_base.js';
import i18 from '../i18/_.js';

function OrientationIndicator() {
    WindowBase.call(this);
    this.name = 'orientation-indicator';
    this.className = 'lbx-orientation-indicator';
    this.showOverlay = false;
    this.showMinimizeButton = false;
    this.showCloseButton = false;
    this.options = {};
    this.initialize();
}

OrientationIndicator.prototype = Object.create(WindowBase.prototype, {
    constructor: {
        value: OrientationIndicator,
        enumerable: false
    }
});

/**
 * @method header
 */
OrientationIndicator.prototype.header = function() {
    return '';
};

/**
 * @method model
 */
OrientationIndicator.prototype.model = function() {
    return {
        tag: 'div', className: 'tab-contents', childs: [
            {tag: 'div', className: 'body-cont', html: i18._('orientation-body')}
        ]
    };
};

export default OrientationIndicator;
