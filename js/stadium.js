import * as THREE from 'three';
import { STADIUM_3D_RADIUS } from './config.js';
import { scene } from './scene.js';

let nebulaCanvas, nebulaCtx, nebulaTex;
let nebulaRendered = false;

function createNebulaTexture() {
  nebulaCanvas = document.createElement('canvas');
  nebulaCanvas.width = 512;
  nebulaCanvas.height = 512;
  nebulaCtx = nebulaCanvas.getContext('2d');
  nebulaTex = new THREE.CanvasTexture(nebulaCanvas);
  nebulaTex.minFilter = THREE.LinearFilter;
  return nebulaTex;
}

// time was already pinned to 0 inside this function, so every frame produced
// an identical canvas + a 512x512 GPU re-upload. Render once, then no-op —
// pure overhead removal at no visual cost (helps high-participant frame rate).
export function updateNebulaTexture(time) {
  if (nebulaRendered) return;
  time = 0;
  if (!nebulaCtx) return;
  nebulaRendered = true;
  const ctx = nebulaCtx;
  const w = 512, h = 512;
  ctx.fillStyle = '#06060e';
  ctx.fillRect(0, 0, w, h);

  // Cosmic nebula blobs — boosted from ~3-4% to ~8-10% canvas alpha so the
  // dust clouds actually read on the dark bowl. Still well below saturation
  // so tops remain the visual focus.
  const blobs = [
    { cx: 256 + Math.sin(time * 0.3) * 80,  cy: 256 + Math.cos(time * 0.4) * 60, r: 160, color: 'rgba(60, 110, 220, 0.10)' },
    { cx: 256 + Math.cos(time * 0.25) * 100, cy: 256 + Math.sin(time * 0.35) * 80, r: 140, color: 'rgba(140, 70, 230, 0.09)' },
    { cx: 256 + Math.sin(time * 0.5) * 60,  cy: 256 + Math.cos(time * 0.2) * 90,  r: 120, color: 'rgba(60, 200, 220, 0.08)' },
    { cx: 256 + Math.cos(time * 0.45) * 70, cy: 256 + Math.sin(time * 0.3) * 50, r: 110, color: 'rgba(220, 70, 160, 0.06)' },
  ];
  for (const b of blobs) {
    const grad = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.r);
    grad.addColorStop(0, b.color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Inverse vignette — pushes the stage center darker so the cyan rim torus
  // at the bowl edge reads as the only lit perimeter. Result: dark crater
  // center, glowing rim. Pure 2D canvas composite, zero render-time cost.
  const vignette = ctx.createRadialGradient(256, 256, 40, 256, 256, 240);
  vignette.addColorStop(0,   'rgba(0, 0, 0, 0.65)');
  vignette.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  vignette.addColorStop(1,    'transparent');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Inner panel lines — concentric rings + radial spokes baked into the
  // texture, ~17% alpha so they read as faint dark-metal seams without
  // shouting. Cool steel-blue (vs pure white) reinforces the dark metal feel.
  ctx.strokeStyle = 'rgba(140, 180, 220, 0.17)';
  ctx.lineWidth = 1;
  for (let r = 40; r < 256; r += 50) {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250);
    ctx.stroke();
  }
  nebulaTex.needsUpdate = true;
}

function createStadium() {
  const group = new THREE.Group();
  const R = STADIUM_3D_RADIUS;
  const DEPTH = 0.7;
  const SEGS = 64;

  const points = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    points.push(new THREE.Vector2(t * R, -DEPTH * (1 - t * t)));
  }
  // Dark-metal bowl: cool blue-gray base, lifted just enough off pure black
  // to read as a defined silhouette. Mild metalness + lower roughness gives
  // a soft specular response to the directional light without an envMap
  // (pure metals look black without one) — reads as brushed dark steel.
  // No new shaders or geometry, so render cost is identical to before.
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(points, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.6, metalness: 0.35, side: THREE.DoubleSide })
  );
  group.add(bowl);

  const nebulaTexture = createNebulaTexture();
  const nebulaPoints = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    nebulaPoints.push(new THREE.Vector2(t * R, -DEPTH * (1 - t * t) + 0.01));
  }
  const nebulaGeo = new THREE.LatheGeometry(nebulaPoints, 64);
  const nebulaPos = nebulaGeo.attributes.position;
  const nebulaUv = nebulaGeo.attributes.uv;
  for (let i = 0; i < nebulaPos.count; i++) {
    const x = nebulaPos.getX(i);
    const z = nebulaPos.getZ(i);
    nebulaUv.setXY(i, (x / R + 1) * 0.5, (z / R + 1) * 0.5);
  }
  nebulaUv.needsUpdate = true;
  group.add(new THREE.Mesh(nebulaGeo, new THREE.MeshBasicMaterial({
    map: nebulaTexture, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  })));

  // 3D grid: cool steel-blue, ~17% opacity (per user spec). Reads as faint
  // panel seams across the bowl. LineBasicMaterial is unlit, so the bump
  // costs nothing relative to the previous 0.05.
  const gridMat = new THREE.LineBasicMaterial({ color: 0x5BA7CC, transparent: true, opacity: 0.17 });
  const gridPoints = [];
  for (let ring = 1; ring <= 5; ring++) {
    const ringR = (ring / 5) * R * 0.95;
    const ringT = ringR / R;
    const ringY = -DEPTH * (1 - ringT * ringT) + 0.02;
    for (let j = 0; j < 64; j++) {
      const a1 = (j / 64) * Math.PI * 2;
      const a2 = ((j + 1) / 64) * Math.PI * 2;
      gridPoints.push(
        new THREE.Vector3(Math.cos(a1) * ringR, ringY, Math.sin(a1) * ringR),
        new THREE.Vector3(Math.cos(a2) * ringR, ringY, Math.sin(a2) * ringR),
      );
    }
  }
  for (let j = 0; j < 12; j++) {
    const a = (j / 12) * Math.PI * 2;
    for (let s = 0; s < 20; s++) {
      const t1 = s / 20, t2 = (s + 1) / 20;
      const r1 = t1 * R * 0.95, r2 = t2 * R * 0.95;
      const y1 = -DEPTH * (1 - t1 * t1) + 0.02;
      const y2 = -DEPTH * (1 - t2 * t2) + 0.02;
      gridPoints.push(
        new THREE.Vector3(Math.cos(a) * r1, y1, Math.sin(a) * r1),
        new THREE.Vector3(Math.cos(a) * r2, y2, Math.sin(a) * r2),
      );
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMat));

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.05, 12, 64),
    new THREE.MeshBasicMaterial({ color: 0x00BFFF, transparent: true, opacity: 0.55 })
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(R + 0.08, 0.15, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x00BFFF, transparent: true, opacity: 0.10 })
  );
  outer.rotation.x = -Math.PI / 2;
  group.add(outer);

  return group;
}

scene.add(createStadium());