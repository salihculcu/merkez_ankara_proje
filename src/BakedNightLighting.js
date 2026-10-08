import * as THREE from 'three';

export function prepareReferenceLights(layout) {
  return (layout?.lights ?? []).map(d => ({
    position:new THREE.Vector3().fromArray(d.position), direction:new THREE.Vector3().fromArray(d.direction ?? [0,-1,0]).normalize(),
    color:new THREE.Color().setRGB(...d.color), range:d.type==='POINT' ? 9 : 22,
    power:d.energy*(d.color[2]>.6 && d.color[1]<.1 ? .14 : .18),
    spot:d.type!=='POINT', outer:Math.cos(d.type==='AREA' ? Math.PI*.43 : (d.angle ?? .76)*.625),
    inner:Math.cos(d.type==='AREA' ? Math.PI*.25 : (d.angle ?? .76)*.625*(1-(d.blend ?? .62))),
  }));
}
export function sampleNightLight(position, normal, lights, result = new THREE.Color()) {
  result.setRGB(0,0,0);
  for(const l of lights) {
    const dx=l.position.x-position.x,dy=l.position.y-position.y,dz=l.position.z-position.z;
    const dist2=dx*dx+dy*dy+dz*dz;if(dist2>=l.range*l.range)continue;
    const dist=Math.sqrt(dist2)||.001;
    let cone=1;
    if(l.spot) {const cosine=-(dx*l.direction.x+dy*l.direction.y+dz*l.direction.z)/dist;cone=THREE.MathUtils.smoothstep(cosine,l.outer,l.inner);if(!cone)continue;}
    const lambert=Math.max(0,(normal.x*dx+normal.y*dy+normal.z*dz)/dist);
    const attenuation=Math.pow(1-Math.pow(dist/l.range,4),2);
    const value=l.power*attenuation*cone*(.12+.88*lambert)/Math.max(dist2,.45);
    result.r+=l.color.r*value;result.g+=l.color.g*value;result.b+=l.color.b*value;
  }
  return result;
}

// Static diffuse lighting is evaluated once, never per frame or by camera proximity.
export async function bakeNightLighting(root, layout) {
  const lights=prepareReferenceLights(layout), meshes=[];
  root.updateMatrixWorld(true);
  root.traverse(o=>{if(o.isMesh && !o.userData.skipHitbox && !o.isSkinnedMesh && !o.isInstancedMesh)meshes.push(o);});
  const state={uniform:{value:0},materials:new Set(),vertices:0,lights:lights.length};
  const world=new THREE.Vector3(),normal=new THREE.Vector3(),color=new THREE.Color();
  let processed=0;
  for(const mesh of meshes) {
    const source=mesh.geometry;if(!source?.attributes.normal)continue;
    const bounds=new THREE.Box3().setFromObject(mesh);
    const nearby=lights.filter(l=>bounds.distanceToPoint(l.position)<l.range);
    if(!nearby.length)continue;
    // Preserve multi-material group boundaries; they retain original tessellation.
    let geo=source.clone();
    if(!Array.isArray(mesh.material)) {
      const raw=geo.index ? geo.toNonIndexed() : geo;
      if(raw!==geo)geo.dispose();geo=raw;
      const attributes=Object.entries(geo.attributes);
      const arrays=Object.fromEntries(attributes.map(([name])=>[name,[]]));
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
      const vertex=i=>Object.fromEntries(attributes.map(([name,attr])=>[name,Array.from({length:attr.itemSize},(_,k)=>attr.getComponent(i,k))]));
      const middle=(x,y)=>Object.fromEntries(attributes.map(([name])=>[name,x[name].map((v,k)=>(v+y[name][k])/2)]));
      const emit=v=>{for(const [name] of attributes)arrays[name].push(...v[name]);};
      const split=(v0,v1,v2,depth)=>{
        a.fromArray(v0.position).applyMatrix4(mesh.matrixWorld);b.fromArray(v1.position).applyMatrix4(mesh.matrixWorld);c.fromArray(v2.position).applyMatrix4(mesh.matrixWorld);
        const edges=[a.distanceToSquared(b),b.distanceToSquared(c),c.distanceToSquared(a)];
        const max=Math.max(...edges);
        if(max<=6.25 || depth>=9 || arrays.position.length>1800000) {emit(v0);emit(v1);emit(v2);return;}
        const edge=edges.indexOf(max);
        if(edge===0){const m=middle(v0,v1);split(v0,m,v2,depth+1);split(m,v1,v2,depth+1);}
        else if(edge===1){const m=middle(v1,v2);split(v0,v1,m,depth+1);split(v0,m,v2,depth+1);}
        else {const m=middle(v2,v0);split(v0,v1,m,depth+1);split(m,v1,v2,depth+1);}
      };
      for(let i=0;i<geo.attributes.position.count;i+=3)split(vertex(i),vertex(i+1),vertex(i+2),0);
      const refined=new THREE.BufferGeometry();
      for(const [name,attr] of attributes)refined.setAttribute(name,new THREE.Float32BufferAttribute(arrays[name],attr.itemSize));
      geo.dispose();geo=refined;
    }
    const normals=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const values=new Float32Array(geo.attributes.position.count*3);
    for(let i=0;i<geo.attributes.position.count;i++) {
      world.fromBufferAttribute(geo.attributes.position,i).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(geo.attributes.normal,i).applyMatrix3(normals).normalize();
      sampleNightLight(world,normal,nearby,color);values.set([color.r,color.g,color.b],i*3);
    }
    geo.setAttribute('nightLight',new THREE.BufferAttribute(values,3));mesh.geometry=geo;
    state.vertices+=geo.attributes.position.count;
    for(const material of (Array.isArray(mesh.material)?mesh.material:[mesh.material])) {
      if(!material || state.materials.has(material) || !material.isMeshStandardMaterial)continue;
      state.materials.add(material);
      const previous=material.onBeforeCompile.bind(material);
      material.onBeforeCompile=shader=>{
        previous(shader);
        if(state.uniform.value<=0)return;
        shader.uniforms.nightMix=state.uniform;
        shader.vertexShader='attribute vec3 nightLight; varying vec3 vNightLight;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vNightLight = nightLight;');
        shader.fragmentShader='uniform float nightMix; varying vec3 vNightLight;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance += vNightLight * diffuseColor.rgb * nightMix;');
      };
      material.customProgramCacheKey=()=>`static-night-${state.uniform.value>0 ? 'on':'off'}`;
      material.defaultAttributeValues={...material.defaultAttributeValues,nightLight:[0,0,0]};
    }
    if(++processed%16===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  state.night=0; state.gain=1;
  const publish=()=>{const next=state.night*state.gain;const changed=(state.uniform.value>0)!==(next>0);state.uniform.value=next;if(changed)for(const m of state.materials)m.needsUpdate=true;};
  state.setMix=value=>{state.night=value;publish();};
  state.setGain=gain=>{state.gain=gain;publish();};
  console.info(`[NightBake] ${lights.length} ışık, ${state.vertices} köşe; gece gerçek ışık döngüsü yok.`);
  return state;
}
