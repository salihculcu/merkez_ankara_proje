import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { IS_MOBILE } from './config.js';

/**
 * Sahne kurulumu, GLB yükleme, hitbox hazırlama ve render döngüsü.
 *
 * Hitbox tespiti iki yolla yapılır:
 *  1. Nesne adı `HITBOX_` önekiyle başlıyorsa  -> storeId = önek sonrası kısım
 *  2. Nesne adı stores.json'daki bir mağaza kimliğiyle (büyük/küçük harf duyarsız)
 *     eşleşiyorsa -> storeId = eşleşen kimlik
 * (Blender'da nesne adı ile mesh adı farklı olabildiği için ikili kontrol şart.)
 */
export class SceneManager {
  constructor(container, config) {
    this.container = container;
    this.config = config;

    this.hitboxes = [];
    this.walkableMeshes = [];
    this.bounds = new THREE.Box3();
    this.sceneScale = 1;
    this.floorY = 0;
    this.modelRoot = null;
    this.cameraBusy = false;

    this.#updaters = new Set();
    this.#raycaster = new THREE.Raycaster();
    this.#pointerNdc = new THREE.Vector2();
    this.#colA = new THREE.Color();
    this.#colB = new THREE.Color();
  }

  #updaters; #raycaster; #pointerNdc; #hitboxMaterial;
  #basePixelRatio = 1; #resScale = 1; #frameAvgMs = 16.7; #adaptTimer = 0;
  #fpsEl = null; #fpsFrames = 0; #fpsTime = 0;
  #lastActivity = 0; #hidden = false; #colA; #colB;

