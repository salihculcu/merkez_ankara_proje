import * as THREE from 'three';

/**
 * Sokak lambaları: editörde yerleştirilir, graph.json içinde `lamps` dizisinde saklanır.
 *
 * Her lamba = direk + başlık küresi + (gece) parlama sprite'ı + zemine ışık havuzu.
 * Gerçek PointLight sayısı performans için `maxRealLights` ile sınırlıdır;
 * sınırı aşan lambalar yalnızca görsel parlama alır.
 */
export class LampSystem {
  constructor(sceneManager, config) {
    this.sm = sceneManager;
    this.config = config;

    this.group = new THREE.Group();
    this.group.name = 'LAMP_LAYER';
    sceneManager.scene.add(this.group);

    this.#buildSharedAssets();
    sceneManager.onUpdate((dt) => this.#update(dt));
  }

  #entries = new Map();   // id -> { root, light, glow, pool, head }
  #fade = 0;              // 0 = sönük (gündüz), 1 = yanık (gece)
  #fadeTarget = 0;
  #highlightId = null;

  // Paylaşılan varlıklar
  #poleGeo; #headGeo; #capGeo; #poleMat; #headMat; #capMat;
  #glowTexture; #poolTexture;

  get height() {
    return this.config.lamps.height ?? THREE.MathUtils.clamp(this.sm.sceneScale * 0.020, 0.4, 5);
  }

  #buildSharedAssets() {
    const h = this.height;
    this.#poleGeo = new THREE.CylinderGeometry(h * 0.018, h * 0.028, h, 10);
    this.#poleGeo.translate(0, h / 2, 0);
    this.#headGeo = new THREE.SphereGeometry(h * 0.085, 16, 12);
    this.#headGeo.translate(0, h * 0.96, 0);
    this.#capGeo = new THREE.ConeGeometry(h * 0.13, h * 0.09, 12);
    this.#capGeo.translate(0, h * 1.06, 0);

    this.#poleMat = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.6, metalness: 0.5 });
    this.#capMat = new THREE.MeshStandardMaterial({ color: 0x1d242e, roughness: 0.5, metalness: 0.6 });
    // Başlık: gündüz mat cam, gece emissive parlar (tek paylaşılan materyal)
    this.#headMat = new THREE.MeshStandardMaterial({
      color: 0x8a8f96,
      roughness: 0.35,
      emissive: new THREE.Color(this.config.lamps.color),
      emissiveIntensity: 0,
    });

    this.#glowTexture = this.#radialTexture(1.0, 0.0);
    this.#poolTexture = this.#radialTexture(0.7, 0.0);
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
    for (const entry of this.#entries.values()) {
      this.group.remove(entry.root);
      entry.glow.material.dispose();
      entry.pool.material.dispose();
    }
    this.#entries.clear();

    const h = this.height;
    const cfg = this.config.lamps;

    lamps.forEach((lamp, index) => {
      const root = new THREE.Group();
      root.position.set(lamp.pos[0], lamp.pos[1], lamp.pos[2]);

      const pole = new THREE.Mesh(this.#poleGeo, this.#poleMat);
      const head = new THREE.Mesh(this.#headGeo, this.#headMat);
      const cap = new THREE.Mesh(this.#capGeo, this.#capMat);
      // Editör seçimi için tanımlayıcı — direk ve başlık tıklanabilir
      pole.userData.lampId = lamp.id;
      head.userData.lampId = lamp.id;
      cap.userData.lampId = lamp.id;

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.#glowTexture,
        color: cfg.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      glow.scale.setScalar(h * 0.85);
      glow.position.y = h * 0.97;

      // Havuz, gerçek ışığın zemindeki ayak izine yakın boyutta tutulur ki
      // ışık limiti dışında kalan lambalar da aydınlatıyormuş gibi görünsün.
      const poolGeo = new THREE.CircleGeometry(h * (cfg.poolRadiusFactor ?? 2.6), 32);
      poolGeo.rotateX(-Math.PI / 2);
      const pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
        map: this.#poolTexture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      pool.position.y = 0.03;
      pool.renderOrder = 5;

      let light = null;
      if (index < cfg.maxRealLights) {
        light = new THREE.PointLight(cfg.color, 0, h * cfg.distanceFactor, 2);
        light.position.y = h * 0.95;
        root.add(light);
      }

      root.add(pole, head, cap, glow, pool);
      this.group.add(root);
      this.#entries.set(lamp.id, { root, light, glow, pool, head });
    });

    this.#applyFade(); // mevcut gece/gündüz durumunu yeni lambalara uygula
  }

  updateLampPosition(id, pos) {
    this.#entries.get(id)?.root.position.set(pos.x, pos.y, pos.z);
  }

  /** Editörde seçili lambayı belirginleştirir. */
  setHighlight(id) {
    this.#highlightId = id;
    for (const [lampId, entry] of this.#entries) {
      entry.root.scale.setScalar(lampId === id ? 1.15 : 1);
    }
  }

  setNight(night) {
    this.#fadeTarget = night ? 1 : 0;
  }

  get pickMeshes() {
    const meshes = [];
    for (const entry of this.#entries.values()) {
      for (const child of entry.root.children) {
        if (child.isMesh && child.userData.lampId) meshes.push(child);
      }
    }
    return meshes;
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
    for (const entry of this.#entries.values()) {
      if (entry.light) entry.light.intensity = f * this.config.lamps.intensity;
      entry.glow.material.opacity = f * 0.85;
      // Gerçek ışığı olmayan lambalar zemin aydınlığını tamamen havuzdan alır
      entry.pool.material.opacity = f * (entry.light ? 0.4 : 0.75);
    }
  }
}
