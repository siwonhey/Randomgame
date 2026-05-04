import * as THREE from 'three';
import { state, getNextColor } from './state.js';
import { MAX_PARTICIPANTS, NEON_COLORS, parseNames, escapeHtml, cryptoRandom } from './config.js';
import { tops, addTopPhysics, removeTopPhysics, repositionTops, clearTops } from './tops.js';
import {
  startBattle, resetGame,
  setUIUpdateCallback, setInputsLockCallback,
} from './game.js';
import { saveToLocalStorage } from './storage.js';

// Roster is mirrored in two DOM blocks (.roster-card inside the setup card,
// .roster-corner pinned bottom-right). Both share the same render pass — the
// columns are built into a fragment and cloned into each .participants slot.
const rosterContainers = () => document.querySelectorAll('.roster-block .participants');
const countDisplays = () => document.querySelectorAll('.roster-block .count-display');
const nameInput = document.getElementById('name-input');
const battleBtn = document.getElementById('battle-btn');

function ordinal(n) {
  const last2 = n % 100;
  if (last2 >= 11 && last2 <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

function setInputsDisabled(disabled) {
  nameInput.disabled = disabled;
  document.getElementById('add-btn').disabled = disabled;
  document.getElementById('event-title').disabled = disabled;
  document.getElementById('shuffle-btn').disabled = disabled;
  document.getElementById('csv-upload-btn').disabled = disabled;
  document.querySelectorAll('.roster-block .remove').forEach(b => { b.disabled = disabled; });
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

// Unified list: active participants on top, eliminated sink to the bottom in
// elimination order (first eliminated = lowest rank, pinned at the very bottom).
// Rendered into BOTH .roster-card and .roster-corner so cross-fading between
// them shows continuous data — the visual transition is opacity only, not
// content rebuild. Build columns once, then clone into each container.
export function renderParticipants() {
  const eliminatedNames = state.rankings.map(r => r.name);
  const eliminatedSet = new Set(eliminatedNames);
  const activeParticipants = state.participants.filter(p => !eliminatedSet.has(p.name));

  const total = state.participants.length;
  const rows = [];
  activeParticipants.forEach(p => rows.push({ p, eliminated: false, rank: null }));
  state.rankings.forEach((top, i) => {
    const activeCount = total - state.rankings.length;
    const rank = activeCount + 1 + i;
    const participant = state.participants.find(p => p.name === top.name) || top;
    rows.push({ p: participant, eliminated: true, rank });
  });

  // Build columns into a detached fragment so we can clone it cheaply into
  // every roster container without re-running the layout math.
  const PER_COL = 12;
  const N = rows.length;
  const colCount = Math.max(1, Math.ceil(N / PER_COL));
  const template = document.createElement('div');
  for (let c = colCount - 1; c >= 0; c--) {
    const end = N - c * PER_COL;
    const start = Math.max(0, end - PER_COL);
    const slice = rows.slice(start, end);
    const colEl = document.createElement('div');
    colEl.className = 'participants-column';
    slice.forEach(({ p, eliminated, rank }) => {
      const div = document.createElement('div');
      div.className = 'participant' + (eliminated ? ' eliminated' : '');
      const three = new THREE.Color(p.color);
      const hex = '#' + three.getHexString();
      const tag = rank ? ordinal(rank) : '';
      div.innerHTML = `
        <span class="rank-tag">${tag}</span>
        <span class="dot" style="background:${hex};color:${hex}"></span>
        <span class="name">${escapeHtml(p.name)}</span>
        <button class="remove" data-name="${escapeHtml(p.name)}" title="Remove"${eliminated ? ' disabled style="visibility:hidden"' : ''}>&times;</button>
      `;
      colEl.appendChild(div);
    });
    template.appendChild(colEl);
  }

  rosterContainers().forEach(container => {
    container.innerHTML = template.innerHTML;
  });

  // Wire remove handlers on every roster instance. The phase guard inside
  // means the corner-roster's remove buttons (visible only via DOM, hidden
  // by CSS) are inert during battle anyway — defensive double-lock.
  document.querySelectorAll('.roster-block .remove').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.phase !== 'idle') return;
      removeParticipant(btn.dataset.name);
    });
  });

  const countText = `${state.participants.length} / ${MAX_PARTICIPANTS}`;
  countDisplays().forEach(el => { el.textContent = countText; });
  battleBtn.disabled = state.participants.length < 2 || state.phase !== 'idle';
}

export function updateRankingsUI() {
  renderParticipants();
}

// Mirror the #event-title input into #title-hud (the in-arena HUD label
// that fades in once the setup card fades out). Called on every keystroke
// AND once after localStorage hydration so a saved title shows up too.
export function syncTitleHud() {
  const titleEl = document.getElementById('event-title');
  const hud = document.getElementById('title-hud');
  if (titleEl && hud) hud.textContent = titleEl.value || '';
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

  // 하단 게임 정보 및 링크 추가
  text += `\n ──────────────────────────────\n`;
  text += `  🎮 GAME: METALBLADE\n`; // 게임명 노출
  text += `  🔗 LINK: https://randomgame-7pg4.vercel.app/\n`; // 링크 노출
  text += ` ──────────────────────────────\n`;
  text += `  DRIVEN BY PHYSICS, EXPLORE THE ARC.`;

  // 클립보드 복사 실행
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = 'Copied!';
    btn.style.color = 'rgba(255,255,255,0.6)';
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

  document.getElementById('event-title').addEventListener('input', () => {
    saveToLocalStorage();
    syncTitleHud();
  });

  // ── Popup mode (re-uses the setup panel as a mid-battle modal) ──
  const popupToggle   = document.getElementById('popup-toggle');
  const popupClose    = document.getElementById('popup-close');
  const popupBackdrop = document.getElementById('popup-backdrop');
  const setupPanel    = document.getElementById('setup-panel');

  const openPopup  = () => document.body.classList.add('popup-open');
  const closePopup = () => document.body.classList.remove('popup-open');

  popupToggle.addEventListener('click', openPopup);
  popupClose.addEventListener('click', closePopup);
  popupBackdrop.addEventListener('click', closePopup);

  // Click outside the panel content while popup is open → close.
  // (Backdrop click already handles edges; this catches gaps inside #setup-panel
  // because the panel itself is full-screen but only its children are interactive.)
  setupPanel.addEventListener('click', (e) => {
    if (!document.body.classList.contains('popup-open')) return;
    if (e.target === setupPanel) closePopup();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('popup-open')) {
      closePopup();
    }
  });
}
