import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { blocksRoute } from '../src/RouteOcclusion.js';

test('only towers between camera and route fade', () => {
  const camera = new THREE.Vector3(0, 10, 0);
  const route = [new THREE.Vector3(0, 0, -20), new THREE.Vector3(0, 0, -30)];
  assert.equal(blocksRoute(new THREE.Box3(new THREE.Vector3(-3, 0, -12), new THREE.Vector3(3, 20, -7)), camera, route), true);
  assert.equal(blocksRoute(new THREE.Box3(new THREE.Vector3(7, 0, -12), new THREE.Vector3(12, 20, -7)), camera, route), false);
  assert.equal(blocksRoute(new THREE.Box3(new THREE.Vector3(-3, 0, -45), new THREE.Vector3(3, 20, -40)), camera, route), false);
});
