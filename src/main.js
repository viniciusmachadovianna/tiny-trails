import * as THREE from "three";
import "./style.css";

const ARENA_HALF_SIZE = 8;
const PLAYER_WIDTH = 0.9;
const PLAYER_DEPTH = 0.62;
const PLAYER_HEIGHT = 0.5;
const HOP_TIME = 0.16;
const HOP_TIME_HELD = 0.28;
const HOP_HEIGHT = 0.45;
const MAX_CELL_X = 10;
const ROW_AHEAD = 25;
const ROW_BEHIND = 15;
const MAX_BACK = 4;
const ROW_WIDTH = 60;
const WRAP = ROW_WIDTH / 2;
const BULLET_SPEED = 18;
const BULLET_RANGE = 12;
const SHOOT_COOLDOWN = 0.25;
const ZOMBIE_SIZE = 0.7;
const ZOMBIE_SPEED_MIN = 1.2;
const ZOMBIE_SPEED_MAX = 2;
const ZOMBIE_SPAWN_DISTANCE = 11;
const ZOMBIE_DESPAWN_DISTANCE = 20;
const ZOMBIE_SPAWN_INTERVAL = 1.5;
const ZOMBIE_HIT_DISTANCE = 0.7;
const MAX_ZOMBIES = 12;
const arenaRoot = document.querySelector("#game");

const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const cell = { x: 0, z: 0 };
let hop = null;
let queued = null;
let riding = null;
const bullets = [];
let shootCooldown = 0;
let facing = "up";
const zombies = [];
let zombieTimer = ZOMBIE_SPAWN_INTERVAL;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f4f1e8");
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

scene.add(new THREE.HemisphereLight("#ffffff", "#aaa49a", 2));
const sunlight = new THREE.DirectionalLight("#ffffff", 2.5);
sunlight.position.set(-8, 14, 10);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1024, 1024);
sunlight.shadow.camera.left = -12;
sunlight.shadow.camera.right = 12;
sunlight.shadow.camera.top = 12;
sunlight.shadow.camera.bottom = -12;
scene.add(sunlight);
scene.add(sunlight.target);
const focus = new THREE.Vector3(0, 0, 0);

const player = new THREE.Mesh(
  new THREE.BoxGeometry(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_DEPTH),
  new THREE.MeshLambertMaterial({ color: "#e87b5b" }),
);
player.position.y = PLAYER_HEIGHT / 2;
player.castShadow = true;
scene.add(player);

const faceMarker = new THREE.Mesh(
  new THREE.BoxGeometry(0.22, 0.22, 0.22),
  new THREE.MeshLambertMaterial({ color: "#3b2a20" }),
);
player.add(faceMarker);

function setFacing(dir) {
  facing = dir;
  const [dx, dz] = vectors[dir];
  faceMarker.position.set(dx * 0.4, 0.1, dz * 0.25);
}

const trunkGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
const leavesGeo = new THREE.BoxGeometry(0.8, 0.9, 0.8);
const trunkMat = new THREE.MeshLambertMaterial({ color: "#8b5a2b" });
const leavesMat = new THREE.MeshLambertMaterial({ color: "#3f9b4a" });
const waterMaterial = new THREE.MeshLambertMaterial({ color: "#5ec2e8" });
const logGeo = new THREE.BoxGeometry(1, 0.2, 0.8);
const logMat = new THREE.MeshLambertMaterial({ color: "#9c6b3a" });
const bulletGeo = new THREE.BoxGeometry(0.15, 0.15, 0.5);
const bulletMat = new THREE.MeshBasicMaterial({ color: "#ffd23f" });
const zombieGeo = new THREE.BoxGeometry(ZOMBIE_SIZE, 0.9, ZOMBIE_SIZE);
const zombieMat = new THREE.MeshLambertMaterial({ color: "#5b8c3a" });

const rowGeometry = new THREE.BoxGeometry(ROW_WIDTH, 0.3, 1);
const rowMaterials = [
  new THREE.MeshLambertMaterial({ color: "#a8d86e" }),
  new THREE.MeshLambertMaterial({ color: "#9bcf62" }),
];
const roadMaterials = [
  new THREE.MeshLambertMaterial({ color: "#4a4a50" }),
  new THREE.MeshLambertMaterial({ color: "#55555c" }),
];

