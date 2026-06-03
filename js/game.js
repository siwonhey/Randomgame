// ═══════════════════════════════════════════
// GAME FLOW — phase transitions + elimination/end/reset
// ═══════════════════════════════════════════
import { state, setPhase } from './state.js';
import { tops, addTopPhysics, repositionTops, clearTops } from './tops.js';
import { world, registerPhysicsCallbacks, pausePhysics, resumePhysics } from './physics.js';
import { scene, spotLight } from './scene.js';
import { spawnParticles, clearParticles } from './particles.js';
import {
  playBeep, playElimination, playVictory, playWhoosh,
  startSpinHum, stopSpinHum, startEDM, setEDMVolume, setEDMMode, ensureAudio, unlockAudio,
} from './audio.js';




// BGM volume profile — input/battle plays at full, result dims for the jingle.
const BGM_VOL_FULL   = 0.12;
const BGM_VOL_RESULT = 0.05;
const BGM_VOL_PAUSE  = 0.03;

const pauseIndicator = document.getElementById('pause-indicator');

export function pauseBattle() {
  if (state.phase !== 'battle' || state.paused) return;
  pausePhysics();
  setEDMVolume(BGM_VOL_PAUSE, 0.25);
  if (pauseIndicator) pauseIndicator.classList.add('show');
}

export function resumeBattle() {
  if (state.phase !== 'battle' || !state.paused) return;
  resumePhysics();
  // Restore via mode helper so we pick up whatever battle volume audio.js sets.
  setEDMMode('battle');
  if (pauseIndicator) pauseIndicator.classList.remove('show');
}

export function togglePauseBattle() {
  if (state.phase !== 'battle') return;
  if (state.paused) resumeBattle();
  else pauseBattle();
}
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
const gameArea = document.getElementById('game-area');

// Listen on several gesture types so the first interaction of any kind resumes
// the AudioContext and starts the BGM (covers touch, mouse, and keyboard).
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('touchstart', unlockAudio);
window.addEventListener('click', unlockAudio);

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

  setPhase('intro');
  state.rankings = [];
  state.battleElapsed = 0;
  onUIUpdate();
  battleBtn.disabled = true;
  resultOverlay.classList.remove('show');
  onInputsLock(true);
  timerDisplay.textContent = '';
  timerDisplay.classList.remove('urgent');
  countdownEl.style.opacity = '0';

  repositionTops();
  ensureAudio();
  playWhoosh();

  setCameraMode('intro', { onComplete: startCountdown });
}

function startCountdown() {
  setPhase('countdown');
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
      countdownEl.style.color = 'rgba(255,255,255,.95)';
      countdownEl.style.textShadow = '0 0 60px rgba(255,255,255,.45)';
      playBeep(1200, 0.3, 0.2);
      setTimeout(() => {
        countdownEl.style.opacity = '0';
        countdownEl.style.color = 'rgba(255,255,255,.95)';
        countdownEl.style.textShadow = '0 0 60px rgba(255,255,255,.35)';
        launchTops();
      }, 600);
    }
  };
  tick();
}

function launchTops() {
  setPhase('battle');
  state.battleStartTime = performance.now();
  setCameraMode('battle');
  startSpinHum();
  startEDM('battle');

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
  setPhase('result');
  state.rankings.unshift(winner);
  stopSpinHum();
  setEDMVolume(BGM_VOL_RESULT, 0.6);

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

  // Ranks 2nd onward — winner is displayed separately in 3D above the list.
  // Split into top-down columns of 8 so every name is visible at once
  // (no scroll). Items 1-8 → column 1, 9-16 → column 2, ...
  resultList.innerHTML = '';
  const RESULT_PER_COL = 8;
  const items = state.rankings.slice(1);
  const colCount = Math.max(1, Math.ceil(items.length / RESULT_PER_COL));
  for (let c = 0; c < colCount; c++) {
    const colEl = document.createElement('div');
    colEl.className = 'result-column';
    const start = c * RESULT_PER_COL;
    const end = Math.min(items.length, start + RESULT_PER_COL);
    for (let i = start; i < end; i++) {
      const top = items[i];
      const rank = i + 2;
      const medal = rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
      const div = document.createElement('div');
      div.className = 'result-item';
      const rankSpan = document.createElement('span');
      rankSpan.className = 'result-rank';
      rankSpan.textContent = medal;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'result-name';
      nameSpan.textContent = top.name;
      div.appendChild(rankSpan);
      div.appendChild(nameSpan);
      div.style.animationDelay = `${i * 0.08}s`;
      colEl.appendChild(div);
    }
    resultList.appendChild(colEl);
  }
}

// ── Reset ──
export function resetGame() {
  setPhase('idle');
  state.rankings = [];
  state.battleElapsed = 0;
  state.paused = false;
  if (pauseIndicator) pauseIndicator.classList.remove('show');
  stopSpinHum();
  // Keep BGM playing across reset; just bring it back up to full volume.
  setEDMVolume(BGM_VOL_FULL, 0.4);
  startEDM('idle');
  spotLight.intensity = 0;

  clearTops();
  clearParticles();

  state.participants.forEach(p => addTopPhysics(p.name, p.color));

  setCameraMode('idle');

  resultOverlay.classList.remove('show');
  hideWinner();
  battleBtn.disabled = state.participants.length < 2;
  statusBar.textContent = '';
  countdownEl.textContent = '';
  countdownEl.style.opacity = '0';
  timerDisplay.textContent = '';
  timerDisplay.classList.remove('urgent');
  onInputsLock(false);
  onUIUpdate();
}
