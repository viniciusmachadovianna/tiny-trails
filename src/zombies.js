import * as THREE from "three";
import { playGroan } from "./sounds.js";
import { emit } from "./particles.js";

const ZOMBIE_SPEED_MIN = 1.2;
const ZOMBIE_SPEED_MAX = 2;
const ZOMBIE_SPAWN_DISTANCE = 11;
const ZOMBIE_DESPAWN_DISTANCE = 20;
const ZOMBIE_SPAWN_INTERVAL = 1.5;
const MAX_ZOMBIES = 12;

const skinColor = "#86b35e";
const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
const pantsMat = new THREE.MeshLambertMaterial({ color: "#3b3550" });
const eyeMat = new THREE.MeshBasicMaterial({ color: "#e84a4a" });
const mouthMat = new THREE.MeshLambertMaterial({ color: "#3a1414" });
const shirtColors = ["#3f6fa8", "#a8493f", "#7a5aa8", "#c9a23f"];
const shirtMats = shirtColors.map((color) => new THREE.MeshLambertMaterial({ color }));
const hitboxMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

const bodyGeo = new THREE.BoxGeometry(0.5, 0.35, 0.28);
const headGeo = new THREE.BoxGeometry(0.38, 0.32, 0.34);
const legGeo = new THREE.BoxGeometry(0.16, 0.3, 0.18).translate(0, -0.15, 0);
const armGeo = new THREE.BoxGeometry(0.13, 0.13, 0.42).translate(0, 0, 0.21);
const eyeGeo = new THREE.BoxGeometry(0.07, 0.07, 0.02);
const mouthGeo = new THREE.BoxGeometry(0.16, 0.04, 0.02);
const patchGeo = new THREE.BoxGeometry(0.16, 0.12, 0.02);
const hitboxGeo = new THREE.BoxGeometry(0.6, 1, 0.5);

export const zombies = [];
export const hitboxes = [];
let zombieTimer = ZOMBIE_SPAWN_INTERVAL;

function createZombieModel() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  const shirtIndex = Math.floor(Math.random() * shirtMats.length);

  const body = new THREE.Mesh(bodyGeo, shirtMats[shirtIndex]);
  body.position.y = 0.475;
  const patch = new THREE.Mesh(patchGeo, skinMat);
  patch.position.set(0.1, 0.42, 0.141);

  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 0.81;
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.09, 0.04, 0.175);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.09, 0.04, 0.175);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, -0.08, 0.175);
  head.add(eyeL, eyeR, mouth);

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

  model.add(body, patch, head, ...legs, ...arms);
  model.traverse((child) => {
    if (child.isMesh && child.material !== eyeMat) child.castShadow = true;
  });

  const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
  hitbox.position.y = 0.5;
  root.add(hitbox);

  return { root, model, legs, arms, hitbox, shirtColor: shirtColors[shirtIndex] };
}

function spawnZombie(scene, player) {
  const angle = Math.random() * Math.PI * 2;
  const parts = createZombieModel();
  parts.root.position.set(
    player.position.x + Math.cos(angle) * ZOMBIE_SPAWN_DISTANCE,
    0,
    player.position.z + Math.sin(angle) * ZOMBIE_SPAWN_DISTANCE,
  );
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
  };
  parts.hitbox.userData.zombie = zombie;
  parts.root.updateMatrixWorld(true);
  zombies.push(zombie);
  hitboxes.push(parts.hitbox);
  if (Math.random() < 0.4) playGroan();
}

export function removeZombie(scene, index) {
  if (index < 0) return;
  scene.remove(zombies[index].mesh);
  zombies.splice(index, 1);
  hitboxes.splice(index, 1);
}

export function killZombie(scene, zombie) {
  const pos = zombie.mesh.position;
  emit(pos.x, 0.5, pos.z, skinColor, 8, 3.2);
  emit(pos.x, 0.5, pos.z, zombie.shirtColor, 6, 3.2);
  emit(pos.x, 0.5, pos.z, "#7a1f1f", 4, 2.5);
  removeZombie(scene, zombies.indexOf(zombie));
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
  zombieTimer -= delta;
  if (zombieTimer <= 0 && zombies.length < MAX_ZOMBIES) {
    zombieTimer = ZOMBIE_SPAWN_INTERVAL;
    spawnZombie(scene, player);
  }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const zombie = zombies[i];
    const pos = zombie.mesh.position;
    const dx = player.position.x - pos.x;
    const dz = player.position.z - pos.z;
    const dist = Math.max(Math.hypot(dx, dz), 0.0001);
    if (dist > ZOMBIE_DESPAWN_DISTANCE) {
      removeZombie(scene, i);
      continue;
    }
    pos.x += (dx / dist) * zombie.speed * delta;
    pos.z += (dz / dist) * zombie.speed * delta;
    animateZombie(zombie, dx, dz, delta);

    zombie.mesh.updateMatrixWorld(true);
    zombie.box.setFromObject(zombie.hitbox);
    if (playerBox.intersectsBox(zombie.box)) return true;
  }
  return false;
}

export function resetZombies(scene) {
  while (zombies.length) removeZombie(scene, zombies.length - 1);
  zombieTimer = ZOMBIE_SPAWN_INTERVAL;
}
