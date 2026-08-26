import * as THREE from 'three';
import { IS_MOBILE } from './config.js';

/**
 * Sokak lambaları: editörde yerleştirilir, graph.json içinde `lamps` dizisinde saklanır.
 *
 * Performans mimarisi:
 *  - Direk / başlık / şapka: 3 adet InstancedMesh (lamba sayısından bağımsız 3 draw call)
 *  - Zemindeki ışık havuzları: 1 adet InstancedMesh
 *  - Ampul parlamaları: 1 adet Points katmanı
 *  - Gerçek PointLight sayısı `maxRealLights` ile sınırlıdır (mobilde perf.mobile değeri);
 *    sınırı aşan lambalar aydınlatma hissini büyütülmüş sahte havuzdan alır.
 *  - Gündüz modunda gece katmanları (havuz, parlama, ışıklar) tamamen kapatılır;
 *    böylece ne overdraw ne de ışık shader maliyeti oluşur.
 */
export class LampSystem {
  constructor(sceneManager, config) {
    this.sm = sceneManager;
    this.config = config;

    this.group = new THREE.Group();
    this.group.name = 'LAMP_LAYER';
    sceneManager.scene.add(this.group);

    const profile = IS_MOBILE ? config.perf.mobile : config.perf.desktop;
    this.#maxReal = profile.maxRealLights ?? config.lamps.maxRealLights;

    this.#buildSharedAssets();
    sceneManager.onUpdate((dt) => this.#update(dt));
  }

  #maxReal;
  #lampIds = [];          // instanceId -> lamba id
  #lampPos = [];          // instanceId -> [x, y, z]
  #lights = [];           // ilk N lamba için gerçek ışıklar
  #poleIM = null; #headIM = null; #capIM = null; #poolIM = null; #glowPoints = null;
  #fade = 0;              // 0 = sönük (gündüz), 1 = yanık (gece)
  #fadeTarget = 0;
  #highlightId = null;

  // Paylaşılan varlıklar
  #poleGeo; #headGeo; #capGeo; #poolGeo; #poleMat; #headMat; #capMat; #poolMat; #glowMat;
  #glowTexture; #poolTexture;

  get height() {
    return this.config.lamps.height ?? THREE.MathUtils.clamp(this.sm.sceneScale * 0.020, 0.4, 5);
  }

  #buildSharedAssets() {
    const h = this.height;
    const cfg = this.config.lamps;

    this.#poleGeo = new THREE.CylinderGeometry(h * 0.018, h * 0.028, h, 8);
    this.#poleGeo.translate(0, h / 2, 0);
    this.#headGeo = new THREE.SphereGeometry(h * 0.085, 12, 10);
    this.#headGeo.translate(0, h * 0.96, 0);
    this.#capGeo = new THREE.ConeGeometry(h * 0.13, h * 0.09, 10);
    this.#capGeo.translate(0, h * 1.06, 0);
    // Havuz, gerçek ışığın zemindeki ayak izine yakın boyutta tutulur ki
    // ışık limiti dışında kalan lambalar da aydınlatıyormuş gibi görünsün.
    this.#poolGeo = new THREE.CircleGeometry(h * (cfg.poolRadiusFactor ?? 2.6), 32);
    this.#poolGeo.rotateX(-Math.PI / 2);
    this.#poolGeo.translate(0, 0.03, 0);

    this.#poleMat = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.6, metalness: 0.5 });
    this.#capMat = new THREE.MeshStandardMaterial({ color: 0x1d242e, roughness: 0.5, metalness: 0.6 });
    // Başlık: gündüz mat cam, gece emissive parlar (tek paylaşılan materyal)
    this.#headMat = new THREE.MeshStandardMaterial({
      color: 0x8a8f96,
      roughness: 0.35,
      emissive: new THREE.Color(cfg.color),
      emissiveIntensity: 0,
    });

    this.#glowTexture = this.#radialTexture(1.0, 0.0);
    this.#poolTexture = this.#radialTexture(0.7, 0.0);

    this.#poolMat = new THREE.MeshBasicMaterial({
      map: this.#poolTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.#glowMat = new THREE.PointsMaterial({
      map: this.#glowTexture,
      color: cfg.color,
      size: this.height * 0.85,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  #radialTexture(innerAlpha, outerAlpha) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = new THREE.Color(this.config.lamps.color);
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${rgb},${innerAlpha})`);
    grad.addColorStop(0.4, `rgba(${rgb},${innerAlpha * 0.35})`);
    grad.addColorStop(1, `rgba(${rgb},${outerAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Lamba listesini (graph.lamps) sahneye kurar. */
  setLamps(lamps = []) {
    this.#disposeBuilt();
    this.#lampIds = lamps.map((l) => l.id);
    this.#lampPos = lamps.map((l) => [...l.pos]);
    const n = lamps.length;
    if (n === 0) { this.#applyFade(); return; }

    const h = this.height;
    const cfg = this.config.lamps;

    this.#poleIM = new THREE.InstancedMesh(this.#poleGeo, this.#poleMat, n);
    this.#headIM = new THREE.InstancedMesh(this.#headGeo, this.#headMat, n);
    this.#capIM = new THREE.InstancedMesh(this.#capGeo, this.#capMat, n);
    this.#poolIM = new THREE.InstancedMesh(this.#poolGeo, this.#poolMat, n);
    this.#poolIM.renderOrder = 5;

    // Editör raycast'i için işaret; instanceId -> lamba id çevirisi lampIdFromHit ile yapılır
    for (const im of [this.#poleIM, this.#headIM, this.#capIM]) {
      im.userData.lampLayer = true;
      im.frustumCulled = false;
    }
    this.#poolIM.frustumCulled = false;

    const glowPositions = new Float32Array(n * 3);
    const realDim = new THREE.Color(0.53, 0.53, 0.53); // gerçek ışıklı lambada havuz daha silik
    const white = new THREE.Color(1, 1, 1);

    lamps.forEach((lamp, i) => {
      this.#writeMatrices(i, 1);
      glowPositions[i * 3] = lamp.pos[0];
      glowPositions[i * 3 + 1] = lamp.pos[1] + h * 0.97;
      glowPositions[i * 3 + 2] = lamp.pos[2];
      this.#poolIM.setColorAt(i, i < this.#maxReal ? realDim : white);

      if (i < this.#maxReal) {
        const light = new THREE.PointLight(cfg.color, 0, h * cfg.distanceFactor, 2);
        light.position.set(lamp.pos[0], lamp.pos[1] + h * 0.95, lamp.pos[2]);
        this.#lights.push(light);
        this.group.add(light);
      }
    });

    this.#poolIM.instanceColor.needsUpdate = true;

    // Yeniden kurulumda mevcut seçim vurgusunu koru
    const hlIdx = this.#highlightId ? this.#lampIds.indexOf(this.#highlightId) : -1;
    if (hlIdx >= 0) this.#writeMatrices(hlIdx, 1.15);

    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    this.#glowPoints = new THREE.Points(glowGeo, this.#glowMat);
    this.#glowPoints.frustumCulled = false;
    this.#glowPoints.renderOrder = 6;

    this.group.add(this.#poleIM, this.#headIM, this.#capIM, this.#poolIM, this.#glowPoints);
    this.#applyFade(); // mevcut gece/gündüz durumunu yeni lambalara uygula
  }

  #disposeBuilt() {
    for (const light of this.#lights) this.group.remove(light);
    this.#lights = [];
    for (const obj of [this.#poleIM, this.#headIM, this.#capIM, this.#poolIM, this.#glowPoints]) {
      if (!obj) continue;
      this.group.remove(obj);
      if (obj.isInstancedMesh) obj.dispose();
      else obj.geometry.dispose(); // glow Points geometrisi lambaya özel
    }
    this.#poleIM = this.#headIM = this.#capIM = this.#poolIM = this.#glowPoints = null;
  }

  /** i. lambanın direk/başlık/şapka/havuz matrislerini yazar. */
  #writeMatrices(i, scale) {
    const [x, y, z] = this.#lampPos[i];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale),
    );
    this.#poleIM.setMatrixAt(i, m);
    this.#headIM.setMatrixAt(i, m);
    this.#capIM.setMatrixAt(i, m);
    const poolM = new THREE.Matrix4().makeTranslation(x, y, z);
    this.#poolIM.setMatrixAt(i, poolM);
    this.#markMatricesDirty();
  }

  #markMatricesDirty() {
    for (const im of [this.#poleIM, this.#headIM, this.#capIM, this.#poolIM]) {
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /** Editör raycast sonucundan lamba kimliğini çözer. */
  lampIdFromHit(hit) {
    if (!hit?.object?.userData?.lampLayer || hit.instanceId == null) return null;
    return this.#lampIds[hit.instanceId] ?? null;
  }

  updateLampPosition(id, pos) {
    const i = this.#lampIds.indexOf(id);
    if (i < 0) return;
    this.#lampPos[i] = [pos.x, pos.y, pos.z];
    this.#writeMatrices(i, this.#highlightId === id ? 1.15 : 1);

    const attr = this.#glowPoints.geometry.getAttribute('position');
    attr.setXYZ(i, pos.x, pos.y + this.height * 0.97, pos.z);
    attr.needsUpdate = true;

    if (i < this.#lights.length) {
      this.#lights[i].position.set(pos.x, pos.y + this.height * 0.95, pos.z);
    }
  }

  /** Editörde seçili lambayı belirginleştirir. */
  setHighlight(id) {
    if (this.#highlightId === id) return;
    const prev = this.#highlightId;
    this.#highlightId = id;
    if (!this.#poleIM) return;
    const prevIdx = prev ? this.#lampIds.indexOf(prev) : -1;
    const idx = id ? this.#lampIds.indexOf(id) : -1;
    if (prevIdx >= 0) this.#writeMatrices(prevIdx, 1);
    if (idx >= 0) this.#writeMatrices(idx, 1.15);
  }

  setNight(night) {
    this.#fadeTarget = night ? 1 : 0;
  }

  get pickMeshes() {
    return [this.#poleIM, this.#headIM, this.#capIM].filter(Boolean);
  }

  #update(dt) {
    if (this.#fade === this.#fadeTarget) return;
    const step = dt / this.config.lamps.transitionSec;
    this.#fade = this.#fadeTarget > this.#fade
      ? Math.min(this.#fadeTarget, this.#fade + step)
      : Math.max(this.#fadeTarget, this.#fade - step);
    this.#applyFade();
  }

  #applyFade() {
    const f = this.#fade;
    this.#headMat.emissiveIntensity = f * 2.2;
    this.#glowMat.opacity = f * 0.85;
    this.#poolMat.opacity = f * 0.75;

    // Gündüz: gece katmanları hiç çizilmesin, ışıklar shader'a girmesin
    const nightVisible = f > 0.01;
    if (this.#poolIM) this.#poolIM.visible = nightVisible;
    if (this.#glowPoints) this.#glowPoints.visible = nightVisible;
    for (const light of this.#lights) {
      light.visible = nightVisible;
      light.intensity = f * this.config.lamps.intensity;
    }
  }
}
