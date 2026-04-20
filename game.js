// ═══════════════════════════════════════════
// GAME FLOW — phase transitions + elimination/end/reset
// ═══════════════════════════════════════════
import { state } from './state.js';
import { tops, addTopPhysics, repositionTops, clearTops } from './tops.js';
import { world, registerPhysicsCallbacks } from './physics.js';
import { scene, spotLight } from './scene.js';
import { spawnParticles, clearParticles } from './particles.js';
import {
  playBeep, playElimination, playVictory,
  startSpinHum, stopSpinHum, startEDM, stopEDM, ensureAudio,
} from './audio.js';
import { setMode as setCameraMode, onImpact as cameraImpact } from './camera.js';
import { showWinner, hideWinner } from './resultScene.js';

const Matter = window.Matter;
const { Composite } = Matter;

const timerDisplay = document.getElementById('timer-display');
const statusBar = document.getElementById('status-bar');
const countdownEl = document.getElementById('countdown');
const battleBtn = document.getElementById('battle-btn');
const resultOverlay = document.getElementById('result-overlay');
const resultList = document.getElementById('result-list');
const rankingsCol = document.getElementById('rankings-col');
const gameArea = document.getElementById('game-area');

let onUIUpdate = () => {};
let onInputsLock = () => {};
export function setUIUpdateCallback(cb) { onUIUpdate = cb; }
export function setInputsLockCallback(cb) { onInputsLock = cb; }

// ── Elimination ──
export function eliminateTop(top) {
  if (top.eliminated) return;
  top.eliminated = true;
  Composite.remove(world, top.body);

  // Ring-out parabola animation
  const startPos = top.mesh.position.clone();
  const dir = startPos.clone().normalize();
  if (dir.length() < 0.01) dir.set(1, 0, 0);
  let t = 0;
  const step = () => {
    t += 0.025;
    top.mesh.position.x = startPos.x + dir.x * t * 5;
    top.mesh.position.z = startPos.z + dir.z * t * 5;
    top.mesh.position.y = Math.max(0, 0.5 * t - 2.5 * t * t) * 3;
    top.mesh.scale.setScalar(Math.max(0, 1 - t * 0.8));
    top.mesh.rotation.x += 0.12;
    top.mesh.rotation.z += 0.06;
    if (t < 1.2) requestAnimationFrame(step);
    else scene.remove(top.mesh);
  };
  step();

  spawnParticles(startPos.x, startPos.z, top.color, 25);
  spawnParticles(startPos.x, startPos.z, 0xffffff, 10);
  playElimination();

  state.rankings.unshift(top);
  onUIUpdate();

  const remaining = tops.filter(t => !t.eliminated);
  statusBar.textContent = `${remaining.length} REMAINING`;
  if (remaining.length === 1) {
    setTimeout(() => endBattle(remaining[0]), 1500);
  }
}

// Wire physics → game
registerPhysicsCallbacks({
  onEliminate: eliminateTop,
  onImpact: cameraImpact,
  getTops: () => tops,
});

// ── Battle start (intro → countdown → launch) ──
export function startBattle() {
  if (state.participants.length < 2 || state.phase !== 'idle') return;

  state.phase = 'intro';
  state.rankings = [];
  state.battleElapsed = 0;
  onUIUpdate();
  rankingsCol.style.visibility = 'visible';
  battleBtn.disabled = true;
  resultOverlay.classList.remove('show');
  onInputsLock(true);
  timerDisplay.textContent = '';
  timerDisplay.classList.remove('urgent');
  countdownEl.style.opacity = '0';

  repositionTops();
  ensureAudio();

  setCameraMode('intro', { onComplete: startCountdown });
}

