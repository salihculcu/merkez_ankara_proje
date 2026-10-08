import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticMeshes } from '../src/StaticBatcher.js';

test('batching preserves world coordinates under a transformed model root', () => {
  const root = new THREE.Group();
  root.position.set(10, 3, -5); root.rotation.y = 0.3;
  const material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(), material); m.position.x = i * 2; root.add(m); }
  const before = new THREE.Box3().setFromObject(root);
  const result = batchStaticMeshes(root, 1000);
  const after = new THREE.Box3().setFromObject(root);
  assert.equal(result.batches.length, 1);
  assert.ok(before.min.distanceTo(after.min) < 0.00001);
  assert.ok(before.max.distanceTo(after.max) < 0.00001);
});

test('batching protects picking, transparency, instances and shared geometry', () => {
  const root = new THREE.Group(); const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  let disposed = false; geometry.addEventListener('dispose', () => { disposed = true; });
  const hitbox = new THREE.Mesh(geometry, material); hitbox.userData.storeId = 'MANGO'; root.add(hitbox);
  for (let i = 0; i < 2; i++) root.add(new THREE.Mesh(geometry, material));
  const transparent = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({transparent:true}));
  const mirrored = new THREE.Mesh(geometry, material); mirrored.scale.x = -1;
  const instance = new THREE.InstancedMesh(geometry, material, 2);
  const parent = new THREE.Mesh(geometry, material); parent.add(new THREE.Object3D());
  root.add(transparent, mirrored, instance, parent);
  const result = batchStaticMeshes(root);
  assert.equal(result.removed.size, 2);
  for (const m of [hitbox, transparent, mirrored, instance, parent]) assert.equal(m.parent, root);
  assert.equal(disposed, false);
});

test('separate regions remain independently cullable', () => {
  const root = new THREE.Group(); const material = new THREE.MeshStandardMaterial();
  for (const x of [5, 8, 205, 208]) { const m = new THREE.Mesh(new THREE.BoxGeometry(), material); m.position.x = x; m.position.z = 5; root.add(m); }
  const result = batchStaticMeshes(root, 100);
  assert.equal(result.batches.length, 2);
  assert.equal(result.removed.size, 4);
});

test('only the selected floor stays visible once a transition completes', async () => {
  globalThis.location = {search: ''};
  const { SceneManager } = await import('../src/SceneManager.js');
  delete globalThis.location;
  const sm = new SceneManager({}, {});
  sm.modelRoot = new THREE.Group(); sm.basementRoot = new THREE.Group();
  sm.setFloorVisibility(1); assert.equal(sm.modelRoot.visible, true); assert.equal(sm.basementRoot.visible, false);
  sm.setFloorVisibility(-1, true); assert.equal(sm.modelRoot.visible, true); assert.equal(sm.basementRoot.visible, true);
  sm.setFloorVisibility(-1); assert.equal(sm.modelRoot.visible, false); assert.equal(sm.basementRoot.visible, true);
});

test('graphics settings reject invalid saved data and clamp resolution', async () => {
  const { normalizeGraphics, DEFAULT_GRAPHICS } = await import('../src/GraphicsSettings.js');
  assert.deepEqual(normalizeGraphics(null), DEFAULT_GRAPHICS);
  assert.deepEqual(normalizeGraphics({scale: NaN, target: 999, fpsLimit: -1, glass: 'false'}), DEFAULT_GRAPHICS);
  assert.equal(normalizeGraphics({scale: 900}).scale, 100);
  assert.equal(normalizeGraphics({scale: -100}).scale, 50);
});

test('graphics profiles restore shared glass materials and resolution without changing geometry', async () => {
  const { SceneManager } = await import('../src/SceneManager.js');
  const { DEFAULT_GRAPHICS, GRAPHICS_PRESETS } = await import('../src/GraphicsSettings.js');
  globalThis.window = {devicePixelRatio: 2, innerWidth: 1000, innerHeight: 700};
  const manager = new SceneManager({}, {perf:{idle:{settleMs:450}}});
  manager.perfProfile = {maxPixelRatio: 2};
  manager.scene = new THREE.Scene();
  const mat = new THREE.MeshPhysicalMaterial({transmission:0.85});
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat); manager.scene.add(mesh, mesh.clone());
  const geometry = mesh.geometry;
  let dpr = 0;
  manager.renderer = {setPixelRatio(value) {dpr=value;},setSize(){}};
  manager.applyGraphicsSettings(GRAPHICS_PRESETS.performance);
  assert.equal(dpr, 1.4); assert.equal(mat.transmission,0);
  manager.applyGraphicsSettings(DEFAULT_GRAPHICS);
  assert.equal(dpr, 2); assert.equal(mat.transmission,0.85); assert.equal(mesh.geometry,geometry);
});

test('named model bulbs isolate shared materials and preserve daylight', async () => {
  const {prepareModelLights,isBulbName} = await import('../src/ModelLights.js');
  assert.ok(isBulbName('kisa_isik_orta.021')); assert.ok(isBulbName('ışık.001')); assert.ok(!isBulbName('karisik_duvar'));
  const root=new THREE.Group();
  const shared=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x112233,emissiveIntensity:.4});
  const bulb=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),shared);bulb.name='isik_sokak_yuksek.001';bulb.position.y=3;
  const wall=new THREE.Mesh(new THREE.BoxGeometry(),shared);wall.position.x=10;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),shared);floor.rotation.x=-Math.PI/2;
  root.add(bulb,wall,floor);
  const data=prepareModelLights(root);
  assert.equal(data.entries.length,1);assert.notEqual(bulb.material,shared);assert.equal(wall.material,shared);
  assert.equal(bulb.material.emissiveIntensity,.4);assert.ok(Math.abs(data.entries[0].groundY)<.001);
});

test('night lamp slider supports 20x without raising daylight settings', async () => {
  const {normalizeLighting,lightingScale}=await import('../src/LightingSettings.js');
  const value=normalizeLighting({lamps:2000});
  assert.equal(value.lamps,2000);assert.equal(lightingScale(value).lamps,20);
  assert.equal(lightingScale(value).exposure,1);assert.equal(lightingScale(value).sun,1);
  assert.equal(normalizeLighting({lamps:5000}).lamps,2000);
  assert.equal(normalizeLighting({lamps:200}).lamps,200);
});
