import * as THREE from 'three';
import { cryptoRange, STADIUM_RADIUS, PHYSICS_SCALE } from './config.js';
import { state } from './state.js';
import { scene } from './scene.js';
import { world } from './physics.js';

const Matter = window.Matter;
const { Bodies, Body, Composite } = Matter;

export const tops = [];

let sharedDiscGeo   = null;
let sharedClawGeo   = null;
let sharedCoreGeo   = null;
let sharedHandleGeo = null;
let sharedTipGeo    = null;

function ensureSharedTopGeometry() {
  if (sharedDiscGeo) return;
  sharedDiscGeo   = new THREE.CylinderGeometry(DISC_R_BASE, DISC_BOT_R_BASE, DISC_H_BASE, 16);
  sharedClawGeo   = buildClawGeometry(1);
  sharedCoreGeo   = new THREE.SphereGeometry(0.08, 8, 8);
  sharedHandleGeo = new THREE.CylinderGeometry(0.02, 0.04, 0.35, 8);
  sharedTipGeo    = new THREE.ConeGeometry(0.05, 0.32, 8);
}

// ── Shared geometry constants ──
// The disc is the visible base; curved claws protrude tangentially from its
// outer edge. The Matter.js hitbox radius == the outermost claw-tip reach
// (OUTER_R_BASE), so collisions fire the moment a claw tip grazes another top.
const BASE_SCALE        = 1.6;
const DISC_R_BASE       = 0.35;   // disc top-face radius
const DISC_BOT_R_BASE   = 0.30;   // disc bottom-face radius (slight taper)
const DISC_H_BASE       = 0.12;   // disc thickness
const CLAW_COUNT        = 4;      // 3–5 curved claws
const CLAW_REACH        = 0.14;   // outward reach beyond disc edge
const CLAW_LEAN         = 0.16;   // tangential forward offset of the claw tip
const CLAW_BASE_W       = 0.14;   // base width along disc tangent
const CLAW_THICK        = 0.09;   // claw thickness (disc-matching height)
const CLAW_ATTACH_FRAC  = 0.96;   // base sits slightly inside disc edge (seam hiding)
// Claw back extends radially INWARD into the disc body by this much (world
// units). The disc is a tapered cylinder — its radius shrinks from 0.35 at
// the top to 0.30 at the bottom, so at the claw's lower edge the disc is
// narrower than the claw attach point and a small wedge gap appears between
// the disc surface and the claw root. Burying the claw back ~0.06 inside
// the disc fills that gap so the claw reads as integral to the body without
// changing the claw TIP position — which means OUTER_R_BASE (and therefore
// the Matter.js collision footprint) is unchanged.
const CLAW_INSET        = 0.06;

// Ring-shaped intaglio groove carved into the disc TOP face. Built into the
// LatheGeometry profile in ensureSharedTopGeometry() — purely geometry, no
// extra draw calls, no shader/material changes. Width = 15% of disc radius
// (matches the handle's thickness scale); ring center sits midway between
// the disc center and outer edge; depth is shallow so the engraving reads
// as a machined detail rather than a deep slot.
const DISC_RING_CENTER_R = DISC_R_BASE / 2;                       // 0.175 — midpoint
const DISC_RING_WIDTH    = DISC_R_BASE * 0.15;                    // 0.0525
const DISC_RING_INNER_R  = DISC_RING_CENTER_R - DISC_RING_WIDTH / 2;
const DISC_RING_OUTER_R  = DISC_RING_CENTER_R + DISC_RING_WIDTH / 2;
const DISC_RING_DEPTH    = 0.015;

// Outer claw-tip radius (used by both the claw mesh placement and the physics
// hitbox — keeping them derived from the same formula is the whole point).
const CLAW_ATTACH_R = CLAW_ATTACH_FRAC * DISC_R_BASE;
const OUTER_R_BASE  = Math.sqrt(
  (CLAW_ATTACH_R + CLAW_REACH) ** 2 + CLAW_LEAN ** 2,
);

