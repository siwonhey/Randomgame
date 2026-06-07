import * as THREE from 'three';
import { state, getNextColor } from './state.js';
import { MAX_PARTICIPANTS, NEON_COLORS, parseNames, escapeHtml, cryptoRandom } from './config.js';
import { tops, addTopPhysics, removeTopPhysics, repositionTops, clearTops } from './tops.js';
import {
  startBattle, resetGame,
  setUIUpdateCallback, setInputsLockCallback,
  resumeBattle, togglePauseBattle,
} from './game.js';
import { renderer } from './scene.js';
import {
  startEDM, stopEDM, startSpinHum, stopSpinHum, ensureAudio,
} from './audio.js';
import { saveToLocalStorage } from './storage.js';

// Roster is mirrored in two DOM blocks (.roster-card inside the setup card,
// .roster-corner pinned bottom-right). Both share the same render pass — the
// columns are built into a fragment and cloned into each .participants slot.
const rosterContainers = () => document.querySelectorAll('.roster-block .participants');
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

function dismissShuffleHint() {
  document.body.classList.remove('shuffle-hint-active');
}

function setInputsDisabled(disabled) {
  nameInput.disabled = disabled;
  document.getElementById('event-title').disabled = disabled;
  document.getElementById('shuffle-btn').disabled = disabled;
  document.getElementById('name-submit').disabled = disabled;
  document.querySelectorAll('.roster-block .remove').forEach(b => { b.disabled = disabled; });
}

// Roster-full warning: same treatment as the TITLE 10-char warning — light up
// .limit-warn on the field-block (red label hint + red input border).
function setParticipantLimitWarning(on) {
  const block = nameInput.closest('.field-block');
  if (block) block.classList.toggle('limit-warn', on);
}

function submitNameInput() {
  if (state.participants.length >= MAX_PARTICIPANTS) {
    nameInput.value = '';
    setParticipantLimitWarning(true);
    return;
  }
  const val = nameInput.value.trim();
  if (!val) return;
  parseNames(val).forEach(n => addParticipant(n));
  nameInput.value = '';
  nameInput.focus();
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
  // Back under the cap → clear any "max reached" notice on the name input.
  if (state.participants.length < MAX_PARTICIPANTS) setParticipantLimitWarning(false);
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
  // Newest entry on top: participants are stored oldest→newest (push order), so
  // reverse for display. (.filter returns a fresh array, so this doesn't mutate
  // state.participants — physics/colors keep their original add order.)
  const activeParticipants = state.participants.filter(p => !eliminatedSet.has(p.name)).reverse();

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
  // Reference INPUT_PC.jpg / INPUT_MO.jpg: fill top-down in left column first,
  // continue in right column when the column is full. PER_COL = 9 so the
  // roster fits in a fixed-height card with no internal scroll.
  const PER_COL = 9;
  const N = rows.length;
  const colCount = Math.max(1, Math.ceil(N / PER_COL));
  const template = document.createElement('div');
  for (let c = 0; c < colCount; c++) {
    const start = c * PER_COL;
    const end = Math.min(N, start + PER_COL);
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

  // Setup card grows as columns are added (1 col → 2 cols → 3 cols).
  // Drives a CSS attribute selector so styles stay declarative.
  const setupCard = document.querySelector('.setup-card');
  if (setupCard) setupCard.dataset.cols = String(colCount);

  // Wire remove handlers on every roster instance. The phase guard inside
  // means the corner-roster's remove buttons (visible only via DOM, hidden
  // by CSS) are inert during battle anyway — defensive double-lock.
  document.querySelectorAll('.roster-block .remove').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.phase !== 'idle') return;
      removeParticipant(btn.dataset.name);
    });
  });

  battleBtn.disabled = state.participants.length < 2 || state.phase !== 'idle';
  document.getElementById('shuffle-btn').disabled = state.participants.length < 2 || state.phase !== 'idle';
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
  if (!titleEl || !hud) return;
  // Show the full title; CSS clips it to the gap between the top-left logo and
  // the top-right mute button (equal margins, … ellipsis on overflow) so it can
  // never grow into either, regardless of length.
  hud.textContent = titleEl.value || '';
}

