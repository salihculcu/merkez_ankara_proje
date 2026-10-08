import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Two static meshes (snow and shared snowmen), loaded only on first use.
export class WinterMode {
  constructor(manager) {
    this.manager = manager;
    this.enabled = false;
    this.root = null;
    this.pending = null;
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled && !this.root) {
      this.pending ??= new GLTFLoader().loadAsync('./assets/models/MERKEZ_ANKARA_SNOW_V3.glb?v=1')
        .then(({ scene }) => {
          scene.name = 'WinterSnow';
          scene.traverse(o => {
            if (o.isMesh) {
              o.castShadow = false;
              o.receiveShadow = false;
              o.raycast = () => {};
            }
          });
          // Parent visibility also hides the snow when visiting the basement.
          this.manager.modelRoot.add(scene);
          scene.updateMatrixWorld(true);
          scene.traverse(o => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; });
          this.root = scene;
        }).catch(error => { this.pending = null; throw error; });
      await this.pending;
    }
    if (this.root) this.root.visible = this.enabled;
  }
}

