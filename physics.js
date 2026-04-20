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

    // 38라인 근처: 기존 로직에 '초반 완충(Curb)' 로직 추가
    const baseFactor = 1 + (state.battleElapsed / BATTLE_TIME_LIMIT) * 1.5;

    // 🔥 수정 포인트: 초반 2.5초 동안은 반발력을 0.3배로 확 줄임
    const earlyCurb = state.battleElapsed < 2.5 ? 0.1 : 1.0;

    const aggressionBoost = state.battleElapsed > 5
      ? 1 + Math.min((state.battleElapsed - 5) / 5, 1) * 2.5
      : 1;

    // 기존 0.012에 earlyCurb를 곱해줍니다.
    const force = intensity * 0.012 * baseFactor * aggressionBoost * earlyCurb;
  }
});

export function physicsTick() {
  if (state.phase !== 'battle') return 0;
  Engine.update(engine, 1000 / 60);

  state.battleElapsed = (performance.now() - state.battleStartTime) / 1000;
  const remaining = Math.max(0, BATTLE_TIME_LIMIT - state.battleElapsed);

  const tops = getTops();

  // Force eliminate furthest when time runs out
  if (remaining <= 0) {
    const active = tops.filter(t => !t.eliminated);
    if (active.length > 1) {
      let furthest = null, maxDist = -1;
      for (const top of active) {
        const d = Math.sqrt(top.body.position.x ** 2 + top.body.position.y ** 2);
        if (d > maxDist) { maxDist = d; furthest = top; }
      }
      if (furthest) onEliminate(furthest);
    }
  }

  const active = tops.filter(t => !t.eliminated);
  const timeRatio = Math.min(state.battleElapsed / BATTLE_TIME_LIMIT, 1);
  let avgSpeed = 0;

  active.forEach(top => {
    const dx = -top.body.position.x;
    const dy = -top.body.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Central gravity increasing over time
    const gravForce = (0.00005 + timeRatio * 0.001) * (dist / STADIUM_RADIUS);
    Body.applyForce(top.body, top.body.position, {
      x: (dx / dist) * gravForce,
      y: (dy / dist) * gravForce,
    });

    // Seek nearest opponent after 6s
    if (state.battleElapsed > 6) {
      let nearest = null, nearestDist = Infinity;
      for (const other of active) {
        if (other === top) continue;
        const odx = other.body.position.x - top.body.position.x;
        const ody = other.body.position.y - top.body.position.y;
        const od = Math.sqrt(odx * odx + ody * ody);
        if (od < nearestDist) { nearestDist = od; nearest = other; }
      }
      if (nearest) {
        const seekDx = nearest.body.position.x - top.body.position.x;
        const seekDy = nearest.body.position.y - top.body.position.y;
        const seekDist = Math.sqrt(seekDx * seekDx + seekDy * seekDy) || 1;
        const seekPhase = Math.min((state.battleElapsed - 5) / 25, 1);
        const seekForce = 0.0003 + seekPhase * 0.0012;
        Body.applyForce(top.body, top.body.position, {
          x: (seekDx / seekDist) * seekForce,
          y: (seekDy / seekDist) * seekForce,
        });
      }
    }

    // Stalemate nudges after 15s
    if (state.battleElapsed > 15 && cryptoRandom() < 0.02) {
      const nudgeAngle = cryptoRandom() * Math.PI * 2;
      const nudgeForce = 0.002 * timeRatio;
      Body.applyForce(top.body, top.body.position, {
        x: Math.cos(nudgeAngle) * nudgeForce,
        y: Math.sin(nudgeAngle) * nudgeForce,
      });
    }

    top.rpm *= top.angularDecay;
    avgSpeed += Math.sqrt(top.body.velocity.x ** 2 + top.body.velocity.y ** 2);

    if (dist > STADIUM_RADIUS * 1.1) {
      onEliminate(top);
    }
  });

  return avgSpeed / Math.max(active.length, 1);
}
