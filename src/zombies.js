import * as THREE from "three";

export const ZOMBIE_SIZE = 0.7;
const ZOMBIE_SPEED_MIN = 1.2;
const ZOMBIE_SPEED_MAX = 2;
const ZOMBIE_SPAWN_DISTANCE = 11;
const ZOMBIE_DESPAWN_DISTANCE = 20;
const ZOMBIE_SPAWN_INTERVAL = 1.5;
const ZOMBIE_HIT_DISTANCE = 0.7;
const MAX_ZOMBIES = 12;

const zombieGeo = new THREE.BoxGeometry(ZOMBIE_SIZE, 0.9, ZOMBIE_SIZE);
const zombieMat = new THREE.MeshLambertMaterial({ color: "#5b8c3a" });

export const zombies = [];
let zombieTimer = ZOMBIE_SPAWN_INTERVAL;

function spawnZombie(scene, player) {
  const angle = Math.random() * Math.PI * 2;
  const mesh = new THREE.Mesh(zombieGeo, zombieMat);
  mesh.position.set(
    player.position.x + Math.cos(angle) * ZOMBIE_SPAWN_DISTANCE,
    0.45,
    player.position.z + Math.sin(angle) * ZOMBIE_SPAWN_DISTANCE,
  );
  mesh.castShadow = true;
  scene.add(mesh);
  const speed = ZOMBIE_SPEED_MIN + Math.random() * (ZOMBIE_SPEED_MAX - ZOMBIE_SPEED_MIN);
  zombies.push({ mesh, speed });
}

export function removeZombie(scene, index) {
  scene.remove(zombies[index].mesh);
  zombies.splice(index, 1);
}

export function updateZombies(delta, scene, player) {
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
    const dist = Math.hypot(dx, dz);
    if (dist < ZOMBIE_HIT_DISTANCE) return true;
    if (dist > ZOMBIE_DESPAWN_DISTANCE) {
      removeZombie(scene, i);
      continue;
    }
    pos.x += (dx / dist) * zombie.speed * delta;
    pos.z += (dz / dist) * zombie.speed * delta;
  }
  return false;
}

export function resetZombies(scene) {
  while (zombies.length) removeZombie(scene, zombies.length - 1);
  zombieTimer = ZOMBIE_SPAWN_INTERVAL;
}
