import { NEON_COLORS } from './config.js';

export const state = {
  participants: [],
  phase: 'idle', // idle | intro | countdown | battle | result
  rankings: [],
  colorIndex: 0,
  soundEnabled: true,
  battleStartTime: 0,
  battleElapsed: 0,
};

// Mirror state.phase to <body data-phase="..."> so CSS can switch UI mode.
// Idle: setup card visible (with embedded .roster-card); .roster-corner hidden.
// Battle phases: card fades out; .roster-corner cross-fades in as the HUD.
// The transition is purely opacity-based — both rosters are always rendered.
export function setPhase(next) {
  state.phase = next;
  if (typeof document !== 'undefined') {
    document.body.dataset.phase = next;
    // Auto-close any open popup whenever the phase transitions to a state
    // where the setup panel must NOT be visible:
    //   - 'result' : battle just ended, result overlay will fade in shortly
    //   - 'idle'   : post-reset / first load, setup panel is the natural view
    if (next === 'result' || next === 'idle') {
      document.body.classList.remove('popup-open');
    }
  }
}

export function getNextColor() {
  const c = NEON_COLORS[state.colorIndex % NEON_COLORS.length];
  state.colorIndex++;
  return c;
}
