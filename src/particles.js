import * as THREE from "three";

const COUNT = 400;
const HIDDEN_Y = -1000;

const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const velocities = new Float32Array(COUNT * 3);
const life = new Float32Array(COUNT);
let cursor = 0;
const tmpColor = new THREE.Color();

for (let i = 0; i < COUNT; i++) positions[i * 3 + 1] = HIDDEN_Y;

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
const material = new THREE.PointsMaterial({
  size: 7 * pixelRatio,
  sizeAttenuation: false,
  vertexColors: true,
});

const points = new THREE.Points(geometry, material);
points.frustumCulled = false;

export function initParticles(scene) {
  scene.add(points);
}

export function emit(x, y, z, color, count = 10, power = 3) {
  tmpColor.set(color);
  for (let n = 0; n < count; n++) {
    const i = cursor;
    cursor = (cursor + 1) % COUNT;
    const angle = Math.random() * Math.PI * 2;
    const speed = power * (0.4 + Math.random() * 0.6);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    velocities[i * 3] = Math.cos(angle) * speed;
    velocities[i * 3 + 1] = 2 + Math.random() * 3;
    velocities[i * 3 + 2] = Math.sin(angle) * speed;
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
    life[i] = 0.5 + Math.random() * 0.5;
  }
  geometry.attributes.color.needsUpdate = true;
}

export function updateParticles(delta) {
  for (let i = 0; i < COUNT; i++) {
    if (life[i] <= 0) continue;
    life[i] -= delta;
    if (life[i] <= 0) {
      positions[i * 3 + 1] = HIDDEN_Y;
      continue;
    }
    velocities[i * 3 + 1] -= 14 * delta;
    positions[i * 3] += velocities[i * 3] * delta;
    positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
    positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;
    if (positions[i * 3 + 1] < 0.05) {
      positions[i * 3 + 1] = 0.05;
      velocities[i * 3 + 1] = 0;
      velocities[i * 3] *= 0.85;
      velocities[i * 3 + 2] *= 0.85;
    }
  }
  geometry.attributes.position.needsUpdate = true;
}

export function resetParticles() {
  life.fill(0);
  for (let i = 0; i < COUNT; i++) positions[i * 3 + 1] = HIDDEN_Y;
  geometry.attributes.position.needsUpdate = true;
}
