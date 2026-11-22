import * as THREE from "three";
import { showMessage } from "./hud.js";

const TAU = Math.PI * 2;
const POOL_SIZE = 10;

let ctx = null;
let listener = null;
let sr = 44100;
let ready = false;
let muted = false;
let poolIndex = 0;
let lastGroan = 0;
let windGain = null;
let cricketsGain = null;
const pool = [];
const buffers = {};

const rand = () => Math.random() * 2 - 1;
const saw = (phase) => 2 * (phase - Math.floor(phase)) - 1;

function lowpass(fc) {
  const a = 1 - Math.exp((-TAU * fc) / sr);
  let y = 0;
  return (x) => (y += a * (x - y));
}

function highpass(fc) {
  const lp = lowpass(fc);
  return (x) => x - lp(x);
}

function render(duration, fn, { loop = false } = {}) {
  const length = Math.floor(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const v = fn(i / sr);
    data[i] = v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const gain = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < length; i++) data[i] *= gain;
  if (!loop) {
    const fade = Math.floor(sr * 0.005);
    for (let i = 0; i < fade; i++) data[length - 1 - i] *= i / fade;
  }
  return buffer;
}

function makeShot() {
  const crackFilter = highpass(4000);
  const tail = lowpass(900);
  return render(0.4, (t) => {
    const crack = crackFilter(rand()) * Math.exp(-t * 120);
    const thumpPhase = TAU * (40 * t + (140 / 25) * (1 - Math.exp(-25 * t)));
    const thump = Math.sin(thumpPhase) * Math.exp(-t * 14);
    const rumble = tail(rand()) * Math.exp(-t * 9) * 0.7;
    return crack * 0.9 + thump + rumble;
  });
}

function makeHop() {
  const band = lowpass(1800);
  const low = highpass(300);
  return render(0.1, (t) => {
    const env = Math.sin(Math.PI * Math.min(1, t / 0.1));
    const swoosh = band(low(rand())) * env;
    const sweep = Math.sin(TAU * (260 * t + 1300 * t * t)) * env * 0.5;
    return swoosh + sweep;
  });
}

function makeLand(kind) {
  if (kind === "road") {
    const hp = highpass(1500);
    return render(0.12, (t) => {
      const tick = hp(rand()) * Math.exp(-t * 140);
      const ping = Math.sin(TAU * 900 * t) * Math.exp(-t * 90) * 0.3;
      const thud = Math.sin(TAU * 110 * t) * Math.exp(-t * 45) * 0.5;
      return tick * 0.8 + ping + thud;
    });
  }
  if (kind === "log") {
    const lp = lowpass(1500);
    return render(0.2, (t) => {
      const a = Math.sin(TAU * 310 * t) * Math.exp(-t * 30);
      const b = Math.sin(TAU * 470 * t) * Math.exp(-t * 38) * 0.6;
      return a + b + lp(rand()) * Math.exp(-t * 90) * 0.5;
    });
  }
  const lp = lowpass(600);
  return render(0.14, (t) => {
    const puff = lp(rand()) * Math.exp(-t * 50);
    const thump = Math.sin(TAU * (80 * t + (140 / 20) * (1 - Math.exp(-20 * t)))) * Math.exp(-t * 35) * 0.6;
    return puff + thump;
  });
}

function makeZombieHit() {
  const impact = lowpass(800);
  const gurgle = lowpass(500);
  return render(0.5, (t) => {
    const hit = impact(rand()) * Math.exp(-t * 30) * 0.9;
    const thump = Math.sin(TAU * (70 * t + (120 / 22) * (1 - Math.exp(-22 * t)))) * Math.exp(-t * 18);
    const rattle = t > 0.04 ? gurgle(rand()) * (0.5 + 0.5 * Math.sin(TAU * 28 * t)) * Math.exp(-(t - 0.04) * 6) * 0.5 : 0;
    return hit + thump + rattle;
  });
}

function makeGroan(base, glide, duration) {
  const rasp = lowpass(2500);
  const weights = new Float32Array(12);
  let phase = 0;
  let step = 0;
  return render(duration, (t) => {
    const progress = t / duration;
    const vibrato = 1 + 0.04 * Math.sin(TAU * 5.5 * t);
    const f0 = (base - glide * progress) * vibrato;
    phase += (TAU * f0) / sr;
    if (step++ % 128 === 0) {
      for (let k = 1; k <= 12; k++) {
        const freq = k * f0;
        weights[k - 1] =
          (Math.exp(-(((freq - 520) / 260) ** 2)) + 0.7 * Math.exp(-(((freq - 1000) / 320) ** 2)) + 0.05) / k;
      }
    }
    let s = 0;
    for (let k = 1; k <= 12; k++) s += weights[k - 1] * Math.sin(k * phase);
    const env = Math.min(1, t / 0.12) * Math.pow(1 - progress, 0.7);
    return (s * 0.55 + rasp(rand()) * 0.15) * env;
  });
}

