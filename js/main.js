// ═══════════════════════════════════════════
// ENTRY — wires modules together and drives the animation loop
// ═══════════════════════════════════════════
import { state, setPhase } from './state.js';
import { scene, renderer, camera, flashLight, onResize } from './scene.js';
import './stadium.js';  // side effect: adds stadium group to scene
import { tops, updateTopPosition } from './tops.js';
import { physicsTick } from './physics.js';
import { updateNebulaTexture } from './stadium.js';
import { updateParticles, spawnTrail } from './particles.js';
import { updateCinematicCamera, getCamTarget } from './camera.js';
import { updateSpinHum, ensureAudio, startEDM } from './audio.js';
import { initUI, renderParticipants, addParticipant, syncTitleHud } from './ui.js';
import { loadFromLocalStorage } from './storage.js';

const timerDisplay = document.getElementById('timer-display');
let frameCount = 0;

function animate() {
  requestAnimationFrame(animate);
  frameCount++;

  const time = performance.now() * 0.0015;

  const avgSpeed = physicsTick();
  if (state.phase === 'battle') {
    const remaining = Math.max(0, 30 - state.battleElapsed);
    timerDisplay.textContent = remaining.toFixed(1) + 's';
    if (remaining < 10) timerDisplay.classList.add('urgent');
    updateSpinHum(avgSpeed / 10);
  }

  updateNebulaTexture(time);

  // Sync top meshes from physics bodies
  tops.forEach(top => {
    if (top.eliminated) return;
    updateTopPosition(top);
    top.mesh.rotation.y += top.rpm * 0.0003;

    // Precession wobble when RPM low
    if (top.rpm < 400 && state.phase === 'battle') {
      const wobble = (1 - top.rpm / 400) * 0.15;
      top.mesh.rotation.x = Math.sin(frameCount * 0.05) * wobble;
      top.mesh.rotation.z = Math.cos(frameCount * 0.05) * wobble;
    }

    // Trail particles
    if (state.phase === 'battle' && frameCount % 3 === 0) {
      const speed = Math.sqrt(top.body.velocity.x ** 2 + top.body.velocity.y ** 2);
      if (speed > 1.2) spawnTrail(top.mesh.position.x, top.mesh.position.z, top.color);
    }
  });

  updateParticles();

  if (flashLight.intensity > 0) {
    flashLight.intensity *= 0.83;
    if (flashLight.intensity < 0.01) flashLight.intensity = 0;
  }

  const active = tops.filter(t => !t.eliminated);
  updateCinematicCamera(active);

  // Dynamic label Y offset + scale based on camera distance
  // Ensures names stay readable and above the floor at any angle.
  const camDist = camera.position.distanceTo(getCamTarget());
  const labelY = Math.max(0.5, Math.min(1.3, camDist * 0.08));
  const labelScale = Math.max(1.0, Math.min(1.6, camDist * 0.10));
  tops.forEach(top => {
    if (top.eliminated || !top.label) return;
    top.label.position.y = labelY;
    top.label.scale.set(1.3 * labelScale, 0.37 * labelScale, 1);
  });

  renderer.render(scene, camera);
}

// ── Landing splash ──
// Reference REDESIGN_0510 §1-1: the LOGO.mp4 animation plays once on page
// load (not on Restart from the result page — that's a normal in-app reset
// that doesn't reload). We mark <body data-landing="active"> while the splash
// is up so the brand block, sound toggle, setup card, and corner roster all
// stay invisible until the splash fades. Hidden when the video reports
// `ended`; falls back to a timeout if the video can't play (autoplay block,
// missing file, decode error).
const LANDING_FALLBACK_MS = 4000;
function runLandingSplash() {
  const splash = document.getElementById('landing-splash');
  if (!splash) return;
  document.body.dataset.landing = 'active';

  const dismiss = () => {
    if (splash.dataset.dismissed) return;
    splash.dataset.dismissed = '1';
    splash.classList.add('hidden');
    delete document.body.dataset.landing;
    setTimeout(() => splash.remove(), 700);
  };

  const video = document.getElementById('landing-logo');
  if (video && typeof video.addEventListener === 'function') {
    video.addEventListener('ended', dismiss, { once: true });
    video.addEventListener('error', dismiss, { once: true });
    // Some browsers reject autoplay silently — kick off play and dismiss
    // immediately on rejection so the splash doesn't stick.
    const playPromise = video.play && video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(dismiss);
    }
  }

  setTimeout(dismiss, LANDING_FALLBACK_MS);
}

// ── Init ──
setPhase('idle');                       // mirror to <body data-phase="idle">
onResize();
initUI();
renderParticipants();
loadFromLocalStorage(addParticipant);
syncTitleHud();                          // pick up the loaded event title
runLandingSplash();
animate();

// BGM kicks in on the first user gesture (browsers gate AudioContext on
// interaction). Once the splash dismisses the user is on the input screen,
// so any click/keypress there triggers BGM and it persists into battle/result.
function startBGMOnFirstInteraction() {
  const start = () => {
    ensureAudio();
    startEDM('idle');
    document.removeEventListener('pointerdown', start);
    document.removeEventListener('keydown', start);
  };
  document.addEventListener('pointerdown', start, { once: true });
  document.addEventListener('keydown', start, { once: true });
}
startBGMOnFirstInteraction();
