import * as THREE from "three";
import { playGroan, playHordeAlarm } from "./sounds.js";
import { emit } from "./particles.js";
import { getRowInfo, MAX_CELL_X } from "./world.js";
import { showMessage } from "./hud.js";
import { mergeBoxes, vertexColorBasicMaterial, vertexColorMaterial } from "./merge.js";

const ZOMBIE_SPEED_MIN = 1.2;
const ZOMBIE_SPEED_MAX = 2;
const ZOMBIE_SPAWN_DISTANCE = 11;
const ZOMBIE_DESPAWN_DISTANCE = 20;
const ZOMBIE_SPAWN_INTERVAL = 1.5;
const MAX_ZOMBIES = 12;

const CROSS_START_X = MAX_CELL_X + 6;
const CROSS_END_X = MAX_CELL_X + 8;
const MAX_CROSSERS = 20;
const SINGLE_CAP = 10;
const SINGLE_INTERVAL_MIN = 2.5;
const SINGLE_INTERVAL_MAX = 5;
const HORDE_INTERVAL_MIN = 10;
const HORDE_INTERVAL_MAX = 18;
const HORDE_WARNING_TIME = 2;

const skinColor = "#86b35e";
const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
const pantsMat = new THREE.MeshLambertMaterial({ color: "#3b3550" });
const shirtColors = ["#3f6fa8", "#a8493f", "#7a5aa8", "#c9a23f"];
const hitboxMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

const bodyGeo = new THREE.BoxGeometry(0.5, 0.35, 0.28);
const headGeo = new THREE.BoxGeometry(0.38, 0.32, 0.34);
const legGeo = new THREE.BoxGeometry(0.16, 0.3, 0.18).translate(0, -0.15, 0);
const armGeo = new THREE.BoxGeometry(0.13, 0.13, 0.42).translate(0, 0, 0.21);
const eyeGeo = new THREE.BoxGeometry(0.07, 0.07, 0.02);
const mouthGeo = new THREE.BoxGeometry(0.16, 0.04, 0.02);
const patchGeo = new THREE.BoxGeometry(0.16, 0.12, 0.02);
const hitboxGeo = new THREE.BoxGeometry(0.6, 1, 0.5);

const bodyGeos = shirtColors.map((shirt) =>
  mergeBoxes([
    { geometry: bodyGeo, position: [0, 0.475, 0], color: shirt },
    { geometry: patchGeo, position: [0.1, 0.42, 0.141], color: skinColor },
    { geometry: headGeo, position: [0, 0.81, 0], color: skinColor },
    { geometry: mouthGeo, position: [0, 0.73, 0.175], color: "#3a1414" },
  ]),
);
const eyesGeo = mergeBoxes([
  { geometry: eyeGeo, position: [-0.09, 0.85, 0.175], color: "#e84a4a" },
  { geometry: eyeGeo, position: [0.09, 0.85, 0.175], color: "#e84a4a" },
]);

export const zombies = [];
export const hitboxes = [];
let zombieTimer = ZOMBIE_SPAWN_INTERVAL;
let kills = 0;

export function getKills() {
  return kills;
}

function createZombieModel() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  const shirtIndex = Math.floor(Math.random() * shirtColors.length);

  const body = new THREE.Mesh(bodyGeos[shirtIndex], vertexColorMaterial);
  body.castShadow = true;
  const eyes = new THREE.Mesh(eyesGeo, vertexColorBasicMaterial);

  const legs = [-0.12, 0.12].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.3, 0);
    pivot.add(new THREE.Mesh(legGeo, pantsMat));
    return pivot;
  });

  const arms = [-0.32, 0.32].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.57, 0);
    pivot.add(new THREE.Mesh(armGeo, skinMat));
    return pivot;
  });

  model.add(body, eyes, ...legs, ...arms);

  const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
  hitbox.position.y = 0.5;
  root.add(hitbox);

  return { root, model, legs, arms, hitbox, shirtColor: shirtColors[shirtIndex] };
}

function makeZombie(scene, x, z) {
  const parts = createZombieModel();
  parts.root.position.set(x, 0, z);
  scene.add(parts.root);
  const zombie = {
    mesh: parts.root,
    model: parts.model,
    legs: parts.legs,
    arms: parts.arms,
    hitbox: parts.hitbox,
    box: new THREE.Box3(),
    shirtColor: parts.shirtColor,
    speed: ZOMBIE_SPEED_MIN + Math.random() * (ZOMBIE_SPEED_MAX - ZOMBIE_SPEED_MIN),
    walk: Math.random() * 6,
    crossDir: 0,
  };
  parts.hitbox.userData.zombie = zombie;
  parts.root.updateMatrixWorld(true);
  zombies.push(zombie);
  hitboxes.push(parts.hitbox);
  return zombie;
}

function spawnZombie(scene, player) {
  const angle = Math.random() * Math.PI * 2;
  makeZombie(
    scene,
    player.position.x + Math.cos(angle) * ZOMBIE_SPAWN_DISTANCE,
    player.position.z + Math.sin(angle) * ZOMBIE_SPAWN_DISTANCE,
  );
  if (Math.random() < 0.4) playGroan();
}

export function removeZombie(scene, index) {
  if (index < 0) return;
  scene.remove(zombies[index].mesh);
  zombies.splice(index, 1);
  hitboxes.splice(index, 1);
}