function makeSplash() {
  const water = lowpass(2200);
  const bubbles = [
    [0.05, 380],
    [0.13, 520],
    [0.22, 450],
    [0.31, 610],
  ];
  return render(0.7, (t) => {
    const splash = water(rand()) * Math.min(1, t / 0.02) * Math.exp(-t * 5);
    let b = 0;
    for (const [start, freq] of bubbles) {
      if (t > start) {
        const dt = t - start;
        b += Math.sin(TAU * freq * dt * (1 + dt * 4)) * Math.exp(-dt * 40) * 0.35;
      }
    }
    return splash + b;
  });
}

function makeDeath() {
  const tone = lowpass(900);
  const rumble = lowpass(600);
  return render(1, (t) => {
    const body = tone(saw(300 * t - 130 * t * t)) * Math.exp(-t * 3);
    return body * 0.8 + rumble(rand()) * Math.exp(-t * 6) * 0.5;
  });
}

function makeAlarm() {
  const tone = lowpass(2000);
  let phase = 0;
  return render(1.68, (t) => {
    const f = Math.floor(t / 0.28) % 2 === 0 ? 560 : 420;
    phase += f / sr;
    const seg = (t % 0.28) / 0.28;
    const env = Math.min(1, seg * 20) * Math.min(1, (1 - seg) * 20);
    return tone(saw(phase)) * env;
  });
}

function makeTreeHit() {
  const leaves = highpass(1500);
  const soft = lowpass(5000);
  return render(0.25, (t) => {
    const rustle = leaves(soft(rand())) * Math.exp(-t * 30) * 0.7;
    const thock = Math.sin(TAU * 210 * t) * Math.exp(-t * 45) * 0.6;
    return rustle + thock;
  });
}

function makeClank() {
  const click = highpass(3000);
  const partials = [
    [620, 9, 1],
    [1010, 12, 0.7],
    [1470, 16, 0.5],
    [2200, 22, 0.3],
  ];
  return render(0.5, (t) => {
    let s = click(rand()) * Math.exp(-t * 200) * 0.5;
    for (const [freq, decay, gain] of partials) s += Math.sin(TAU * freq * t) * Math.exp(-t * decay) * gain;
    return s;
  });
}

function makeWind() {
  const length = 8;
  let y = 0;
  return render(
    length,
    (t) => {
      const cycle = TAU * (t / length);
      const a = 0.01 + 0.012 * (0.5 + 0.5 * Math.sin(cycle)) + 0.006 * (0.5 + 0.5 * Math.sin(cycle * 3));
      y += a * (rand() - y);
      return y * (0.6 + 0.4 * Math.sin(cycle * 2));
    },
    { loop: true },
  );
}

function makeCrickets() {
  const crickets = [
    [4300, 1, 0],
    [4700, 2, 0.55],
    [5000, 4, 1.7],
  ];
  return render(
    4,
    (t) => {
      let s = 0;
      for (const [freq, period, offset] of crickets) {
        const p = ((t + offset) % period) / period;
        if (p < 0.22) {
          const pulses = 0.35 + 0.65 * (Math.sin(TAU * 38 * t) > 0 ? 1 : 0);
          s += Math.sin(TAU * freq * t) * pulses * Math.sin((Math.PI * p) / 0.22);
        }
      }
      return s;
    },
    { loop: true },
  );
}

// Os sons são sintetizados por código (~25 s de áudio, com 12 senoides por amostra nos grunhidos).
// Fazer tudo de uma vez no carregamento trava a página; aqui cada som roda numa tarefa própria,
// deixando o navegador desenhar entre elas. Sons ainda não prontos simplesmente não tocam.
function addTo(key, make) {
  if (!buffers[key]) buffers[key] = [];
  buffers[key].push(make());
}

function addLand(kind) {
  if (!buffers.land) buffers.land = {};
  buffers.land[kind] = makeLand(kind);
}

