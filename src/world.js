import * as THREE from "three";
import { mergeBoxes, vertexColorMaterial } from "./merge.js";

export const MAX_CELL_X = 10;
export const ROW_WIDTH = 60;
export const WRAP = ROW_WIDTH / 2;
const ROW_AHEAD = 25;
const ROW_BEHIND = 15;

let scene = null;
export const rows = new Map();
const rowInfo = new Map();
let lastGen = -1;
let run = { type: "grass", left: 3 };
let currentRoad = null;

const START_INFO = {
  type: "grass",
  trees: new Set(),
  logs: [],
  cars: [],
  carCells: new Set(),
  road: null,
};

function makeTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(ROW_WIDTH / 2, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function speckle(ctx, w, h, colors, count) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 3, 3);
  }
}

const grassTexture = makeTexture(128, 64, (ctx, w, h) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, ["#e4f0d2", "#d3e5b5"], 60);
});

const roadTexture = makeTexture(128, 64, (ctx, w, h) => {
  ctx.fillStyle = "#4a4a50";
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, ["#44444a", "#52525a"], 50);
});

const roadLineTexture = makeTexture(128, 64, (ctx, w, h) => {
  ctx.fillStyle = "#4a4a50";
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, ["#44444a", "#52525a"], 50);
  ctx.fillStyle = "#d8d8cc";
  ctx.fillRect(28, h / 2 - 2, 72, 4);
});

const waterTexture = makeTexture(128, 64, (ctx, w, h) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#cdeefb";
  ctx.lineWidth = 3;
  for (let y = 12; y < h; y += 24) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin((x / w) * Math.PI * 2) * 4;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
});

const trunkGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
const leavesGeo = new THREE.BoxGeometry(0.8, 0.9, 0.8);
const trunkMat = new THREE.MeshLambertMaterial({ color: "#8b5a2b" });
const leavesMat = new THREE.MeshLambertMaterial({ color: "#3f9b4a" });
const logGeo = new THREE.BoxGeometry(1, 0.2, 0.8);
const logMat = new THREE.MeshLambertMaterial({ color: "#9c6b3a" });
const rowGeometry = new THREE.BoxGeometry(ROW_WIDTH, 0.3, 1);

const waterMaterial = new THREE.MeshLambertMaterial({ color: "#5ec2e8", map: waterTexture });
const rowMaterials = [
  new THREE.MeshLambertMaterial({ color: "#a8d86e", map: grassTexture }),
  new THREE.MeshLambertMaterial({ color: "#9bcf62", map: grassTexture }),
];
const roadMaterials = [
  new THREE.MeshLambertMaterial({ map: roadLineTexture }),
  new THREE.MeshLambertMaterial({ color: "#ececf0", map: roadTexture }),
];

const dummy = new THREE.Object3D();

const parkedCarColors = ["#7b8794", "#8a6f5a", "#6f7a5a"];
const carBodyGeo = new THREE.BoxGeometry(1.8, 0.32, 0.72);
const carCabinGeo = new THREE.BoxGeometry(0.9, 0.26, 0.62);
const carWheelGeo = new THREE.BoxGeometry(0.32, 0.2, 0.08);

function buildCarGeometry(color) {
  const parts = [
    { geometry: carBodyGeo, position: [0, 0.26, 0], color },
    { geometry: carCabinGeo, position: [-0.15, 0.55, 0], color: "#2c3440" },
  ];
  for (const wx of [-0.55, 0.55]) {
    for (const wz of [-0.38, 0.38]) {
      parts.push({ geometry: carWheelGeo, position: [wx, 0.1, wz], color: "#1d1d20" });
    }
  }
  return mergeBoxes(parts);
}

const parkedCarGeos = parkedCarColors.map(buildCarGeometry);

export function initWorld(targetScene) {
  scene = targetScene;
}

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