const rows = new Map();
const rowInfo = new Map();
let bestZ = 0;
let lastGen = -1;
let run = { type: "grass", left: 3 };

function randomRun() {
  const r = Math.random();
  if (r < 0.4) return { type: "road", left: 1 + Math.floor(Math.random() * 3) };
  if (r < 0.52) return { type: "river", left: 1 + Math.floor(Math.random() * 2) };
  return { type: "grass", left: 1 + Math.floor(Math.random() * 3) };
}

function createLogs(info) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const speed = 1 + Math.random() * 1.3;
  let x = -WRAP + 2 + Math.random() * 3;
  while (x < WRAP - 2) {
    const len = 2 + Math.floor(Math.random() * 2);
    info.logs.push({ x: x + len / 2, len, dir, speed });
    x += len + 2 + Math.floor(Math.random() * 2);
  }
}

function makeInfo() {
  if (run.left <= 0) {
    run = run.type === "river" ? { type: "grass", left: 1 } : randomRun();
  }
  run.left--;
  const info = { type: run.type, trees: new Set(), logs: [] };
  if (run.type === "grass") {
    for (let x = -26; x <= 26; x++) {
      const playable = Math.abs(x) <= MAX_CELL_X;
      if (Math.random() < (playable ? 0.14 : 0.5)) info.trees.add(x);
    }
  }
  if (run.type === "river") createLogs(info);
  return info;
}

function getRowInfo(z) {
  if (z >= -1) return { type: "grass", trees: new Set(), logs: [] };
  while (lastGen > z) {
    lastGen--;
    rowInfo.set(lastGen, makeInfo());
  }
  return rowInfo.get(z);
}

function createTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.25;
  const leaves = new THREE.Mesh(leavesGeo, leavesMat);
  leaves.position.y = 0.95;
  trunk.castShadow = true;
  leaves.castShadow = true;
  tree.add(trunk, leaves);
  return tree;
}

function createRow(z) {
  const info = getRowInfo(z);
  const row = new THREE.Group();
  row.userData.info = info;

  let material = rowMaterials[Math.abs(z) % 2];
  if (info.type === "river") material = waterMaterial;
  if (info.type === "road") material = roadMaterials[Math.abs(z) % 2];

  const floor = new THREE.Mesh(rowGeometry, material);
  floor.position.y = info.type === "river" ? -0.25 : -0.15;
  floor.receiveShadow = true;
  row.add(floor);

  for (const x of info.trees) {
    const tree = createTree();
    tree.position.x = x;
    row.add(tree);
  }

  for (const log of info.logs) {
    const mesh = new THREE.Mesh(logGeo, logMat);
    mesh.scale.x = log.len;
    mesh.position.set(log.x, -0.1, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    row.add(mesh);
    log.mesh = mesh;
  }

  row.position.z = z;
  scene.add(row);
  rows.set(z, row);
}

function updateRows() {
  const minZ = cell.z - ROW_AHEAD;
  const maxZ = cell.z + ROW_BEHIND;
  for (let z = minZ; z <= maxZ; z++) {
    if (!rows.has(z)) createRow(z);
  }
  for (const [z, row] of rows) {
    if (z < minZ || z > maxZ) {
      scene.remove(row);
      rows.delete(z);
    }
  }
}

function updateLogs(delta) {
  for (const row of rows.values()) {
    for (const log of row.userData.info.logs) {
      log.x += log.dir * log.speed * delta;
      if (log.x > WRAP) log.x -= ROW_WIDTH;
      if (log.x < -WRAP) log.x += ROW_WIDTH;
      log.mesh.position.x = log.x;
    }
  }
}

function shoot() {
  if (shootCooldown > 0) return;
  shootCooldown = SHOOT_COOLDOWN;
  const mesh = new THREE.Mesh(bulletGeo, bulletMat);
  const [dx, dz] = vectors[facing];
  mesh.position.set(player.position.x + dx * 0.6, 0.6, player.position.z + dz * 0.6);
  mesh.rotation.y = dx !== 0 ? Math.PI / 2 : 0;
  scene.add(mesh);
  bullets.push({ mesh, traveled: 0, dx, dz });
}

function removeBullet(index) {
  scene.remove(bullets[index].mesh);
  bullets.splice(index, 1);
}

function updateBullets(delta) {
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
      removeZombie(hit);
      removeBullet(i);
      continue;
    }

    const row = rows.get(Math.round(bz));
    const col = Math.round(bx);
    if (row && row.userData.info.trees.has(col)) {
      removeBullet(i);
    } else if (bullet.traveled >= BULLET_RANGE) {
      removeBullet(i);
    }
  }
}

