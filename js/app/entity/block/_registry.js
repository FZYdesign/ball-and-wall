import spinning from './black-hole/spinning.js';
import unstable from './black-hole/unstable.js';
import trampoline from './trampoline.js';

/**
 * Interactive block entities, keyed by the `entity` value an episode's block
 * table declares. Replaces a runtime-built module path that no bundler could
 * follow; an unknown name is now a missing key instead of a failed fetch.
 */
export default {
    'black-hole/spinning': spinning,
    'black-hole/unstable': unstable,
    trampoline
};
