import { buildorEvents } from './buildorEvents';

let audioCtx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(gain, ctx.currentTime + delay);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
  osc.connect(vol);
  vol.connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration);
}

/** Two-tone ascending chime — permission needed */
export function soundPermission() {
  playTone(523, 0.15, 'sine', 0.12);       // C5
  playTone(659, 0.2, 'sine', 0.12, 0.12);  // E5
}

/** Low descending tone — error */
export function soundError() {
  playTone(220, 0.3, 'triangle', 0.15);      // A3
  playTone(147, 0.4, 'triangle', 0.12, 0.2); // D3
}

/** Bright ding — task complete */
export function soundComplete() {
  playTone(784, 0.12, 'sine', 0.1);         // G5
  playTone(1047, 0.18, 'sine', 0.06, 0.08); // C6 harmonic
}

export function setMuted(m: boolean) { muted = m; }
export function isMuted() { return muted; }

// Auto-wire to event bus
buildorEvents.on('permission-required', () => soundPermission());
buildorEvents.on('error-occurred', () => soundError());
buildorEvents.on('turn-completed', () => soundComplete());
