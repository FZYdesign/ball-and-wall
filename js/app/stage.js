
define('app/stage', 
[
    'app/preloader', 'app/input/_', 'app/sound', 'app/episodes/_', 'app/core/_'
], 
function(preloader, input, sound, episode, core) {
    
    var
        /**
         * The play field the game's geometry, levels and sprites are authored
         * against. Everything on screen is this size scaled by a single factor.
         *
         * @property BASE_WIDTH
         * @static
         */
        BASE_WIDTH = 798,

        /**
         * @property BASE_HEIGHT
         * @static
         */
        BASE_HEIGHT = 462;


    function Stage() {
        this.element = $('#a-game-canvas');
        this.canvases = $('#a-game-canvases');
        this.wrapper = $('#a-game-wrapper');
        this.scale = 1;
        this.stage = new createjs.Stage('a-game-canvas');
        this.bgFrontWidthHalfWidth = null;
        this.bgBackWidthHalfWidth = null;
        this.backgroundFront = null;
        this.backgroundBack = null;
        this.earthquakeParams = null;
        this.states = {};
        this.timers = {};
        this.initEvents();

        // The backing store is authored size x device pixel ratio, so the game
        // renders at native resolution however the element is then scaled.
        this.element.attr('width', BASE_WIDTH * core.helperApp.pixelRatio());
        this.element.attr('height', BASE_HEIGHT * core.helperApp.pixelRatio());
        this.fit();
    }

    /**
     * @method initEvents
     */
    Stage.prototype.initEvents = function() {
        $(window).bind('resize orientationchange', $.proxy(this.fit, this));
    };

    /**
     * Scales the play field to fit the viewport, preserving its aspect ratio.
     *
     * The canvases are laid out at their authored size and scaled with a single
     * CSS transform rather than being re-laid-out per breakpoint. That keeps the
     * dashboard canvas -- absolutely positioned against the 798px field -- glued
     * to the play field at every size, which per-breakpoint widths could not do.
     *
     * It never scales above 1, so anything wide enough for the original layout
     * renders exactly as before.
     *
     * @method fit
     * @return {Stage}
     */
    Stage.prototype.fit = function() {
        var viewportWidth = $(window).width(),
            viewportHeight = $(window).height(),
            // Whatever sits above the field (container padding, the bottom line,
            // page chrome) eats into the height available to it. Measuring the
            // wrapper's own top is reliable because nothing above it depends on
            // the wrapper's height.
            top = this.wrapper.length ? this.wrapper[0].getBoundingClientRect().top : 0,
            availableHeight = viewportHeight - (top > 0 && top < viewportHeight ? top : 0),
            scale;

        scale = Math.min(
            viewportWidth / BASE_WIDTH,
            availableHeight / BASE_HEIGHT,
            1
        );

        if ( !isFinite(scale) || scale <= 0 ) {
            scale = 1;
        }
        this.scale = scale;

        // The backing store is device-pixel sized, so without an explicit CSS size
        // the element would render at backing-store dimensions on a retina screen.
        this.element.css({
            width: BASE_WIDTH + 'px',
            height: BASE_HEIGHT + 'px'
        });

        if ( scale === 1 ) {
            this.wrapper.removeClass('a-scaled').css({width: '', height: ''});
            this.canvases.css({transform: '', width: '', height: ''});
        } else {
            // A transform does not change the layout box, so the wrapper is sized
            // to the painted result and clips the oversized box inside it.
            // Without that the 798px field keeps widening the document and the
            // page scrolls sideways on a phone.
            this.wrapper.addClass('a-scaled').css({
                width: Math.round(BASE_WIDTH * scale) + 'px',
                height: Math.round(BASE_HEIGHT * scale) + 'px'
            });
            this.canvases.css({
                width: BASE_WIDTH + 'px',
                height: BASE_HEIGHT + 'px',
                transform: 'scale(' + scale + ')'
            });
        }
        input.pointer.updateStageCoords();

        return this;
    };

    /**
     * @method getWidth
     * @return {Number}
     */
    Stage.prototype.getWidth = function() {
        return this.stage.canvas.width;
    };

    /**
     * @method getHeight
     * @return {Number}
     */
    Stage.prototype.getHeight = function() {
        return this.stage.canvas.height;
    };

    /**
     * Ratio between the on-screen size and the backing store. Consumers that
     * work in stage pixels do not need this -- input/pointer.js already converts.
     *
     * @method getScale
     * @return {Number}
     */
    Stage.prototype.getScale = function() {
        var rect = this.stage.canvas.getBoundingClientRect();

        return rect.width ? rect.width / this.getWidth() : 1;
    };
    
    /**
     * @method add
     * @param {EntityBase} entity
     */
    Stage.prototype.add = function(entity) {
        if ( entity.id > 0 ) {
                this.stage.addChild(entity);
            } else {
                this.stage.addChild(entity.bitmap);
            $.each(entity.childs || [], function(index, child) {
                this.add(child);
            }.bind(this));
            
            if ( entity.initDefaults ) {
                entity.initDefaults();
            }
        }
        // TODO To consider thinks about sorting layers
        if ( episode.getName() == 'pegasus' ) {
            this.sortChildrenByLayer();
        }
    };
    
    /**
     * @method remove
     * @param {EntityBase} entity
     */
    Stage.prototype.remove = function(entity) {
        if ( !entity || entity.id > 0 ) {
            this.stage.removeChild(entity);
        } else {
            this.stage.removeChild(entity.bitmap);
        }
    };
    
    /**
     * @method clear
     */
    Stage.prototype.clear = function() {
        this.stage.clear();
        this.stage.removeAllChildren();
        
        this.backgroundBack = new createjs.Bitmap(preloader.get('c-canvas-bg-back').src);
        this.backgroundBack.layerId = 1;
        this.stage.addChild(this.backgroundBack);
        this.bgBackWidthHalfWidth = (preloader.get('c-canvas-bg-back').width - this.getWidth()) / 2;

        this.backgroundMid = new createjs.Bitmap(preloader.get('c-canvas-bg-mid').src);
        this.backgroundMid.layerId = 2;
        this.stage.addChild(this.backgroundMid);
        this.bgMidWidthHalfWidth = (preloader.get('c-canvas-bg-mid').width - this.getWidth()) / 2;
        
        this.backgroundFront = new createjs.Bitmap(preloader.get('c-canvas-bg-front').src);
        this.backgroundFront.layerId = 3;
        this.stage.addChild(this.backgroundFront);
        this.bgFrontWidthHalfWidth = (preloader.get('c-canvas-bg-front').width - this.getWidth()) / 2;
    };
    
    /**
     * @method update
     * @param {Object} event
     */
    Stage.prototype.update = function(event) {
        var x;
        
        if ( this.earthquakeParams ) {
            this.stage.x = (Math.random() * this.earthquakeParams.x) - this.earthquakeParams.x / 2;
            this.stage.y = (Math.random() * this.earthquakeParams.y) - this.earthquakeParams.y / 2;
        } else {
            this.stage.x = 0;
            this.stage.y = 0;
        }
        
        this.stage.update(event);
        
        if ( this.bgFrontWidthHalfWidth ) {
            x = (this.getWidth() - input.pointer.x) / 15;
            this.backgroundFront.x = - ((this.getWidth() / 30) - x) - this.bgFrontWidthHalfWidth;
        }
        if ( this.bgMidWidthHalfWidth ) {
            x = (this.getWidth() - input.pointer.x) / 50;
            this.backgroundMid.x = - ((this.getWidth() / 100) - x) - this.bgMidWidthHalfWidth;
        }
        if ( this.bgBackWidthHalfWidth ) {
            x = (this.getWidth() - input.pointer.x) / 120;
            this.backgroundBack.x = - ((this.getWidth() / 240) - x) - this.bgBackWidthHalfWidth;
        }
    };
    
    /**
     * @method sortChildrenByLayer
     * @return {Stage}
     */
    Stage.prototype.sortChildrenByLayer = function() {
        this.stage.sortChildren(function(object1, object2) {
            object1.layerId = object1.layerId || 1;
            object2.layerId = object2.layerId || 1;

            if ( object1.layerId > object2.layerId ) {
                return 1;
            } else if ( object1.layerId < object2.layerId ) {
                return -1;
            } else if ( object1.id > object2.id ) {
                return 1;
            } else if ( object1.id < object2.id ) {
                return -1;
            }

            return 0;
        });  
    };
    
    /**
     * @method earthquake
     * @param {Number} x
     * @param {Number} y
     * @param {Number} duration
     * @param {Boolean} playSound
     * @return {Stage}
     */
    Stage.prototype.earthquake = function(x, y, duration, playSound) {
        var _this = this;
        
        this.earthquakeParams = {
            x: x * core.helperApp.pixelRatio(),
            y: y * core.helperApp.pixelRatio()
        };
        if ( this.timers.earthquake ) {
            clearTimeout(this.timers.earthquake);
        }
        if ( playSound === undefined || playSound === true ) {
            sound.stop('earthquake');
            sound.play('earthquake');
        }
        
        this.timers.earthquake = setTimeout(function() {
            _this.earthquakeParams = null;
            _this.timers.earthquake = null;
            
            if ( playSound === undefined || playSound === true ) {
                sound.stop('earthquake');
            }
        }, duration);
        
        return this;
    };
    
    /**
     * @method getPaddle
     * @return {EntityPaddle}
     */
    Stage.prototype.getPaddle = function() {
        return this.getPaddles().reset().current();
    };
    
    /**
     * @method getPaddles
     * @return {Paddles}
     */
    Stage.prototype.getPaddles = function() {
        return this.getEntities().paddles;
    };
    
    /**
     * @method getBall
     * @return {Ball}
     */
    Stage.prototype.getBall = function() {
        return this.getBalls().reset().current();
    };
    
    /**
     * @method getBalls
     * @return {Balls}
     */
    Stage.prototype.getBalls = function() {
        return this.getEntities().balls;
    };
    
    /**
     * @method getBlocks
     * @return {Blocks}
     */
    Stage.prototype.getBlocks = function() {
        return require('app/levels').getBlocks();
    };
    
    /**
     * @method getBonuses
     * @return {Bonuses}
     */
    Stage.prototype.getBonuses = function() {
        return require('app/levels').getBonuses();
    };
    
    /**
     * @method getEntities
     * @return {Object}
     */
    Stage.prototype.getEntities = function() {
        return require('app/entities/_');
    };
    
    /**
     * @method onCanvasClick
     * @param {Object} event
     */
//    Stage.prototype.onCanvasClick = function(event) {
//        this.emit('click', event);
//    };
    
    var instance = null;
    
    if ( instance === null ) {
        instance = new Stage();
    }
    
    return instance;
});