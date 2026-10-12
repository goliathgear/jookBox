// Synthesized wallbox sounds, so there are no audio files to ship.
// Browsers only allow audio after a user gesture: unlockAudio() runs on the
// first click or key press, and every sound before that is silently skipped.

let ctx: AudioContext | null = null;
let enabled = true;
let noise: AudioBuffer | null = null;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function unlockAudio() {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function audio(): AudioContext | null {
  return enabled && ctx && ctx.state === 'running' ? ctx : null;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function envelope(c: AudioContext, peak: number, attack: number, decay: number, at = c.currentTime) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  gain.connect(c.destination);
  return gain;
}

function tone(c: AudioContext, type: OscillatorType, from: number, to: number, out: AudioNode, length: number, at = c.currentTime) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + length);
  osc.connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

function burst(c: AudioContext, filter: BiquadFilterType, freq: number, out: AudioNode, length: number, sweepTo?: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, c.currentTime);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + length);
  src.connect(f).connect(out);
  src.start();
  src.stop(c.currentTime + length + 0.02);
}

export const sfx = {
  /** A stiff title page swinging over. */
  flip() {
    const c = audio();
    if (!c) return;
    burst(c, 'bandpass', 2400, envelope(c, 0.22, 0.012, 0.14), 0.16, 500);
    tone(c, 'sine', 150, 60, envelope(c, 0.18, 0.005, 0.09, c.currentTime + 0.1), 0.1, c.currentTime + 0.1);
  },
  /** Bakelite push button. */
  click() {
    const c = audio();
    if (!c) return;
    burst(c, 'lowpass', 2500, envelope(c, 0.2, 0.002, 0.04), 0.05);
    tone(c, 'triangle', 700, 300, envelope(c, 0.08, 0.002, 0.05), 0.05);
  },
  /** Selection accepted. */
  bell() {
    const c = audio();
    if (!c) return;
    tone(c, 'sine', 1318.5, 1318.5, envelope(c, 0.12, 0.004, 1.1), 1.2);
    tone(c, 'sine', 1975.5, 1975.5, envelope(c, 0.06, 0.004, 0.8, c.currentTime + 0.09), 0.9, c.currentTime + 0.09);
  },
  /** No such selection. */
  buzz() {
    const c = audio();
    if (!c) return;
    const out = envelope(c, 0.07, 0.01, 0.2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(out);
    tone(c, 'sawtooth', 110, 104, lp, 0.22);
  },
  /** The rack hit its end stop. */
  thunk() {
    const c = audio();
    if (!c) return;
    tone(c, 'sine', 110, 55, envelope(c, 0.25, 0.004, 0.12), 0.13);
  },
};