// Single curved-claw 2D profile (shark-fin / scythe silhouette).
// Local frame: +X points outward (radial), +Y points tangent-forward (the lean
// direction). Base is the vertical segment from (0,-w/2)→(0,+w/2); tip is at
// (reach, lean). Leading edge bulges outward; trailing edge scoops inward.
function buildClawShape(S) {
  const bw  = CLAW_BASE_W * S;
  const r   = CLAW_REACH   * S;
  const ln  = CLAW_LEAN    * S;
  const ins = CLAW_INSET   * S;
  const shape = new THREE.Shape();
  // Back extends inward by `ins` so the claw root is buried inside the disc
  // body (hiding the taper gap). The outer profile from (0,-bw/2) → tip →
  // (0,bw/2) is unchanged, so the visible silhouette and collision tip
  // position both match the previous design.
  shape.moveTo(-ins, -bw / 2);
  shape.lineTo(0, -bw / 2);
  shape.bezierCurveTo(
    r * 0.22, -bw * 0.15,
    r * 0.55,  ln * 0.38,
    r,         ln,                 // claw tip
  );
  shape.bezierCurveTo(
    r * 0.48,  ln * 0.65,
    r * 0.12,  bw * 0.55,
    0,         bw / 2,
  );
  shape.lineTo(-ins, bw / 2);
  shape.closePath();
  return shape;
}

function buildClawGeometry(S) {
  const geo = new THREE.ExtrudeGeometry(buildClawShape(S), {
    depth: CLAW_THICK * S,
    bevelEnabled: true,
    bevelSize: 0.006 * S,
    bevelThickness: 0.008 * S,
    bevelSegments: 1,
    curveSegments: 8,
  });
  // Lay flat in XZ plane (shape X → world X, shape Y → world -Z, depth → +Y),
  // then center the thickness so the claw's vertical midline is at y=0.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(CLAW_THICK * S) / 2, 0);
  return geo;
}

