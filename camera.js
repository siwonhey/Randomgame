// ═══════════════════════════════════════════
// CINEMATIC CAMERA — state machine driving camera.position & lookAt
//   idle       → top-down with slight offset (avoids top nav UI overlap)
//   intro      → zoom-in + orbit from top-down to perspective angle
//   countdown  → hold settled perspective (fires onComplete at intro end)
//   battle     → real-time fit-to-frame on surviving tops, low-angle when <=3
//   result     → focus on winner
// ═══════════════════════════════════════════
import * as THREE from 'three';
import { camera, flashLight } from './scene.js';
import { INTRO_DURATION } from './config.js';

const TOP_POS       = new THREE.Vector3(0, 15, 0.01);  // straight-down, tiny offset to avoid degenerate lookAt
const TOP_TARGET    = new THREE.Vector3(0, 0, 0);      // stadium centered in frame
const PERSP_POS     = new THREE.Vector3(0, 9, 10);
const PERSP_TARGET  = new THREE.Vector3(0, 0, 0);
const LOW_ANGLE_Y   = 2.8;

// Cinematic spiral zoom-in — stadium is pinned at origin while the camera
// sweeps 180° around it and descends on a decelerating curve.
const INTRO_START_ANGLE  = Math.PI;                    // azimuth at raw=0 (radius≈0, so xz≈0)
const INTRO_END_ANGLE    = Math.PI * 2;                // 180° sweep — ends at +z (matches PERSP_POS)
const INTRO_START_RADIUS = 0.02;
const INTRO_END_RADIUS   = PERSP_POS.z;                // 10 — must match PERSP_POS for seamless handoff
const INTRO_START_Y      = TOP_POS.y;                  // 15
const INTRO_END_Y        = PERSP_POS.y;                // 9
const INTRO_START_FOV    = 62;                         // wide punch at apex
const INTRO_END_FOV      = 45;                         // settled perspective FOV
const BASE_FOV           = 45;

camera.position.copy(TOP_POS);
camera.lookAt(TOP_TARGET);
const camTarget = TOP_TARGET.clone();

let mode = 'idle';
let introStart = 0;
let introCallback = null;
let winnerRef = null;
let shakeAmount = 0;
let zoomPunch = 0;
const tmp = new THREE.Vector3();

export function getCamTarget() { return camTarget; }

export function setMode(newMode, payload = {}) {
  mode = newMode;
  if (newMode === 'intro') {
    introStart = performance.now();
    introCallback = payload.onComplete || null;
  } else if (newMode === 'result') {
    winnerRef = payload.winner || null;
  } else if (newMode === 'idle') {
    winnerRef = null;
    shakeAmount = 0;
    zoomPunch = 0;
    if (camera.fov !== BASE_FOV) { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
  }
}

export function addShake(amount) { shakeAmount = Math.max(shakeAmount, amount); }
export function addZoomPunch(amount) { zoomPunch = Math.max(zoomPunch, amount); }

// Impact feedback (wired from physics collision events)
export function onImpact({ cx, cz, intensity }) {
  if (intensity > 0.4) addShake(intensity * 0.12);
  if (intensity > 0.5) addZoomPunch(intensity * 0.22);
  if (intensity > 0.25) {
    flashLight.position.set(cx, 0.5, cz);
    flashLight.intensity = intensity * 4;
  }
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export function updateCinematicCamera(activeTops) {
  switch (mode) {
    case 'idle': {
      camera.position.lerp(TOP_POS, 0.04);
      camTarget.lerp(TOP_TARGET, 0.04);
      break;
    }
    case 'intro': {
      // Spiral descent: camera sweeps 180° around a pinned stadium while the
      // orbit radius expands and the altitude drops, both on a decelerating
      // ease-out curve. FOV starts wide and narrows for a dolly-punch feel.
      const elapsed = (performance.now() - introStart) / 1000;
      const raw = Math.min(elapsed / INTRO_DURATION, 1);
      const tRadial = easeOutCubic(raw);                 // decelerating descent + zoom
      const tAngle  = easeInOutCubic(raw);               // smooth orbit, no snap at edges

      const angle  = INTRO_START_ANGLE + (INTRO_END_ANGLE - INTRO_START_ANGLE) * tAngle;
      const radius = INTRO_START_RADIUS + (INTRO_END_RADIUS - INTRO_START_RADIUS) * tRadial;
      const height = INTRO_START_Y + (INTRO_END_Y - INTRO_START_Y) * tRadial;

      camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      camTarget.copy(PERSP_TARGET);                      // stadium pinned at center

      const fov = INTRO_START_FOV + (INTRO_END_FOV - INTRO_START_FOV) * easeOutCubic(raw);
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

      if (raw >= 1) {
        mode = 'countdown';
        if (introCallback) { const cb = introCallback; introCallback = null; cb(); }
      }
      break;
    }
    case 'countdown': {
      camera.position.lerp(PERSP_POS, 0.08);
      camTarget.lerp(PERSP_TARGET, 0.08);
      break;
    }
    case 'battle': {
      const active = activeTops || [];
      if (active.length === 0) {
        camera.position.lerp(PERSP_POS, 0.03);
        camTarget.lerp(PERSP_TARGET, 0.03);
      } else {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let cx = 0, cz = 0;
        for (const t of active) {
          const px = t.mesh.position.x, pz = t.mesh.position.z;
          cx += px; cz += pz;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (pz < minZ) minZ = pz;
          if (pz > maxZ) maxZ = pz;
        }
        cx /= active.length; cz /= active.length;
        const span = Math.max(maxX - minX, maxZ - minZ, 2);
        const lowAngle = active.length <= 3;
        const camY = lowAngle ? LOW_ANGLE_Y : 6 + span * 0.8;
        const camZ = cz + (lowAngle ? span * 1.2 + 3.8 : span * 0.9 + 5);
        const targetY = lowAngle ? 0.3 : 0;
        const speed = lowAngle ? 0.04 : 0.025;
        tmp.set(cx * 0.4, camY, camZ);  // pull X toward center for stability
        camera.position.lerp(tmp, speed);
        tmp.set(cx, targetY, cz);
        camTarget.lerp(tmp, speed);
      }
      break;
    }
    case 'result': {
      if (winnerRef && winnerRef.mesh) {
        tmp.set(winnerRef.mesh.position.x + 0.8, 2.5, winnerRef.mesh.position.z + 4);
        camera.position.lerp(tmp, 0.04);
        camTarget.lerp(winnerRef.mesh.position, 0.04);
      }
      break;
    }
  }

  // Zoom punch — brief dolly toward target on strong impacts
  if (zoomPunch > 0.001) {
    const dir = tmp.subVectors(camTarget, camera.position).normalize();
    camera.position.addScaledVector(dir, zoomPunch * 0.4);
    zoomPunch *= 0.8;
  }

  camera.lookAt(camTarget);

  // Shake — applied after lookAt so orientation stays locked but position jitters
  if (shakeAmount > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shakeAmount;
    camera.position.y += (Math.random() - 0.5) * shakeAmount;
    camera.position.z += (Math.random() - 0.5) * shakeAmount * 0.5;
    shakeAmount *= 0.88;
  }
}
