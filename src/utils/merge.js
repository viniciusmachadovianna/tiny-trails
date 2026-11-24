import * as THREE from "three";

export const vertexColorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
export const vertexColorBasicMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

const matrix = new THREE.Matrix4();
const normalMatrix = new THREE.Matrix3();
const vector = new THREE.Vector3();
const tint = new THREE.Color();

export function mergeBoxes(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let offset = 0;

  for (const part of parts) {
    const { geometry, position, color } = part;
    matrix.makeTranslation(position[0], position[1], position[2]);
    normalMatrix.getNormalMatrix(matrix);
    tint.set(color);

    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      vector.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      positions.push(vector.x, vector.y, vector.z);
      vector.fromBufferAttribute(nor, i).applyNormalMatrix(normalMatrix).normalize();
      normals.push(vector.x, vector.y, vector.z);
      colors.push(tint.r, tint.g, tint.b);
    }
    for (let i = 0; i < geometry.index.count; i++) {
      indices.push(geometry.index.getX(i) + offset);
    }
    offset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}
