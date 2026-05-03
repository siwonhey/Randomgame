import * as THREE from 'three';
import { cryptoRange, STADIUM_RADIUS, PHYSICS_SCALE } from './config.js';
import { state } from './state.js';
import { scene } from './scene.js';
import { world } from './physics.js';

const Matter = window.Matter;
const { Bodies, Body, Composite } = Matter;

export const tops = [];

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
  const shape = new THREE.Shape();
  shape.moveTo(0, -bw / 2);
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
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const S = scale;

  // ── Disc base (thick cylinder, slight taper) ──
  // Material was MeshPhysicalMaterial w/ transmission: 0.15 — that triggers
  // a per-frame second-pass scene render. Downgraded to MeshStandardMaterial
  // and bumped emissiveIntensity to keep the neon self-glow.
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(DISC_R_BASE * S, DISC_BOT_R_BASE * S, DISC_H_BASE * S, 32),
    new THREE.MeshStandardMaterial({
      color: c, transparent: true, opacity: 0.82,
      roughness: 0.15, metalness: 0.2,
      emissive: c, emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
    })
  );
  const discCenterY = DISC_H_BASE * S;          // disc center height
  disc.position.y = discCenterY;
  group.add(disc);

  // ── Top-face decal ──
  const decalCanvas = document.createElement('canvas');
  decalCanvas.width = 256; decalCanvas.height = 256;
  const dctx = decalCanvas.getContext('2d');
  dctx.clearRect(0, 0, 256, 256);
  const hexStr = '#' + c.getHexString();
  dctx.save();
  dctx.translate(128, 128);
  for (let i = 0; i < 3; i++) {
    dctx.save();
    dctx.rotate(i * (Math.PI * 2 / 3));
    dctx.fillStyle = hexStr;
    dctx.globalAlpha = 0.9;
    dctx.beginPath();
    dctx.roundRect(-10, -125, 20, 120, 5);
    dctx.fill();
    dctx.restore();
  }
  dctx.globalAlpha = 0.3;
  dctx.strokeStyle = '#ffffff';
  dctx.lineWidth = 8;
  dctx.beginPath();
  dctx.arc(0, 0, 85, 0, Math.PI * 2);
  dctx.stroke();
  dctx.restore();

  const decalTex = new THREE.CanvasTexture(decalCanvas);
  const decalMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.34 * S, 32),
    new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  decalMesh.rotation.x = -Math.PI / 2;
  decalMesh.position.y = discCenterY + (DISC_H_BASE * S) / 2 + 0.001;
  group.add(decalMesh);

  // ── Curved claws around the disc's outer edge (all lean same direction) ──
  const clawGeo = buildClawGeometry(S);
  const clawMat = new THREE.MeshStandardMaterial({
    color: c, transparent: true, opacity: 0.88,
    roughness: 0.08, metalness: 0.7,
    emissive: c, emissiveIntensity: 0.45,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < CLAW_COUNT; i++) {
    const angle = (i / CLAW_COUNT) * Math.PI * 2;
    const claw = new THREE.Mesh(clawGeo, clawMat);
    claw.position.set(
      Math.cos(angle) * CLAW_ATTACH_R * S,
      discCenterY,
      Math.sin(angle) * CLAW_ATTACH_R * S,
    );
    claw.rotation.y = -angle;     // align fin's local +X with radial outward
    group.add(claw);
  }

  // ── Core glow ──
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.08 * S, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: c, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 })
  );
  core.position.y = discCenterY + 0.02 * S;
  group.add(core);

  // ── Handle ──
  const handleHeight = 0.35 * S;
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02 * S, 0.04 * S, handleHeight, 8),
    new THREE.MeshStandardMaterial({
      color: c, transparent: true, opacity: 0.9, roughness: 0.1,
      emissive: c, emissiveIntensity: 0.15,
    })
  );
  handle.position.y = discCenterY + handleHeight / 2 + 0.1 * S;
  group.add(handle);

  // ── Sharp inverse-cone tip pointing straight down ──
  const tipH = 0.32 * S;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.05 * S, tipH, 16),
    new THREE.MeshStandardMaterial({
      color: c, transparent: true, opacity: 0.8,
      metalness: 0.85, roughness: 0.15,
      emissive: c, emissiveIntensity: 0.25,
    })
  );
  tip.rotation.x = Math.PI;                                  // apex points down
  tip.position.y = (discCenterY - (DISC_H_BASE * S) / 2) - tipH / 2 + 0.02 * S;
  group.add(tip);

  // Per-top PointLight removed (was 30 lights at 30 tops — major shader cost).
  // Self-glow is preserved entirely through bumped emissive channels above.

  return group;
}

// Billboard label — always faces camera, renders on top (renderOrder 999)
function createLabel(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 72;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 28px Inter, Pretendard, sans-serif';
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
  sprite.scale.set(1.3, 0.37, 1);
  sprite.position.y = 0.9;
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
    restitution: cryptoRange(0.9, 1.2),
    friction: 0.001,
    frictionAir: 0.0015,
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
