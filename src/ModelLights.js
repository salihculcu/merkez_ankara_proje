import * as THREE from 'three';

export function isBulbName(name = '') {
  return /(^|[_. -])isik([_. -]|$)/.test(name.toLocaleLowerCase('tr').replaceAll('ı','i').replaceAll('ş','s'));
}

// Run before batching: only bulb materials are cloned, never shared walls/roofs.
export function prepareModelLights(root) {
  root.updateMatrixWorld(true);
  const bulbs = [], surfaces = [], materials = new Map();
  root.traverse(obj => {
    if (!obj.isMesh || obj.userData.skipHitbox) return;
    if (isBulbName(obj.name)) bulbs.push(obj);
    else surfaces.push(obj);
  });
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0,-1,0);
  const entries = [];
  for (const bulb of bulbs) {
    const box = new THREE.Box3().setFromObject(bulb);
    const position = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const tall = /yuksek/.test(bulb.name);
    const mats = Array.isArray(bulb.material) ? bulb.material : [bulb.material];
    const copies = mats.map(original => {
      if (!materials.has(original)) {
        const mat = original.clone();
        if (!mat.emissive) return original;
        materials.set(original, { mat, day:mat.emissive.clone(), intensity:mat.emissiveIntensity });
      }
      return materials.get(original).mat;
    });
    bulb.material = Array.isArray(bulb.material) ? copies : copies[0];
    // Offset the downward sample to avoid the supporting pole directly below the bulb.
    const origin = position.clone(); origin.x += Math.max(size.x / 2 + .12, .35); origin.y = box.min.y - .04;
    ray.set(origin, down);
    const ground = ray.intersectObjects(surfaces, false).find(hit => {
      if (!hit.face) return false;
      const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
      return Math.abs(normal.y) > .65;
    });
    const groundY = ground?.point.y;
    const height = groundY == null ? (tall ? 4 : 1) : Math.max(.3, position.y - groundY);
    entries.push({position,groundY,radius:THREE.MathUtils.clamp(height * 1.4, .8, 6),height,tall});
  }
  return { entries, materials:[...materials.values()] };
}

export class ModelLights {
  constructor(sm, prepared) {
    this.sm = sm; this.entries = prepared.entries; this.materials = prepared.materials;
    this.mix = -1; this.timer = 0; this.lampScale = 1;
    this.warm = new THREE.Color(0xffbc55);
    const canvas = document.createElement('canvas'); canvas.width=canvas.height=64;
    const ctx = canvas.getContext('2d');
    const gradient=ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(255,255,255,1)'); gradient.addColorStop(.25,'rgba(255,255,255,.35)'); gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const texture=new THREE.CanvasTexture(canvas);
    this.glowMat=new THREE.PointsMaterial({map:texture,color:this.warm,size:1.1,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    // Move only the halo slightly toward the camera; nearby walls still occlude it.
    this.glowMat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n mvPosition.z += 0.35;\n gl_Position = projectionMatrix * mvPosition;');
    };
    this.glowMat.customProgramCacheKey = () => 'bulb-halo-depth-v1';
    this.poolMat=new THREE.MeshBasicMaterial({map:texture,color:this.warm,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    this.layers = [sm.modelRoot,sm.basementRoot].filter(Boolean).map((root,index)=>{
      const group = new THREE.Group(); group.name='MODEL_BULB_LIGHTING'; group.position.y=index ? -sm.floorDrop : 0; group.visible=false;
      const geo=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(this.entries.flatMap(e=>e.position.toArray()),3));
      const glow=new THREE.Points(geo,this.glowMat); glow.raycast=()=>{}; group.add(glow);
      const grounded=this.entries.filter(e=>e.groundY!=null);
      if (grounded.length) {
        const circle=new THREE.PlaneGeometry(2,2);circle.rotateX(-Math.PI/2);
        const pools=new THREE.InstancedMesh(circle,this.poolMat,grounded.length);
        pools.raycast=()=>{};
        grounded.forEach((e,i)=>{ const matrix=new THREE.Matrix4().compose(new THREE.Vector3(e.position.x,e.groundY+.025,e.position.z),new THREE.Quaternion(),new THREE.Vector3(e.radius,1,e.radius));pools.setMatrixAt(i,matrix); });
        pools.instanceMatrix.needsUpdate=true; pools.computeBoundingSphere(); group.add(pools);
      }
      sm.scene.add(group);return {root,group};
    });
    this.bake=prepared.bake;
    sm.onUpdate(dt=>this.update(dt));
    console.info(`[ModelLights] ${this.entries.length} ampul, ${this.bake?.lights ?? 0} önceden hesaplanmış ışık.`);
  }

  setLampScale(scale) {
    this.lampScale = scale;
    this.mix = -1;
    this.bake?.setGain?.(scale);
  }

  update(dt) {
    const fade=this.sm.nightMix;
    if(fade !== this.mix) {
      this.mix=fade;
      const gain=this.lampScale ?? 1;
      for(const {mat,day,intensity} of this.materials) {mat.emissive.lerpColors(day,this.warm,fade);mat.emissiveIntensity=THREE.MathUtils.lerp(intensity,5*gain,fade);}
      this.glowMat.opacity=Math.min(1, fade*.8*gain);this.poolMat.opacity=Math.min(1, fade*.48*gain);
    }
    for(const {root,group} of this.layers) group.visible=root.visible && fade>.001;
    this.bake?.setMix(fade);
  }
}
