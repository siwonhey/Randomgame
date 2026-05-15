// ═══════════════════════════════════════════
// CONFIG — shared constants and utilities
// ═══════════════════════════════════════════
// Pastel-vivid palette tuned to read against a near-black stadium.
// Reference colors supplied in round-7 feedback: EA8EFF, FFA7BD, FF4344, 78FBAB, AA78FD.
export const NEON_COLORS = [
  0xEA8EFF, 0xFFA7BD, 0xFF4344, 0x78FBAB, 0xAA78FD,
  0xFFB876, 0x76D6FF, 0xFFE066, 0x9DFF76, 0xFF76D6,
  0x76FFD8, 0xFFCC66, 0xC576FF,
];

export const STADIUM_RADIUS = 200;           // matter.js units
export const STADIUM_3D_RADIUS = 5;          // three.js world units
export const MAX_PARTICIPANTS = 30;
export const PHYSICS_SCALE = STADIUM_3D_RADIUS / STADIUM_RADIUS;
export const BATTLE_TIME_LIMIT = 30;
export const INTRO_DURATION = 2.4;           // seconds — cinematic spiral zoom-in

export function cryptoRandom() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / 4294967296;
}

export function cryptoRange(min, max) {
  return min + cryptoRandom() * (max - min);
}

export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function parseNames(text) {
  return text.split(/[,\n\r\t]+/).map(s => s.trim()).filter(s => s.length > 0);
}
