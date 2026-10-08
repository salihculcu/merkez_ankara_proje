import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Keep transparent sorting, selectable objects, instancing and hierarchy intact.
// Nearby opaque meshes can share a draw call without changing their materials.
export function batchStaticMeshes(root, cellSize = 100) {
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const groups = new Map();
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  root.traverseVisible((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh
        || obj.userData.navigationTower || obj.userData.storeId || obj.userData.skipHitbox || obj.children.length
        || obj.morphTargetInfluences?.length || Array.isArray(obj.material)) return;
    const mat = obj.material;
    if (!mat || !mat.visible || mat.transparent || mat.transmission > 0
        || obj.matrixWorld.determinant() <= 0) return;
    const geometry = obj.geometry;
    if (!geometry?.attributes.position
        || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    box.copy(geometry.boundingBox).applyMatrix4(obj.matrixWorld).getCenter(center);
    const cell = `${Math.floor(center.x / cellSize)},${Math.floor(center.z / cellSize)}`;
    const layout = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array?.constructor.name}:${!!a.isInterleavedBufferAttribute}`).join('|');
    const key = `${mat.uuid}/${cell}/${obj.renderOrder}/${obj.layers.mask}/${!!geometry.index}/${layout}/${!!obj.userData.navigationOccluder}`;
    const list = groups.get(key) ?? [];
    list.push(obj);
    groups.set(key, list);
  });

  const removed = new Set();
  const batches = [];
  const oldGeometries = new Set();
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => mesh.geometry.clone()
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld)));
    let merged;
    try { merged = mergeGeometries(geometries, false); }
    catch (error) { console.warn('[StaticBatcher] Grup birleştirilemedi; özgün nesneler korunuyor.', error); }
    finally { for (const geometry of geometries) geometry.dispose(); }
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const first = meshes[0];
    const batch = new THREE.Mesh(merged, first.material);
    batch.name = `BATCH_${first.material.name || batches.length}`;
    batch.renderOrder = first.renderOrder;
    batch.layers.mask = first.layers.mask;
    batch.userData.sourceNames = meshes.map((mesh) => mesh.name);
    const reversible = !!first.userData.navigationOccluder;
    if (reversible) batch.userData.navigationBatchId = batch.uuid;
    root.add(batch);
    batches.push(batch);
    for (const mesh of meshes) {
      removed.add(mesh);
      oldGeometries.add(mesh.geometry);
      if (reversible) {
        // Keep source pieces dormant; only a batch containing an actual blocker is opened.
        mesh.userData.navigationSourceBatchId = batch.uuid;
        mesh.visible = false;
      } else mesh.removeFromParent();
    }
  }
  // Shared geometry may still belong to an interactive mesh or an instance.
  root.traverse((obj) => { if (obj.geometry) oldGeometries.delete(obj.geometry); });
  for (const geometry of oldGeometries) geometry.dispose();
  return { removed, batches };
}
