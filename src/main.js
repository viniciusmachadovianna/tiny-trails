/** @file Inicializa a cena, os sistemas do jogo e o loop de animação. */
import * as THREE from "three";
import "./ui/style.css";
import { resetBullets, shoot, updateBullets } from "./entities/bullets.js";
import { activateZombies, getKills, resetZombies, updateZombies } from "./entities/zombies.js";
import {
  initAudio,
  pauseAudio,
  playDeath,
  playHop,
  playLand,
  playRecord,
  playRespawn,
  resumeAudio,
  setAmbienceDuck,
  updateAmbience,
} from "./systems/sounds.js";
import { createPlayer } from "./entities/player.js";
import { beginRun, bindHudActions, hideOverlay, showOverlay, updateHud } from "./ui/hud.js";
import { emit, initParticles, resetParticles, setParticlePixelRatio, updateParticles } from "./systems/particles.js";
import { getDaylight, initLighting, resetLighting, updateLighting } from "./systems/lighting.js";
import {
  getRowInfo,
  initWorld,
  isBlocked,
  MAX_CELL_X,
  resetWorld,
  updateLogs,
  updateRows,
  updateWater,
} from "./world/world.js";

const ARENA_HALF_SIZE = 8;
const PLAYER_HEIGHT = 0.5;
const HOP_TIME = 0.22;
const HOP_TIME_HELD = 0.36;
const HOP_HEIGHT = 0.45;
const MAX_BACK = 4;

const ADAPTIVE_RESOLUTION = true;
const SLOW_FRAME_TIME = 1 / 40;
const ADAPT_WINDOW_FRAMES = 60;
const RATIO_STEP = 0.25;
const arenaRoot = document.querySelector("#game");

const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const cell = { x: 0, z: 0 };
let hop = null;
let queued = null;
let riding = null;
let facing = "up";
let bestZ = 0;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
camera.position.set(14, 20, 14);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: (window.devicePixelRatio || 1) < 2,
  powerPreference: "high-performance",
});
let resolutionSteps = 0;
let adaptTime = 0;
let adaptFrames = 0;
let adaptWarmup = 3;

function pixelRatioBounds() {
  const max = Math.min(window.devicePixelRatio || 1, 2);
  return { max, min: Math.min(1, max) };
}

function applyPixelRatio() {
  const { max, min } = pixelRatioBounds();
  const ratio = Math.max(min, max - resolutionSteps * RATIO_STEP);
  renderer.setPixelRatio(ratio);
  setParticlePixelRatio(ratio);
}

function adaptResolution(rawDelta) {
  if (!ADAPTIVE_RESOLUTION) return;
  const { max, min } = pixelRatioBounds();
  if (max - resolutionSteps * RATIO_STEP <= min) return;
  if (document.hidden) {
    adaptTime = 0;
    adaptFrames = 0;
    return;
  }
  if (adaptWarmup > 0) {
    adaptWarmup -= rawDelta;
    return;
  }
  adaptTime += Math.min(rawDelta, 0.1);
  adaptFrames++;
  if (adaptFrames < ADAPT_WINDOW_FRAMES) return;
  const average = adaptTime / adaptFrames;
  adaptTime = 0;
  adaptFrames = 0;
  if (average > SLOW_FRAME_TIME) {
    resolutionSteps++;
    applyPixelRatio();
    adaptWarmup = 1;
  }
}

