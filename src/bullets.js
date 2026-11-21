import * as THREE from "three";
import { hitboxes, killZombie, zombies } from "./zombies.js";
import { rows } from "./world.js";
import { emit } from "./particles.js";
import { muzzleFlash } from "./lighting.js";
import { playShoot, playZombieHit } from "./sounds.js";

const BULLET_SPEED = 18;
const BULLET_RANGE = 12;
const SHOOT_COOLDOWN = 0.25;
const AIM_ASSIST_COS = Math.cos(THREE.MathUtils.degToRad(30));
const AIM_TURN_SPEED = 10;

const bulletGeo = new THREE.BoxGeometry(0.15, 0.15, 0.5);
const bulletMat = new THREE.MeshBasicMaterial({ color: "#ffd23f" });

const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const aimDir = new THREE.Vector3();

const bullets = [];
let shootCooldown = 0;

function findTarget(player, dx, dz) {
  let best = null;
  let bestDist = Infinity;
  for (const zombie of zombies) {
    toTarget.set(
      zombie.mesh.position.x - player.position.x,
      0,
      zombie.mesh.position.z - player.position.z,
    );
    const dist = toTarget.length();
    if (dist < 0.3 || dist > BULLET_RANGE) continue;
    const cos = (toTarget.x * dx + toTarget.z * dz) / dist;
    if (cos < AIM_ASSIST_COS) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = zombie;
    }
  }
  return best;
}

export function shoot(scene, player, direction) {
  if (shootCooldown > 0) return;
  shootCooldown = SHOOT_COOLDOWN;
  playShoot();
  muzzleFlash();

  let [dx, dz] = direction;
  const target = findTarget(player, dx, dz);
  const startX = player.position.x + dx * 0.6;
  const startZ = player.position.z + dz * 0.6;
  if (target) {
    aimDir.set(target.mesh.position.x - startX, 0, target.mesh.position.z - startZ);
    if (aimDir.lengthSq() > 0.0001) {
      aimDir.normalize();
      dx = aimDir.x;
      dz = aimDir.z;
    }
  }

  const mesh = new THREE.Mesh(bulletGeo, bulletMat);
  mesh.position.set(startX, 0.5, startZ);
  mesh.rotation.y = Math.atan2(dx, dz);
  scene.add(mesh);
  bullets.push({ mesh, traveled: 0, dx, dz, target });
}

function removeBullet(scene, index) {
  scene.remove(bullets[index].mesh);
  bullets.splice(index, 1);
}

function steer(bullet, prevX, prevZ, delta) {
  if (!bullet.target) return;
  if (!zombies.includes(bullet.target)) {
    bullet.target = null;
    return;
  }
  const tp = bullet.target.mesh.position;
  toTarget.set(tp.x - prevX, 0, tp.z - prevZ);
  const dist = toTarget.length();
  if (dist < 0.0001 || toTarget.x * bullet.dx + toTarget.z * bullet.dz < 0) {
    bullet.target = null;
    return;
  }
  toTarget.divideScalar(dist);
  const t = Math.min(1, AIM_TURN_SPEED * delta);
  aimDir.set(bullet.dx, 0, bullet.dz).lerp(toTarget, t).normalize();
  bullet.dx = aimDir.x;
  bullet.dz = aimDir.z;
  bullet.mesh.rotation.y = Math.atan2(bullet.dx, bullet.dz);
}

export function updateBullets(delta, scene) {
  shootCooldown = Math.max(0, shootCooldown - delta);
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const step = BULLET_SPEED * delta;
    const prevX = bullet.mesh.position.x;
    const prevZ = bullet.mesh.position.z;

    steer(bullet, prevX, prevZ, delta);

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
