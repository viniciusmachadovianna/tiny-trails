import * as THREE from "three";

const skinMat = new THREE.MeshLambertMaterial({ color: "#f2c9a0" });
const shirtMat = new THREE.MeshLambertMaterial({ color: "#e87b5b" });
const pantsMat = new THREE.MeshLambertMaterial({ color: "#3f5f8f" });
const bootMat = new THREE.MeshLambertMaterial({ color: "#2b2b30" });
const hairMat = new THREE.MeshLambertMaterial({ color: "#3b2a20" });
const bagMat = new THREE.MeshLambertMaterial({ color: "#6b5a3a" });
const gunMat = new THREE.MeshLambertMaterial({ color: "#2f3238" });
const eyeMat = new THREE.MeshBasicMaterial({ color: "#1a1a1a" });

const legGeo = new THREE.BoxGeometry(0.18, 0.25, 0.2).translate(0, -0.125, 0);
const bootGeo = new THREE.BoxGeometry(0.2, 0.08, 0.24).translate(0, -0.21, 0.02);
const bodyGeo = new THREE.BoxGeometry(0.5, 0.3, 0.3);
const bagGeo = new THREE.BoxGeometry(0.34, 0.3, 0.14);
const headGeo = new THREE.BoxGeometry(0.36, 0.34, 0.34);
const hairTopGeo = new THREE.BoxGeometry(0.4, 0.1, 0.38);
const hairBackGeo = new THREE.BoxGeometry(0.4, 0.22, 0.08);
const eyeGeo = new THREE.BoxGeometry(0.06, 0.07, 0.02);
const armGeo = new THREE.BoxGeometry(0.12, 0.26, 0.12).translate(0, -0.13, 0);
const handGeo = new THREE.BoxGeometry(0.12, 0.08, 0.12).translate(0, -0.26, 0);
const gunGeo = new THREE.BoxGeometry(0.08, 0.3, 0.1).translate(0, -0.4, 0);

export function createPlayer() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.position.y = -0.25;
  root.add(model);

  const body = new THREE.Mesh(bodyGeo, shirtMat);
  body.position.y = 0.4;
  const bag = new THREE.Mesh(bagGeo, bagMat);
  bag.position.set(0, 0.42, -0.22);

  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 0.72;
  const hairTop = new THREE.Mesh(hairTopGeo, hairMat);
  hairTop.position.y = 0.9;
  const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
  hairBack.position.set(0, 0.78, -0.17);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.09, 0.74, 0.175);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.09, 0.74, 0.175);

  const legs = [-0.1, 0.1].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.25, 0);
    pivot.add(new THREE.Mesh(legGeo, pantsMat), new THREE.Mesh(bootGeo, bootMat));
    return pivot;
  });

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.31, 0.5, 0);
  leftArm.add(new THREE.Mesh(armGeo, shirtMat), new THREE.Mesh(handGeo, skinMat));

  const rightArm = new THREE.Group();
  rightArm.position.set(0.31, 0.5, 0);
  rightArm.rotation.x = -Math.PI / 2;
  rightArm.add(
    new THREE.Mesh(armGeo, shirtMat),
    new THREE.Mesh(handGeo, skinMat),
    new THREE.Mesh(gunGeo, gunMat),
  );

  model.add(body, bag, head, hairTop, hairBack, eyeL, eyeR, ...legs, leftArm, rightArm);
  model.traverse((child) => {
    if (child.isMesh && child.material !== eyeMat) child.castShadow = true;
  });

  return { root, model, legs, arms: [leftArm, rightArm] };
}
