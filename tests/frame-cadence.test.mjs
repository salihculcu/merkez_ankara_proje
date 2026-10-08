import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameCadence } from '../src/FrameCadence.js';
test('60Hz callbacks do not chase a 144 FPS quality target', () => {
 const c = new FrameCadence(); for(let i=0;i<60;i++) c.observe(1000/60);
 assert.equal(c.targetMs(144),1000/60);
 assert.equal(c.targetMs(30),1000/30);
});
test('isolated fast callbacks and stalls do not corrupt cadence', () => {
 const c = new FrameCadence(); c.observe(4); c.observe(900);
 for(let i=0;i<59;i++) c.observe(1000/60);
 assert.equal(c.targetMs(144),1000/60);
 for(let i=0;i<60;i++) c.observe(1000/120);
 assert.equal(c.targetMs(144),1000/120);
 for(let i=0;i<60;i++) c.observe(40);
 assert.equal(c.targetMs(144),1000/120);
});
test('old refresh cadence expires after recent batches change', () => {
 const c = new FrameCadence();
 for(let i=0;i<60;i++) c.observe(1000/120);
 assert.equal(c.targetMs(144),1000/120);
 for(let i=0;i<8*60;i++) c.observe(1000/60);
 assert.equal(c.targetMs(144),1000/60);
});