  async init({ storeIds = [], onProgress = null } = {}) {
    const { config } = this;

    // Cihaz profili: mobilde antialias kapalı, piksel oranı sınırlı (doluluk maliyeti dpr² ile büyür)
    this.perfProfile = IS_MOBILE ? config.perf.mobile : config.perf.desktop;
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.perfProfile.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.#basePixelRatio = Math.min(window.devicePixelRatio, this.perfProfile.maxPixelRatio);
    this.renderer.setPixelRatio(this.#basePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = this.perfProfile.toneMapping === 'linear'
      ? THREE.LinearToneMapping
      : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    const day = config.dayNight.day;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(day.bg);
    this.renderer.toneMappingExposure = day.exposure;
    // Lambert kiosk yolunda RoomEnvironment/PMREM yok: env map her fragment'te ek örnekleme.
    // Gündüz hemi+directional zaten AVM krokisini doldurur.
    this.scene.environment = null;
    this.scene.environmentIntensity = 0;

    this.hemiLight = new THREE.HemisphereLight(day.hemiSky, day.hemiGround, day.hemi);
    this.scene.add(this.hemiLight);
    this.dirLight = new THREE.DirectionalLight(day.dirColor, day.dir);
    this.dirLight.position.set(1, 2, 1.2);
    this.scene.add(this.dirLight);

    this.onUpdate((dt) => this.#updateDayNight(dt));

    this.camera = new THREE.PerspectiveCamera(
      config.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    this.camera.position.set(20, 20, 20);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(82); // zemin altına inme
    this.controls.screenSpacePanning = false;

    window.addEventListener('resize', () => this.#onResize());

    await this.#loadModel(storeIds, onProgress);
    this.#buildGround();
    this.#fitControlsToBounds();
    this.pokeActivity();

    return this;
  }

  /** Son kullanıcı/kamera etkinliği — idle FPS tavanını geciktirir. */
  pokeActivity() {
    if (this.isIdle) this.#frameAvgMs = Math.min(this.#frameAvgMs, 18);
    this.#lastActivity = performance.now();
  }

  get isIdle() {
    if (this.cameraBusy) return false;
    if (this.#nightMix !== this.#nightTarget) return false;
    const settle = this.config.perf.idle?.settleMs ?? 400;
    return performance.now() - this.#lastActivity > settle;
  }

  async #loadModel(storeIds, onProgress) {
    // gltf-transform Draco + WebP GLB: mesh decode için yerel DRACOLoader şart.
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_GLTF_CONFIG);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const loadUrl = (url) => new Promise((resolve, reject) => {
      loader.load(
        url,
        resolve,
        (xhr) => { if (onProgress) onProgress(xhr.loaded, xhr.total); },
        reject,
      );
    });

    // Mobilde önce hafifletilmiş model denenir; yoksa ana modele düşülür.
    let gltf;
    if (IS_MOBILE && this.config.paths.modelMobile) {
      try {
        gltf = await loadUrl(this.config.paths.modelMobile);
        console.info('[SceneManager] Mobil model yüklendi:', this.config.paths.modelMobile);
      } catch {
        console.warn('[SceneManager] Mobil model bulunamadı, ana model kullanılıyor.');
      }
    }
    if (!gltf) gltf = await loadUrl(this.config.paths.model);

    this.modelRoot = gltf.scene;
    this.scene.add(this.modelRoot);

    const storeIdSet = new Set(storeIds.map((s) => s.toUpperCase()));
    const prefix = this.config.hitbox.prefix.toUpperCase();

    this.#hitboxMaterial = new THREE.MeshBasicMaterial({
      color: this.config.hitbox.debugColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const nameDump = [];
    this.modelRoot.traverse((obj) => {
      if (!obj.isMesh) return;

      const upper = obj.name.toUpperCase();
      let storeId = null;
      if (upper.startsWith(prefix)) storeId = upper.slice(prefix.length);
      else if (storeIdSet.has(upper)) storeId = upper;

      nameDump.push({ name: obj.name, tur: storeId ? `HITBOX (${storeId})` : 'model', ucgen: (obj.geometry.index?.count ?? 0) / 3 });

      if (storeId) {
        obj.userData.storeId = storeId;
        obj.material = this.#hitboxMaterial;
        obj.visible = false; // raycast yine çalışır; çizim maliyeti sıfırlanır
        this.hitboxes.push(obj);
      } else {
        this.walkableMeshes.push(obj);
      }
    });

    if (this.perfProfile.maxTextureSize) {
      this.#downscaleTextures(this.modelRoot, this.perfProfile.maxTextureSize);
    }
    this.#optimizeModelMaterials(this.modelRoot);
    this.#dedupeEquivalentMaterials(this.modelRoot);
    this.#mergeStaticBatches(this.modelRoot);

    // Statik AVM: her kare matrix yeniden çarpılmaz
    this.modelRoot.updateMatrixWorld(true);
    this.modelRoot.traverse((obj) => {
      obj.matrixAutoUpdate = false;
      obj.matrixWorldAutoUpdate = false;
    });

    console.groupCollapsed('[SceneManager] GLB nesne dökümü');
    console.table(nameDump);
    console.groupEnd();
    console.info(`[SceneManager] ${this.hitboxes.length} hitbox bulundu:`, this.hitboxes.map((h) => h.userData.storeId));

    this.bounds.setFromObject(this.modelRoot);
    this.sceneScale = this.bounds.getSize(new THREE.Vector3()).length();
    this.floorY = this.bounds.min.y;
  }

  /**
   * Kiosk malzemeleri: PBR'ı Lambert'e indir, düz duvarlarda arka yüzü çizme,
   * gölge bayraklarını kapat. Cam/şeffaf yüzeylerde DoubleSide korunur.
   */
  #optimizeModelMaterials(root) {
    const mode = this.perfProfile.materialMode ?? 'lambert';
    const seen = new Map();
    let converted = 0;
    let frontLocked = 0;

    const convert = (mat) => {
      if (!mat) return mat;
      if (seen.has(mat)) return seen.get(mat);
      const next = this.#toRuntimeMaterial(mat, mode);
      if (next !== mat) converted += 1;
      if (next.side === THREE.FrontSide) frontLocked += 1;
      seen.set(mat, next);
      return next;
    };

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (obj.userData.storeId) return;
      obj.material = Array.isArray(obj.material)
        ? obj.material.map(convert)
        : convert(obj.material);
    });

    console.info(`[SceneManager] Malzeme: ${converted} Lambert, ${frontLocked} FrontSide (${mode}).`);
  }