function spawnZombie() {
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

function removeZombie(index) {
  scene.remove(zombies[index].mesh);
  zombies.splice(index, 1);
}

// Moves zombies toward the player. Returns true if one reached the player.
function updateZombies(delta) {
  zombieTimer -= delta;
  if (zombieTimer <= 0 && zombies.length < MAX_ZOMBIES) {
    zombieTimer = ZOMBIE_SPAWN_INTERVAL;
    spawnZombie();
  }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const zombie = zombies[i];
    const pos = zombie.mesh.position;
    const dx = player.position.x - pos.x;
    const dz = player.position.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ZOMBIE_HIT_DISTANCE) return true;
    if (dist > ZOMBIE_DESPAWN_DISTANCE) {
      removeZombie(i);
      continue;
    }
    pos.x += (dx / dist) * zombie.speed * delta;
    pos.z += (dz / dist) * zombie.speed * delta;
  }
  return false;
}

function resetGame() {
  while (bullets.length) removeBullet(bullets.length - 1);
  shootCooldown = 0;
  setFacing("up");
  while (zombies.length) removeZombie(zombies.length - 1);
  zombieTimer = ZOMBIE_SPAWN_INTERVAL;
  for (const row of rows.values()) scene.remove(row);
  rows.clear();
  rowInfo.clear();
  lastGen = -1;
  run = { type: "grass", left: 3 };
  cell.x = 0;
  cell.z = 0;
  bestZ = 0;
  hop = null;
  queued = null;
  riding = null;
  player.position.set(0, PLAYER_HEIGHT / 2, 0);
  focus.set(0, 0, 0);
  updateRows();
}

function startHop(dir, duration = HOP_TIME) {
  const [dx, dz] = vectors[dir];
  const baseX = Math.round(player.position.x);
  const toX = THREE.MathUtils.clamp(baseX + dx, -MAX_CELL_X, MAX_CELL_X);
  const toZ = Math.min(cell.z + dz, bestZ + MAX_BACK);
  if (toX === baseX && toZ === cell.z) return;
  if (getRowInfo(toZ).trees.has(toX)) return;
  riding = null;
  hop = { fromX: player.position.x, fromZ: cell.z, toX, toZ, t: 0, duration };
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
  updateBullets(delta);
  if (updateZombies(delta)) {
    resetGame();
    return;
  }

  if (!hop && riding) {
    player.position.x = riding.log.x + riding.offset;
    if (Math.abs(player.position.x) > MAX_CELL_X + 0.5) {
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
      updateRows();

      const info = getRowInfo(cell.z);
      if (info.type === "river") {
        const log = info.logs.find(
          (l) => Math.abs(player.position.x - l.x) <= l.len / 2 + 0.2,
        );
        if (!log) {
          resetGame();
          return;
        }
        riding = { log, offset: player.position.x - log.x };
      }

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

  const follow = 1 - Math.exp(-6 * delta);
  focus.x += (player.position.x * 0.3 - focus.x) * follow;
  focus.z += (player.position.z - focus.z) * follow;
  camera.position.set(focus.x + 14, 20, focus.z + 14);
  sunlight.position.set(focus.x - 8, 14, focus.z + 10);
  sunlight.target.position.set(focus.x, 0, focus.z);

  renderer.render(scene, camera);
}

document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    shoot();
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
updateRows();
animate();