// ═══════════════════════════════════════════
// PHYSICS — Matter.js engine + collision handling + tick loop
// Callbacks (set via registerPhysicsCallbacks) let game.js react
// to elimination and impact events without importing game.js directly.
// ═══════════════════════════════════════════
import { state } from './state.js';
import { STADIUM_RADIUS, BATTLE_TIME_LIMIT, PHYSICS_SCALE } from './config.js';

const Matter = window.Matter;
const { Engine, Body, Events } = Matter;

// Version marker — confirms the browser loaded THIS fresh build (catches stale
// cache). TEMP, remove once the battle feel is confirmed.
console.log('%c[PHYSICS BUILD v18 — dash acceleration on the charge]', 'color:#4cf');

export const engine = Engine.create({ gravity: { x: 0, y: 0 } });
export const world = engine.world;

// Hard speed cap (matter units / step). Bounds the ricochet + keeps the last
// surviving top from looking absurdly fast. Applied to every top each frame.
const MAX_TOP_SPEED = 7;

// Power boost over time: harder bounces + higher speed cap as the battle goes on,
// so clashes escalate late instead of fizzling. Recomputed each tick (time-based:
// 1x until 7s, eases to ~2x). Read by the collision handler.
let powerBoost = 1;

// TEMP DIAGNOSTIC — remove once confirmed.
let _diagContacts = 0;
let _diagFrame = 0;

let onEliminate = () => {};
let onImpact = () => {};
let getTops = () => [];

export function registerPhysicsCallbacks(cbs) {
  if (cbs.onEliminate) onEliminate = cbs.onEliminate;
  if (cbs.onImpact)    onImpact = cbs.onImpact;
  if (cbs.getTops)     getTops = cbs.getTops;
}

