import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NavigationOcclusion, prepareNavigationOcclusion } from '../src/NavigationOcclusion.js';
import { batchStaticMeshes } from '../src/StaticBatcher.js';

function fixture() {
  const root = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 5, 15);
  const material = new THREE.MeshStandardMaterial();
  const make = (name, x, y, z, sx=4, sy=8, sz=2) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);
    mesh.name=name;mesh.position.set(x,y,z);root.add(mesh);return mesh;
  };
  const blocker = make('awning',0,4,5);
  const target = make('shop',0,4,-10,6,8,4);target.userData.storeId='TARGET';
  const facade = make('facade',0,3,-7.8,5,6,.2);
  const other = make('neighbor',12,4,5);
  const ground = make('ground',0,0,0,80,.2,80);
  prepareNavigationOcclusion(root,[target]);
  const controller = new NavigationOcclusion(camera);controller.addRoot(root);
  const route=[new THREE.Vector3(0,0,-10)];
  return {root,camera,material,blocker,target,facade,other,ground,controller,route};
}

test('only intersecting blockers fade; selected shop, facade, neighbor and ground are preserved',()=>{
  const f=fixture();f.controller.setRoute(f.route,'TARGET');f.controller.update(.5);
  assert.ok(f.blocker.material.opacity >= .15 && f.blocker.material.opacity < .17);
  for(const mesh of [f.target,f.facade,f.other,f.ground])assert.equal(mesh.material,f.material);
  assert.equal(f.material.opacity,1);
  assert.ok(!f.ground.userData.navigationOccluder);
});

test('clearing a route restores original materials, including originally transparent glass',()=>{
  const f=fixture();f.blocker.material=f.material;
  f.material.transparent=true;f.material.opacity=.7;f.material.depthWrite=true;
  f.controller.setRoute(f.route,'TARGET');f.controller.update(1);
  assert.ok(Math.abs(f.blocker.material.opacity-.105)<.001);
  f.controller.setRoute(null);f.controller.update(1);
  assert.equal(f.blocker.material,f.material);assert.equal(f.material.opacity,.7);assert.equal(f.material.depthWrite,true);
});

test('camera movement releases blockers smoothly after hysteresis; hidden floors stay untouched',()=>{
  const f=fixture();f.controller.setRoute(f.route,'TARGET');f.controller.update(1);
  f.camera.position.x=30;f.controller.update(.2);assert.ok(f.blocker.material.opacity<.3);
  f.controller.update(.5);assert.ok(f.blocker.material.opacity>.9);
  f.controller.update(1);assert.equal(f.blocker.material,f.material);
  f.root.visible=false;f.camera.position.x=0;f.controller.update(1);assert.equal(f.blocker.material,f.material);
});

test('geometry gaps do not fade merely because their bounding box crosses the ray',()=>{
  const root=new THREE.Group(),camera=new THREE.PerspectiveCamera();camera.position.set(0,5,15);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-6,0,0,-4,0,0,-5,10,0,4,0,0,6,0,0,5,10,0],3));
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.navigationOccluder=true;root.add(mesh);
  const controller=new NavigationOcclusion(camera);controller.addRoot(root);controller.setRoute([new THREE.Vector3(0,0,-10)]);controller.update(1);
  assert.equal(mesh.material,material);
});

test('blocker material follows day/night changes and batching keeps blockers independent',()=>{
  const f=fixture();const result=batchStaticMeshes(f.root);
  assert.equal(f.blocker.parent,f.root);assert.equal(f.facade.parent,f.root);
  f.controller.dispose();f.controller=new NavigationOcclusion(f.camera);f.controller.addRoot(f.root);
  const nightMix={value:1};
  f.material.onBeforeCompile=shader=>{shader.uniforms.nightMix=nightMix;};
  f.material.customProgramCacheKey=()=>`night-${nightMix.value}`;
  f.controller.setRoute(f.route,'TARGET');f.controller.update(1);
  const shader={uniforms:{}};f.blocker.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.nightMix,nightMix);assert.equal(f.blocker.material.customProgramCacheKey(),'night-1');
  f.material.color.set(0x334455);f.material.emissiveIntensity=2;f.controller.update(.1);
  assert.equal(f.blocker.material.color.getHex(),0x334455);assert.equal(f.blocker.material.emissiveIntensity,2);
  f.controller.dispose();assert.equal(f.blocker.material,f.material);
});

test('only an obstructed batch opens, and it recombines once the route is cleared',()=>{
  const f=fixture();const result=batchStaticMeshes(f.root);
  const batch=result.batches.find(b=>b.userData.navigationBatchId===f.blocker.userData.navigationSourceBatchId);
  assert.ok(batch);assert.equal(batch.visible,true);assert.equal(f.blocker.visible,false);
  f.controller.dispose();f.controller=new NavigationOcclusion(f.camera);f.controller.addRoot(f.root);
  f.controller.setRoute(f.route,'TARGET');f.controller.update(1);
  assert.equal(batch.visible,false);assert.equal(f.blocker.visible,true);
  assert.equal(f.other.material,f.material);
  f.controller.setRoute(null);f.controller.update(1);
  assert.equal(batch.visible,true);assert.equal(f.blocker.visible,false);
});

test('switching selection restores the new target even while the previous route was fading it',()=>{
  const f=fixture();f.blocker.userData.navigationOwners=['OTHER'];
  f.controller.setRoute(f.route,'TARGET');f.controller.update(1);assert.equal(f.blocker.material.opacity,.15);
  f.controller.setRoute(f.route,'OTHER');f.controller.update(1);assert.equal(f.blocker.material,f.material);
});
