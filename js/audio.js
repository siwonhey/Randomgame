import { state } from './state.js';
import { cryptoRandom } from './config.js';

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let audioUnlocked = false;

export function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function playBeep(freq = 800, duration = 0.1, vol = 0.15) {
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

export function playCollision(intensity = 0.5) {
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

export function playElimination() {
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

export function playVictory() {
  if (!state.soundEnabled) return;
  ensureAudio();
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => setTimeout(() => playBeep(freq, 0.3, 0.2), i * 150));
}

// ── Procedural EDM loop ──
let edmPlaying = false;
let edmNodes = [];
let edmInterval = null;
let edmMaster = null;
let edmTargetVolume = 0.06;
let edmMode = 'idle';
const EDM_VOLUME = { idle: 0.06, battle: 0.16 };

// Smooth ramp the EDM bus gain — used to dim BGM on the result screen
// without stopping/restarting the loop, then restore on reset.
export function setEDMVolume(vol, rampSeconds = 0.4) {
  edmTargetVolume = vol;
  if (!edmMaster || !audioCtx) return;
  const now = audioCtx.currentTime;
  edmMaster.gain.cancelScheduledValues(now);
  edmMaster.gain.setValueAtTime(edmMaster.gain.value, now);
  edmMaster.gain.linearRampToValueAtTime(vol, now + rampSeconds);
}

export function setEDMMode(mode) {
  edmMode = mode === 'battle' ? 'battle' : 'idle';
  edmTargetVolume = EDM_VOLUME[edmMode];
  if (edmPlaying) {
    setEDMVolume(edmTargetVolume, 0.4);
  }
}

export function startEDM(mode = 'idle') {
  edmMode = mode === 'battle' ? 'battle' : 'idle';
  edmTargetVolume = EDM_VOLUME[edmMode];
  if (!state.soundEnabled) return;
  if (edmPlaying) {
    setEDMMode(edmMode);
    return;
  }
  ensureAudio();

  // If the AudioContext is still suspended (browser autoplay policy blocks
  // it until a user gesture), defer the actual scheduling until it resumes.
  // Scheduling oscillators while suspended causes them to pile up at the
  // frozen currentTime — they'd all fire simultaneously on resume.
  if (audioCtx.state !== 'running') {
    const onReady = () => {
      if (audioCtx.state === 'running') {
        audioCtx.removeEventListener('statechange', onReady);
        startEDM(edmMode);
      }
    };
    audioCtx.addEventListener('statechange', onReady);
    return;
  }

  edmPlaying = true;
  const bpm = 140;
  const beatLen = 60 / bpm;

  const master = audioCtx.createGain();
  master.gain.value = edmTargetVolume;
  master.connect(audioCtx.destination);
  edmMaster = master;

  function scheduleKick(time) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);
    g.gain.setValueAtTime(edmMode === 'battle' ? 0.75 : 0.45, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(g).connect(master);
    osc.start(time);
    osc.stop(time + 0.15);
    edmNodes.push(osc);
  }

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
    if (open) g.gain.value = edmMode === 'battle' ? 0.16 : 0.1;
    else g.gain.value = edmMode === 'battle' ? 0.11 : 0.08;
    src.connect(hp).connect(g).connect(master);
    src.start(time);
    edmNodes.push(src);
  }

  function scheduleBass(time, freq, dur) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, time);
    lp.frequency.exponentialRampToValueAtTime(200, time + dur);
    g.gain.setValueAtTime(edmMode === 'battle' ? 0.28 : 0.16, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(lp).connect(g).connect(master);
    osc.start(time);
    osc.stop(time + dur);
    edmNodes.push(osc);
  }

  function scheduleLead(time, freq, dur) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    g.gain.setValueAtTime(edmMode === 'battle' ? 0.1 : 0.05, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(lp).connect(g).connect(master);
    osc.start(time);
    osc.stop(time + dur);
    edmNodes.push(osc);
  }

  const bassNotes = [82.4, 82.4, 110, 98];
  const leadNotes = [330, 392, 494, 392, 330, 494, 587, 494];

  let beat = 0;
  function scheduleBar() {
    if (!edmPlaying || !state.soundEnabled) { stopEDM(); return; }
    const now = audioCtx.currentTime;
    for (let i = 0; i < 8; i++) {
      const time = now + i * (beatLen / 2);
      if (i % 2 === 0) scheduleKick(time);
      scheduleHat(time, i % 2 === 1);
      if (i === 0 || i === 4) {
        const bassNote = bassNotes[(beat + Math.floor(i / 4)) % bassNotes.length];
        scheduleBass(time, bassNote, beatLen * 1.5);
      }
      const leadNote = leadNotes[(beat * 8 + i) % leadNotes.length];
      scheduleLead(time, leadNote, beatLen * 0.4);
    }
    beat++;
  }

  scheduleBar();
  edmInterval = setInterval(scheduleBar, beatLen * 4 * 1000);
  edmNodes.push(master);
}

export function playWhoosh() {
  if (!state.soundEnabled) return;
  ensureAudio();
  const duration = 0.18;
  const bufSize = Math.floor(audioCtx.sampleRate * duration);
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const t = i / bufSize;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2);
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1200, audioCtx.currentTime);
  filter.Q.value = 0.9;
  filter.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + duration);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start();
}

export function stopEDM() {
  edmPlaying = false;
  if (edmInterval) { clearInterval(edmInterval); edmInterval = null; }
  edmNodes.forEach(n => {
    try { if (n.stop) n.stop(); if (n.disconnect) n.disconnect(); } catch { /* noop */ }
  });
  edmNodes = [];
  edmMaster = null;
}

// ── Spin hum ──
let spinOsc = null;
let spinGain = null;

export function startSpinHum() {
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

export function updateSpinHum(avgSpeed) {
  if (!spinOsc || !spinGain) return;
  spinOsc.frequency.value = 60 + avgSpeed * 200;
  spinGain.gain.value = Math.min(avgSpeed * 0.06, 0.08);
}

export function stopSpinHum() {
  if (spinGain) spinGain.gain.value = 0;
  if (spinOsc) {
    try { spinOsc.stop(); } catch { /* noop */ }
    spinOsc = null;
  }
  spinGain = null;
}

export function unlockAudio() {
  if (audioUnlocked) return;

  ensureAudio();

  audioUnlocked = true;

  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
}