// ── Collision = SYMMETRIC strong ricochet (the core of the battle) ──
// When two tops touch, BOTH shoot straight apart along the contact normal at the
// SAME outward speed = max(BOUNCE_FLOOR, 0.5 × closing speed):
//   • the floor guarantees a strong, visible "정반대로 튕김" even from a slow touch
//     (Matter's restitution alone barely bounces low-speed contacts);
//   • the closing-speed term makes a hard clash fling them farther, so a solid hit
//     can ring a top out.
// Done with setVelocity (NOT applyForce): Matter clears body.force at the end of
// each Engine.update and this fires mid-update, so an applyForce here would be
// silently wiped (that was the long-standing "no repulsion" bug). The tangential
// component is dropped so the bounce reads as a clean head-on rebound.
const BOUNCE_FLOOR = 5;
Events.on(engine, 'collisionStart', (event) => {
  if (state.phase !== 'battle') return;
  const tops = getTops();
  for (const pair of event.pairs) {
    const topA = tops.find(t => t.body === pair.bodyA);
    const topB = tops.find(t => t.body === pair.bodyB);
    if (!topA || !topB || topA.eliminated || topB.eliminated) continue;
    _diagContacts++;

    const nx = pair.bodyB.position.x - pair.bodyA.position.x;
    const ny = pair.bodyB.position.y - pair.bodyA.position.y;
    const dist = Math.sqrt(nx * nx + ny * ny) || 1;
    const nlx = nx / dist, nly = ny / dist;

    const va = pair.bodyA.velocity, vb = pair.bodyB.velocity;
    const closing = (va.x - vb.x) * nlx + (va.y - vb.y) * nly;  // >0 = approaching (just the magnitude)
    const out = Math.max(BOUNCE_FLOOR * powerBoost, Math.abs(closing) * 0.7);

    // Bounce each top RADIALLY OUTWARD (center → rim), NOT along the top-to-top
    // normal. Bouncing along the normal knocked tops sideways into their
    // neighbours, so the rebound energy was spent starting MORE collisions (too
    // frequent) instead of carrying a top out. Sending the rebound along the
    // center-out axis means a clash throws the pair toward the rim — fewer chain
    // hits, cleaner ring-outs. (Fall back to the contact normal for a top that's
    // basically dead-center, where "outward" is undefined.)
    const pA = pair.bodyA.position, pB = pair.bodyB.position;
    const dA = Math.sqrt(pA.x * pA.x + pA.y * pA.y);
    const dB = Math.sqrt(pB.x * pB.x + pB.y * pB.y);
    const ax = dA > 1 ? pA.x / dA : -nlx, ay = dA > 1 ? pA.y / dA : -nly;
    const bx = dB > 1 ? pB.x / dB :  nlx, by = dB > 1 ? pB.y / dB :  nly;
    Body.setVelocity(topA.body, { x: ax * out, y: ay * out });
    Body.setVelocity(topB.body, { x: bx * out, y: by * out });

    // clash feedback (sparks / camera punch) on harder hits
    const intensity = Math.min(Math.abs(closing) / 12, 1);
    if (intensity > 0.4) {
      const cx = ((pair.bodyA.position.x + pair.bodyB.position.x) / 2) * PHYSICS_SCALE;
      const cz = ((pair.bodyA.position.y + pair.bodyB.position.y) / 2) * PHYSICS_SCALE;
      onImpact({ cx, cz, intensity });
    }
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

  // Timeout backstop: once the 30s clock runs out, ring out the furthest top each
  // frame until one remains. Most battles finish by ring-out well before this.
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
  let avgSpeed = 0;
  let maxDR = 0;   // TEMP DIAGNOSTIC

  // Tops get stronger over TIME (not by count): flat 1x for the first 7s, then
  // eases up to a max of ~2x by ~25s and holds there. Starts at 7s so the opening
  // stays calm; max ≈ the current peak strength.
  powerBoost = 1 + Math.min(Math.max(state.battleElapsed - 7, 0) / 18, 1) * 1.0;
  // NOTE: there is deliberately NO "seek" (no top chasing another). The center
  // pull alone gathers everyone so they meet and clash — that's enough of a
  // pretext for collisions. A seek force would re-aim a top that just ricocheted
  // back toward another top, spending the bounce on "finding a rival" instead of
  // letting it fly OUT — so nobody would ever ring out, they'd just keep colliding.

  for (const top of active) {
    // Cap speed before adding more force so the ricochet can't run away. The cap
    // rises with powerBoost so late-game survivors can actually move/hit harder.
    const cap = MAX_TOP_SPEED * powerBoost;
    const vx = top.body.velocity.x;
    const vy = top.body.velocity.y;
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > cap) {
      Body.setVelocity(top.body, { x: (vx / sp) * cap, y: (vy / sp) * cap });
    }

    const dx = -top.body.position.x;
    const dy = -top.body.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const distRatio = dist / STADIUM_RADIUS;
    if (distRatio > maxDR) maxDR = distRatio;   // TEMP DIAGNOSTIC

    // Radial alignment — the key to a beyblade-style CENTER↔OUT feel. Each frame
    // the velocity is rotated toward the radial (center-to-rim) axis WITHOUT
    // changing its speed. Tops were orbiting and clipping each other sideways
    // (좌우); bleeding that tangential/orbiting motion into radial motion makes
    // them charge straight in, clash near the center, and ricochet straight out
    // toward the rim. Speed is preserved (renormalized), so this does NOT slow the
    // field down — it just redirects the existing energy onto the in/out axis.
    {
      const v = top.body.velocity;
      const speed = Math.sqrt(v.x * v.x + v.y * v.y);
      const rx = top.body.position.x / dist;   // radial-outward unit (dist = from center)
      const ry = top.body.position.y / dist;
      const vRad = v.x * rx + v.y * ry;         // signed: + outward, − inward
      // Straighten ONLY inward charges (so they slam head-on into the center).
      // Do NOT touch outward motion: forcing a near-rim top's velocity outward read
      // as the EDGE sucking it out for free. A top now only travels outward when an
      // actual collision bounces it out — the ring-out is earned by the hit.
      if (speed > 0.05 && vRad < 0) {
        const BIAS = 0.15;
        const nvx = v.x * (1 - BIAS) + (-rx) * speed * BIAS;   // bias toward center
        const nvy = v.y * (1 - BIAS) + (-ry) * speed * BIAS;
        const nmag = Math.sqrt(nvx * nvx + nvy * nvy) || 1;
        Body.setVelocity(top.body, { x: (nvx / nmag) * speed, y: (nvy / nmag) * speed });
      }
    }

    let safetyNet = 1;
    if (state.battleElapsed < 2.5) {
      // 가장자리 근처일수록 강하게 복귀 — keeps the opening rush from flinging anyone out
      const edgeFactor = Math.max(0, distRatio - 0.6);
      safetyNet += edgeFactor * 10;
    }

    // Center pull (the gather force) — the ENGINE: it keeps every top charging
    // back to the center so they keep slamming into each other, and replenishes
    // the energy drag bleeds (so the field doesn't slow down).
    //
    // BUT a plain ∝distance pull is STRONGEST at the rim — exactly where we want a
    // bounced top to LEAVE — so it sucked every ricochet back into the center
    // cluster (looked like the tops "going to find each other" instead of ringing
    // out). So past 70% of the radius the pull FADES toward ~15%: the core stays a
    // strong clashing engine, but a top flung toward the rim is barely held and
    // coasts out for the ring-out. (Full strength during the 2.5s opening so the
    // launch rush can't fling everyone straight out.)
    let rimFade = 1;
    if (state.battleElapsed >= 2.5 && distRatio > 0.7) {
      rimFade = Math.max(0.15, 1 - (distRatio - 0.7) / 0.3);
    }
    const gravForce = 0.0018 * distRatio * safetyNet * rimFade;
    Body.applyForce(top.body, top.body.position, {
      x: (dx / dist) * gravForce,
      y: (dy / dist) * gravForce,
    });

    // DASH — gives the charge ACCELERATION (the "쫀득" wind-up). The faster a top is
    // already heading toward the center, the more inward thrust it gets (positive
    // feedback, capped by the speed clamp), so a charge builds from a drift into a
    // fast, weighty SMASH at the center instead of crawling in at constant speed.
    // Only while moving inward (inward speed > 0.3) so it never fights a top that
    // was just bounced OUT — that one is free to fly to the rim.
    {
      const inward = (top.body.velocity.x * dx + top.body.velocity.y * dy) / dist; // >0 = charging in
      if (inward > 0.3) {
        const dash = 0.00012 * inward;
        Body.applyForce(top.body, top.body.position, {
          x: (dx / dist) * dash,
          y: (dy / dist) * dash,
        });
      }
    }

    // Floor the spin so it never decays to ~0 (which made tops look dead / "힘이
    //빠진" late game). 500 keeps a steady visible spin without the too-fast look.
    top.rpm = Math.max(top.rpm * top.angularDecay, 500);
    avgSpeed += Math.sqrt(top.body.velocity.x ** 2 + top.body.velocity.y ** 2);

    if (state.battleElapsed > 1.5 && active.length > 1 && dist > STADIUM_RADIUS) {
      onEliminate(top);
    }
  }

  // TEMP DIAGNOSTIC — once per second. radial≈1 = center↔out motion (beyblade,
  // good); radial≈0 = sideways/orbiting. avgSpeed should stay ~constant (no fade).
  if (++_diagFrame % 60 === 0) {
    let mvx = 0, mvy = 0, ms = 0, radSum = 0, radN = 0;
    for (const t of active) {
      const v = t.body.velocity, s = Math.hypot(v.x, v.y);
      mvx += v.x; mvy += v.y; ms += s;
      const d = Math.hypot(t.body.position.x, t.body.position.y) || 1;
      if (s > 0.05) { radSum += Math.abs((v.x * t.body.position.x + v.y * t.body.position.y) / d) / s; radN++; }
    }
    const coherence = ms > 0.01 ? Math.hypot(mvx, mvy) / ms : 0;
    const radial = radSum / Math.max(radN, 1);
    console.log(
      `[battle ${state.battleElapsed.toFixed(0)}s] active=${active.length} ` +
      `contacts/s=${_diagContacts} avgSpeed=${(avgSpeed / Math.max(active.length, 1)).toFixed(2)} ` +
      `radial=${radial.toFixed(2)} coherence=${coherence.toFixed(2)} maxDistRatio=${maxDR.toFixed(2)}`
    );
    _diagContacts = 0;
  }

  return avgSpeed / Math.max(active.length, 1);
}
