import * as THREE from 'three';

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════
const NEON_COLORS = [
  0x39FF14, 0x00BFFF, 0xBF40FF, 0xFF6EC7,
  0xDFFF00, 0x00FFEF, 0xFF6700, 0xFF003F,
];
const STADIUM_RADIUS = 200;
const STADIUM_3D_RADIUS = 5;
const MAX_PARTICIPANTS = 30;
const PHYSICS_SCALE = STADIUM_3D_RADIUS / STADIUM_RADIUS;
const BATTLE_TIME_LIMIT = 30; // seconds

function cryptoRandom() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / 4294967296;
}

function cryptoRange(min, max) {
  return min + cryptoRandom() * (max - min);
}

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const state = {
  participants: [],
  phase: 'idle', // idle | countdown | battle | result
  rankings: [],
  colorIndex: 0,
  soundEnabled: true,
  battleStartTime: 0,
  battleElapsed: 0,
};

function getNextColor() {
  const c = NEON_COLORS[state.colorIndex % NEON_COLORS.length];
  state.colorIndex++;
  return c;
}

// ═══════════════════════════════════════════
// SOUND ENGINE (Web Audio API)
// ═══════════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playBeep(freq = 800, duration = 0.1, vol = 0.15) {
  if (!state.soundEnabled) return;
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playCollision(intensity = 0.5) {
  if (!state.soundEnabled) return;
  ensureAudio();
  const bufSize = audioCtx.sampleRate * 0.08;
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (cryptoRandom() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  const bandpass = audioCtx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 3000 + intensity * 4000;
  bandpass.Q.value = 1.5;
  gain.gain.value = Math.min(intensity * 0.35, 0.4);
  src.connect(bandpass).connect(gain).connect(audioCtx.destination);
  src.start();
}

function playElimination() {
  if (!state.soundEnabled) return;
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.5);
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

function playVictory() {
  if (!state.soundEnabled) return;
  ensureAudio();
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playBeep(freq, 0.3, 0.2), i * 150);
  });
}

// ── EDM Background Music (procedural) ──
let edmPlaying = false;
let edmNodes = [];
let edmInterval = null;

function startEDM() {
  if (!state.soundEnabled || edmPlaying) return;
  ensureAudio();
  edmPlaying = true;
  const t = audioCtx.currentTime;
  const bpm = 140;
  const beatLen = 60 / bpm;

  // Master gain
  const master = audioCtx.createGain();
  master.gain.value = 0.12;
  master.connect(audioCtx.destination);

  // Kick drum pattern
  function scheduleKick(time) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);
    g.gain.setValueAtTime(0.7, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(g).connect(master);
    osc.start(time);
    osc.stop(time + 0.15);
    edmNodes.push(osc);
  }

  // Hi-hat (noise burst)
  function scheduleHat(time, open) {
    const bufSize = audioCtx.sampleRate * (open ? 0.08 : 0.03);
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;
    const g = audioCtx.createGain();
    g.gain.value = open ? 0.15 : 0.1;
    src.connect(hp).connect(g).connect(master);
    src.start(time);
    edmNodes.push(src);
  }

  // Bass synth
  function scheduleBass(time, freq, dur) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, time);
    lp.frequency.exponentialRampToValueAtTime(200, time + dur);
    g.gain.setValueAtTime(0.3, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(lp).connect(g).connect(master);
    osc.start(time);
    osc.stop(time + dur);
    edmNodes.push(osc);
  }

  // Lead synth arpeggio
  function scheduleLead(time, freq, dur) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    g.gain.setValueAtTime(0.08, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(lp).connect(g).connect(master);
    osc.start(time);
    osc.stop(time + dur);
    edmNodes.push(osc);
  }

  // Bass notes (E minor progression)
  const bassNotes = [82.4, 82.4, 110, 98]; // E2, E2, A2, G2
  // Lead arpeggio notes
  const leadNotes = [330, 392, 494, 392, 330, 494, 587, 494]; // E4 G4 B4 etc

  let beat = 0;
  function scheduleBar() {
    if (!edmPlaying || !state.soundEnabled) { stopEDM(); return; }
    const now = audioCtx.currentTime;
    for (let i = 0; i < 8; i++) {
      const time = now + i * (beatLen / 2);
      // Kick on every beat (1, 2, 3, 4)
      if (i % 2 === 0) scheduleKick(time);
      // Hi-hat on every 8th note, open on offbeats
      scheduleHat(time, i % 2 === 1);
      // Bass on beats 1 and 3
      if (i === 0 || i === 4) {
        const bassNote = bassNotes[(beat + Math.floor(i / 4)) % bassNotes.length];
        scheduleBass(time, bassNote, beatLen * 1.5);
      }
      // Lead arpeggio
      const leadNote = leadNotes[(beat * 8 + i) % leadNotes.length];
      scheduleLead(time, leadNote, beatLen * 0.4);
    }
    beat++;
    // Clean up old nodes
    edmNodes = edmNodes.filter(n => { try { return n.context.currentTime < n.context.currentTime + 10; } catch { return false; } });
  }

  scheduleBar();
  edmInterval = setInterval(scheduleBar, beatLen * 4 * 1000); // schedule every bar
  edmNodes.push(master);
}

function stopEDM() {
  edmPlaying = false;
  if (edmInterval) { clearInterval(edmInterval); edmInterval = null; }
  edmNodes.forEach(n => {
    try {
      if (n.stop) n.stop();
      if (n.disconnect) n.disconnect();
    } catch { /* already stopped */ }
  });
  edmNodes = [];
}

// Spin hum (continuous)
let spinOsc = null;
let spinGain = null;

