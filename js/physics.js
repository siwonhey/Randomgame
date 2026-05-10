// ═══════════════════════════════════════════
// PHYSICS — Matter.js engine + collision handling + tick loop
// Callbacks (set via registerPhysicsCallbacks) let game.js react
// to elimination and impact events without importing game.js directly.
// ═══════════════════════════════════════════
import { state } from './state.js';
import { STADIUM_RADIUS, BATTLE_TIME_LIMIT, PHYSICS_SCALE, cryptoRandom } from './config.js';

const Matter = window.Matter;
const { Engine, Body, Events } = Matter;

export const engine = Engine.create({ gravity: { x: 0, y: 0 } });
export const world = engine.world;

let onEliminate = () => {};
let onImpact = () => {};
let getTops = () => [];

export function registerPhysicsCallbacks(cbs) {
  if (cbs.onEliminate) onEliminate = cbs.onEliminate;
  if (cbs.onImpact)    onImpact = cbs.onImpact;
  if (cbs.getTops)     getTops = cbs.getTops;
}

Events.on(engine, 'collisionStart', (event) => {
  if (state.phase !== 'battle') return;
  const tops = getTops();
  for (const pair of event.pairs) {
    const topA = tops.find(t => t.body === pair.bodyA);
    const topB = tops.find(t => t.body === pair.bodyB);
    if (!topA || !topB || topA.eliminated || topB.eliminated) continue;

    const relVel = Math.sqrt(
      (pair.bodyA.velocity.x - pair.bodyB.velocity.x) ** 2 +
      (pair.bodyA.velocity.y - pair.bodyB.velocity.y) ** 2
    );
    const intensity = Math.min(relVel / 12, 1);

    const nx = pair.bodyB.position.x - pair.bodyA.position.x;
    const ny = pair.bodyB.position.y - pair.bodyA.position.y;
    const dist = Math.sqrt(nx * nx + ny * ny) || 1;

    const baseFactor = 1 + (state.battleElapsed / BATTLE_TIME_LIMIT) * 1.5;

    // Smooth early curb: ~0.15x up to ~1s, ramps via smoothstep to 1.0x by 2.5s.
    const rampT = Math.max(0, Math.min((state.battleElapsed - 1) / 0.7, 1));
    const earlyCurb = 0.05 + 0.95 * (rampT * rampT * (3 - 2 * rampT));

    const aggressionBoost = state.battleElapsed > 3
     ? 1 + Math.min((state.battleElapsed - 3) / 5, 1) * 2.0
     : 1;

    const force = intensity * 0.015 * baseFactor * aggressionBoost * earlyCurb;

    // Apply along collision normal so the tuning above actually affects bounce.
    const fx = (nx / dist) * force;
    const fy = (ny / dist) * force;
    Body.applyForce(topA.body, topA.body.position, { x: -fx, y: -fy });
    Body.applyForce(topB.body, topB.body.position, { x:  fx, y:  fy });
  }
});

let pauseStartTime = 0;

// Pause/resume freeze the Matter.js step and shift the battle clock so
// state.battleElapsed (driven by performance.now() − battleStartTime) picks
// up exactly where it left off when resumed.
export function pausePhysics() {
  if (state.paused) return;
  state.paused = true;
  pauseStartTime = performance.now();
}

export function resumePhysics() {
  if (!state.paused) return;
  state.battleStartTime += performance.now() - pauseStartTime;
  state.paused = false;
}

export function physicsTick() {
  if (state.phase !== 'battle') return 0;
  if (state.paused) return 0;
  Engine.update(engine, 1000 / 60);

  state.battleElapsed = (performance.now() - state.battleStartTime) / 1000;
  const remaining = Math.max(0, BATTLE_TIME_LIMIT - state.battleElapsed);

  const tops = getTops();

  if (remaining <= 0) {
    const active = tops.filter(t => !t.eliminated);
    if (active.length > 1) {
      let furthest = active[0];
      let maxDist2 = furthest.body.position.x ** 2 + furthest.body.position.y ** 2;
      for (const top of active) {
        const d2 = top.body.position.x ** 2 + top.body.position.y ** 2;
        if (d2 > maxDist2) {
          maxDist2 = d2;
          furthest = top;
        }
      }
      if (furthest) onEliminate(furthest);
    }
  }

  const active = tops.filter(t => !t.eliminated);
  const timeRatio = Math.min(state.battleElapsed / BATTLE_TIME_LIMIT, 1);
  let avgSpeed = 0;
  const shouldSeek = state.battleElapsed > 3 && active.length > 1;

  for (const top of active) {
    const dx = -top.body.position.x;
    const dy = -top.body.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const distRatio = dist / STADIUM_RADIUS;

    let safetyNet = 1;

    if (state.battleElapsed < 2.5) {

      // 가장자리 근처일수록 강하게 복귀
     const edgeFactor = Math.max(0, distRatio - 0.6);

      safetyNet += edgeFactor * 10;
    }

    const gravForce =
     (0.00018 + timeRatio * 0.0012) *
      distRatio *
     safetyNet;
    Body.applyForce(top.body, top.body.position, {
      x: (dx / dist) * gravForce,
      y: (dy / dist) * gravForce,
    });

    if (shouldSeek) {
      let nearest = null;
      let nearestDist2 = Infinity;
      for (const other of active) {
        if (other === top) continue;
        const odx = other.body.position.x - top.body.position.x;
        const ody = other.body.position.y - top.body.position.y;
        const d2 = odx * odx + ody * ody;
        if (d2 < nearestDist2) {
          nearestDist2 = d2;
          nearest = other;
        }
      }

      if (nearest) {
        const predict = active.length === 2 ? 4 : 2;

        const targetX =
         nearest.body.position.x +
          nearest.body.velocity.x * predict;

        const targetY =
         nearest.body.position.y +
          nearest.body.velocity.y * predict;

        const seekDx = targetX - top.body.position.x;
        const seekDy = targetY - top.body.position.y;
        const seekDist = Math.sqrt(seekDx * seekDx + seekDy * seekDy) || 1;
        const seekPhase = Math.min((state.battleElapsed - 3) / 20, 1);
        let seekForce = 0.00025 + seekPhase * 0.0015;
        let dirX = seekDx / seekDist;
        let dirY = seekDy / seekDist;

        if (active.length === 2) {
          seekForce *= 1.6;
          const jitter = (cryptoRandom() - 0.5) * 0.08;
          const cos = Math.cos(jitter);
          const sin = Math.sin(jitter);
          const jitterX = dirX * cos - dirY * sin;
          const jitterY = dirX * sin + dirY * cos;
          dirX = jitterX;
          dirY = jitterY;
        }

        if (seekDist < 4) {
         dirX = seekDx / seekDist;
         dirY = seekDy / seekDist;
        }

        Body.applyForce(top.body, top.body.position, {
          x: dirX * seekForce,
          y: dirY * seekForce,
        });
      }
    }

    top.rpm *= top.angularDecay;
    avgSpeed += Math.sqrt(top.body.velocity.x ** 2 + top.body.velocity.y ** 2);
if (
  state.battleElapsed > 1.5 &&
  active.length > 1 &&
  dist > STADIUM_RADIUS * 1.1
)
     {
      onEliminate(top);
    }
  }

  return avgSpeed / Math.max(active.length, 1);
}
