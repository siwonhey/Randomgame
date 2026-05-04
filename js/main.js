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
import { updateSpinHum } from './audio.js';
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
  const labelY = Math.max(0.85, Math.min(1.7, camDist * 0.10));
  const labelScale = Math.max(1.0, Math.min(1.7, camDist * 0.11));
  tops.forEach(top => {
    if (top.eliminated || !top.label) return;
    top.label.position.y = labelY;
    top.label.scale.set(1.3 * labelScale, 0.37 * labelScale, 1);
  });

  renderer.render(scene, camera);
}

// ── Init ──
setPhase('idle');                       // mirror to <body data-phase="idle">
onResize();
initUI();
renderParticipants();
loadFromLocalStorage(addParticipant);
syncTitleHud();                          // pick up the loaded event title
animate();