function startCountdown() {
  state.phase = 'countdown';
  let count = 3;
  countdownEl.style.opacity = '1';

  const tick = () => {
    if (count > 0) {
      countdownEl.textContent = count;
      countdownEl.style.transform = 'translate(-50%,-50%) scale(1.3)';
      setTimeout(() => { countdownEl.style.transform = 'translate(-50%,-50%) scale(1)'; }, 200);
      playBeep(400 + count * 100, 0.2, 0.15);
      count--;
      setTimeout(tick, 800);
    } else {
      countdownEl.textContent = 'GO!';
      countdownEl.style.color = 'rgba(57,255,20,.9)';
      countdownEl.style.textShadow = '0 0 60px rgba(57,255,20,.5)';
      playBeep(1200, 0.3, 0.2);
      setTimeout(() => {
        countdownEl.style.opacity = '0';
        countdownEl.style.color = 'rgba(0,191,255,.9)';
        countdownEl.style.textShadow = '0 0 60px rgba(0,191,255,.4)';
        launchTops();
      }, 600);
    }
  };
  tick();
}

function launchTops() {
  state.phase = 'battle';
  state.battleStartTime = performance.now();
  setCameraMode('battle');
  startSpinHum();
  startEDM();

  const { Body } = Matter;
  tops.forEach(top => {
    top.rpm = top.initialSpin;
    top.eliminated = false;
    const dx = -top.body.position.x;
    const dy = -top.body.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 3 + Math.random();
    Body.setVelocity(top.body, { x: (dx / dist) * speed, y: (dy / dist) * speed });
  });

  statusBar.textContent = `${tops.filter(t => !t.eliminated).length} REMAINING`;
}

// ── Battle end ──
function endBattle(winner) {
  state.phase = 'result';
  state.rankings.unshift(winner);
  stopSpinHum();
  stopEDM();

  setCameraMode('result', { winner });
  spotLight.intensity = 2.5;
  spotLight.position.set(winner.mesh.position.x, 8, winner.mesh.position.z);
  spotLight.target = winner.mesh;

  playVictory();

  const rect = gameArea.getBoundingClientRect();
  const cx = (rect.left + rect.width / 2) / window.innerWidth;
  const cy = (rect.top + rect.height / 2) / window.innerHeight;
  const fire = (opts) => window.confetti({ origin: { x: cx, y: cy }, ...opts });
  fire({ spread: 80, particleCount: 100, startVelocity: 45 });
  setTimeout(() => fire({ spread: 100, particleCount: 80 }), 300);
  setTimeout(() => fire({ spread: 120, particleCount: 100 }), 600);
  setTimeout(() => fire({ spread: 60, particleCount: 50, startVelocity: 30 }), 900);

  statusBar.textContent = '';
  timerDisplay.textContent = '';

  setTimeout(showResult, 2500);
}

function showResult() {
  const winner = state.rankings[0];
  resultOverlay.classList.add('show');
  document.getElementById('result-winner-name').textContent = winner.name;
  showWinner(winner);

  // Ranks 2nd onward — winner is displayed separately in 3D above the list
  resultList.innerHTML = '';
  state.rankings.slice(1).forEach((top, i) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    const rank = i + 2;
    const medal = rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
    div.textContent = `${medal}  ${top.name}`;
    div.style.animationDelay = `${i * 0.08}s`;
    resultList.appendChild(div);
  });
}

// ── Reset ──
export function resetGame() {
  state.phase = 'idle';
  state.rankings = [];
  state.battleElapsed = 0;
  stopSpinHum();
  stopEDM();
  spotLight.intensity = 0;

  clearTops();
  clearParticles();

  state.participants.forEach(p => addTopPhysics(p.name, p.color));

  setCameraMode('idle');

  resultOverlay.classList.remove('show');
  hideWinner();
  rankingsCol.style.visibility = 'hidden';
  document.getElementById('rankings').innerHTML = '';
  battleBtn.disabled = state.participants.length < 2;
  statusBar.textContent = '';
  countdownEl.textContent = '';
  countdownEl.style.opacity = '0';
  timerDisplay.textContent = '';
  timerDisplay.classList.remove('urgent');
  onInputsLock(false);
  onUIUpdate();
}
