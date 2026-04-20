import * as THREE from 'three';
import { state, getNextColor } from './state.js';
import { MAX_PARTICIPANTS, NEON_COLORS, parseNames, escapeHtml, cryptoRandom } from './config.js';
import { tops, addTopPhysics, removeTopPhysics, repositionTops, clearTops } from './tops.js';
import {
  startBattle, resetGame,
  setUIUpdateCallback, setInputsLockCallback,
} from './game.js';
import { saveToLocalStorage } from './storage.js';

const participantsEl = document.getElementById('participants');
const nameInput = document.getElementById('name-input');
const countDisplay = document.getElementById('count-display');
const battleBtn = document.getElementById('battle-btn');
const rankingsEl = document.getElementById('rankings');

function setInputsDisabled(disabled) {
  nameInput.disabled = disabled;
  document.getElementById('add-btn').disabled = disabled;
  document.getElementById('event-title').disabled = disabled;
  document.getElementById('shuffle-btn').disabled = disabled;
  document.getElementById('csv-upload-btn').disabled = disabled;
  participantsEl.querySelectorAll('.remove').forEach(b => { b.disabled = disabled; });
}

export function addParticipant(name) {
  name = name.trim();
  if (!name || state.participants.length >= MAX_PARTICIPANTS) return;
  if (state.participants.some(p => p.name === name)) return;

  const color = getNextColor();
  state.participants.push({ name, color });
  addTopPhysics(name, color);
  repositionTops();
  renderParticipants();
  saveToLocalStorage();
}

function removeParticipant(name) {
  const idx = state.participants.findIndex(p => p.name === name);
  if (idx === -1) return;
  state.participants.splice(idx, 1);
  removeTopPhysics(name);
  repositionTops();
  renderParticipants();
  saveToLocalStorage();
}

export function renderParticipants() {
  participantsEl.innerHTML = '';
  state.participants.forEach(p => {
    const div = document.createElement('div');
    div.className = 'participant';
    const c = new THREE.Color(p.color);
    const hex = '#' + c.getHexString();
    div.innerHTML = `
      <span class="dot" style="background:${hex};color:${hex}"></span>
      <span class="name">${escapeHtml(p.name)}</span>
      <button class="remove" data-name="${escapeHtml(p.name)}" title="Remove">&times;</button>
    `;
    participantsEl.appendChild(div);
  });
  participantsEl.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.phase !== 'idle') return;
      removeParticipant(btn.dataset.name);
    });
  });
  countDisplay.textContent = `${state.participants.length} / ${MAX_PARTICIPANTS}`;
  battleBtn.disabled = state.participants.length < 2 || state.phase !== 'idle';
}

export function updateRankingsUI() {
  rankingsEl.innerHTML = '';
  const total = state.rankings.length + tops.filter(t => !t.eliminated).length;
  state.rankings.forEach((top, i) => {
    const rank = total - i;
    const div = document.createElement('div');
    div.className = 'rank-item' + (rank === 1 ? ' winner' : '');
    const c = new THREE.Color(top.color);
    div.innerHTML = `
      <span class="rank-num">${rank}</span>
      <span class="rank-dot" style="background:#${c.getHexString()}"></span>
      <span class="rank-name">${escapeHtml(top.name)}</span>
    `;
    rankingsEl.appendChild(div);
  });
}

function copyResults() {
  const title = document.getElementById('event-title').value || 'BLADE-X BATTLE';
  
  // 텍스트 구성 수정 (박스 디자인 적용)
  let text = `╔${'═'.repeat(28)}╗\n`;
  text += `   ✦ BLADE-X : BATTLE REPORT ✦\n`;
  text += `╚${'═'.repeat(28)}╝\n`;
  text += ` 📢 [ ${title} ]\n`;
  text += ` ───\n`;
  text += `  REDEFINING THE EXPERIENCE OF RANDOM SELECTION\n`;
  text += ` ───\n\n`;
  
  // 순위 리스트 (메달 및 등수 강조)
  state.rankings.forEach((top, i) => {
    let prefix;
    if (i === 0) prefix = '  🏆  WINNER : ';
    else if (i === 1) prefix = '  🥈  2nd : ';
    else if (i === 2) prefix = '  🥉  3rd : ';
    else prefix = `   ${i + 1}. `;
    
    text += `${prefix}${top.name}\n`;
    if (i === 0) text += '\n'; // 우승자 아래 한 줄 띄움
  });
  
  text += `\n ──────────────────────────────\n`;
  text += `  DRIVEN BY PHYSICS, EXPLORE THE ARC.`;

  // 클립보드 복사 실행
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = 'Copied!';
    btn.style.color = '#39FF14'; // 네온 그린 강조
    ㄴ
    setTimeout(() => {
      btn.textContent = 'Copy Results';
      btn.style.color = '';
    }, 1500);
  });
}

function handleCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const text = evt.target.result;
    const names = text.split(/[,\n\r\t]+/)
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(s => s.length > 0);
    names.forEach(n => addParticipant(n));
  };
  reader.readAsText(file);
  e.target.value = '';
}

function shuffleParticipants() {
  if (state.phase !== 'idle' || state.participants.length < 2) return;

  for (let i = state.participants.length - 1; i > 0; i--) {
    const j = Math.floor(cryptoRandom() * (i + 1));
    [state.participants[i], state.participants[j]] = [state.participants[j], state.participants[i]];
  }

  const shuffled = [...NEON_COLORS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(cryptoRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  state.participants.forEach((p, i) => { p.color = shuffled[i % shuffled.length]; });

  clearTops();
  state.participants.forEach(p => addTopPhysics(p.name, p.color));
  renderParticipants();
  saveToLocalStorage();

  const btn = document.getElementById('shuffle-btn');
  btn.textContent = 'Shuffled';
  setTimeout(() => { btn.textContent = 'Shuffle'; }, 1000);
}

export function initUI() {
  setUIUpdateCallback(updateRankingsUI);
  setInputsLockCallback(setInputsDisabled);

  nameInput.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;  // IME safety (Korean composition)
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = nameInput.value.trim();
      if (val) {
        parseNames(val).forEach(n => addParticipant(n));
        nameInput.value = '';
      }
    }
  });
  nameInput.addEventListener('paste', () => {
    setTimeout(() => {
      const names = parseNames(nameInput.value);
      if (names.length > 1) {
        names.forEach(n => addParticipant(n));
        nameInput.value = '';
      }
    }, 0);
  });

  document.getElementById('add-btn').addEventListener('click', () => {
    parseNames(nameInput.value).forEach(n => addParticipant(n));
    nameInput.value = '';
  });

  battleBtn.addEventListener('click', startBattle);
  document.getElementById('btn-retry').addEventListener('click', resetGame);
  document.getElementById('btn-copy').addEventListener('click', copyResults);

  document.getElementById('csv-upload-btn').addEventListener('click', () => {
    document.getElementById('csv-input').click();
  });
  document.getElementById('csv-input').addEventListener('change', handleCSV);

  document.getElementById('shuffle-btn').addEventListener('click', shuffleParticipants);

  const soundBtn = document.getElementById('sound-toggle');
  soundBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    soundBtn.innerHTML = state.soundEnabled ? '&#x1f50a;' : '&#x1f507;';
    soundBtn.style.opacity = state.soundEnabled ? '1' : '0.5';
  });

  document.getElementById('event-title').addEventListener('input', saveToLocalStorage);
}
