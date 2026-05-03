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
// (Setup vs Battle layouts live in style.css and key off this attribute.)
export function setPhase(next) {
  state.phase = next;
  if (typeof document !== 'undefined') {
    document.body.dataset.phase = next;
    // Auto-close any open popup whenever the phase transitions to a state
    // where the setup panel must NOT be visible:
    //   - 'result' : battle just ended, result overlay will fade in shortly
    //   - 'idle'   : post-reset / first load, setup panel is the natural view
    // Without this, the popup-open !important rule would keep the setup
    // panel layered over the arena (or over a not-yet-shown result overlay).
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
