import Base from './_base.js';
import ball from './ball.js';
import block from './block/block.js';
import BlackHole from './block/black-hole/_base.js';
import blackHoleSpinning from './block/black-hole/spinning.js';
import blackHoleUnstable from './block/black-hole/unstable.js';
import trampoline from './block/trampoline.js';
import bonus from './bonus.js';
import bullet from './bullet.js';
import cloud from './cloud.js';
import explosion from './explosion.js';
import paddle from './paddle.js';
import particle from './particle.js';
import score from './score.js';
import tail from './tail.js';

export default {
    Base: Base,
    ball: ball,
    block: block,
    BlackHole: BlackHole,
    blackHoleSpinning: blackHoleSpinning,
    blackHoleUnstable: blackHoleUnstable,
    trampoline: trampoline,
    bonus: bonus,
    bullet: bullet,
    cloud: cloud,
    explosion: explosion,
    paddle: paddle,
    particle: particle,
    score: score,
    tail: tail
};