function copyResults() {
  const title = document.getElementById('event-title').value || 'BLITZ BATTLE';
  const ranked = state.rankings;
  if (!ranked.length) return;
  const winner = ranked[0];
  const losers = ranked.slice(1);

  let text = ` ─── BLITZ : BATTLE REPORT ${'─'.repeat(23)}\n\n`;
  text += ` 📄 NOTE\n`;
  text += ` ${title}\n\n`;
  text += ` 🏆 WINNER ── ${winner.name}\n\n`;

  // Losers in a single top-down list, ranks zero-padded (02., 03., …) so the
  // winner reads as 1st implicitly.
  if (losers.length) {
    losers.forEach((p, i) => {
      text += ` ${String(i + 2).padStart(2, '0')}. ${p.name}\n`;
    });
    text += `\n`;
  }

  text += ` ${'─'.repeat(49)}\n`;
  text += ` 🎮 REDEFINING THE EXPERIENCE OF RANDOM SELECTION\n`;
  text += ` 👉 [Play BLITZ Now](https://randomgame-7pg4.vercel.app/)\n`;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy');
    const original = btn.textContent;
    btn.textContent = 'COPIED!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
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
}

// Title required to start. If empty when battle button is clicked, mark the
// input with .warn (red) and swap the placeholder to a prompt; clear on next
// keystroke. Reference: REDESIGN_0510 §1-2 — "타이틀 미 입력시 경고 메시지".
function validateTitle() {
  const titleEl = document.getElementById('event-title');
  // The visible placeholder is the styled .field-ph overlay (native placeholder
  // is transparent), so swap its regular-weight tail too — the bold "배틀 타이틀"
  // lead stays put.
  const tail = document.querySelector('.input-box .ph-tail');
  if (titleEl.value.trim()) {
    titleEl.classList.remove('warn');
    titleEl.placeholder = '배틀 타이틀을 입력하세요';
    if (tail) tail.textContent = '을 입력하세요';
    return true;
  }
  titleEl.classList.add('warn');
  titleEl.placeholder = '배틀 타이틀을 입력해주세요';
  if (tail) tail.textContent = '을 입력해주세요';
  titleEl.focus();
  return false;
}

