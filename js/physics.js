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

    const force = intensity * 0.018 * baseFactor * aggressionBoost * earlyCurb;

    // Apply along collision normal so the tuning above actually affects bounce.
    const fx = (nx / dist) * force;
    const fy = (ny / dist) * force;
    Body.applyForce(topA.body, topA.body.position, { x: -fx, y: -fy });
    Body.applyForce(topB.body, topB.body.position, { x:  fx, y:  fy });
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
    const distRatio = dist / STADIUM_RADIUS;
       let safetyNet = 1.0;
       if (state.battleElapsed < 2 && distRatio > 0.65) {
           safetyNet = 6.0; // 3초 전에는 밖으로 나갈 때 8배의 힘으로 구조
    }

        // 2. 기본 중력 계산 (기존 로직 유지 + safetyNet 곱하기)
        const gravForce = (0.0002 + timeRatio * 0.001) * distRatio * safetyNet;
    
        Body.applyForce(top.body, top.body.position, {
          x: (dx / dist) * gravForce,
          y: (dy / dist) * gravForce,
        });

    // Seek nearest opponent after 3s
    if (state.battleElapsed > 3) {
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

            // --- [수정 시작: 궤도 깨뜨리기 로직] ---
            let dirX = seekDx / seekDist;
            let dirY = seekDy / seekDist;

            // 살아남은 팽이가 딱 2개일 때만 방향을 조금씩 흔듭니다.
           if (active.length === 2) {
             // 시간에 따라 출렁이는 값을 더해 직선 궤도를 방해함
             const wobble = Math.sin(performance.now() * 0.005) * 0.2; 
             dirX += wobble;
             dirY += (cryptoRandom() - 0.5) * 0.1;
           }
           // --- [수정 끝] ---

            const seekPhase = Math.min((state.battleElapsed - 3) / 25, 1);
            const seekForce = 0.0003 + seekPhase * 0.0018;

           Body.applyForce(top.body, top.body.position, {
             x: dirX * seekForce,
             y: dirY * seekForce,
           });
         }
        }

    // Stalemate nudges after 5s
    if (state.battleElapsed > 5 && cryptoRandom() < 0.04) {
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