applyPixelRatio();
renderer.setSize(arenaRoot.clientWidth, arenaRoot.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
arenaRoot.appendChild(renderer.domElement);

initLighting(scene);
initAudio(camera, scene);
initParticles(scene);
initWorld(scene);
const focus = new THREE.Vector3(0, 0, 0);

const { root: player, model: playerModel, legs: playerLegs, arms: playerArms } = createPlayer();
player.position.y = PLAYER_HEIGHT / 2;
scene.add(player);

const playerBox = new THREE.Box3();
const playerBoxCenter = new THREE.Vector3();
const playerBoxSize = new THREE.Vector3(0.5, 0.8, 0.5);

let faceAngle = 0;

function setFacing(dir) {
  facing = dir;
  const [dx, dz] = vectors[dir];
  faceAngle = Math.atan2(dx, dz);
}

function resetGame() {
  resetBullets(scene);
  resetZombies(scene);
  resetParticles();
  resetLighting();
  resetWorld();
  setFacing("up");
  cell.x = 0;
  cell.z = 0;
  bestZ = 0;
  hop = null;
  queued = null;
  riding = null;
  player.position.set(0, PLAYER_HEIGHT / 2, 0);
  player.rotation.set(0, 0, 0);
  focus.set(0, 0, 0);
  updateRows(cell.z);
}

function startHop(dir, duration = HOP_TIME) {
  const [dx, dz] = vectors[dir];
  const baseX = Math.round(player.position.x);
  const toX = THREE.MathUtils.clamp(baseX + dx, -MAX_CELL_X, MAX_CELL_X);
  const toZ = Math.min(cell.z + dz, bestZ + MAX_BACK);
  if (toX === baseX && toZ === cell.z) return;
  if (isBlocked(toX, toZ)) return;
  riding = null;
  hop = { fromX: player.position.x, fromZ: cell.z, toX, toZ, t: 0, duration };
  activateZombies();
  playHop();
}

const pressed = new Set();
const directions = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right",
};

let state = "playing";
let needsRender = false; // pausado
let deadAt = 0;
let deathKind = "zombie";
let deathT = 0;
let deathFromY = 0;
const RESPAWN_DELAY = 800;
const DEATH_TEXT = {
  zombie: "Os zumbis te pegaram!",
  water: "Você se afogou!",
};

function die(kind) {
  if (state !== "playing") return;
  state = "dead";
  deadAt = performance.now();
  deathKind = kind;
  deathT = 0;
  deathFromY = player.position.y;
  hop = null;
  queued = null;
  riding = null;
  pressed.clear();

  const distance = Math.max(0, -bestZ);
  const kills = getKills();
  emit(player.position.x, 0.5, player.position.z, kind === "water" ? "#5ec2e8" : "#7a1f1f", 12, 3);
  playDeath(kind);
  setAmbienceDuck(0.35);

  const record = showOverlay("dead", { distance, kills, text: DEATH_TEXT[kind], lockMs: RESPAWN_DELAY });
  if (record) setTimeout(() => state === "dead" && playRecord(), 700);
}

function animateDeath(delta) {
  deathT = Math.min(deathT + delta / 0.55, 1);
  const e = 1 - (1 - deathT) ** 3;
  if (deathKind === "water") {
    player.position.y = THREE.MathUtils.lerp(deathFromY, -0.7, e);
  } else {
    player.rotation.z = -e * Math.PI * 0.48;
    player.position.y = THREE.MathUtils.lerp(deathFromY, 0.3, e);
  }
}

function respawn() {
  if (state !== "dead" || performance.now() - deadAt < RESPAWN_DELAY) return;
  resetGame();
  state = "playing";
  hideOverlay();
  beginRun();
  setAmbienceDuck(1);
  playRespawn();
}

