import * as THREE from 'three';

const normalize = value => String(value ?? '').toLocaleUpperCase('tr').replaceAll('İ', 'I').replace(/[^A-Z0-9]/g, '');
const meshBox = mesh => {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
};
const visibleInTree = (mesh, batched = false) => {
  for (let node = batched ? mesh.parent : mesh; node; node = node.parent) if (!node.visible) return false;
  return true;
};

/** Preserve independent blockers before static batching, and associate nearby facades/signs. */
export function prepareNavigationOcclusion(root, hitboxes) {
  root.updateMatrixWorld(true);
  const stores = hitboxes.map(mesh => ({ id: normalize(mesh.userData.storeId), box: meshBox(mesh) }));
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry || mesh.isInstancedMesh || mesh.isSkinnedMesh) return;
    if (mesh.userData.skipHitbox && !mesh.userData.storeSign) return;
    const box = meshBox(mesh), size = box.getSize(new THREE.Vector3());
    // Floor surfaces and small details never obscure the navigation corridor.
    if (!mesh.userData.storeId && !mesh.userData.navigationTower && !mesh.userData.storeSign &&
        (box.max.y < 1.6 || Math.max(size.x, size.z) < .8 || size.length() < 1.2)) return;
    mesh.userData.navigationOccluder = true;
    const ownId = normalize(mesh.userData.storeId);
    if (ownId) { mesh.userData.navigationOwners = [ownId]; return; }
    const center = box.getCenter(new THREE.Vector3());
    const owners = new Set();
    for (let parent = mesh.parent; parent && parent !== root; parent = parent.parent) {
      if (parent.userData.storeId) owners.add(normalize(parent.userData.storeId));
    }
    for (const store of stores) {
      // Keep complete shared facade panels when they cross the selected shop boundary.
      const overlapX = Math.min(box.max.x, store.box.max.x + .7) - Math.max(box.min.x, store.box.min.x - .7);
      const overlapZ = Math.min(box.max.z, store.box.max.z + .7) - Math.max(box.min.z, store.box.min.z - .7);
      const vertical = box.min.y <= store.box.max.y + 1.5 && box.max.y >= store.box.min.y - 8;
      const nearCenter = center.x >= store.box.min.x - 1.5 && center.x <= store.box.max.x + 1.5 &&
        center.z >= store.box.min.z - 1.5 && center.z <= store.box.max.z + 1.5;
      if (vertical && overlapX > 0 && overlapZ > 0 && (nearCenter || Math.min(size.x, size.z) < 1.5)) owners.add(store.id);
    }
    mesh.userData.navigationOwners = [...owners];
  });
}

/** AABB broad phase, actual triangle intersections, delayed release and isolated materials. */
export class NavigationOcclusion {
  constructor(camera) {
    this.camera = camera;
    this.entries = [];
    this.batches = [];
    this.samples = [];
    this.selectedStore = '';
    this.timer = 0;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.direction = new THREE.Vector3();
    this.hit = new THREE.Vector3();
    this.intersections = [];
  }

  addRoot(root) {
    root.updateMatrixWorld(true);
    const batches = new Map();
    root.traverse(mesh => {
      if (mesh.userData.navigationBatchId) {
        const group = { mesh, entries: [] };
        batches.set(mesh.userData.navigationBatchId, group);this.batches.push(group);
      }
    });
    root.traverse(mesh => {
      if (!mesh.isMesh || !mesh.userData.navigationOccluder) return;
      const batch = batches.get(mesh.userData.navigationSourceBatchId);
      const entry = { mesh, batch, box: meshBox(mesh), original: mesh.material, faded: null, versions: [], alpha: 1, target: 1, blockedUntil: 0 };
      this.entries.push(entry);batch?.entries.push(entry);
    });
  }