export function killZombie(scene, zombie) {
  kills++;
  const pos = zombie.mesh.position;
  emit(pos.x, 0.5, pos.z, skinColor, 8, 3.2);
  emit(pos.x, 0.5, pos.z, zombie.shirtColor, 6, 3.2);
  emit(pos.x, 0.5, pos.z, "#7a1f1f", 4, 2.5);
  removeZombie(scene, zombies.indexOf(zombie));
}

function spawnCrosser(scene, rowZ, dir, offset, speed) {
  const zombie = makeZombie(scene, -dir * (CROSS_START_X + offset), rowZ);
  zombie.crossDir = dir;
  zombie.speed = speed;
}

function spawnSingle(scene, road) {
  const rowZ = road.rows[Math.floor(Math.random() * road.rows.length)];
  spawnCrosser(scene, rowZ, road.dir, 0, 2.2 + Math.random());
}

function spawnHorde(scene, road, count) {
  for (let i = 0; i < count; i++) {
    const rowZ = road.rows[i % road.rows.length];
    const offset = Math.floor(i / road.rows.length) * 1.2 + Math.random() * 0.3;
    spawnCrosser(scene, rowZ, road.dir, offset, 2.6 + Math.random() * 0.6);
  }
}

function updateRoads(delta, scene, player) {
  const pz = Math.round(player.position.z);
  const roads = new Set();
  for (let z = pz - 14; z <= pz + 1; z++) {
    const road = getRowInfo(z).road;
    if (road) roads.add(road);
  }

  let crossers = zombies.reduce((n, zombie) => n + (zombie.crossDir ? 1 : 0), 0);

  for (const road of roads) {
    if (road.timer === undefined) {
      road.timer = road.big ? 4 + Math.random() * 6 : 1 + Math.random() * 3;
    }
    road.timer -= delta;

    if (road.big && !road.warned && road.timer <= HORDE_WARNING_TIME) {
      road.warned = true;
      const ahead = road.rows.some((z) => z < pz && z >= pz - 12);
      if (ahead) {
        showMessage("⚠ Horda cruzando a rua!", 3);
        playHordeAlarm();
      }
    }

    if (road.timer > 0) continue;

    if (road.big) {
      const count = 6 + Math.floor(Math.random() * 4);
      if (crossers + count > MAX_CROSSERS) {
        road.timer = 1;
        continue;
      }
      spawnHorde(scene, road, count);
      crossers += count;
      road.timer = HORDE_INTERVAL_MIN + Math.random() * (HORDE_INTERVAL_MAX - HORDE_INTERVAL_MIN);
      road.warned = false;
    } else {
      if (crossers >= SINGLE_CAP) {
        road.timer = 1;
        continue;
      }
      spawnSingle(scene, road);
      crossers++;
      road.timer = SINGLE_INTERVAL_MIN + Math.random() * (SINGLE_INTERVAL_MAX - SINGLE_INTERVAL_MIN);
    }
  }
}

function animateZombie(zombie, dx, dz, delta) {
  zombie.walk += delta * zombie.speed * 5;
  const swing = Math.sin(zombie.walk);
  zombie.legs[0].rotation.x = swing * 0.7;
  zombie.legs[1].rotation.x = -swing * 0.7;
  zombie.arms[0].rotation.x = Math.sin(zombie.walk * 0.5) * 0.12;
  zombie.arms[1].rotation.x = -Math.sin(zombie.walk * 0.5) * 0.12;
  zombie.model.position.y = Math.abs(swing) * 0.05;

  const targetAngle = Math.atan2(dx, dz);
  let diff = targetAngle - zombie.mesh.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  zombie.mesh.rotation.y += diff * Math.min(1, delta * 8);
}

export function updateZombies(delta, scene, player, playerBox) {
  updateRoads(delta, scene, player);

  zombieTimer -= delta;
  const chasers = zombies.reduce((n, zombie) => n + (zombie.crossDir ? 0 : 1), 0);
  if (zombieTimer <= 0 && chasers < MAX_ZOMBIES) {
    zombieTimer = ZOMBIE_SPAWN_INTERVAL;
    spawnZombie(scene, player);
  }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const zombie = zombies[i];
    const pos = zombie.mesh.position;
    const dx = player.position.x - pos.x;
    const dz = player.position.z - pos.z;
    const dist = Math.max(Math.hypot(dx, dz), 0.0001);

    const far = zombie.crossDir ? Math.abs(dz) > 30 : dist > ZOMBIE_DESPAWN_DISTANCE;
    if (far) {
      removeZombie(scene, i);
      continue;
    }

    if (zombie.crossDir) {
      pos.x += zombie.crossDir * zombie.speed * delta;
      animateZombie(zombie, zombie.crossDir, 0, delta);
      if (pos.x * zombie.crossDir > CROSS_END_X) {
        removeZombie(scene, i);
        continue;
      }
    } else {
      pos.x += (dx / dist) * zombie.speed * delta;
      pos.z += (dz / dist) * zombie.speed * delta;
      animateZombie(zombie, dx, dz, delta);
    }

    zombie.mesh.updateMatrixWorld(true);
    zombie.box.setFromObject(zombie.hitbox);
    if (playerBox.intersectsBox(zombie.box)) return true;
  }
  return false;
}

export function resetZombies(scene) {
  while (zombies.length) removeZombie(scene, zombies.length - 1);
  zombieTimer = ZOMBIE_SPAWN_INTERVAL;
  kills = 0;
}
