import * as THREE from "three";
import "./style.css";

const ARENA_HALF_SIZE = 8;
const PLAYER_WIDTH = 0.9;
const PLAYER_DEPTH = 0.62;
const PLAYER_HEIGHT = 0.5;
//const MOVE_SPEED = 6;
const HOP_TIME = 0.28; 
const HOP_HEIGHT = 0.45; 
const MAX_CELL = ARENA_HALF_SIZE - 1; 
const arenaRoot = document.querySelector("#game");
const ROW_AHEAD = 25;   
const ROW_BEHIND = 15;  
const MAX_BACK = 4;     
const ROW_WIDTH = 60;   

const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const cell = { x: 0, z: 0 };
let hop = null;     
let queued = null;  

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

// const arenaFloor = new THREE.Mesh(
//   new THREE.BoxGeometry(ARENA_HALF_SIZE * 2, 0.3, ARENA_HALF_SIZE * 2),
//   new THREE.MeshLambertMaterial({ color: "#f8f6f0" }),
// );
// arenaFloor.position.y = -0.15;
// arenaFloor.receiveShadow = true;
// scene.add(arenaFloor);

// const outlinePoints = [
//   new THREE.Vector3(-ARENA_HALF_SIZE, 0.01, -ARENA_HALF_SIZE),
//   new THREE.Vector3(ARENA_HALF_SIZE, 0.01, -ARENA_HALF_SIZE),
//   new THREE.Vector3(ARENA_HALF_SIZE, 0.01, ARENA_HALF_SIZE),
//   new THREE.Vector3(-ARENA_HALF_SIZE, 0.01, ARENA_HALF_SIZE),
// ];
// const outline = new THREE.LineLoop(
//   new THREE.BufferGeometry().setFromPoints(outlinePoints),
//   new THREE.LineBasicMaterial({ color: "#cfc9bd" }),
// );
// scene.add(outline);

const player = new THREE.Mesh(
  new THREE.BoxGeometry(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_DEPTH),
  new THREE.MeshLambertMaterial({ color: "#e87b5b" }),
);
player.position.y = PLAYER_HEIGHT / 2;
player.castShadow = true;
scene.add(player);

const rowGeometry = new THREE.BoxGeometry(ROW_WIDTH, 0.3, 1);
const rowMaterials = [
  new THREE.MeshLambertMaterial({ color: "#a8d86e" }),
  new THREE.MeshLambertMaterial({ color: "#9bcf62" }),
];
const rows = new Map(); // z -> mesh
let bestZ = 0;          // linha mais avançada já alcançada

function createRow(z) {
  const mesh = new THREE.Mesh(rowGeometry, rowMaterials[Math.abs(z) % 2]);
  mesh.position.set(0, -0.15, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  rows.set(z, mesh);
}

function updateRows() {
  const minZ = cell.z - ROW_AHEAD;
  const maxZ = cell.z + ROW_BEHIND;
  for (let z = minZ; z <= maxZ; z++) if (!rows.has(z)) createRow(z);
  for (const [z, mesh] of rows) {
    if (z < minZ || z > maxZ) {
      scene.remove(mesh);
      rows.delete(z);
    }
  }
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

// function constrainPlayer() {
//   const maxX = ARENA_HALF_SIZE - PLAYER_WIDTH / 2;
//   const maxZ = ARENA_HALF_SIZE - PLAYER_DEPTH / 2;
//   player.position.x = THREE.MathUtils.clamp(player.position.x, -maxX, maxX);
//   player.position.z = THREE.MathUtils.clamp(player.position.z, -maxZ, maxZ);
// }

// function getMovement() {
//   const movement = { x: 0, z: 0 };
//   if (pressed.has("left")) movement.x -= 1;
//   if (pressed.has("right")) movement.x += 1;
//   if (pressed.has("up")) movement.z -= 1;
//   if (pressed.has("down")) movement.z += 1;
//   return movement;
// }

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
 
  if (hop) {
    hop.t = Math.min(hop.t + delta / HOP_TIME, 1);
    const k = hop.t;
    player.position.x = THREE.MathUtils.lerp(hop.fromX, hop.toX, k);
    player.position.z = THREE.MathUtils.lerp(hop.fromZ, hop.toZ, k);
    player.position.y = PLAYER_HEIGHT / 2 + Math.sin(k * Math.PI) * HOP_HEIGHT;
 
    if (k === 1) {
      cell.x = hop.toX;
      cell.z = hop.toZ;
      bestZ = Math.min(bestZ, cell.z);
      updateRows();
      hop = null;
      const next = queued ?? [...pressed].pop(); 
      queued = null;
      if (next) startHop(next);
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

function startHop(dir) {
  const [dx, dz] = vectors[dir];
  const toX = THREE.MathUtils.clamp(cell.x + dx, -MAX_CELL, MAX_CELL);
  const toZ = Math.min(cell.z + dz, bestZ + MAX_BACK); 
  if (toX === cell.x && toZ === cell.z) return; 
  hop = { fromX: cell.x, fromZ: cell.z, toX, toZ, t: 0 };
}

const clock = new THREE.Clock();

document.addEventListener("keydown", (event) => {
  const direction = directions[event.key.toLowerCase()];
  if (!direction) return;
  event.preventDefault();
  if (event.repeat) return;
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
  const halfHeight = Math.max(ARENA_HALF_SIZE * 1.2, ARENA_HALF_SIZE * Math.SQRT2 * 1.12 / aspect);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(arenaRoot.clientWidth, arenaRoot.clientHeight);
});

window.dispatchEvent(new Event("resize"));
updateRows();
animate();
