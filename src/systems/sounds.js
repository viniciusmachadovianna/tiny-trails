import * as THREE from "three";
import { showMessage } from "../ui/hud.js";

const TAU = Math.PI * 2;
const POOL_SIZE = 10;

let ctx = null;
let listener = null;
let sr = 44100;
let ready = false;
let muted = false;
let paused = false;
let suspendTimer = null;
let poolIndex = 0;
let lastGroan = 0;
let windGain = null;
let cricketsGain = null;
let duck = 1; // 1 = ambiente normal; menor = ambiente mais baixo (ex.: depois de morrer)
let duckNow = 1;
const pool = [];
const buffers = {};

const rand = () => Math.random() * 2 - 1;
const saw = (phase) => 2 * (phase - Math.floor(phase)) - 1;

// Fase de um seno cuja frequência cai de (f1 + df) até f1: f(t) = f1 + df·e^(−k·t).
const sweep = (f1, df, k, t) => TAU * (f1 * t + (df / k) * (1 - Math.exp(-k * t)));

function lowpass(fc) {
  const a = 1 - Math.exp((-TAU * fc) / sr);
  let y = 0;
  return (x) => (y += a * (x - y));
}

function highpass(fc) {
  const lp = lowpass(fc);
  return (x) => x - lp(x);
}

// Filtro passa-banda ressonante (variável de estado). A frequência central pode mudar a cada
// amostra, o que dá "chiados com timbre" que sobem ou descem (splat, vento, whoosh).
function resonator(q = 3) {
  const damp = 1 / q;
  let low = 0;
  let band = 0;
  return (x, fc) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, sr / 8)) / sr);
    low += f * band;
    const high = x - low - damp * band;
    band += f * high;
    return band * damp;
  };
}