function startSpinHum() {
  if (!state.soundEnabled) return;
  ensureAudio();
  spinOsc = audioCtx.createOscillator();
  spinGain = audioCtx.createGain();
  spinOsc.type = 'sawtooth';
  spinOsc.frequency.value = 80;
  spinGain.gain.value = 0;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  spinOsc.connect(lp).connect(spinGain).connect(audioCtx.destination);
  spinOsc.start();
}

function updateSpinHum(avgSpeed) {
  if (!spinOsc || !spinGain) return;
  spinOsc.frequency.value = 60 + avgSpeed * 200;
  spinGain.gain.value = Math.min(avgSpeed * 0.06, 0.08);
}

function stopSpinHum() {
  if (spinGain) spinGain.gain.value = 0;
  if (spinOsc) {
    try { spinOsc.stop(); } catch (e) { /* already stopped */ }
    spinOsc = null;
  }
  spinGain = null;
}

// ═══════════════════════════════════════════
// THREE.JS RENDERER
// ═══════════════════════════════════════════
const gameArea = document.getElementById('game-area');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 12, 8);
camera.lookAt(0, 0, 0);
const defaultCamPos = camera.position.clone();
const defaultCamTarget = new THREE.Vector3(0, 0, 0);
let camTarget = defaultCamTarget.clone();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
gameArea.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

const spotLight = new THREE.SpotLight(0x00BFFF, 0, 20, Math.PI / 6, 0.5);
spotLight.position.set(0, 10, 0);
scene.add(spotLight);

// ═══════════════════════════════════════════
// STADIUM — Nebula Glow Floor
// ═══════════════════════════════════════════
let nebulaCanvas, nebulaCtx, nebulaTex;

function createNebulaTexture() {
  nebulaCanvas = document.createElement('canvas');
  nebulaCanvas.width = 512;
  nebulaCanvas.height = 512;
  nebulaCtx = nebulaCanvas.getContext('2d');
  nebulaTex = new THREE.CanvasTexture(nebulaCanvas);
  nebulaTex.minFilter = THREE.LinearFilter;
  return nebulaTex;
}

function updateNebulaTexture(time) {
  const ctx = nebulaCtx;
  const w = 512, h = 512;
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, w, h);

  // Animated nebula blobs
  const blobs = [
    { cx: 256 + Math.sin(time * 0.3) * 80, cy: 256 + Math.cos(time * 0.4) * 60, r: 140, color: 'rgba(0, 100, 255, 0.06)' },
    { cx: 256 + Math.cos(time * 0.25) * 100, cy: 256 + Math.sin(time * 0.35) * 80, r: 120, color: 'rgba(150, 0, 255, 0.05)' },
    { cx: 256 + Math.sin(time * 0.5) * 60, cy: 256 + Math.cos(time * 0.2) * 90, r: 100, color: 'rgba(0, 200, 200, 0.05)' },
    { cx: 256 + Math.cos(time * 0.45) * 70, cy: 256 + Math.sin(time * 0.3) * 50, r: 90, color: 'rgba(255, 50, 150, 0.04)' },
  ];

  for (const b of blobs) {
    const grad = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.r);
    grad.addColorStop(0, b.color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Concentric grid circles
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let r = 40; r < 256; r += 50) {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial lines
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250);
    ctx.stroke();
  }

  nebulaTex.needsUpdate = true;
}

function createStadium() {
  const group = new THREE.Group();
  const R = STADIUM_3D_RADIUS;
  const DEPTH = 0.7; // bowl depth
  const SEGS = 64;

  // Concave bowl geometry (custom shape via LatheGeometry)
  const points = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS; // 0 = center, 1 = rim
    const r = t * R;
    // Parabolic bowl: y = -DEPTH * (1 - t^2)
    const y = -DEPTH * (1 - t * t);
    points.push(new THREE.Vector2(r, y));
  }
  const bowlGeo = new THREE.LatheGeometry(points, 64);
  const bowlMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a18,
    roughness: 0.6,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  group.add(bowl);

  // Nebula glow floor mapped onto bowl surface
  const nebulaTexture = createNebulaTexture();
  const nebulaMat = new THREE.MeshBasicMaterial({
    map: nebulaTexture,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  // Slightly offset nebula bowl to overlay
  const nebulaPoints = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    const r = t * R;
    const y = -DEPTH * (1 - t * t) + 0.01;
    nebulaPoints.push(new THREE.Vector2(r, y));
  }
  const nebulaGeo = new THREE.LatheGeometry(nebulaPoints, 64);
  // Fix UV mapping to be radial
  const nebulaPos = nebulaGeo.attributes.position;
  const nebulaUv = nebulaGeo.attributes.uv;
  for (let i = 0; i < nebulaPos.count; i++) {
    const x = nebulaPos.getX(i);
    const z = nebulaPos.getZ(i);
    nebulaUv.setXY(i, (x / R + 1) * 0.5, (z / R + 1) * 0.5);
  }
  nebulaUv.needsUpdate = true;
  const nebulaDisc = new THREE.Mesh(nebulaGeo, nebulaMat);
  group.add(nebulaDisc);

  // Grid lines on bowl surface (concentric + radial, via LineSegments)
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x00BFFF,
    transparent: true,
    opacity: 0.08,
  });
  const gridPoints = [];

  // Concentric circles on bowl
  for (let ring = 1; ring <= 5; ring++) {
    const ringR = (ring / 5) * R * 0.95;
    const ringT = ringR / R;
    const ringY = -DEPTH * (1 - ringT * ringT) + 0.02;
    for (let j = 0; j < 64; j++) {
      const a1 = (j / 64) * Math.PI * 2;
      const a2 = ((j + 1) / 64) * Math.PI * 2;
      gridPoints.push(
        new THREE.Vector3(Math.cos(a1) * ringR, ringY, Math.sin(a1) * ringR),
        new THREE.Vector3(Math.cos(a2) * ringR, ringY, Math.sin(a2) * ringR),
      );
    }
  }

  // Radial lines on bowl
  for (let j = 0; j < 12; j++) {
    const a = (j / 12) * Math.PI * 2;
    for (let s = 0; s < 20; s++) {
      const t1 = s / 20;
      const t2 = (s + 1) / 20;
      const r1 = t1 * R * 0.95, r2 = t2 * R * 0.95;
      const y1 = -DEPTH * (1 - (t1) * (t1)) + 0.02;
      const y2 = -DEPTH * (1 - (t2) * (t2)) + 0.02;
      gridPoints.push(
        new THREE.Vector3(Math.cos(a) * r1, y1, Math.sin(a) * r1),
        new THREE.Vector3(Math.cos(a) * r2, y2, Math.sin(a) * r2),
      );
    }
  }

  const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPoints);
  const gridLines = new THREE.LineSegments(gridGeo, gridMat);
  group.add(gridLines);

  // Rim glow ring
  const ringGeo = new THREE.TorusGeometry(R, 0.05, 12, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00BFFF,
    transparent: true,
    opacity: 0.5,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0;
  group.add(ring);

  // Outer soft glow
  const outerGeo = new THREE.TorusGeometry(R + 0.08, 0.15, 8, 64);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0x00BFFF,
    transparent: true,
    opacity: 0.06,
  });
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0;
  group.add(outer);

  return group;
}