export function createTop3D(color, scale = BASE_SCALE) {
  ensureSharedTopGeometry();
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const S = scale;

  // ── Disc base (thick cylinder, slight taper) ──
  // Material was MeshPhysicalMaterial w/ transmission: 0.15 — that triggers
  // a per-frame second-pass scene render. Downgraded to MeshStandardMaterial
  // and bumped emissiveIntensity to keep the neon self-glow.
  const disc = new THREE.Mesh(
    sharedDiscGeo,
    new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.15, metalness: 0.2,
      emissive: c, emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
    })
  );
  const discCenterY = DISC_H_BASE;          // disc center height (scaled via group)
  disc.position.y = discCenterY;
  group.add(disc);

  // ── Top-face decal (Option 2, refined) ──
  // Rendered once at top-creation time into a 256×256 canvas and uploaded as
  // a CanvasTexture — every subsequent frame is a free texture sample, so
  // the layering below adds zero render cost.
  //
  // Tuning vs. the first Option 2 pass (user feedback: needs more 강약):
  //   • Tick count 12 → 8 (cleaner), tick length +13% (still legible while
  //     spinning).
  //   • Outer rim engraving deepened with a 4-stop bevel (highlight rim →
  //     flat steel → dark groove → faint inner reflection).
  //   • Central hub now sits on a small dark "step" with its own bright rim,
  //     so the star emblem reads as recessed into the body rather than
  //     painted on the surface.
  const decalCanvas = document.createElement('canvas');
  decalCanvas.width = 256; decalCanvas.height = 256;
  const dctx = decalCanvas.getContext('2d');
  dctx.clearRect(0, 0, 256, 256);
  const hexStr = '#' + c.getHexString();
  dctx.save();
  dctx.translate(128, 128);

  // ① Outer bevel highlight — bright hairline just outside the main rim.
  dctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  dctx.lineWidth = 1.5;
  dctx.beginPath();
  dctx.arc(0, 0, 107, 0, Math.PI * 2);
  dctx.stroke();

  // ② Main steel rim — wide flat stroke (slightly thinner than v1 so the
  //    bevel above + groove below read as a true 3-step bevel).
  dctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  dctx.lineWidth = 7;
  dctx.beginPath();
  dctx.arc(0, 0, 102, 0, Math.PI * 2);
  dctx.stroke();

  // ④ Faint inner reflection — used to sit just below a black engraving
  //    groove; the groove was removed per user feedback ("까만 테두리 링
  //    없애줘"), but this slim highlight stays so the rim transition into
  //    the jelly disc isn't a hard edge.
  dctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  dctx.lineWidth = 0.8;
  dctx.beginPath();
  dctx.arc(0, 0, 90, 0, Math.PI * 2);
  dctx.stroke();

  // ⑤ Translucent color "jelly" disc — the colored core of the top face.
  dctx.globalAlpha = 0.45;
  dctx.fillStyle = hexStr;
  dctx.beginPath();
  dctx.arc(0, 0, 88, 0, Math.PI * 2);
  dctx.fill();

  // ⑥ Radial gradient overlay — bright top-left, dark rim, gives the jelly
  //    disc its 3D dome reading.
  // White center highlight removed (it read as a gray wash while spinning).
  // Only a soft dark rim remains, purely for the domed-disc depth cue. (sheen
  // color is still computed for the pinwheel arms below.)
  const sheen = c.clone().lerp(new THREE.Color(0xffffff), 0.5);
  const sR = Math.round(sheen.r * 255), sG = Math.round(sheen.g * 255), sB = Math.round(sheen.b * 255);
  const radial = dctx.createRadialGradient(0, -10, 0, 0, 0, 88);
  radial.addColorStop(0,   'rgba(0, 0, 0, 0)');
  radial.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  radial.addColorStop(1,   'rgba(0, 0, 0, 0.42)');
  dctx.fillStyle = radial;
  dctx.globalAlpha = 1;
  dctx.beginPath();
  dctx.arc(0, 0, 88, 0, Math.PI * 2);
  dctx.fill();

  // ⑦ Pinwheel spiral — a SPIN CUE. Everything else on the face (concentric
  //    rings, radial gradient, 6-point star) is rotationally symmetric, so the
  //    top read as static even while spinning fast. Several Archimedean arms
  //    sweeping from the hub out to the rim break that symmetry; each arm is
  //    drawn as tapering, fading segments (comet-trail look) so the rotation
  //    reads instantly. Sits over the jelly, under the hub/star so the centre
  //    emblem stays clean.
  const SPIRAL_ARMS = 3;
  const spiralTurn = 0.9;          // fraction of a full turn each arm sweeps
  const spiralIn = 28, spiralOut = 84;
  dctx.lineCap = 'round';
  for (let a = 0; a < SPIRAL_ARMS; a++) {
    const base = (a / SPIRAL_ARMS) * Math.PI * 2;
    let prevX = null, prevY = null;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const rr = spiralIn + (spiralOut - spiralIn) * t;
      const ang = base + t * spiralTurn * Math.PI * 2;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (prevX !== null) {
        // Same body-tinted sheen as the dome (not white) so the spinning arms
        // blur into a colored gloss rather than a gray ring, while still being
        // light enough against the disc to read the rotation.
        dctx.strokeStyle = `rgba(${sR}, ${sG}, ${sB}, ${0.5 * (1 - t * 0.6)})`;
        dctx.lineWidth = 6 * (1 - t * 0.5);
        dctx.beginPath();
        dctx.moveTo(prevX, prevY);
        dctx.lineTo(px, py);
        dctx.stroke();
      }
      prevX = px; prevY = py;
    }
  }

  // ⑧ Hub step — a darker disc behind the emblem, plus a bright outline,
  //    so the central area reads as a small recessed platform.
  dctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
  dctx.beginPath();
  dctx.arc(0, 0, 34, 0, Math.PI * 2);
  dctx.fill();

  dctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  dctx.lineWidth = 1.2;
  dctx.beginPath();
  dctx.arc(0, 0, 34, 0, Math.PI * 2);
  dctx.stroke();

  // ⑨ Subtle inner shadow on the hub step — extra depth cue.
  dctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
  dctx.lineWidth = 1.5;
  dctx.beginPath();
  dctx.arc(0, 0, 31, 0, Math.PI * 2);
  dctx.stroke();

  // ⑩ 6-point star emblem — filled + outlined.
  const drawStar = () => {
    dctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 === 0 ? 26 : 12;
      if (i === 0) dctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else dctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    dctx.closePath();
  };
  dctx.fillStyle = hexStr;
  dctx.globalAlpha = 0.95;
  drawStar();
  dctx.fill();

  dctx.strokeStyle = 'rgba(255, 255, 255, 0.50)';
  dctx.lineWidth = 1;
  drawStar();
  dctx.stroke();

  // ⑪ Center bead — body color (was white), so the handle-mount center reads
  //    as part of the body instead of a pale white dot.
  dctx.fillStyle = hexStr;
  dctx.globalAlpha = 1;
  dctx.beginPath();
  dctx.arc(0, 0, 5, 0, Math.PI * 2);
  dctx.fill();

  dctx.restore();

  const decalTex = new THREE.CanvasTexture(decalCanvas);
  const decalMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 24),
    new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  decalMesh.rotation.x = -Math.PI / 2;
  decalMesh.position.y = discCenterY + (DISC_H_BASE / 2) + 0.001;
  group.add(decalMesh);

  // ── Curved claws around the disc's outer edge (all lean same direction) ──
  const clawGeo = sharedClawGeo;
  const clawMat = new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.08, metalness: 0.7,
    emissive: c, emissiveIntensity: 0.45,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < CLAW_COUNT; i++) {
    const angle = (i / CLAW_COUNT) * Math.PI * 2;
    const claw = new THREE.Mesh(clawGeo, clawMat);
    claw.position.set(
      Math.cos(angle) * CLAW_ATTACH_R,
      discCenterY,
      Math.sin(angle) * CLAW_ATTACH_R,
    );
    claw.rotation.y = -angle;     // align fin's local +X with radial outward
    group.add(claw);
  }

  // ── Core (handle ↔ body junction) ──
  // Sits exactly where the handle meets the disc. Material matches the handle
  // (same color/roughness/emissive) so the junction reads as one piece with the
  // handle instead of a brighter glowing bead.
  const core = new THREE.Mesh(
    sharedCoreGeo,
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, emissive: c, emissiveIntensity: 0.15 })
  );
  core.position.y = discCenterY + 0.02;
  group.add(core);

  // ── Handle ──
  const handleHeight = 0.35;
  const handle = new THREE.Mesh(
    sharedHandleGeo,
    new THREE.MeshStandardMaterial({
      color: c, roughness: 0.1,
      emissive: c, emissiveIntensity: 0.15,
    })
  );
  handle.position.y = discCenterY + handleHeight / 2 + 0.1;
  group.add(handle);

  // ── Sharp inverse-cone tip pointing straight down ──
  const tipH = 0.32;
  const tip = new THREE.Mesh(
    sharedTipGeo,
    new THREE.MeshStandardMaterial({
      color: c,
      metalness: 0.85, roughness: 0.15,
      emissive: c, emissiveIntensity: 0.25,
    })
  );
  tip.rotation.x = Math.PI;                                  // apex points down
  tip.position.y = (discCenterY - (DISC_H_BASE / 2)) - tipH / 2 + 0.02;
  group.add(tip);

  group.scale.setScalar(S);

  // Per-top PointLight removed (was 30 lights at 30 tops — major shader cost).
  // Self-glow is preserved entirely through bumped emissive channels above.

  return group;
}

