// ═══════════════════════════════════════════
// CONFIG — shared constants and utilities
// ═══════════════════════════════════════════
// 30 distinct pastel-vivid hues — one per maximum-participant slot so no two
// tops share a color even at MAX_PARTICIPANTS. Spanned across the hue wheel
// (red → orange → yellow → green → cyan → blue → purple → magenta) with a
// mix of bright and softer variants so adjacent ranks read as distinct.
// First 13 are the round-7 reference palette; the next 17 fill the gaps.
export const NEON_COLORS = [
  0xEA8EFF, 0xFFA7BD, 0xFF4344, 0x78FBAB, 0xAA78FD,
  0xFFB876, 0x76D6FF, 0xFFE066, 0x9DFF76, 0xFF76D6,
  0x76FFD8, 0xFFCC66, 0xC576FF,
  0xFF8A4C, 0x4CFFD2, 0xFF5BA7, 0x5BA7FF, 0xB5FF5B,
  0xFF8A8A, 0x8A5BFF, 0x5BFF8A, 0xFFD15B, 0xD15BFF,
  0x5BD1FF, 0x9BCCFF, 0xCCFF9B, 0xFFF4A2, 0xCC9BFF,
  0xFFA042, 0x42BCFF,
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