export function initUI() {
  setUIUpdateCallback(updateRankingsUI);
  setInputsLockCallback(setInputsDisabled);

  // Clicking/focusing the name field while the roster is already full warns
  // immediately (the field can't accept more), not only on submit.
  nameInput.addEventListener('focus', () => {
    if (state.participants.length >= MAX_PARTICIPANTS) setParticipantLimitWarning(true);
  });

  // At the 30-person cap, block typing into the name field outright (mirrors the
  // TITLE 10-char cap): preventDefault stops keyboard + IME inserts so no extra
  // text can be entered, and the red "최대 30명" notice lights up.
  nameInput.addEventListener('beforeinput', (e) => {
    const inserting = e.inputType && e.inputType.startsWith('insert');
    if (inserting && state.participants.length >= MAX_PARTICIPANTS) {
      e.preventDefault();
      setParticipantLimitWarning(true);
    }
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;  // IME safety (Korean composition)
    if (e.key === 'Enter') {
      e.preventDefault();
      submitNameInput();
    }
  });
  document.getElementById('name-submit').addEventListener('click', submitNameInput);
  nameInput.addEventListener('paste', () => {
    setTimeout(() => {
      const names = parseNames(nameInput.value);
      if (names.length > 1) {
        names.forEach(n => addParticipant(n));
        nameInput.value = '';
        // Some pasted names may have been dropped at the cap — surface it.
        if (state.participants.length >= MAX_PARTICIPANTS) setParticipantLimitWarning(true);
      }
    }, 0);
  });

  battleBtn.addEventListener('click', () => {
    if (!validateTitle()) return;
    startBattle();
  });
  document.getElementById('btn-retry').addEventListener('click', resetGame);
  document.getElementById('btn-copy').addEventListener('click', copyResults);

  // Click the top-left brand logo to return to the setup screen from any
  // in-game or result state. No-op when already on the setup screen, or
  // while the participant-edit popup is open (the popup has its own dismiss
  // controls and shouldn't be short-circuited by the logo).
  const brandBlock = document.querySelector('.brand-block');
  if (brandBlock) {
    brandBlock.addEventListener('click', () => {
      if (state.phase === 'idle') return;
      if (document.body.classList.contains('popup-open')) return;
      resetGame();
    });
  }

  document.getElementById('shuffle-btn').addEventListener('click', () => {
    // Pressing SHUFFLE before the auto-dismiss timer counts as having read the
    // hint, so close the bubble immediately.
    dismissShuffleHint();
    shuffleParticipants();
  });

  // First-visit hint above the SHUFFLE icon. Dismissed by the explicit × button,
  // by pressing SHUFFLE (treated as read), or by the auto-dismiss timer below.
  // Not persisted to storage — a page refresh re-arms it.
  document.body.classList.add('shuffle-hint-active');
  // Auto-dismiss 10s after the user lands on the setup screen (the × button and
  // pressing SHUFFLE still dismiss it earlier). Fades via the opacity transition.
  setTimeout(dismissShuffleHint, 10000);
  const hintCloseBtn = document.querySelector('#shuffle-hint .hint-close');
  if (hintCloseBtn) hintCloseBtn.addEventListener('click', dismissShuffleHint);

  // Mute toggle lives in two places (input page CTA + in-battle top-right);
  // both buttons drive the same state and reflect the muted class together.
  const soundBtn = document.getElementById('sound-toggle');
  const battleMuteBtn = document.getElementById('popup-toggle');
  const muteButtons = [soundBtn, battleMuteBtn];
  function toggleMute() {
    state.soundEnabled = !state.soundEnabled;
    muteButtons.forEach(b => {
      b.classList.toggle('muted', !state.soundEnabled);
      b.title = state.soundEnabled ? 'Mute' : 'Unmute';
    });
    if (state.soundEnabled) {
      ensureAudio();
      if (state.phase === 'battle') {
        startEDM('battle');
        startSpinHum();
      } else {
        startEDM('idle');
      }
    } else {
      stopEDM();
      stopSpinHum();
    }
  }
  soundBtn.addEventListener('click', toggleMute);
  battleMuteBtn.addEventListener('click', toggleMute);

  // TITLE is capped at 10 chars (maxlength blocks the actual input). When the
  // user tries to type past the cap, flash the red "10자 이내로 작성해주세요" hint
  // beside the label. beforeinput catches the attempt across IME + keyboard; we
  // ignore deletions and selection-replacements (those stay within the cap).
  const TITLE_MAX = 10;
  const titleInput = document.getElementById('event-title');
  const titleBlock = titleInput.closest('.field-block');

  // Over-limit warning: light up .limit-warn (red hint beside the label + red
  // input border), hold it for 2s, then drop the class so it fades out via the
  // CSS opacity/border-color transitions. Typing past the cap again restarts
  // the 2s hold.
  let titleWarnTimer = null;
  function flashTitleLimit() {
    titleBlock.classList.add('limit-warn');
    if (titleWarnTimer) clearTimeout(titleWarnTimer);
    titleWarnTimer = setTimeout(() => titleBlock.classList.remove('limit-warn'), 2000);
  }

  // Block the 11th character outright (instead of letting it appear and snap
  // back to 10): preventDefault stops the insert for keyboard + paste. Korean
  // IME composition can still momentarily exceed the cap, so the input handler
  // below clamps on commit as a backstop.
  titleInput.addEventListener('beforeinput', (e) => {
    const inserting = e.inputType && e.inputType.startsWith('insert');
    const replacing = titleInput.selectionStart !== titleInput.selectionEnd;
    if (inserting && !replacing && titleInput.value.length >= TITLE_MAX) {
      e.preventDefault();
      flashTitleLimit();
    }
  });

  titleInput.addEventListener('input', () => {
    const titleEl = titleInput;
    // IME backstop: clamp to the cap if composition pushed the value past it.
    if (titleEl.value.length > TITLE_MAX) {
      titleEl.value = titleEl.value.slice(0, TITLE_MAX);
      flashTitleLimit();
    }
    // Clear the empty-title warning as soon as the user starts typing.
    if (titleEl.classList.contains('warn') && titleEl.value.trim()) {
      titleEl.classList.remove('warn');
      titleEl.placeholder = '배틀 타이틀을 입력하세요';
    }
    saveToLocalStorage();
    syncTitleHud();
  });

  // ── Popup-close wiring kept for safety, but the mid-battle entry point
  // (the former gear button) has been repurposed to a mute toggle, so the
  // popup no longer opens during battle. Close handlers stay in case a
  // future flow re-introduces popup-open.
  const popupClose    = document.getElementById('popup-close');
  const popupBackdrop = document.getElementById('popup-backdrop');
  const setupPanel    = document.getElementById('setup-panel');

  const closePopup = () => {
    document.body.classList.remove('popup-open');
    if (state.phase === 'battle') resumeBattle();
  };

  popupClose.addEventListener('click', closePopup);
  popupBackdrop.addEventListener('click', closePopup);

  // Click on the 3D canvas during battle toggles pause. Bound to the renderer
  // canvas (not #game-area) so HUD elements (timer/status/title) don't trip it.
  renderer.domElement.addEventListener('click', () => {
    if (state.phase !== 'battle') return;
    if (document.body.classList.contains('popup-open')) return;
    togglePauseBattle();
  });

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
      return;
    }
    // Spacebar toggles pause during battle. Ignore when typing in inputs or
    // when the popup is open so it doesn't fight Edit-Participants.
    if (e.code === 'Space' &&
        state.phase === 'battle' &&
        !document.body.classList.contains('popup-open') &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      togglePauseBattle();
    }
  });
}