const stadium = createStadium();
scene.add(stadium);

// ═══════════════════════════════════════════
// TOP (BEYBLADE) 3D MODEL
// ═══════════════════════════════════════════
function createTop3D(color) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const S = 1.6; // 팽이 크기 배율

  // 1. 메인 바디 (기존 유지)
  const discGeo = new THREE.CylinderGeometry(0.35 * S, 0.30 * S, 0.12 * S, 32);
  const discMat = new THREE.MeshPhysicalMaterial({
    color: c,
    transparent: true,
    opacity: 0.72,
    roughness: 0.1,
    metalness: 0.1,
    emissive: c,
    emissiveIntensity: 0.2,
    transmission: 0.15,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = 0.12 * S;
  group.add(disc);

  // 2. 팽이 윗면 디자인
  const decalCanvas = document.createElement('canvas');
  decalCanvas.width = 256;
  decalCanvas.height = 256;
  const dctx = decalCanvas.getContext('2d');
  dctx.clearRect(0, 0, 256, 256);
  const hexStr = '#' + c.getHexString();

  dctx.save();
  dctx.translate(128, 128);

  // --- 120도 간격의 3선 그리기 (더 길게 수정) ---
  for (let i = 0; i < 3; i++) {
    dctx.save();
    dctx.rotate(i * (Math.PI * 2 / 3)); 
    
    dctx.fillStyle = hexStr;
    dctx.globalAlpha = 0.9;
    dctx.beginPath();
    // y 위치를 -125로 늘리고 세로 길이를 120으로 확장하여 반지름 끝까지 닿게 함
    dctx.roundRect(-10, -125, 20, 120, 5); 
    dctx.fill();
    dctx.restore();
  }

  // --- 화이트 링 (투명도 30%로 수정) ---
  dctx.globalAlpha = 0.3; // 기존 0.6에서 0.3(30%)으로 변경
  dctx.strokeStyle = '#ffffff';
  dctx.lineWidth = 8; 
  dctx.beginPath();
  dctx.arc(0, 0, 85, 0, Math.PI * 2);
  dctx.stroke();
  
  dctx.restore();

  const decalTex = new THREE.CanvasTexture(decalCanvas);
  const decalGeo = new THREE.CircleGeometry(0.34 * S, 32);
  const decalMat = new THREE.MeshBasicMaterial({
    map: decalTex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const decalMesh = new THREE.Mesh(decalGeo, decalMat);
  decalMesh.rotation.x = -Math.PI / 2;
  decalMesh.position.y = 0.12 * S + 0.065 * S + 0.001;
  group.add(decalMesh);

  // 3. 공격 날개 (기존 유지)
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const bladeGeo = new THREE.BoxGeometry(0.38 * S, 0.04 * S, 0.065 * S);
    const bladeMat = new THREE.MeshPhysicalMaterial({
      color: c,
      transparent: true,
      opacity: 0.55,
      roughness: 0.05,
      metalness: 0.3,
      emissive: c,
      emissiveIntensity: 0.25,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(Math.cos(angle) * 0.24 * S, 0.12 * S, Math.sin(angle) * 0.24 * S);
    blade.rotation.y = -angle + Math.PI / 2;
    blade.rotation.z = 0.15;
    group.add(blade);
  }

  // 4. 중앙 코어 (기존 유지)
  const coreGeo = new THREE.SphereGeometry(0.08 * S, 16, 16);
  const coreMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: c, emissiveIntensity: 0.7, transparent: true, opacity: 0.9 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 0.14 * S;
  group.add(core);

  // 5. 핸들 (길이 연장 유지)
  const handleHeight = 0.35 * S; 
  const handleGeo = new THREE.CylinderGeometry(0.02 * S, 0.04 * S, handleHeight, 8);
  const handleMat = new THREE.MeshPhysicalMaterial({
    color: c,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
  });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.y = 0.12 * S + (handleHeight / 2) + 0.1 * S; 
  group.add(handle);

  // 6. 하단 팁 (기존 유지)
  const tipGeo = new THREE.ConeGeometry(0.04 * S, 0.1 * S, 8);
  const tipMat = new THREE.MeshPhysicalMaterial({ color: c, transparent: true, opacity: 0.6, metalness: 0.5 });
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.rotation.x = Math.PI;
  tip.position.y = 0.01;
  group.add(tip);

  // 조명 효과
  const light = new THREE.PointLight(color, 0.6, 2.5 * S);
  light.position.y = 0.1 * S;
  group.add(light);

  return group;
}

// Name label using canvas sprite
function createLabel(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '500 24px Inter, Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Text shadow
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(name, 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.2, 0.3, 1);
  sprite.position.y = 0.9;
  return sprite;
}

// ═══════════════════════════════════════════
// PARTICLE SYSTEM
// ═══════════════════════════════════════════
const particles = [];
const particleGeo = new THREE.SphereGeometry(0.02, 4, 4);

function spawnParticles(x, z, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.position.set(x, 0.15, z);
    const angle = cryptoRandom() * Math.PI * 2;
    const speed = 0.02 + cryptoRandom() * 0.08;
    scene.add(mesh);
    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: 0.015 + cryptoRandom() * 0.05,
      vz: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.02 + cryptoRandom() * 0.03,
    });
  }
}

function spawnTrail(x, z, color) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.45,
  });
  const mesh = new THREE.Mesh(particleGeo, mat);
  mesh.position.set(x, 0.05, z);
  scene.add(mesh);
  particles.push({
    mesh, vx: 0, vy: 0, vz: 0,
    life: 0.5, decay: 0.025,
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.vy -= 0.001; // gravity
    p.life -= p.decay;
    p.mesh.material.opacity = Math.max(0, p.life);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════════════
// MATTER.JS PHYSICS
// ═══════════════════════════════════════════
const { Engine, Bodies, Body, Events, Composite } = Matter;
const engine = Engine.create({ gravity: { x: 0, y: 0 } });
const world = engine.world;

const tops = []; // { body, mesh, label, name, color, eliminated, angularDecay, rpm }

function addTopPhysics(name, color) {
  const count = tops.filter(t => !t.eliminated).length;
  const angle = (count / Math.max(state.participants.length, 1)) * Math.PI * 2;
  const spawnR = STADIUM_RADIUS * 0.7;
  const x = Math.cos(angle) * spawnR;
  const y = Math.sin(angle) * spawnR;

  const radius = cryptoRange(14, 17);
  const body = Bodies.circle(x, y, radius, {
    mass: cryptoRange(0.6, 1.0),//무게
    restitution: cryptoRange(0.9, 1.4),//탄성
    friction: 0.001,
    frictionAir: 0.0015,//공기 저항
    frictionStatic: 0,
  });
  Composite.add(world, body);

  const mesh = createTop3D(color);
  scene.add(mesh);

  const label = createLabel(name);
  mesh.add(label);

  const top = {
    body, mesh, label, name, color,
    eliminated: false,
    angularDecay: cryptoRange(0.997, 0.999),
    rpm: 0,
    initialSpin: cryptoRange(1000, 1500),
    radius,
    trailTimer: 0,
  };
  tops.push(top);
  updateTopPosition(top);
  return top;
}

function removeTopPhysics(name) {
  const idx = tops.findIndex(t => t.name === name);
  if (idx === -1) return;
  const top = tops[idx];
  Composite.remove(world, top.body);
  scene.remove(top.mesh);
  top.mesh.traverse(child => {
    if (child.material) child.material.dispose();
    if (child.geometry) child.geometry.dispose();
  });
  tops.splice(idx, 1);
}

function updateTopPosition(top) {
  const px = top.body.position.x * PHYSICS_SCALE;
  const pz = top.body.position.y * PHYSICS_SCALE;
  top.mesh.position.set(px, 0, pz);
}

function repositionTops() {
  const active = tops.filter(t => !t.eliminated);
  active.forEach((top, i) => {
    const angle = (i / active.length) * Math.PI * 2;
    const spawnR = STADIUM_RADIUS * 0.7;
    Body.setPosition(top.body, {
      x: Math.cos(angle) * spawnR,
      y: Math.sin(angle) * spawnR,
    });
    Body.setVelocity(top.body, { x: 0, y: 0 });
    Body.setAngularVelocity(top.body, 0);
    updateTopPosition(top);
    top.mesh.rotation.set(0, 0, 0);
  });
}

// Collision events — amplified forces for dramatic ring-outs
Events.on(engine, 'collisionStart', (event) => {
  if (state.phase !== 'battle') return;
  for (const pair of event.pairs) {
    const topA = tops.find(t => t.body === pair.bodyA);
    const topB = tops.find(t => t.body === pair.bodyB);
    if (topA && topB && !topA.eliminated && !topB.eliminated) {
      const relVel = Math.sqrt(
        (pair.bodyA.velocity.x - pair.bodyB.velocity.x) ** 2 +
        (pair.bodyA.velocity.y - pair.bodyB.velocity.y) ** 2
      );
      const intensity = Math.min(relVel / 12, 1);

      // Stronger collision force — ensures ring-outs
      const nx = pair.bodyB.position.x - pair.bodyA.position.x;
      const ny = pair.bodyB.position.y - pair.bodyA.position.y;
      const dist = Math.sqrt(nx * nx + ny * ny) || 1;

      // Time pressure: forces increase as battle progresses
      // After 10s, collision knockback ramps up dramatically
      const baseFactor = 1 + (state.battleElapsed / BATTLE_TIME_LIMIT) * 1.5;
      const aggressionBoost = state.battleElapsed > 5
        ? 1 + Math.min((state.battleElapsed - 5) / 5, 1) * 2.5
        : 1;
      const timeFactor = baseFactor * aggressionBoost;
      const force = intensity * 0.012 * timeFactor;

      Body.applyForce(pair.bodyA, pair.bodyA.position, {
        x: (-nx / dist) * force,
        y: (-ny / dist) * force,
      });
      Body.applyForce(pair.bodyB, pair.bodyB.position, {
        x: (nx / dist) * force,
        y: (ny / dist) * force,
      });

      // Spark particles at collision point
      const cx = ((pair.bodyA.position.x + pair.bodyB.position.x) / 2) * PHYSICS_SCALE;
      const cz = ((pair.bodyA.position.y + pair.bodyB.position.y) / 2) * PHYSICS_SCALE;
      spawnParticles(cx, cz, 0xffffff, Math.floor(intensity * 15));

      // Colored sparks from each top
      if (intensity > 0.3) {
        spawnParticles(cx, cz, topA.color, 3);
        spawnParticles(cx, cz, topB.color, 3);
      }

      playCollision(intensity);

      // Screen shake
      if (intensity > 0.4) {
        shakeAmount = intensity * 0.1;
      }

      // Flash light
      if (intensity > 0.25) {
        flashLight.position.set(cx, 0.5, cz);
        flashLight.intensity = intensity * 4;
      }
    }
  }
});

// Flash light for collisions
const flashLight = new THREE.PointLight(0xffffff, 0, 5);
flashLight.position.y = 0.5;
scene.add(flashLight);

let shakeAmount = 0;

// ═══════════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════════
const timerDisplay = document.getElementById('timer-display');

function startBattle() {
  if (state.participants.length < 2 || state.phase !== 'idle') return;
  state.phase = 'countdown';
  state.rankings = [];
  state.battleElapsed = 0;
  updateRankingsUI();
  document.getElementById('rankings-section').style.display = 'block';
  document.getElementById('battle-btn').disabled = true;
  document.getElementById('result-overlay').classList.remove('show');
  setInputsDisabled(true);
  timerDisplay.textContent = '';
  timerDisplay.classList.remove('urgent');

  repositionTops();

  // Countdown
  const cdEl = document.getElementById('countdown');
  let count = 3;
  cdEl.style.opacity = '1';

  ensureAudio();

  const cdInterval = setInterval(() => {
    if (count > 0) {
      cdEl.textContent = count;
      cdEl.style.transform = 'translate(-50%,-50%) scale(1.3)';
      setTimeout(() => {
        cdEl.style.transform = 'translate(-50%,-50%) scale(1)';
      }, 200);
      playBeep(400 + count * 100, 0.2, 0.15);
      count--;
    } else {
      cdEl.textContent = 'GO!';
      cdEl.style.color = 'rgba(57,255,20,.9)';
      cdEl.style.textShadow = '0 0 60px rgba(57,255,20,.5)';
      playBeep(1200, 0.3, 0.2);
      clearInterval(cdInterval);
      setTimeout(() => {
        cdEl.style.opacity = '0';
        cdEl.style.color = 'rgba(0,191,255,.8)';
        cdEl.style.textShadow = '0 0 60px rgba(0,191,255,.4)';
        launchTops();
      }, 600);
    }
  }, 800);
}

function launchTops() {
  state.phase = 'battle';
  state.battleStartTime = performance.now();
  startSpinHum();

  startEDM();

  tops.forEach(top => {
    top.rpm = top.initialSpin;
    top.eliminated = false;
    // Velocity toward center with randomized speed
    const dx = -top.body.position.x;
    const dy = -top.body.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = cryptoRange(2, 3);
    Body.setVelocity(top.body, {
      x: (dx / dist) * speed,
      y: (dy / dist) * speed,
    });
  });

  document.getElementById('status-bar').textContent =
    `${tops.filter(t => !t.eliminated).length} REMAINING`;
}

function eliminateTop(top) {
  if (top.eliminated) return;
  top.eliminated = true;
  Composite.remove(world, top.body);

  // Elimination animation — Ring Out parabola
  const startPos = top.mesh.position.clone();
  const dir = startPos.clone().normalize();
  if (dir.length() < 0.01) dir.set(1, 0, 0);
  let t = 0;

  const elimAnim = () => {
    t += 0.025;
    top.mesh.position.x = startPos.x + dir.x * t * 5;
    top.mesh.position.z = startPos.z + dir.z * t * 5;
    top.mesh.position.y = Math.max(0, 0.5 * t - 2.5 * t * t) * 3;
    top.mesh.scale.setScalar(Math.max(0, 1 - t * 0.8));
    top.mesh.rotation.x += 0.12;
    top.mesh.rotation.z += 0.06;
    if (t < 1.2) {
      requestAnimationFrame(elimAnim);
    } else {
      scene.remove(top.mesh);
    }
  };
  elimAnim();

  // Explosion particles
  spawnParticles(startPos.x, startPos.z, top.color, 25);
  spawnParticles(startPos.x, startPos.z, 0xffffff, 10);

  playElimination();

  // Record ranking
  state.rankings.unshift(top);
  updateRankingsUI();

  const remaining = tops.filter(t => !t.eliminated);
  document.getElementById('status-bar').textContent =
    `${remaining.length} REMAINING`;

  // Check for winner
  if (remaining.length === 1) {
    setTimeout(() => endBattle(remaining[0]), 1500);
  }

  // Climax: zoom when 2-3 left
  if (remaining.length <= 3 && remaining.length > 1) {
    const cx = remaining.reduce((s, t) => s + t.body.position.x, 0) / remaining.length * PHYSICS_SCALE;
    const cz = remaining.reduce((s, t) => s + t.body.position.y, 0) / remaining.length * PHYSICS_SCALE;
    camTarget.set(cx, 0, cz);
  }
}

// Force eliminate the top furthest from center (time limit fallback)
function forceEliminateFurthest() {
  const active = tops.filter(t => !t.eliminated);
  if (active.length <= 1) return;

  let furthest = null;
  let maxDist = -1;
  for (const top of active) {
    const dist = Math.sqrt(top.body.position.x ** 2 + top.body.position.y ** 2);
    if (dist > maxDist) {
      maxDist = dist;
      furthest = top;
    }
  }
  if (furthest) eliminateTop(furthest);
}

function endBattle(winner) {
  state.phase = 'result';
  state.rankings.unshift(winner);
  stopSpinHum();
  stopEDM();

  // Spotlight on winner
  spotLight.intensity = 2.5;
  spotLight.position.set(winner.mesh.position.x, 8, winner.mesh.position.z);
  spotLight.target = winner.mesh;

  playVictory();

  // Confetti
  const rect = gameArea.getBoundingClientRect();
  const cx = (rect.left + rect.width / 2) / window.innerWidth;
  const cy = (rect.top + rect.height / 2) / window.innerHeight;
  const fire = (opts) => confetti({ origin: { x: cx, y: cy }, ...opts });
  fire({ spread: 80, particleCount: 100, startVelocity: 45 });
  setTimeout(() => fire({ spread: 100, particleCount: 80 }), 300);
  setTimeout(() => fire({ spread: 120, particleCount: 100 }), 600);
  setTimeout(() => fire({ spread: 60, particleCount: 50, startVelocity: 30 }), 900);

  document.getElementById('status-bar').textContent = '';
  timerDisplay.textContent = '';

  setTimeout(() => showResult(), 2500);
}

function showResult() {
  const overlay = document.getElementById('result-overlay');
  const list = document.getElementById('result-list');
  list.innerHTML = '';

  state.rankings.forEach((top, i) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    const rank = i + 1;
    const medal = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
    div.textContent = `${medal}  ${top.name}`;
    div.style.animationDelay = `${i * 0.08}s`;
    list.appendChild(div);
  });

  overlay.classList.add('show');
}

function resetGame() {
  state.phase = 'idle';
  state.rankings = [];
  state.battleElapsed = 0;
  stopSpinHum();
  stopEDM();
  spotLight.intensity = 0;

  // Remove all physics bodies and meshes
  tops.forEach(t => {
    try { Composite.remove(world, t.body); } catch (e) { /* already removed */ }
    scene.remove(t.mesh);
  });
  tops.length = 0;

  // Clear particles
  particles.forEach(p => {
    scene.remove(p.mesh);
    p.mesh.material.dispose();
  });
  particles.length = 0;

  // Re-create tops from participant list
  state.participants.forEach(p => {
    addTopPhysics(p.name, p.color);
  });

  // Reset camera
  camera.position.copy(defaultCamPos);
  camTarget.copy(defaultCamTarget);

  // UI
  document.getElementById('result-overlay').classList.remove('show');
  document.getElementById('rankings-section').style.display = 'none';
  document.getElementById('rankings').innerHTML = '';
  document.getElementById('battle-btn').disabled = state.participants.length < 2;
  document.getElementById('status-bar').textContent = '';
  document.getElementById('countdown').textContent = '';
  timerDisplay.textContent = '';
  timerDisplay.classList.remove('urgent');
  setInputsDisabled(false);
}

// ═══════════════════════════════════════════
// PHYSICS LOOP
// ═══════════════════════════════════════════
function physicsTick() {
  if (state.phase !== 'battle') return;

  Engine.update(engine, 1000 / 60);

  // Timer
  state.battleElapsed = (performance.now() - state.battleStartTime) / 1000;
  const remaining = Math.max(0, BATTLE_TIME_LIMIT - state.battleElapsed);
  timerDisplay.textContent = remaining.toFixed(1) + 's';
  if (remaining < 10) timerDisplay.classList.add('urgent');

  // Force eliminations when time is running out
  if (remaining <= 0) {
    forceEliminateFurthest();
  }

  let avgSpeed = 0;
  const active = tops.filter(t => !t.eliminated);

  // Progressive central gravity — increases over time to force encounters
  const timeRatio = Math.min(state.battleElapsed / BATTLE_TIME_LIMIT, 1);

  active.forEach(top => {
    const dx = -top.body.position.x;
    const dy = -top.body.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Central pull increases over time
    const baseGrav = 0.00008;//기본 중력
    const gravBoost = timeRatio * 0.001;//시간이 흐를수록 중앙으로 강하게 당김
    const gravForce = (baseGrav + gravBoost) * (dist / STADIUM_RADIUS);
    Body.applyForce(top.body, top.body.position, {
      x: (dx / dist) * gravForce,
      y: (dy / dist) * gravForce,
    });

    // After 10s: tops actively seek nearest opponent
    if (state.battleElapsed > 6) {
      let nearest = null;
      let nearestDist = Infinity;
      for (const other of active) {
        if (other === top) continue;
        const odx = other.body.position.x - top.body.position.x;
        const ody = other.body.position.y - top.body.position.y;
        const od = Math.sqrt(odx * odx + ody * ody);
        if (od < nearestDist) {
          nearestDist = od;
          nearest = other;
        }
      }
      if (nearest) {
        const seekDx = nearest.body.position.x - top.body.position.x;
        const seekDy = nearest.body.position.y - top.body.position.y;
        const seekDist = Math.sqrt(seekDx * seekDx + seekDy * seekDy) || 1;
        // Seek force escalates from 10s to 30s
        const seekPhase = Math.min((state.battleElapsed - 5) / 25, 1);
        const seekForce = 0.0003 + seekPhase * 0.0012;
        Body.applyForce(top.body, top.body.position, {
          x: (seekDx / seekDist) * seekForce,
          y: (seekDy / seekDist) * seekForce,
        });
      }
    }

    // Random nudges to prevent stalemates (after 15s)
    if (state.battleElapsed > 15 && cryptoRandom() < 0.02) {
      const nudgeAngle = cryptoRandom() * Math.PI * 2;
      const nudgeForce = 0.002 * timeRatio;
      Body.applyForce(top.body, top.body.position, {
        x: Math.cos(nudgeAngle) * nudgeForce,
        y: Math.sin(nudgeAngle) * nudgeForce,
      });
    }

    // RPM decay
    top.rpm *= top.angularDecay;

    // Speed tracking
    const speed = Math.sqrt(top.body.velocity.x ** 2 + top.body.velocity.y ** 2);
    avgSpeed += speed;

    // Check elimination (outside stadium)
    if (dist > STADIUM_RADIUS * 1.1) {
      eliminateTop(top);
    }
  });

  avgSpeed /= Math.max(active.length, 1);
  updateSpinHum(avgSpeed / 10);
}

// ═══════════════════════════════════════════
// RENDER LOOP
// ═══════════════════════════════════════════
let frameCount = 0;

function animate() {
  requestAnimationFrame(animate);
  frameCount++;

  const time = performance.now() * 0.0015;

  physicsTick();

  // Update nebula floor
  updateNebulaTexture(time);

  // Update 3D positions from physics
  tops.forEach(top => {
    if (top.eliminated) return;
    updateTopPosition(top);

    // Spin rotation
    top.mesh.rotation.y += top.rpm * 0.0003;

    // Precession when RPM low
    if (top.rpm < 400 && state.phase === 'battle') {
      const wobble = (1 - top.rpm / 400) * 0.15;
      top.mesh.rotation.x = Math.sin(frameCount * 0.05) * wobble;
      top.mesh.rotation.z = Math.cos(frameCount * 0.05) * wobble;
    }

    // Trail particles
    if (state.phase === 'battle' && frameCount % 3 === 0) {
      const speed = Math.sqrt(top.body.velocity.x ** 2 + top.body.velocity.y ** 2);
      if (speed > 1.2) {
        spawnTrail(top.mesh.position.x, top.mesh.position.z, top.color);
      }
    }
  });

  // Update particles
  updateParticles();

  // Flash light decay
  if (flashLight.intensity > 0) {
    flashLight.intensity *= 0.83;
    if (flashLight.intensity < 0.01) flashLight.intensity = 0;
  }

  // Camera
  if (state.phase === 'battle') {
    const active = tops.filter(t => !t.eliminated);
    if (active.length <= 3 && active.length > 0) {
      const cx = active.reduce((s, t) => s + t.mesh.position.x, 0) / active.length;
      const cz = active.reduce((s, t) => s + t.mesh.position.z, 0) / active.length;
      camTarget.lerp(new THREE.Vector3(cx, 0, cz), 0.03);
      camera.position.lerp(new THREE.Vector3(cx, 9, cz + 6), 0.02);
    }
  } else if (state.phase === 'result') {
    // Stay on winner
  } else {
    camera.position.lerp(defaultCamPos, 0.03);
    camTarget.lerp(defaultCamTarget, 0.03);
  }
  camera.lookAt(camTarget);

  // Screen shake
  if (shakeAmount > 0.001) {
    camera.position.x += (cryptoRandom() - 0.5) * shakeAmount;
    camera.position.y += (cryptoRandom() - 0.5) * shakeAmount;
    shakeAmount *= 0.88;
  }

  renderer.render(scene, camera);
}

// ═══════════════════════════════════════════
// UI LOGIC
// ═══════════════════════════════════════════
const participantsEl = document.getElementById('participants');
const nameInput = document.getElementById('name-input');
const countDisplay = document.getElementById('count-display');
const battleBtn = document.getElementById('battle-btn');

function setInputsDisabled(disabled) {
  nameInput.disabled = disabled;
  document.getElementById('add-btn').disabled = disabled;
  document.getElementById('event-title').disabled = disabled;
  participantsEl.querySelectorAll('.remove').forEach(b => (b.disabled = disabled));
}

function addParticipant(name) {
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

function renderParticipants() {
  participantsEl.innerHTML = '';
  state.participants.forEach(p => {
    const div = document.createElement('div');
    div.className = 'participant';
    const c = new THREE.Color(p.color);
    const hex = '#' + c.getHexString();
    div.innerHTML = `
      <span class="dot" style="background:${hex};color:${hex}"></span>
      <span class="name">${escapeHtml(p.name)}</span>
      <button class="remove" data-name="${escapeHtml(p.name)}">&times;</button>
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

function updateRankingsUI() {
  const el = document.getElementById('rankings');
  el.innerHTML = '';
  const total = state.rankings.length + tops.filter(t => !t.eliminated).length;
  state.rankings.forEach((top, i) => {
    const rank = total - i;
    const div = document.createElement('div');
    div.className = 'rank-item';
    const c = new THREE.Color(top.color);
    div.innerHTML = `
      <span class="rank-num">${rank}</span>
      <span class="rank-dot" style="background:#${c.getHexString()}"></span>
      <span class="rank-name">${escapeHtml(top.name)}</span>
    `;
    el.appendChild(div);
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Parse multiple names (comma, newline, tab separated)
function parseNames(text) {
  return text
    .split(/[,\n\r\t]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ── Event Listeners ──

nameInput.addEventListener('keydown', (e) => {
  // 1. IME 입력 중(한글 조합 중)인 경우 이벤트 무시 (이게 핵심입니다!)
  if (e.isComposing || e.keyCode === 229) return;

  if (e.key === 'Enter') {
    e.preventDefault(); // 엔터 시 페이지 새로고침 방지
    
    const val = nameInput.value.trim();
    if (val) {
      const names = parseNames(val);
      names.forEach(n => addParticipant(n));
      nameInput.value = ''; // 입력 후 입력창 비우기
    }
  }
});

nameInput.addEventListener('paste', (e) => {
  setTimeout(() => {
    const names = parseNames(nameInput.value);
    if (names.length > 1) {
      names.forEach(n => addParticipant(n));
      nameInput.value = '';
    }
  }, 0);
});

document.getElementById('add-btn').addEventListener('click', () => {
  const names = parseNames(nameInput.value);
  names.forEach(n => addParticipant(n));
  nameInput.value = '';
});

battleBtn.addEventListener('click', () => startBattle());

document.getElementById('btn-retry').addEventListener('click', () => resetGame());

document.getElementById('btn-copy').addEventListener('click', () => {
  const title = document.getElementById('event-title').value || 'Metal Blade Battle';
  let text = `${title} \u2014 Results\n`;
  text += '\u2500'.repeat(30) + '\n';
  state.rankings.forEach((top, i) => {
    text += `${i + 1}. ${top.name}\n`;
  });
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy Results';
    }, 1500);
  });
});

// CSV upload
document.getElementById('csv-upload-btn').addEventListener('click', () => {
  document.getElementById('csv-input').click();
});

document.getElementById('csv-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const text = evt.target.result;
    const names = text
      .split(/[,\n\r\t]+/)
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(s => s.length > 0);
    names.forEach(n => addParticipant(n));
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Shuffle participants
document.getElementById('shuffle-btn').addEventListener('click', () => {
  if (state.phase !== 'idle' || state.participants.length < 2) return;

  // Fisher-Yates shuffle
  for (let i = state.participants.length - 1; i > 0; i--) {
    const j = Math.floor(cryptoRandom() * (i + 1));
    [state.participants[i], state.participants[j]] = [state.participants[j], state.participants[i]];
  }

  // Reassign colors randomly
  const shuffledColors = [...NEON_COLORS];
  for (let i = shuffledColors.length - 1; i > 0; i--) {
    const j = Math.floor(cryptoRandom() * (i + 1));
    [shuffledColors[i], shuffledColors[j]] = [shuffledColors[j], shuffledColors[i]];
  }
  state.participants.forEach((p, i) => {
    p.color = shuffledColors[i % shuffledColors.length];
  });

  // Rebuild tops with new colors
  tops.forEach(t => {
    try { Composite.remove(world, t.body); } catch (e) { /* */ }
    scene.remove(t.mesh);
    t.mesh.traverse(child => {
      if (child.material) child.material.dispose();
      if (child.geometry) child.geometry.dispose();
    });
  });
  tops.length = 0;
  state.participants.forEach(p => addTopPhysics(p.name, p.color));

  renderParticipants();
  saveToLocalStorage();

  const btn = document.getElementById('shuffle-btn');
  btn.textContent = 'Shuffled!';
  setTimeout(() => { btn.textContent = 'Shuffle'; }, 1000);
});

// Sound toggle
const soundBtn = document.getElementById('sound-toggle');
soundBtn.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  soundBtn.innerHTML = state.soundEnabled ? '&#x1f50a;' : '&#x1f507;';
  soundBtn.style.opacity = state.soundEnabled ? '1' : '0.5';
});

// Mobile panel toggle
const mobileToggle = document.getElementById('mobile-toggle');
if (mobileToggle) {
  mobileToggle.addEventListener('click', () => {
    const panel = document.getElementById('panel');
    panel.classList.toggle('collapsed');
    mobileToggle.textContent = panel.classList.contains('collapsed') ? '+' : '\u2212';
  });
}

// ═══════════════════════════════════════════
// URL SHARING & LOCAL STORAGE
// ═══════════════════════════════════════════
function saveToLocalStorage() {
  const data = {
    participants: state.participants.map(p => p.name),
    eventTitle: document.getElementById('event-title').value,
  };
  localStorage.setItem('metalBlade', JSON.stringify(data));
}

function loadFromLocalStorage() {
  // Check URL params first
  const params = new URLSearchParams(window.location.search);
  const urlNames = params.get('names');
  const urlTitle = params.get('title');

  if (urlNames) {
    document.getElementById('event-title').value = urlTitle || '';
    urlNames.split(',').forEach(n => addParticipant(decodeURIComponent(n)));
    return;
  }

  // Then localStorage
  try {
    const raw = localStorage.getItem('metalBlade');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.eventTitle) {
      document.getElementById('event-title').value = data.eventTitle;
    }
    if (data.participants) {
      data.participants.forEach(n => addParticipant(n));
    }
  } catch (e) {
    /* ignore corrupt data */
  }
}

// Save event title changes
document.getElementById('event-title').addEventListener('input', saveToLocalStorage);

// ═══════════════════════════════════════════
// RESIZE
// ═══════════════════════════════════════════
function onResize() {
  const w = gameArea.clientWidth;
  const h = gameArea.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
onResize();
loadFromLocalStorage();
animate();