// Billboard label — always faces camera, renders on top (renderOrder 999)
function createLabel(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 72;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 18px Inter, Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(name, 128, 36);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  }));
  sprite.scale.set(0.65, 0.185, 1);
  sprite.position.y = 0.55;
  sprite.renderOrder = 999;
  return sprite;
}

// Spawn position for participant `i` of `n`.
// 1 ring for <14, 2 rings for 14–22, 3 rings for 23+. Multi-ring splits by
// circumference so density is roughly uniform; outer rings are angle-offset
// so they interleave with inner rings rather than line up radially.
function computeSpawnPos(i, n) {
  let rings;
  if (n < 14) {
    rings = [{ r: STADIUM_RADIUS * 0.7, count: n, offset: 0 }];
  } else if (n <= 22) {
    const rI = STADIUM_RADIUS * 0.46;
    const rO = STADIUM_RADIUS * 0.82;
    const innerN = Math.max(1, Math.round(n * rI / (rI + rO)));
    const outerN = n - innerN;
    rings = [
      { r: rI, count: innerN, offset: 0 },
      { r: rO, count: outerN, offset: Math.PI / Math.max(outerN, 1) },
    ];
  } else {
    const rA = STADIUM_RADIUS * 0.34;
    const rB = STADIUM_RADIUS * 0.60;
    const rC = STADIUM_RADIUS * 0.84;
    const total = rA + rB + rC;
    const nA = Math.max(1, Math.round(n * rA / total));
    const nC = Math.max(1, Math.round(n * rC / total));
    const nB = Math.max(1, n - nA - nC);
    rings = [
      { r: rA, count: nA, offset: 0 },
      { r: rB, count: nB, offset: Math.PI / Math.max(nB, 1) },
      { r: rC, count: nC, offset: Math.PI / Math.max(nC * 2, 1) },
    ];
  }

  let cumulative = 0;
  for (const ring of rings) {
    if (i < cumulative + ring.count) {
      const local = i - cumulative;
      const angle = (local / ring.count) * Math.PI * 2 + ring.offset;
      return { x: Math.cos(angle) * ring.r, y: Math.sin(angle) * ring.r };
    }
    cumulative += ring.count;
  }
  return { x: 0, y: 0 };
}