function placeParkedCar(info) {
  if (Math.random() >= 0.05) return;
  const x0 = Math.floor(Math.random() * 25) - 12;
  info.cars.push({
    x: x0 + 0.5,
    angle: (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.4,
    colorIndex: Math.floor(Math.random() * parkedCarColors.length),
  });
  for (const cellX of [x0, x0 + 1]) {
    info.trees.add(cellX);
    info.carCells.add(cellX);
  }
}

function makeInfo(z) {
  if (run.left <= 0) {
    const previous = run.type;
    run = previous === "river" ? { type: "grass", left: 1 } : randomRun();
    if (previous === "road" && run.type === "road") {
      run = { type: "grass", left: 1 + Math.floor(Math.random() * 3) };
    }
    run.size = run.left;
    currentRoad =
      run.type === "road"
        ? { rows: [], big: run.size >= 3, dir: Math.random() < 0.5 ? -1 : 1, timer: undefined, warned: false }
        : null;
  }
  run.left--;
  const info = {
    type: run.type,
    trees: new Set(),
    logs: [],
    cars: [],
    carCells: new Set(),
    road: run.type === "road" ? currentRoad : null,
  };
  if (info.road) info.road.rows.push(z);
  if (run.type === "grass") {
    for (let x = -26; x <= 26; x++) {
      const playable = Math.abs(x) <= MAX_CELL_X;
      if (Math.random() < (playable ? 0.14 : 0.5)) info.trees.add(x);
    }
  }
  if (run.type === "river") createLogs(info);
  if (run.type === "road") placeParkedCar(info);
  return info;
}

export function getRowInfo(z) {
  if (z >= -1) return START_INFO;
  while (lastGen > z) {
    lastGen--;
    rowInfo.set(lastGen, makeInfo(lastGen));
  }
  return rowInfo.get(z);
}

export function isBlocked(x, z) {
  return getRowInfo(z).trees.has(x);
}

function createTrees(row, info) {
  const xs = [...info.trees].filter((x) => !info.carCells.has(x));
  if (!xs.length) return;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, xs.length);
  const leaves = new THREE.InstancedMesh(leavesGeo, leavesMat, xs.length);
  xs.forEach((x, i) => {
    dummy.position.set(x, 0.25, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.95, 0);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  for (const mesh of [trunks, leaves]) {
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    row.add(mesh);
  }
}

function createCarMesh(car) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(parkedCarGeos[car.colorIndex], vertexColorMaterial);
  body.rotation.y = car.angle;
  body.castShadow = true;
  group.add(body);
  group.position.x = car.x;
  return group;
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

  createTrees(row, info);
  for (const car of info.cars) row.add(createCarMesh(car));

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

function disposeRow(row) {
  scene.remove(row);
  row.traverse((child) => {
    if (child.isInstancedMesh) child.dispose();
  });
}

export function updateRows(centerZ) {
  const minZ = centerZ - ROW_AHEAD;
  const maxZ = centerZ + ROW_BEHIND;
  for (let z = minZ; z <= maxZ; z++) {
    if (!rows.has(z)) createRow(z);
  }
  for (const [z, row] of rows) {
    if (z < minZ || z > maxZ) {
      disposeRow(row);
      rows.delete(z);
    }
  }
}

export function updateLogs(delta) {
  for (const row of rows.values()) {
    for (const log of row.userData.info.logs) {
      log.x += log.dir * log.speed * delta;
      if (log.x > WRAP) log.x -= ROW_WIDTH;
      if (log.x < -WRAP) log.x += ROW_WIDTH;
      log.mesh.position.x = log.x;
    }
  }
}

export function updateWater(delta) {
  waterTexture.offset.x += delta * 0.4;
}

export function resetWorld() {
  for (const row of rows.values()) disposeRow(row);
  rows.clear();
  rowInfo.clear();
  lastGen = -1;
  run = { type: "grass", left: 3 };
  currentRoad = null;
}
