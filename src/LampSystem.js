import * as THREE from 'three';

/**
 * Sokak lambaları: editörde yerleştirilir, graph.json içinde `lamps` dizisinde saklanır.
 *
 * Performans mimarisi:
 *  - Direk / başlık / şapka: 3 adet InstancedMesh (lamba sayısından bağımsız 3 draw call)
 *  - Zemindeki ışık havuzları: 1 adet InstancedMesh
 *  - Ampul parlamaları: 1 adet Points katmanı
 *  - Gerçek PointLight sayısı cihaz profilindeki maxRealLights (masaüstü 4 / mobil 2);
 *    aralıkla kameraya en yakın lambalara bağlanır, kalanı sahte havuz kullanır.
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

    this.#maxReal = sceneManager.perfProfile.maxRealLights ?? config.lamps.maxRealLights;

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
  #intensityScale = 1;
  #highlightId = null;
  #assignTimer = 0;
  #order = [];
  #dist = [];
  #m = new THREE.Matrix4();
  #p = new THREE.Vector3();
  #q = new THREE.Quaternion();
  #s = new THREE.Vector3();
  #realDim = new THREE.Color(0.53, 0.53, 0.53);
  #white = new THREE.Color(1, 1, 1);

  get maxRealLights() { return this.#maxReal; }

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
      im.visible = new URLSearchParams(location.search).has('editor');
    }

    const glowPositions = new Float32Array(n * 3);

    lamps.forEach((lamp, i) => {
      this.#writeMatrices(i, 1);
      glowPositions[i * 3] = lamp.pos[0];
      glowPositions[i * 3 + 1] = lamp.pos[1] + h * 0.97;
      glowPositions[i * 3 + 2] = lamp.pos[2];
      this.#poolIM.setColorAt(i, this.#white);
    });

    const lightCount = Math.min(this.#maxReal, n);
    for (let i = 0; i < lightCount; i++) {
      const light = new THREE.PointLight(cfg.color, 0, h * cfg.distanceFactor, 2);
      light.visible = false;
      this.#lights.push(light);
      this.group.add(light);
    }

    this.#poolIM.instanceColor.needsUpdate = true;

    // Yeniden kurulumda mevcut seçim vurgusunu koru
    const hlIdx = this.#highlightId ? this.#lampIds.indexOf(this.#highlightId) : -1;
    if (hlIdx >= 0) this.#writeMatrices(hlIdx, 1.15);

    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    this.#glowPoints = new THREE.Points(glowGeo, this.#glowMat);
    this.#glowPoints.renderOrder = 6;

    this.group.add(this.#poleIM, this.#headIM, this.#capIM, this.#poolIM, this.#glowPoints);
    this.#refreshBounds();
    this.#applyFade();
    this.#assignNearestLights();
  }

  #refreshBounds() {
    const box = new THREE.Box3();
    const h = this.height;
    for (const [x, y, z] of this.#lampPos) {
      box.expandByPoint(this.#p.set(x, y, z));
      box.expandByPoint(this.#p.set(x, y + h * 1.15, z));
    }
    const sphere = box.isEmpty() ? new THREE.Sphere() : box.getBoundingSphere(new THREE.Sphere());
    sphere.radius += Math.max(h * 0.4, 0.5);
    for (const im of [this.#poleIM, this.#headIM, this.#capIM, this.#poolIM]) {
      if (!im) continue;
      im.boundingSphere = sphere.clone();
      im.frustumCulled = true;
    }
    if (this.#glowPoints) {
      this.#glowPoints.geometry.boundingSphere = sphere.clone();
      this.#glowPoints.frustumCulled = true;
    }
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
    this.#p.set(x, y, z);
    this.#s.set(scale, scale, scale);
    this.#m.compose(this.#p, this.#q, this.#s);
    this.#poleIM.setMatrixAt(i, this.#m);
    this.#headIM.setMatrixAt(i, this.#m);
    this.#capIM.setMatrixAt(i, this.#m);
    this.#m.makeTranslation(x, y, z);
    this.#poolIM.setMatrixAt(i, this.#m);
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

    this.#refreshBounds();
    if (this.#fade > 0.01) this.#assignNearestLights();
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
    this.sm.pokeActivity();
  }

  /** Ayarlar paneli: 1 = config şiddeti. Gece lambalarını anında ölçekler. */
  setIntensityScale(scale) {
    this.#intensityScale = scale;
    this.#applyFade();
    if (this.#fade > 0.01) this.#assignNearestLights();
  }

  get pickMeshes() {
    return [this.#poleIM, this.#headIM, this.#capIM].filter(Boolean);
  }

  #update(dt) {
    let fading = false;
    if (this.#fade !== this.#fadeTarget) {
      const step = dt / this.config.lamps.transitionSec;
      this.#fade = this.#fadeTarget > this.#fade
        ? Math.min(this.#fadeTarget, this.#fade + step)
        : Math.max(this.#fadeTarget, this.#fade - step);
      this.#applyFade();
      fading = true;
    }
    if (this.#fade > 0.01 && this.#lights.length) {
      this.#assignTimer += dt;
      const interval = this.config.lamps.assignIntervalSec ?? 0.28;
      if (fading || this.#assignTimer >= interval) {
        this.#assignTimer = 0;
        this.#assignNearestLights();
      }
    }
  }

  #assignNearestLights() {
    const n = this.#lampPos.length;
    if (!n || !this.#lights.length) return;
    const cam = this.sm.camera.position;
    if (this.#order.length !== n) this.#order = Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < n; i++) {
      const p = this.#lampPos[i];
      const dx = p[0] - cam.x;
      const dz = p[2] - cam.z;
      this.#dist[i] = dx * dx + dz * dz;
    }
    this.#order.sort((a, b) => this.#dist[a] - this.#dist[b]);

    const h = this.height;
    const nightVisible = this.#fade > 0.01;
    const intensity = this.#fade * this.config.lamps.intensity * this.#intensityScale;
    const chosen = new Set();
    for (let k = 0; k < this.#lights.length; k++) {
      const lampI = this.#order[k];
      const light = this.#lights[k];
      if (lampI == null) {
        light.visible = false;
        continue;
      }
      chosen.add(lampI);
      const [x, y, z] = this.#lampPos[lampI];
      light.position.set(x, y + h * 0.95, z);
      light.visible = nightVisible;
      light.intensity = intensity;
    }
    if (this.#poolIM?.instanceColor) {
      for (let i = 0; i < n; i++) {
        this.#poolIM.setColorAt(i, chosen.has(i) ? this.#realDim : this.#white);
      }
      this.#poolIM.instanceColor.needsUpdate = true;
    }
  }

  #applyFade() {
    const f = this.#fade;
    const gain = this.#intensityScale;
    this.#headMat.emissiveIntensity = f * 2.2 * gain;
    this.#glowMat.opacity = Math.min(1, f * 0.85 * gain);
    this.#poolMat.opacity = Math.min(1, f * 0.75 * gain);

    // Gündüz: gece katmanları hiç çizilmesin, ışıklar shader'a girmesin
    const nightVisible = f > 0.01;
    if (this.#poolIM) this.#poolIM.visible = nightVisible;
    if (this.#glowPoints) this.#glowPoints.visible = nightVisible;
    for (const light of this.#lights) {
      light.visible = nightVisible;
      light.intensity = f * this.config.lamps.intensity * gain;
    }
  }
}
