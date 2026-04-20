// ═══════════════════════════════════════════
// CONFIG — shared constants and utilities
// ═══════════════════════════════════════════
export const NEON_COLORS = [
  0x39FF14, 0x00BFFF, 0xBF40FF, 0xFF6EC7,
  0xDFFF00, 0x00FFEF, 0xFF6700, 0xFF003F,
  // 5 additional non-overlapping neon tones (v1.1)
  0xFFFF33, 0xFF00FF, 0x00FF88, 0x8A2BE2, 0x40E0FF,
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