function setPaused(next) {
  if (state === "dead" || next === (state === "paused")) return;
  state = next ? "paused" : "playing";
  pressed.clear();
  if (next) {
    showOverlay("pause");
    pauseAudio();
  } else {
    hideOverlay();
    resumeAudio();
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.05);

  if (state === "paused") {
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    return;
  }

  adaptResolution(rawDelta);

  if (state === "dead") {
    updateParticles(delta);
    animateDeath(delta);
    updateAmbience(getDaylight());
    renderer.render(scene, camera);
    return;
  }

  updateLogs(delta);
  updateWater(delta);
  updateParticles(delta);
  updateBullets(delta, scene);

  playerBox.setFromCenterAndSize(
    playerBoxCenter.set(player.position.x, 0.45, player.position.z),
    playerBoxSize,
  );
  if (updateZombies(delta, scene, player, playerBox)) {
    die("zombie");
    return;
  }

  if (!hop && riding) {
    player.position.x = riding.log.x + riding.offset;
    if (Math.abs(player.position.x) > MAX_CELL_X + 0.5) {
      die("water");
      return;
    }
  }

  if (hop) {
    hop.t = Math.min(hop.t + delta / hop.duration, 1);
    const k = hop.t;
    player.position.x = THREE.MathUtils.lerp(hop.fromX, hop.toX, k);
    player.position.z = THREE.MathUtils.lerp(hop.fromZ, hop.toZ, k);
    player.position.y = PLAYER_HEIGHT / 2 + Math.sin(k * Math.PI) * HOP_HEIGHT;

    if (k === 1) {
      cell.x = hop.toX;
      cell.z = hop.toZ;
      hop = null;
      bestZ = Math.min(bestZ, cell.z);
      updateRows(cell.z);

      const info = getRowInfo(cell.z);
      if (info.type === "river") {
        const log = info.logs.find(
          (l) => Math.abs(player.position.x - l.x) <= l.len / 2 + 0.2,
        );
        if (!log) {
          die("water");
          return;
        }
        riding = { log, offset: player.position.x - log.x };
      }
      playLand(info.type === "river" ? "log" : info.type);

      if (queued) {
        const d = queued;
        queued = null;
        startHop(d);
      } else {
        const held = [...pressed].filter((d) => d === "up" || d === "down").pop();
        if (held) startHop(held, HOP_TIME_HELD);
      }
    }
  }

  const s = hop ? Math.sin(hop.t * Math.PI) : 0;
  playerModel.scale.set(1 - s * 0.08, 1 + s * 0.15, 1 - s * 0.08);
  playerLegs[0].rotation.x = s * 0.7;
  playerLegs[1].rotation.x = -s * 0.7;
  playerArms[0].rotation.x = -s * 0.5;
  let diff = faceAngle - playerModel.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  playerModel.rotation.y += diff * Math.min(1, delta * 18);

  const follow = 1 - Math.exp(-6 * delta);
  focus.x += (player.position.x * 0.3 - focus.x) * follow;
  focus.z += (player.position.z - focus.z) * follow;
  camera.position.set(focus.x + 14, 20, focus.z + 14);
  updateLighting(delta, focus, player.position);
  updateAmbience(getDaylight());
  updateHud(Math.max(0, -bestZ), getKills());

  renderer.render(scene, camera);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "p" || key === "escape") {
    event.preventDefault();
    if (!event.repeat) setPaused(state === "playing");
    return;
  }
  if (state === "dead") {
    if (key === "enter" || key === "r") {
      event.preventDefault();
      if (!event.repeat) respawn();
    }
    return;
  }
  if (state === "paused") {
    if (key === "enter") {
      event.preventDefault();
      if (!event.repeat) setPaused(false);
    }
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    shoot(scene, player, vectors[facing]);
    return;
  }
  const direction = directions[event.key.toLowerCase()];
  if (!direction) return;
  event.preventDefault();
  if (event.repeat) return;
  setFacing(direction);
  pressed.add(direction);
  if (hop) queued = direction;
  else startHop(direction);
});

document.addEventListener("keyup", (event) => {
  const direction = directions[event.key.toLowerCase()];
  if (direction) pressed.delete(direction);
});

window.addEventListener("blur", () => pressed.clear());

window.addEventListener("resize", () => {
  needsRender = true;
  const aspect = arenaRoot.clientWidth / arenaRoot.clientHeight;
  const halfHeight = Math.max(
    ARENA_HALF_SIZE * 1.2,
    (ARENA_HALF_SIZE * Math.SQRT2 * 1.12) / aspect,
  );
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  applyPixelRatio();
  renderer.setSize(arenaRoot.clientWidth, arenaRoot.clientHeight);
});

bindHudActions({
  togglePause: () => setPaused(state === "playing"),
  respawn,
});

/**Pausa sozinho ao trocar / minimizar aba. */
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") setPaused(true);
});

window.dispatchEvent(new Event("resize"));
setFacing("up");
updateRows(cell.z);
animate();
