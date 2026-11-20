import * as THREE from "three";
import { removeZombie, ZOMBIE_SIZE, zombies } from "./zombies.js";
import { playShoot, playZombieHit } from "./sounds.js";

const BULLET_SPEED = 18;
const BULLET_RANGE = 12;
const SHOOT_COOLDOWN = 0.25;

const bulletGeo = new THREE.BoxGeometry(0.15, 0.15, 0.5);
const bulletMat = new THREE.MeshBasicMaterial({ color: "#ffd23f" });

const bullets = [];
let shootCooldown = 0;

export function shoot(scene, player, direction) {
  if (shootCooldown > 0) return;
  shootCooldown = SHOOT_COOLDOWN;
  playShoot();
  const [dx, dz] = direction;
  const mesh = new THREE.Mesh(bulletGeo, bulletMat);
  mesh.position.set(player.position.x + dx * 0.6, 0.6, player.position.z + dz * 0.6);
  mesh.rotation.y = dx !== 0 ? Math.PI / 2 : 0;
  scene.add(mesh);
  bullets.push({ mesh, traveled: 0, dx, dz });
}

function removeBullet(scene, index) {
  scene.remove(bullets[index].mesh);
  bullets.splice(index, 1);
}

export function updateBullets(delta, scene, rows) {
  shootCooldown = Math.max(0, shootCooldown - delta);
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const step = BULLET_SPEED * delta;
    const prevX = bullet.mesh.position.x;
    const prevZ = bullet.mesh.position.z;
    bullet.mesh.position.x += bullet.dx * step;
    bullet.mesh.position.z += bullet.dz * step;
    bullet.traveled += step;

    const bx = bullet.mesh.position.x;
    const bz = bullet.mesh.position.z;
    const reach = ZOMBIE_SIZE / 2 + 0.1;
    const minX = Math.min(prevX, bx) - reach;
    const maxX = Math.max(prevX, bx) + reach;
    const minZ = Math.min(prevZ, bz) - reach;
    const maxZ = Math.max(prevZ, bz) + reach;
    const hit = zombies.findIndex((zombie) => {
      const zp = zombie.mesh.position;
      return zp.x > minX && zp.x < maxX && zp.z > minZ && zp.z < maxZ;
    });
    if (hit !== -1) {
      playZombieHit();
      removeZombie(scene, hit);
      removeBullet(scene, i);
      continue;
    }

    const row = rows.get(Math.round(bz));
    const col = Math.round(bx);
    if (row && row.userData.info.trees.has(col)) {
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