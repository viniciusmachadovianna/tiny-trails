import * as THREE from "three";

const DAY_LENGTH = 100;
const LANTERN_INTENSITY = 28;
const FLASH_INTENSITY = 45;

const day = {
  bg: new THREE.Color("#f4f1e8"),
  sky: new THREE.Color("#ffffff"),
  ground: new THREE.Color("#aaa49a"),
  sun: new THREE.Color("#ffffff"),
  hemi: 2,
  sunIntensity: 2.5,
  fogNear: 32,
  fogFar: 60,
};

const night = {
  bg: new THREE.Color("#0f1626"),
  sky: new THREE.Color("#5568a8"),
  ground: new THREE.Color("#1c1c2a"),
  sun: new THREE.Color("#9fb4ff"),
  hemi: 0.9,
  sunIntensity: 0.6,
  fogNear: 24,
  fogFar: 44,
};

let scene = null;
let fog = null;
let hemisphere = null;
let sun = null;
let lantern = null;
let time = 0;
let flash = 0;

export function initLighting(targetScene) {
  scene = targetScene;
  scene.background = day.bg.clone();
  fog = new THREE.Fog(day.bg.clone(), day.fogNear, day.fogFar);
  scene.fog = fog;

  hemisphere = new THREE.HemisphereLight(day.sky.clone(), day.ground.clone(), day.hemi);

  sun = new THREE.DirectionalLight(day.sun.clone(), day.sunIntensity);
  sun.position.set(-8, 14, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);

sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;

sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 60;

sun.shadow.camera.updateProjectionMatrix();sun.shadow.mapSize.set(2048, 2048);

sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;

sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 60;

sun.shadow.camera.updateProjectionMatrix();

  lantern = new THREE.PointLight("#ffcc88", 0, 14, 2);

  scene.add(hemisphere, sun, sun.target, lantern);
}

export function muzzleFlash() {
  flash = 1;
}

export function resetLighting() {
  time = 0;
  flash = 0;
}

export function updateLighting(delta, focus, playerPosition) {
  time += delta;
  const phase = (time / DAY_LENGTH) % 1;
  const raw = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
  const daylight = THREE.MathUtils.smoothstep(raw, 0.2, 0.8);
  const n = 1 - daylight;

  scene.background.lerpColors(day.bg, night.bg, n);
  fog.color.copy(scene.background);
  fog.near = THREE.MathUtils.lerp(day.fogNear, night.fogNear, n);
  fog.far = THREE.MathUtils.lerp(day.fogFar, night.fogFar, n);

  hemisphere.color.lerpColors(day.sky, night.sky, n);
  hemisphere.groundColor.lerpColors(day.ground, night.ground, n);
  hemisphere.intensity = THREE.MathUtils.lerp(day.hemi, night.hemi, n);

  sun.color.lerpColors(day.sun, night.sun, n);
  sun.intensity = THREE.MathUtils.lerp(day.sunIntensity, night.sunIntensity, n);
  sun.position.set(focus.x - 8, 14, focus.z + 10);
  sun.target.position.set(focus.x, 0, focus.z);

  flash = Math.max(0, flash - delta * 9);
  lantern.position.set(playerPosition.x, 1.6, playerPosition.z);
  lantern.intensity = n * LANTERN_INTENSITY + flash * FLASH_INTENSITY;
}