const buildQueue = [
  () => { buffers.hop = makeHop(); },
  () => addLand("grass"),
  () => addLand("road"),
  () => addLand("log"),
  () => addTo("shots", makeShot),
  () => addTo("shots", makeShot),
  () => addTo("shots", makeShot),
  () => addTo("hits", makeZombieHit),
  () => addTo("hits", makeZombieHit),
  () => addTo("hits", makeZombieHit),
  () => { buffers.splash = makeSplash(); },
  () => { buffers.death = makeDeath(); },
  () => { buffers.treeHit = makeTreeHit(); },
  () => { buffers.clank = makeClank(); },
  () => addTo("groans", () => makeGroan(95, 25, 1.1)),
  () => addTo("groans", () => makeGroan(78, 20, 1.3)),
  () => addTo("groans", () => makeGroan(110, 35, 0.9)),
  () => {
    buffers.wind = makeWind();
    windGain = startLoop(buffers.wind);
  },
  () => {
    buffers.crickets = makeCrickets();
    cricketsGain = startLoop(buffers.crickets);
  },
];

function buildNext() {
  const task = buildQueue.shift();
  if (!task) return;
  task();
  setTimeout(buildNext, 0);
}

function startLoop(buffer) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(listener.getInput());
  source.start();
  return gain;
}

export function initAudio(camera, scene) {
  if (ready) return;
  ctx = THREE.AudioContext.getContext();
  sr = ctx.sampleRate;
  listener = new THREE.AudioListener();
  camera.add(listener);

  for (let i = 0; i < POOL_SIZE; i++) {
    const audio = new THREE.PositionalAudio(listener);
    audio.setDistanceModel("inverse");
    audio.setRefDistance(22);
    audio.setRolloffFactor(1);
    scene.add(audio);
    pool.push(audio);
  }

  ready = true;
  setTimeout(buildNext, 0);

  const resume = () => {
    if (ctx.state === "suspended") ctx.resume();
  };
  window.addEventListener("keydown", resume);
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "m") toggleMute();
  });
}

export function toggleMute() {
  if (!ready) return;
  muted = !muted;
  listener.setMasterVolume(muted ? 0 : 1);
  showMessage(muted ? "🔇 Som desligado (M)" : "🔊 Som ligado (M)", 1.5);
}

export function updateAmbience(daylight) {
  if (!ready) return;
  if (windGain) windGain.gain.value = 0.05 + 0.04 * daylight;
  if (cricketsGain) cricketsGain.gain.value = 0.06 * Math.pow(1 - daylight, 1.5);
}

function pick(list) {
  if (!list || !list.length) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

function play(buffer, volume = 1, jitter = 0.08) {
  if (!ready || !buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(listener.getInput());
  source.start();
}

function setPannerPosition(panner, x, y, z) {
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    panner.setPosition(x, y, z);
  }
}

function playAt(buffer, x, z, volume = 1, jitter = 0.08) {
  if (!ready || !buffer) return;
  if (x === undefined || z === undefined) {
    play(buffer, volume, jitter);
    return;
  }
  const audio = pool[poolIndex];
  poolIndex = (poolIndex + 1) % pool.length;
  if (audio.isPlaying) audio.stop();
  audio.setBuffer(buffer);
  audio.setVolume(volume);
  audio.setPlaybackRate(1 + (Math.random() * 2 - 1) * jitter);
  audio.position.set(x, 0.5, z);
  setPannerPosition(audio.panner, x, 0.5, z);
  audio.play();
}

export function playHop() {
  play(buffers.hop, 0.3);
}

export function playLand(kind) {
  if (!ready) return;
  const land = buffers.land;
  play(land && (land[kind] || land.grass), 0.4);
}

export function playShoot() {
  if (!ready) return;
  play(pick(buffers.shots), 0.5, 0.06);
}

export function playZombieHit(x, z) {
  if (!ready) return;
  playAt(pick(buffers.hits), x, z, 0.8);
}

export function playGroan(x, z) {
  if (!ready) return;
  const now = ctx.currentTime;
  if (now - lastGroan < 0.35) return;
  lastGroan = now;
  playAt(pick(buffers.groans), x, z, 0.7, 0.12);
}

export function playTreeHit(x, z) {
  if (!ready) return;
  playAt(buffers.treeHit, x, z, 0.6);
}

export function playClank(x, z) {
  if (!ready) return;
  playAt(buffers.clank, x, z, 0.6);
}

export function playSplash() {
  play(buffers.splash, 0.7);
}

export function playDeath() {
  play(buffers.death, 0.7);
}

export function playHordeAlarm() {
  if (!ready) return;
  if (!buffers.alarm) buffers.alarm = makeAlarm(); // sob demanda: 1.7 s de áudio que ninguém usava
  play(buffers.alarm, 0.5, 0);
}
