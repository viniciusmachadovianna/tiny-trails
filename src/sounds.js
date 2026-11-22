let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

window.addEventListener("keydown", () => getCtx(), { once: true });

function tone({ type = "square", from, to, duration, volume = 0.12, delay = 0 }) {
  const c = getCtx();
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function noise({ duration, volume = 0.2, filter = 1200 }) {
  const c = getCtx();
  const size = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, size, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  const source = c.createBufferSource();
  source.buffer = buffer;
  const lowpass = c.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = filter;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  source.connect(lowpass).connect(gain).connect(c.destination);
  source.start();
}

export function playHop() {
  tone({ type: "sine", from: 300, to: 600, duration: 0.08, volume: 0.1 });
}

export function playShoot() {
  tone({ type: "square", from: 900, to: 150, duration: 0.12, volume: 0.1 });
  noise({ duration: 0.08, volume: 0.1, filter: 3000 });
}

export function playZombieHit() {
  noise({ duration: 0.2, volume: 0.2, filter: 900 });
  tone({ type: "sawtooth", from: 220, to: 60, duration: 0.2, volume: 0.12 });
}

export function playGroan() {
  tone({ type: "sawtooth", from: 100, to: 55, duration: 0.6, volume: 0.05 });
}

export function playSplash() {
  noise({ duration: 0.45, volume: 0.25, filter: 2200 });
  tone({ type: "sine", from: 400, to: 90, duration: 0.3, volume: 0.1 });
}

export function playDeath() {
  tone({ type: "sawtooth", from: 320, to: 45, duration: 0.7, volume: 0.15 });
  noise({ duration: 0.4, volume: 0.15, filter: 800 });
}

export function playHordeAlarm() {
  for (let i = 0; i < 3; i++) {
    tone({ type: "square", from: 620, to: 440, duration: 0.2, volume: 0.07, delay: i * 0.28 });
  }
}
