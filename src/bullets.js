import * as THREE from "three";
import { hitboxes, killZombie } from "./zombies.js";
import { rows } from "./world.js";
import { emit } from "./particles.js";
import { muzzleFlash } from "./lighting.js";
import { playShoot, playZombieHit } from "./sounds.js";

const BULLET_SPEED = 18;
const BULLET_RANGE = 12;
const SHOOT_COOLDOWN = 0.25;

const bulletGeo = new THREE.BoxGeometry(0.15, 0.15, 0.5);
const bulletMat = new THREE.MeshBasicMaterial({ color: "#ffd23f" });

const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();

const bullets = [];
let shootCooldown = 0;

export function shoot(scene, player, direction) {
  if (shootCooldown > 0) return;
  shootCooldown = SHOOT_COOLDOWN;
  playShoot();
  muzzleFlash();
  const [dx, dz] = direction;
  const mesh = new THREE.Mesh(bulletGeo, bulletMat);
  mesh.position.set(player.position.x + dx * 0.6, 0.5, player.position.z + dz * 0.6);
  mesh.rotation.y = dx !== 0 ? Math.PI / 2 : 0;
  scene.add(mesh);
  bullets.push({ mesh, traveled: 0, dx, dz });
}

function removeBullet(scene, index) {
  scene.remove(bullets[index].mesh);
  bullets.splice(index, 1);
}

export function updateBullets(delta, scene) {
  shootCooldown = Math.max(0, shootCooldown - delta);
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const step = BULLET_SPEED * delta;
    const prevX = bullet.mesh.position.x;
    const prevZ = bullet.mesh.position.z;

    rayOrigin.set(prevX, 0.5, prevZ);
    rayDirection.set(bullet.dx, 0, bullet.dz);
    raycaster.set(rayOrigin, rayDirection);
    raycaster.far = step + 0.05;
    const hits = raycaster.intersectObjects(hitboxes, false);
    if (hits.length > 0) {
      const zombie = hits[0].object.userData.zombie;
      playZombieHit();
      killZombie(scene, zombie);
      removeBullet(scene, i);
      continue;
    }

    bullet.mesh.position.x += bullet.dx * step;
    bullet.mesh.position.z += bullet.dz * step;
    bullet.traveled += step;

    const bx = bullet.mesh.position.x;
    const bz = bullet.mesh.position.z;
    const row = rows.get(Math.round(bz));
    if (row && row.userData.info.trees.has(Math.round(bx))) {
      emit(bx, 0.6, bz, "#3f9b4a", 4, 2);
      removeBullet(scene, i);
    } else if (bullet.traveled >= BULLET_RANGE) {
      removeBullet(scene, i);
    }
  }
}

export function resetBullets(scene) {
  while (bullets.length) removeBullet(scene, bullets.length - 1);
  shootCooldown = 0;
}