export function addTopPhysics(name, color) {
  const count = tops.filter(t => !t.eliminated).length;
  const n = Math.max(state.participants.length, count + 1);
  const { x, y } = computeSpawnPos(count, n);

  // Per-top size jitter applied to BOTH mesh and physics so the Matter.js
  // circle hitbox exactly matches the outermost claw-tip reach.
  const scale = BASE_SCALE * cryptoRange(0.92, 1.08);
  const meshOuterR = OUTER_R_BASE * scale;                 // world units (claw-tip reach)
  const radius = meshOuterR / PHYSICS_SCALE;               // matter units (1:1 with claw tips)

  const body = Bodies.circle(x, y, radius, {
    mass: cryptoRange(0.6, 1.0),
    // High restitution gives a sharp, springy REBOUND on contact (the duel
    // "clash" feel) — low values made hits read as soft pushes. The strong
    // center gravity + lunge forces then reel the tops back in to collide
    // again. Moderate air drag bleeds off any shared momentum so the field
    // can't drift together in one direction between clashes.
    // Springy (near-elastic): this is what lets a fast top knock a slower one
    // clear across and out of the bowl. Low restitution just absorbed the hit so
    // tops mushed into a sparking clump without ejecting anyone — the speed clamp
    // in physics.js now prevents the runaway that high restitution used to cause,
    // so we can keep clashes bouncy AND bounded.
    restitution: cryptoRange(0.9, 0.97),
    friction: 0.001,
    // Low air drag so the field keeps its speed across the whole battle instead of
    // bleeding energy and slowing down over time; the center pull replenishes it
    // and the speed clamp (physics.js), not drag, caps the top end.
    frictionAir: 0.0025,
    frictionStatic: 0,
  });
  Composite.add(world, body);

  const mesh = createTop3D(color, scale);
  scene.add(mesh);

  const label = createLabel(name);
  mesh.add(label);

  const top = {
    body, mesh, label, name, color,
    eliminated: false,
    angularDecay: cryptoRange(0.997, 0.999),
    rpm: 0,
    initialSpin: cryptoRange(1000, 1500),
    radius,
  };
  tops.push(top);
  updateTopPosition(top);
  return top;
}

export function removeTopPhysics(name) {
  const idx = tops.findIndex(t => t.name === name);
  if (idx === -1) return;
  const top = tops[idx];
  Composite.remove(world, top.body);
  scene.remove(top.mesh);
  top.mesh.traverse(child => {
    if (child.material) child.material.dispose();
    if (child.geometry) child.geometry.dispose();
  });
  tops.splice(idx, 1);
}

export function updateTopPosition(top) {
  top.mesh.position.set(
    top.body.position.x * PHYSICS_SCALE,
    0,
    top.body.position.y * PHYSICS_SCALE,
  );
}

export function repositionTops() {
  const active = tops.filter(t => !t.eliminated);
  active.forEach((top, i) => {
    const { x, y } = computeSpawnPos(i, active.length);
    Body.setPosition(top.body, { x, y });
    Body.setVelocity(top.body, { x: 0, y: 0 });
    Body.setAngularVelocity(top.body, 0);
    updateTopPosition(top);
    top.mesh.rotation.set(0, 0, 0);
  });
}

export function clearTops() {
  tops.forEach(t => {
    try { Composite.remove(world, t.body); } catch { /* already removed */ }
    scene.remove(t.mesh);
    t.mesh.traverse(child => {
      if (child.material) child.material.dispose();
      if (child.geometry) child.geometry.dispose();
    });
  });
  tops.length = 0;
}
