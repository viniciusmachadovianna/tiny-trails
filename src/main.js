import * as THREE from "three";
import "./style.css";
import { resetBullets, shoot, updateBullets } from "./bullets.js";
import { activateZombies, getKills, resetZombies, updateZombies } from "./zombies.js";
import { initAudio, playDeath, playHop, playLand, playSplash, updateAmbience } from "./sounds.js";
import { createPlayer } from "./player.js";
import { updateHud } from "./hud.js";
import { initParticles, resetParticles, updateParticles } from "./particles.js";
import { getDaylight, initLighting, resetLighting, updateLighting } from "./lighting.js";
import {
  getRowInfo,
  initWorld,
  isBlocked,
  MAX_CELL_X,
  resetWorld,
  updateLogs,
  updateRows,
  updateWater,
} from "./world.js";

const ARENA_HALF_SIZE = 8;
const PLAYER_HEIGHT = 0.5;
const HOP_TIME = 0.16;
const HOP_TIME_HELD = 0.28;
const HOP_HEIGHT = 0.45;
const MAX_BACK = 4;
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  updateLogs(delta);
  updateWater(delta);
  updateParticles(delta);
  updateBullets(delta, scene);

  playerBox.setFromCenterAndSize(
    playerBoxCenter.set(player.position.x, 0.45, player.position.z),
    playerBoxSize,
  );
  if (updateZombies(delta, scene, player, playerBox)) {
    playDeath();
    resetGame();
    return;
  }

  if (!hop && riding) {
    player.position.x = riding.log.x + riding.offset;
    if (Math.abs(player.position.x) > MAX_CELL_X + 0.5) {
      playSplash();
      resetGame();
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
          playSplash();
          resetGame();
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(arenaRoot.clientWidth, arenaRoot.clientHeight);
});

window.dispatchEvent(new Event("resize"));
setFacing("up");
updateRows(cell.z);
animate();
