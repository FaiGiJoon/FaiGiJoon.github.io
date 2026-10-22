// Tiny Web Audio synth: Game Boy style blips, no audio files needed.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('red-battle-muted') === '1'; } catch { /* storage unavailable */ }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('red-battle-muted', m ? '1' : '0'); } catch { /* ignore */ }
}

// One oscillator note: freq may be a number or [start, end] for a slide.
function tone({ freq, dur = 0.1, type = 'square', vol = 0.06, at = 0 }) {
  const a = ac(); if (!a || muted) return;
  const t0 = a.currentTime + at;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type;
  const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.07, at = 0, hp = 800 }) {
  const a = ac(); if (!a || muted) return;
  const t0 = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

// Attack cue, shaped by move type.
const MOVE_CUES = {
  ELECTRIC: () => { for (let i = 0; i < 6; i++) tone({ freq: i % 2 ? 1800 : 900, dur: 0.05, at: i * 0.045, type: 'sawtooth' }); },
  FIRE: () => { noise({ dur: 0.35, hp: 400 }); tone({ freq: [300, 900], dur: 0.3, type: 'sawtooth', vol: 0.04 }); },
  WATER: () => { tone({ freq: [900, 300], dur: 0.25, type: 'sine', vol: 0.08 }); noise({ dur: 0.2, hp: 2000, vol: 0.04 }); },
  GRASS: () => { tone({ freq: [400, 800], dur: 0.12, type: 'triangle', vol: 0.08 }); tone({ freq: [500, 1000], dur: 0.12, at: 0.1, type: 'triangle', vol: 0.08 }); },
  ICE: () => { for (let i = 0; i < 4; i++) tone({ freq: 1400 + i * 300, dur: 0.08, at: i * 0.06, type: 'triangle', vol: 0.07 }); },
  PSYCHIC: () => { tone({ freq: [300, 1200], dur: 0.4, type: 'sine', vol: 0.08 }); tone({ freq: [1200, 300], dur: 0.4, at: 0.2, type: 'sine', vol: 0.05 }); },
  GHOST: () => { tone({ freq: [200, 80], dur: 0.45, type: 'sawtooth', vol: 0.05 }); },
  DARK: () => { tone({ freq: [250, 70], dur: 0.3, type: 'square', vol: 0.06 }); noise({ dur: 0.15, hp: 300, at: 0.1 }); },
  DRAGON: () => { tone({ freq: [150, 500], dur: 0.35, type: 'sawtooth', vol: 0.06 }); noise({ dur: 0.3, hp: 300 }); },
  FIGHTING: () => { noise({ dur: 0.08, hp: 500, vol: 0.1 }); tone({ freq: [200, 90], dur: 0.12, vol: 0.08 }); },
  FLYING: () => { noise({ dur: 0.3, hp: 3000, vol: 0.05 }); tone({ freq: [600, 1100], dur: 0.2, type: 'triangle', vol: 0.05 }); },
  GROUND: () => { noise({ dur: 0.35, hp: 100, vol: 0.1 }); tone({ freq: [120, 50], dur: 0.3, vol: 0.08 }); },
  ROCK: () => { noise({ dur: 0.2, hp: 200, vol: 0.1 }); tone({ freq: [180, 60], dur: 0.2, vol: 0.08 }); },
  POISON: () => { tone({ freq: [500, 250], dur: 0.2, type: 'sine', vol: 0.07 }); tone({ freq: [450, 200], dur: 0.2, at: 0.15, type: 'sine', vol: 0.07 }); },
  BUG: () => { for (let i = 0; i < 5; i++) tone({ freq: 1200 + (i % 2) * 200, dur: 0.04, at: i * 0.05, type: 'square', vol: 0.04 }); },
  STEEL: () => { tone({ freq: 2200, dur: 0.15, type: 'triangle', vol: 0.07 }); tone({ freq: 3300, dur: 0.12, at: 0.02, type: 'triangle', vol: 0.04 }); },
  NORMAL: () => { tone({ freq: [500, 250], dur: 0.1, vol: 0.07 }); },
};

export function moveCue(type) { (MOVE_CUES[type] || MOVE_CUES.NORMAL)(); }

// Impact cue after the attack lands.
export function hitCue(kind) {
  if (kind === 'super') { noise({ dur: 0.18, hp: 400, vol: 0.12 }); tone({ freq: [300, 80], dur: 0.2, vol: 0.1 }); tone({ freq: 700, dur: 0.1, at: 0.12, vol: 0.06 }); }
  else if (kind === 'weak') { noise({ dur: 0.08, hp: 1500, vol: 0.05 }); tone({ freq: [250, 180], dur: 0.1, vol: 0.05 }); }
  else if (kind === 'crit') { noise({ dur: 0.22, hp: 300, vol: 0.14 }); tone({ freq: [500, 60], dur: 0.25, vol: 0.12 }); }
  else { noise({ dur: 0.12, hp: 600, vol: 0.09 }); tone({ freq: [350, 120], dur: 0.14, vol: 0.08 }); }
}

export function missCue() { tone({ freq: [700, 350], dur: 0.2, type: 'triangle', vol: 0.05 }); }
export function faintCue() { tone({ freq: [600, 80], dur: 0.7, type: 'square', vol: 0.07 }); }
export function sendOutCue() { tone({ freq: 600, dur: 0.08 }); tone({ freq: 900, dur: 0.12, at: 0.08 }); }
export function blip() { tone({ freq: 880, dur: 0.025, vol: 0.025 }); }
export function selectCue() { tone({ freq: 1000, dur: 0.04, vol: 0.04 }); }
export function winCue() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, at: i * 0.14, vol: 0.07 })); }
export function loseCue() { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.25, at: i * 0.2, vol: 0.07 })); }
