import * as THREE from 'three';

const ray = new THREE.Ray();
const direction = new THREE.Vector3();
const hit = new THREE.Vector3();

/** True only when a tower box lies between the camera and a route point. */
export function blocksRoute(box, camera, routePoints) {
  for (const point of routePoints) {
    direction.subVectors(point, camera);
    const distance = direction.length();
    if (distance < 2) continue;
    ray.set(camera, direction.multiplyScalar(1 / distance));
    if (ray.intersectBox(box, hit) && hit.distanceTo(camera) < distance - 1) return true;
  }
  return false;
}