  setRoute(points, storeId = null) {
    this.selectedStore = normalize(storeId);
    this.samples = [];
    if (Array.isArray(points) && points.length) {
      // Resample by distance so a long straight segment cannot slip between sparse graph nodes.
      const lengths = [0];
      for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + points[i].distanceTo(points[i - 1]));
      const total = lengths.at(-1), count = Math.min(16, Math.max(2, Math.ceil(total / 4) + 1));
      for (let i = 0, segment = 1; i < count; i++) {
        const distance = total * i / (count - 1);
        while (segment < points.length - 1 && lengths[segment] < distance) segment++;
        const p = points.length === 1 ? points[0].clone() : points[segment - 1].clone().lerp(points[segment],
          (distance - lengths[segment - 1]) / Math.max(.00001, lengths[segment] - lengths[segment - 1]));
        p.y += .35;
        this.samples.push(p);
      }
      const entrance = points.at(-1).clone(); entrance.y += 1.6;
      this.samples.push(entrance);
    }
    this.timer = 0;
    for (const entry of this.entries) { entry.target = 1; entry.blockedUntil = 0; }
  }

  update(dt) {
    this.time += dt; this.timer -= dt;
    if (this.samples.length && this.timer <= 0) {
      this.timer = .2;
      for (const entry of this.entries) {
        const { mesh, box } = entry;
        const protectedMesh = this.selectedStore && (mesh.userData.navigationOwners ?? []).includes(this.selectedStore);
        if (protectedMesh || !visibleInTree(mesh, !!entry.batch)) { entry.target = 1; entry.blockedUntil = 0; continue; }
        let blocked = false;
        for (const point of this.samples) {
          this.direction.subVectors(point, this.camera.position);
          const distance = this.direction.length();
          if (distance < .6) continue;
          this.raycaster.set(this.camera.position, this.direction.multiplyScalar(1 / distance));
          this.raycaster.near = .1; this.raycaster.far = distance - .25;
          if (!this.raycaster.ray.intersectBox(box, this.hit) || this.hit.distanceTo(this.camera.position) >= distance - .25) continue;
          this.intersections.length = 0;
          this.raycaster.intersectObject(mesh, false, this.intersections);
          if (this.intersections.length) { blocked = true; break; }
        }
        if (blocked) entry.blockedUntil = this.time + .45;
        entry.target = blocked || this.time < entry.blockedUntil ? .15 : 1;
      }
    }
    for (const entry of this.entries) {
      if (entry.target === 1 && entry.alpha === 1) continue;
      if (!entry.faded) {
        const copy = mat => {
          const clone = mat.clone(); clone.transparent = true; clone.depthWrite = false; clone.forceSinglePass = true;
          clone.onBeforeCompile = mat.onBeforeCompile;
          clone.customProgramCacheKey = () => mat.customProgramCacheKey();
          clone.defaultAttributeValues = { ...mat.defaultAttributeValues };
          return clone;
        };
        entry.faded = Array.isArray(entry.original) ? entry.original.map(copy) : copy(entry.original);
      }
      const sources = Array.isArray(entry.original) ? entry.original : [entry.original];
      const faded = Array.isArray(entry.faded) ? entry.faded : [entry.faded];
      entry.alpha += (entry.target - entry.alpha) * (1 - Math.exp(-dt * 9));
      if (Math.abs(entry.alpha - entry.target) < .003) entry.alpha = entry.target;
      for (let i = 0; i < faded.length; i++) {
        const material = faded[i], source = sources[i];
        if (entry.versions[i] !== source.version) { material.needsUpdate = true; entry.versions[i] = source.version; }
        // Original materials continue to receive day/night and graphics updates.
        for (const key of ['color', 'emissive']) if (material[key] && source[key]) material[key].copy(source[key]);
        for (const key of ['emissiveIntensity', 'transmission', 'roughness', 'metalness', 'envMapIntensity']) {
          if (key in source) material[key] = source[key];
        }
        material.opacity = source.opacity * entry.alpha;
      }
      entry.mesh.material = entry.alpha === 1 ? entry.original : entry.faded;
    }
    for (const batch of this.batches) {
      const split = batch.entries.some(entry => entry.alpha < 1);
      batch.mesh.visible = !split;
      for (const entry of batch.entries) entry.mesh.visible = split;
    }
  }

  dispose() {
    for (const entry of this.entries) {
      entry.mesh.material = entry.original;
      for (const material of (Array.isArray(entry.faded) ? entry.faded : [entry.faded])) material?.dispose();
    }
    this.entries.length = 0;
    for (const batch of this.batches) {
      batch.mesh.visible = true;
      for (const entry of batch.entries) entry.mesh.visible = false;
    }
    this.batches.length = 0;
  }
}