// echo: lista de [atraso em segundos, ganho] — ecos simples que dão "espaço" ao som.
function render(duration, fn, { loop = false, echo = null } = {}) {
  const length = Math.floor(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = fn(i / sr);
  if (echo) {
    const taps = echo.map(([delay, gain]) => [Math.floor(sr * delay), gain]);
    // De trás pra frente: data[i - atraso] ainda é o som original, então não há eco de eco.
    for (let i = length - 1; i >= 0; i--) {
      for (const [d, g] of taps) if (i >= d) data[i] += data[i - d] * g;
    }
  }
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const a = Math.abs(data[i]);
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

// Tiro: estalo seco + "corpo" que desce de tom + coice grave + cauda + clique do ferrolho + ecos.
function makeShot(v = 0) {
  const crackFilter = highpass(3500);
  const bodyBand = resonator(3);
  const tail = lowpass(700);
  const clack = highpass(2500);
  const base = 40 + v * 5;
  return render(
    0.6,
    (t) => {
      const crack = crackFilter(rand()) * Math.exp(-t * 150);
      const body = bodyBand(rand(), 600 + 1500 * Math.exp(-t * 35)) * Math.exp(-t * 38) * 1.4;
      const thump = Math.sin(sweep(base, 130, 24, t)) * Math.exp(-t * 15);
      const rumble = tail(rand()) * Math.exp(-t * 8) * 0.6;
      const slide = t > 0.12 ? clack(rand()) * Math.exp(-(t - 0.12) * 260) * 0.25 : 0;
      return crack * 0.8 + body * 0.7 + thump + rumble + slide;
    },
    { echo: [[0.07, 0.26], [0.15, 0.15], [0.26, 0.08]] },
  );
}

function makeHop() {
  const band = lowpass(1800);
  const low = highpass(300);
  return render(0.11, (t) => {
    const env = Math.sin(Math.PI * Math.min(1, t / 0.11));
    const swoosh = band(low(rand())) * env;
    const sweepTone = Math.sin(TAU * (260 * t + 1300 * t * t)) * env * 0.4;
    const push = Math.sin(sweep(70, 90, 70, t)) * Math.exp(-t * 55) * 0.5; // "tum" do impulso
    return swoosh + sweepTone + push;
  });
}

// Duas variações de cada pouso (v = 0 ou 1), pra não soar igual toda hora.
function makeLand(kind, v = 0) {
  const k = 1 + v * 0.14;
  if (kind === "road") {
    const hp = highpass(1500);
    const grit = highpass(2500);
    return render(0.13, (t) => {
      const tick = hp(rand()) * Math.exp(-t * 140);
      const ping = Math.sin(TAU * 900 * k * t) * Math.exp(-t * 90) * 0.25;
      const thud = Math.sin(TAU * 110 * k * t) * Math.exp(-t * 45) * 0.5;
      const crunch =
        t > 0.02 ? grit(rand()) * Math.exp(-(t - 0.02) * 70) * (Math.random() < 0.35 ? 1 : 0.3) * 0.35 : 0;
      return tick * 0.8 + ping + thud + crunch;
    });
  }
  if (kind === "log") {
    const lp = lowpass(1500);
    const slosh = lowpass(900);
    return render(0.22, (t) => {
      const a = Math.sin(TAU * 310 * k * t) * Math.exp(-t * 30);
      const b = Math.sin(TAU * 470 * k * t) * Math.exp(-t * 38) * 0.6;
      const water = t > 0.015 ? slosh(rand()) * Math.exp(-(t - 0.015) * 25) * 0.35 : 0;
      return a + b + lp(rand()) * Math.exp(-t * 90) * 0.5 + water;
    });
  }
  const lp = lowpass(600);
  const rustle = resonator(1.5);
  return render(0.15, (t) => {
    const puff = lp(rand()) * Math.exp(-t * 50);
    const thump = Math.sin(sweep(80 * k, 140, 20, t)) * Math.exp(-t * 35) * 0.6;
    const leaves = rustle(rand(), 3200) * Math.exp(-t * 40) * 0.5;
    return puff + thump + leaves;
  });
}

// Acerto no zumbi: estalo + "splat" molhado que desce de tom + pancada grave + gorgolejo.
function makeZombieHit(v = 0) {
  const crack = highpass(2500);
  const impact = lowpass(800);
  const wet = resonator(2.5);
  const gurgle = lowpass(500);
  return render(
    0.55,
    (t) => {
      const snap = crack(rand()) * Math.exp(-t * 110) * 0.6;
      const hit = impact(rand()) * Math.exp(-t * 30) * 0.9;
      const splat = wet(rand(), 1100 - 700 * Math.min(1, t / 0.18)) * Math.exp(-t * 20) * 1.3;
      const thump = Math.sin(sweep(65 + v * 6, 120, 22, t)) * Math.exp(-t * 17);
      const rattle =
        t > 0.05
          ? gurgle(rand()) * (0.5 + 0.5 * Math.sin(TAU * (26 + v * 4) * t)) * Math.exp(-(t - 0.05) * 6) * 0.45
          : 0;
      return snap + hit + splat + thump + rattle;
    },
    { echo: [[0.09, 0.12]] },
  );
}

// Grunhido: harmônicos moldados por "vogais" (formantes) que escorregam durante o som,
// com vibrato duplo e "voz rascante" (fry) para soar mais podre.
function makeGroan(base, glide, duration) {
  const rasp = lowpass(2500);
  const weights = new Float32Array(12);
  let phase = 0;
  let step = 0;
  return render(duration, (t) => {
    const progress = t / duration;
    const vibrato = 1 + 0.04 * Math.sin(TAU * 5.5 * t) + 0.015 * Math.sin(TAU * 11 * t);
    const f0 = (base - glide * progress) * vibrato;
    phase += (TAU * f0) / sr;
    if (step++ % 128 === 0) {
      const f1 = 520 - 120 * progress;
      const f2 = 1000 - 200 * progress;
      for (let k = 1; k <= 12; k++) {
        const freq = k * f0;
        weights[k - 1] =
          (Math.exp(-(((freq - f1) / 260) ** 2)) + 0.7 * Math.exp(-(((freq - f2) / 320) ** 2)) + 0.05) / k;
      }
    }
    let s = 0;
    for (let k = 1; k <= 12; k++) s += weights[k - 1] * Math.sin(k * phase);
    const env = Math.min(1, t / 0.12) * Math.pow(1 - progress, 0.7);
    const fry = 0.7 + 0.3 * Math.sin(TAU * 23 * t);
    return (s * 0.55 * fry + rasp(rand()) * 0.18) * env;
  });
}

// Morte por zumbi: pancada grave + três mordidas crocantes + rosnado que cai de tom.
function makeDeath() {
  const tone = lowpass(900);
  const rumble = lowpass(600);
  const crunch = highpass(1800);
  const chomps = [0, 0.1, 0.21];
  let phase = 0;
  return render(
    1.3,
    (t) => {
      phase += (260 - 170 * Math.min(1, t / 1.1)) / sr;
      const body = tone(saw(phase)) * Math.exp(-t * 3) * 0.7;
      const impact = Math.sin(sweep(45, 90, 12, t)) * Math.exp(-t * 7) * 0.9;
      let bite = 0;
      for (const start of chomps) if (t >= start) bite += Math.exp(-(t - start) * 55);
      const grr = rumble(rand()) * Math.exp(-t * 6) * 0.5;
      return body + impact + crunch(rand()) * bite * 0.5 + grr;
    },
    { echo: [[0.11, 0.15]] },
  );
}

// Fim de jogo: três notas descendo (sol, mi, dó), a última com vibrato — um "uóm-uóm-uóóóm" triste.
function makeSting() {
  const notes = [
    [392, 0, 0.3],
    [330, 0.3, 0.3],
    [262, 0.6, 0.6],
  ];
  const lp = lowpass(1800);
  return render(1.7, (t) => {
    let s = 0;
    for (const [freq, start, len] of notes) {
      if (t < start) continue;
      const dt = t - start;
      const last = start >= 0.6;
      const a = Math.min(1, dt / 0.012) * Math.exp(-dt * (last ? 3.2 : 8));
      const phase = TAU * freq * (dt - (0.03 * dt * dt) / (2 * len)) + (last ? 0.8 * Math.sin(TAU * 5 * dt) : 0);
      s += (Math.sin(phase) + 0.35 * Math.sin(2 * phase) + 0.15 * Math.sin(3 * phase)) * a;
    }
    return lp(s);
  });
}

// Novo recorde: arpejo curto e brilhante (dó, mi, sol, dó).
function makeRecord() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  return render(
    1.1,
    (t) => {
      let s = 0;
      notes.forEach((freq, i) => {
        const dt = t - i * 0.085;
        if (dt < 0) return;
        const a = Math.min(1, dt / 0.004) * Math.exp(-dt * (i === 3 ? 4 : 9));
        s += (Math.sin(TAU * freq * dt) + 0.4 * Math.sin(TAU * 2 * freq * dt) * Math.exp(-dt * 12)) * a;
      });
      return s;
    },
    { echo: [[0.12, 0.25], [0.24, 0.12]] },
  );
}

// Bip do botão de pausa (cai de tom) e de continuar (sobe de tom).
function makeBlip(from, to) {
  const lp = lowpass(3000);
  const dur = 0.14;
  return render(dur, (t) => {
    const k = t / dur;
    const phase = TAU * (from * t + ((to - from) * t * t) / (2 * dur));
    const env = Math.min(1, t / 0.006) * Math.pow(1 - k, 1.5);
    return lp(Math.sin(phase) + 0.3 * Math.sin(2 * phase)) * env;
  });
}

// Renascer: "whoosh" que sobe + três notas de sino em acorde maior.
function makeRespawn() {
  const air = resonator(1.8);
  const lp = lowpass(4000);
  const chime = (t, freq, start) => {
    const dt = t - start;
    return dt < 0 ? 0 : Math.sin(TAU * freq * dt) * Math.min(1, dt / 0.01) * Math.exp(-dt * 7);
  };
  return render(
    1,
    (t) => {
      const rise = Math.min(1, t / 0.45);
      const whoosh = air(rand(), 300 + 2200 * rise * rise) * Math.sin(Math.PI * Math.min(1, t / 0.55));
      const bells = chime(t, 523.25, 0.3) + chime(t, 784, 0.4) * 0.8 + chime(t, 1046.5, 0.5) * 0.6;
      return lp(whoosh * 0.6 + bells * 0.7);
    },
    { echo: [[0.1, 0.2]] },
  );
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

// Os sons são sintetizados por código (~30 s de áudio, com 12 senoides por amostra nos grunhidos).
// Fazer tudo de uma vez no carregamento trava a página; aqui cada som roda numa tarefa própria,
// deixando o navegador desenhar entre elas. Sons ainda não prontos simplesmente não tocam.
function addTo(key, make) {
  if (!buffers[key]) buffers[key] = [];
  buffers[key].push(make());
}

function addLand(kind) {
  if (!buffers.land) buffers.land = {};
  buffers.land[kind] = [makeLand(kind, 0), makeLand(kind, 1)];
}

const buildQueue = [
  () => { buffers.hop = makeHop(); },
  () => addLand("grass"),
  () => addLand("road"),
  () => addLand("log"),
  () => addTo("shots", () => makeShot(0)),
  () => addTo("shots", () => makeShot(1)),
  () => addTo("shots", () => makeShot(2)),
  () => addTo("hits", () => makeZombieHit(0)),
  () => addTo("hits", () => makeZombieHit(1)),
  () => addTo("hits", () => makeZombieHit(2)),
  () => { buffers.splash = makeSplash(); },
  () => { buffers.death = makeDeath(); },
  () => { buffers.sting = makeSting(); },
  () => { buffers.pause = makeBlip(720, 360); },
  () => { buffers.resume = makeBlip(360, 760); },
  () => { buffers.respawn = makeRespawn(); },
  () => { buffers.record = makeRecord(); },
  () => { buffers.treeHit = makeTreeHit(); },
  () => { buffers.clank = makeClank(); },
  () => addTo("groans", () => makeGroan(95, 25, 1.1)),
  () => addTo("groans", () => makeGroan(78, 20, 1.3)),
  () => addTo("groans", () => makeGroan(110, 35, 0.9)),
  () => addTo("groans", () => makeGroan(70, 14, 1.5)),
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

  // Compressor no fim da cadeia: tiros, grunhidos e mortes sobrepostos não estouram o volume.
  if (typeof listener.setFilter === "function") {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 14;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    listener.setFilter(compressor);
  }

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
    if (!paused && ctx.state === "suspended") ctx.resume();
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

// Ambiente (vento e grilos). `duck` abaixa o volume de forma suave, ex.: na tela de morte.
export function setAmbienceDuck(value) {
  duck = value;
}

export function updateAmbience(daylight) {
  if (!ready) return;
  duckNow += (duck - duckNow) * 0.08;
  if (windGain) windGain.gain.value = (0.05 + 0.04 * daylight) * duckNow;
  if (cricketsGain) cricketsGain.gain.value = 0.06 * Math.pow(1 - daylight, 1.5) * duckNow;
}

// Pausa de verdade: toca o bipe e então suspende o AudioContext (some tudo, inclusive vento e grilos).
export function pauseAudio() {
  if (!ready) return;
  paused = true;
  play(buffers.pause, 0.35, 0);
  clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => {
    if (paused && ctx.state === "running") ctx.suspend();
  }, 160);
}

export function resumeAudio() {
  if (!ready) return;
  paused = false;
  clearTimeout(suspendTimer);
  const beep = () => play(buffers.resume, 0.35, 0);
  if (ctx.state === "suspended") ctx.resume().then(beep, beep);
  else beep();
}

function pick(list) {
  if (!list || !list.length) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

function play(buffer, volume = 1, jitter = 0.08, delay = 0) {
  if (!ready || !buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(listener.getInput());
  source.start(delay ? ctx.currentTime + delay : 0);
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
  play(land && pick(land[kind] || land.grass), 0.4);
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

// kind: "zombie" (pego pelos zumbis) ou "water" (afogado). Ambos terminam com a "musiquinha" triste.
export function playDeath(kind = "zombie") {
  if (kind === "water") {
    play(buffers.sting, 0.4, 0.02, 0.35);
    return;
  }
  play(buffers.death, 0.8, 0.03);
  play(buffers.sting, 0.4, 0.02, 0.3);
}

export function playRespawn() {
  play(buffers.respawn, 0.55, 0.02);
}

export function playRecord() {
  play(buffers.record, 0.5, 0);
}
