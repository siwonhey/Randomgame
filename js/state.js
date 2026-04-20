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

export function getNextColor() {
  const c = NEON_COLORS[state.colorIndex % NEON_COLORS.length];
  state.colorIndex++;
  return c;
}
