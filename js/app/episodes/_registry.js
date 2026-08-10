import pegasusBlocks from './pegasus/blocks.js';
import pegasusBonuses from './pegasus/bonuses.js';
import pegasusLevels from './pegasus/levels.js';
import pegasusManifest from './pegasus/manifest.js';
import pegasusResources from './pegasus/resources.js';
import pegasusSplashScreen from './pegasus/splash-screen.js';
import spaceBlocks from './space/blocks.js';
import spaceBonuses from './space/bonuses.js';
import spaceLevels from './space/levels.js';
import spaceManifest from './space/manifest.js';
import spaceResources from './space/resources.js';
import spaceSplashScreen from './space/splash-screen.js';

/**
 * Every episode's content, keyed by episode name.
 *
 * Under AMD this lookup was `require('app/episodes/' + name + '/manifest')`, a
 * path built at runtime. A bundler cannot follow that, so the modules are named
 * here instead. It also means a typo in an episode name is a missing key rather
 * than a failed network fetch.
 *
 * Add an episode by importing its six modules and adding an entry -- see
 * CLAUDE.md for the rest of the steps.
 */
export default {
    pegasus: {
        blocks: pegasusBlocks,
        bonuses: pegasusBonuses,
        levels: pegasusLevels,
        manifest: pegasusManifest,
        resources: pegasusResources,
        'splash-screen': pegasusSplashScreen
    },
    space: {
        blocks: spaceBlocks,
        bonuses: spaceBonuses,
        levels: spaceLevels,
        manifest: spaceManifest,
        resources: spaceResources,
        'splash-screen': spaceSplashScreen
    }
};
