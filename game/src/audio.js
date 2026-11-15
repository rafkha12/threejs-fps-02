// Synthesized sound only — no audio files, no network. A small helper
// builds each effect from oscillators and filtered noise at call time, so
// nothing is decoded or loaded. Created lazily on the first user gesture,
// because browsers forbid audio before one.
let ctx = null;
let master = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function noiseBuffer(seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function burst({ duration, freq, type, gain, slideTo }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise({ duration, freq, gain, q }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q ?? 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  source.connect(filter);
  filter.connect(g);
  g.connect(master);
  source.start(t);
  source.stop(t + duration + 0.02);
}

export const sfx = {
  shot(kind) {
    if (kind === 'rifle') {
      noise({ duration: 0.12, freq: 900, gain: 0.5 });
      burst({ duration: 0.09, freq: 160, type: 'square', gain: 0.25, slideTo: 60 });
    } else if (kind === 'smg') {
      noise({ duration: 0.08, freq: 1200, gain: 0.4 });
    } else if (kind === 'marksman') {
      noise({ duration: 0.25, freq: 500, gain: 0.7 });
      burst({ duration: 0.2, freq: 110, type: 'square', gain: 0.35, slideTo: 40 });
    } else if (kind === 'shotgun') {
      noise({ duration: 0.2, freq: 700, gain: 0.65 });
      burst({ duration: 0.15, freq: 130, type: 'sawtooth', gain: 0.3, slideTo: 50 });
    } else {
      noise({ duration: 0.09, freq: 1100, gain: 0.35 });
    }
  },
  distantShot() {
    noise({ duration: 0.14, freq: 500, gain: 0.16 });
  },
  dryFire() {
    burst({ duration: 0.05, freq: 1400, type: 'square', gain: 0.12 });
  },
  reload() {
    burst({ duration: 0.05, freq: 900, type: 'square', gain: 0.12 });
    setTimeout(() => burst({ duration: 0.05, freq: 700, type: 'square', gain: 0.12 }), 260);
  },
  hit() {
    burst({ duration: 0.06, freq: 1900, type: 'sine', gain: 0.3 });
  },
  kill() {
    burst({ duration: 0.09, freq: 1200, type: 'sine', gain: 0.3 });
    setTimeout(() => burst({ duration: 0.12, freq: 1800, type: 'sine', gain: 0.3 }), 80);
  },
  hurt() {
    burst({ duration: 0.15, freq: 220, type: 'sawtooth', gain: 0.3, slideTo: 90 });
  },
  plantBeep() {
    burst({ duration: 0.07, freq: 980, type: 'sine', gain: 0.25 });
  },
  defuseBeep() {
    burst({ duration: 0.07, freq: 660, type: 'sine', gain: 0.25 });
  },
  explosion() {
    noise({ duration: 0.9, freq: 220, gain: 0.9, q: 0.5 });
    burst({ duration: 0.7, freq: 70, type: 'sine', gain: 0.7, slideTo: 28 });
  },
  buy() {
    burst({ duration: 0.08, freq: 880, type: 'sine', gain: 0.25 });
    setTimeout(() => burst({ duration: 0.1, freq: 1320, type: 'sine', gain: 0.25 }), 70);
  },
  roundWin() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => burst({ duration: 0.16, freq: f, type: 'sine', gain: 0.28 }), i * 110));
  },
  roundLose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => burst({ duration: 0.18, freq: f, type: 'sine', gain: 0.25 }), i * 120));
  },
};