  /** Aynı renk/doku/yüz kombinasyonunu tek malzeme örneğine indirir (batch birleşimi için). */
  #dedupeEquivalentMaterials(root) {
    const canon = new Map();
    let reused = 0;
    root.traverse((obj) => {
      if (!obj.isMesh || obj.userData.storeId) return;
      const apply = (mat) => {
        if (!mat) return mat;
        const key = [
          mat.type,
          mat.color?.getHexString?.() ?? '',
          mat.map?.uuid ?? '-',
          mat.emissive?.getHexString?.() ?? '',
          mat.side,
          mat.transparent ? 1 : 0,
          (mat.opacity ?? 1).toFixed(3),
        ].join('|');
        const existing = canon.get(key);
        if (existing) {
          if (existing !== mat) reused += 1;
          return existing;
        }
        canon.set(key, mat);
        return mat;
      };
      obj.material = Array.isArray(obj.material)
        ? obj.material.map(apply)
        : apply(obj.material);
    });
    if (reused) console.info(`[SceneManager] ${reused} eşdeğer malzeme tekilleştirildi (${canon.size} benzersiz).`);
  }

  /**
   * Aynı malzemeyi paylaşan statik mesh'leri tek geometride birleştirir.
   * 300+ ayrı draw call, kiosk kuşbakışında birkaç batch'e iner.
   */
  #mergeStaticBatches(root) {
    const groups = new Map();
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || obj.userData.storeId || !obj.visible) return;
      if (Array.isArray(obj.material)) return;
      const list = groups.get(obj.material.uuid) ?? [];
      list.push(obj);
      groups.set(obj.material.uuid, list);
    });

    let batches = 0;
    let removed = 0;
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const geos = [];
      for (const mesh of meshes) {
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        geos.push(geo);
      }
      let merged = null;
      try {
        merged = mergeGeometries(geos, false);
      } catch {
        merged = null;
      }
      for (const geo of geos) geo.dispose();
      if (!merged) continue;

      const batch = new THREE.Mesh(merged, meshes[0].material);
      batch.name = `BATCH_${meshes[0].material.name || batches}`;
      batch.castShadow = false;
      batch.receiveShadow = false;
      root.add(batch);
      this.walkableMeshes.push(batch);

      for (const mesh of meshes) {
        const idx = this.walkableMeshes.indexOf(mesh);
        if (idx >= 0) this.walkableMeshes.splice(idx, 1);
        mesh.removeFromParent();
        mesh.geometry?.dispose();
        removed += 1;
      }
      batches += 1;
    }
    if (batches) console.info(`[SceneManager] ${removed} mesh ${batches} batch halinde birleştirildi.`);
  }

  #toRuntimeMaterial(mat, mode) {
    const transparent = !!(mat.transparent || mat.opacity < 0.999 || mat.alphaTest > 0);
    const side = transparent ? THREE.DoubleSide : THREE.FrontSide;

    if (mode !== 'lambert' || mat.isMeshBasicMaterial || mat.isMeshLambertMaterial) {
      mat.side = side;
      if (mat.envMapIntensity != null) mat.envMapIntensity = 0;
      return mat;
    }

    if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial && !mat.isMeshPhongMaterial) {
      mat.side = side;
      return mat;
    }

    return new THREE.MeshLambertMaterial({
      name: mat.name,
      color: mat.color.clone(),
      map: mat.map ?? null,
      emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
      emissiveMap: mat.emissiveMap ?? null,
      emissiveIntensity: mat.emissiveIntensity ?? 1,
      opacity: mat.opacity,
      transparent,
      alphaTest: mat.alphaTest ?? 0,
      alphaMap: mat.alphaMap ?? null,
      aoMap: mat.aoMap ?? null,
      aoMapIntensity: mat.aoMapIntensity ?? 1,
      lightMap: mat.lightMap ?? null,
      lightMapIntensity: mat.lightMapIntensity ?? 1,
      side,
      depthWrite: mat.depthWrite,
      fog: mat.fog,
    });
  }

  /**
   * GPU belleği koruması: kenarı maxSize'ı aşan dokular canvas ile küçültülür.
   * 2048² RGBA bir doku mip'lerle ~22 MB tutar; 1024'e inince ~5.5 MB'a düşer.
   */
  #downscaleTextures(root, maxSize) {
    const seen = new Set();
    let count = 0;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
          const tex = mat?.[key];
          if (!tex || seen.has(tex)) continue;
          seen.add(tex);
          const img = tex.image;
          if (!img?.width || Math.max(img.width, img.height) <= maxSize) continue;

          const scale = maxSize / Math.max(img.width, img.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          tex.image = canvas;
          tex.needsUpdate = true;
          count += 1;
        }
      }
    });
    if (count) console.info(`[SceneManager] ${count} doku ${maxSize}px'e küçültüldü (bellek koruması).`);
  }

  // Bloklar arası yürüyüş alanı GLB'de ayrı bir zemin mesh'i olmayabilir;
  // hem görsel bütünlük hem editörde "boşluğa" node koyabilmek için büyük bir taban diski eklenir.
  #buildGround() {
    const radius = this.sceneScale * 1.2;
    const geo = new THREE.CircleGeometry(radius, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8f887c });
    const ground = new THREE.Mesh(geo, mat);
    const center = this.bounds.getCenter(new THREE.Vector3());
    ground.position.set(center.x, this.floorY - 0.02, center.z);
    ground.name = 'GROUND_DISC';
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    this.scene.add(ground);
    this.groundMesh = ground;
    this.walkableMeshes.push(ground);
  }

  #fitControlsToBounds() {
    const center = this.bounds.getCenter(new THREE.Vector3());
    this.controls.target.copy(center);
    this.controls.minDistance = this.sceneScale * 0.08;
    // Asıl tavan CameraDirector.setHomeFromBounds'ta home mesafesine çekilir
    this.controls.maxDistance = this.sceneScale * 1.0;
    this.camera.near = Math.max(0.01, this.sceneScale * 0.001);
    this.camera.far = this.sceneScale * 12;
    this.camera.updateProjectionMatrix();
  }

  setHitboxDebug(visible) {
    this.#hitboxMaterial.opacity = visible ? this.config.hitbox.debugOpacity : 0;
    for (const h of this.hitboxes) h.visible = visible;
  }

  // ---------- Gece / Gündüz ----------

  #nightMix = 0;        // 0 = gündüz, 1 = gece
  #nightTarget = 0;

  /** Ortam ışıklarını gece/gündüz durumuna yumuşak geçişle taşır. */
  setNight(night) {
    this.#nightTarget = night ? 1 : 0;
    this.pokeActivity();
    this.#adaptTimer = this.config.perf.adaptive.intervalSec;
    this.#applyPixelRatio();
  }

  get isNight() { return this.#nightTarget === 1; }

  #updateDayNight(dt) {
    if (this.#nightMix === this.#nightTarget) return;
    const step = dt / this.config.dayNight.transitionSec;
    this.#nightMix = this.#nightTarget > this.#nightMix
      ? Math.min(this.#nightTarget, this.#nightMix + step)
      : Math.max(this.#nightTarget, this.#nightMix - step);

    const { day, night } = this.config.dayNight;
    const mix = this.#nightMix;
    const lerp = (a, b) => a + (b - a) * mix;

    this.scene.background.lerpColors(this.#colA.set(day.bg), this.#colB.set(night.bg), mix);
    this.hemiLight.color.lerpColors(this.#colA.set(day.hemiSky), this.#colB.set(night.hemiSky), mix);
    this.hemiLight.groundColor.lerpColors(this.#colA.set(day.hemiGround), this.#colB.set(night.hemiGround), mix);
    this.hemiLight.intensity = lerp(day.hemi, night.hemi);
    this.dirLight.color.lerpColors(this.#colA.set(day.dirColor), this.#colB.set(night.dirColor), mix);
    this.dirLight.intensity = lerp(day.dir, night.dir);
    this.renderer.toneMappingExposure = lerp(day.exposure, night.exposure);

    if (this.#nightMix === this.#nightTarget) this.#applyPixelRatio();
  }

  /** Ekran koordinatından verilen nesne listesine ışın gönderir. */
  raycastFromScreen(clientX, clientY, objects) {
    return this.screenRaycaster(clientX, clientY).intersectObjects(objects, false);
  }

  /** Ekran koordinatına ayarlanmış paylaşılan raycaster'ı döner (editör, çizgi eşiği gibi özel parametreler için kullanır). */
  screenRaycaster(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.#pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointerNdc, this.camera);
    return this.#raycaster;
  }

  /** Ekran koordinatından yatay bir düzleme (y=planeY) ışın gönderir. */
  raycastToPlane(clientX, clientY, planeY) {
    const rect = this.canvas.getBoundingClientRect();
    this.#pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointerNdc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const out = new THREE.Vector3();
    return this.#raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  // ---------- 2B kuş bakışı görünümü ----------

  topViewActive = false;
  #savedView = null;

  /**
   * Kamerayı tam tepeden bakışa kilitler (CAD/harita programlarındaki 2B mod gibi):
   * dönme kapanır, sol sürükleme kaydırma olur, dar FOV ile perspektif düzleşir.
   * Kapatınca önceki 3B görünüm aynen geri gelir.
   */
  setTopView(on) {
    if (on === this.topViewActive) return;
    this.topViewActive = on;
    this.pokeActivity();
    const cam = this.camera;
    const c = this.controls;

    if (on) {
      this.#savedView = {
        pos: cam.position.clone(),
        target: c.target.clone(),
        fov: cam.fov,
        maxPolar: c.maxPolarAngle,
        maxDist: c.maxDistance,
        mouseLeft: c.mouseButtons.LEFT,
        touchOne: c.touches.ONE,
      };

      const center = this.bounds.getCenter(new THREE.Vector3());
      const size = this.bounds.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.z);

      // Dar FOV = ortografiğe yakın, düz plan görünümü; mesafe plana göre kadrajlanır
      cam.fov = 20;
      const dist = (maxDim / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.12;
      c.maxDistance = Math.max(c.maxDistance, dist * 2.5);

      cam.position.set(center.x, this.floorY + dist, center.z + dist * 0.001);
      c.target.copy(center);
      c.minPolarAngle = 0;
      c.maxPolarAngle = 0.002;   // tepeden bakış kilidi
      c.enableRotate = false;
      c.mouseButtons.LEFT = THREE.MOUSE.PAN;  // sol sürükleme: haritayı kaydır
      c.touches.ONE = THREE.TOUCH.PAN;
    } else {
      const s = this.#savedView;
      cam.fov = s.fov;
      cam.position.copy(s.pos);
      c.target.copy(s.target);
      c.minPolarAngle = 0;
      c.maxPolarAngle = s.maxPolar;
      c.maxDistance = s.maxDist;
      c.enableRotate = true;
      c.mouseButtons.LEFT = s.mouseLeft;
      c.touches.ONE = s.touchOne;
    }

    cam.updateProjectionMatrix();
    c.update();
  }

  onUpdate(fn) { this.#updaters.add(fn); return () => this.#updaters.delete(fn); }

  start() {
    if (this.config.debug.fpsCounter) {
      this.#fpsEl = document.createElement('div');
      this.#fpsEl.id = 'fps-counter';
      this.#fpsEl.textContent = '— FPS';
      document.body.appendChild(this.#fpsEl);
    }

    this.pokeActivity();

    const poke = () => this.pokeActivity();
    window.addEventListener('pointerdown', poke, { passive: true });
    window.addEventListener('keydown', poke);
    this.canvas.addEventListener('wheel', poke, { passive: true });
    this.canvas.addEventListener('pointermove', poke, { passive: true });
    this.controls.addEventListener('start', poke);
    this.controls.addEventListener('change', poke);

    document.addEventListener('visibilitychange', () => {
      this.#hidden = document.hidden;
      if (this.#hidden) {
        this.renderer.setAnimationLoop(null);
      } else {
        this.pokeActivity();
        this.#runLoop();
      }
    });

    this.#runLoop();
  }

  #runLoop() {
    let last = performance.now();
    let elapsed = 0;
    let lastRender = 0;

    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const idleCfg = this.config.perf.idle;
      const cap = this.isIdle
        ? (idleCfg?.fps ?? 30)
        : (idleCfg?.activeFps ?? 60);
      if (now - lastRender < (1000 / cap) - 0.75) return;

      const dtMs = now - last;
      const dt = Math.min(dtMs / 1000, 0.1);
      last = now;
      lastRender = now;
      elapsed += dt;
      this.#adaptResolution(dtMs, dt);
      this.#updateFpsCounter(dtMs);
      this.controls.update();
      for (const fn of this.#updaters) fn(dt, elapsed);
      this.renderer.render(this.scene, this.camera);
    });
  }

  #updateFpsCounter(dtMs) {
    if (!this.#fpsEl) return;
    this.#fpsFrames += 1;
    this.#fpsTime += dtMs;
    if (this.#fpsTime < 500) return; // ~saniyede 2 kez güncelle

    const avgMs = this.#fpsTime / this.#fpsFrames;
    const fps = Math.round(1000 / avgMs);
    this.#fpsFrames = 0;
    this.#fpsTime = 0;

    const bits = [];
    if (this.#resScale < 1) bits.push(`${(this.#resScale * 100).toFixed(0)}%`);
    if (this.isNight) bits.push('gece');
    if (this.isIdle) bits.push('idle');
    const extra = bits.length ? ` · ${bits.join(' · ')}` : '';
    this.#fpsEl.textContent = `${fps} FPS · ${avgMs.toFixed(1)} ms${extra}`;
    this.#fpsEl.className = fps >= 50 ? 'good' : fps >= 30 ? 'mid' : 'bad';
  }

  /**
   * Uyarlanabilir çözünürlük: ortalama kare süresi yavaşsa render ölçeğini
   * kademeli düşürür, tekrar hızlanınca geri yükseltir. Zayıf tablet/telefonlarda
   * takılmayı akıcılığa çevirir; güçlü cihazlarda hiç devreye girmez.
   */
  #adaptResolution(dtMs, dt) {
    const cfg = this.config.perf.adaptive;
    if (!cfg.enabled) return;
    // Idle 30 FPS kasıtlıdır; ölçek düşürme tetiklenmesin
    if (this.isIdle) {
      this.#adaptTimer = 0;
      return;
    }

    // Üstel hareketli ortalama; sekme geri planından dönüşteki dev kareleri yok say
    if (dtMs < 500) this.#frameAvgMs += (dtMs - this.#frameAvgMs) * 0.05;

    this.#adaptTimer += dt;
    if (this.#adaptTimer < cfg.intervalSec) return;
    this.#adaptTimer = 0;

    let next = this.#resScale;
    if (this.#frameAvgMs > cfg.slowMs) next = Math.max(cfg.minScale, this.#resScale * cfg.step);
    else if (this.#frameAvgMs < cfg.fastMs) next = Math.min(1, this.#resScale / cfg.step);
    if (next === this.#resScale) return;

    this.#resScale = next;
    this.#applyPixelRatio();
    console.info(`[SceneManager] Render ölçeği: ${this.#effectivePixelRatio().toFixed(2)} (ort. kare ${this.#frameAvgMs.toFixed(1)} ms)`);
  }

  #effectivePixelRatio() {
    const nightBias = (this.#nightTarget > 0.5 || this.#nightMix > 0.5)
      ? (this.perfProfile.nightPixelScale ?? 1)
      : 1;
    return this.#basePixelRatio * this.#resScale * nightBias;
  }

  #applyPixelRatio() {
    const next = this.#effectivePixelRatio();
    if (Math.abs(next - this.renderer.getPixelRatio()) < 0.001) return;
    this.renderer.setPixelRatio(next);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  #onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
