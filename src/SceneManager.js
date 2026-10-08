import { FrameCadence } from './FrameCadence.js?v=mobilefps2';
import { blocksRoute } from './RouteOcclusion.js';
import { NavigationOcclusion, prepareNavigationOcclusion } from './NavigationOcclusion.js?v=1';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { batchStaticMeshes } from './StaticBatcher.js?v=occlusion1';
import { bakeNightLighting } from './BakedNightLighting.js';
import { ModelLights, prepareModelLights } from './ModelLights.js';
import { DEFAULT_GRAPHICS } from './GraphicsSettings.js';
import { USE_LIGHT_PERF, resolvePerfProfile } from './config.js?v=mobilefps1';

/**
 * Sahne kurulumu, GLB yükleme, hitbox hazırlama ve render döngüsü.
 *
 * Hitbox tespiti:
 *  1. glTF mesh adı (Blender mesh verisi) `HITBOX_` / `STORE_` ile başlıyorsa
 *  2. Nesne veya parent adı aynı önekle başlıyorsa
 *  3. Nesne adı stores.json kimliğiyle birebir eşleşiyorsa
 * Blender glTF aktarımında nesne adı (MANGO) ile mesh adı (HITBOX_MANGO) ayrıdır;
 * Three.js nesne adını yazar, mesh adı parser ilişkisinden okunur.
 */
export class SceneManager {
  constructor(container, config) {
    this.container = container;
    this.config = config;

    this.hitboxes = [];
    this.walkableMeshes = [];
    this.storeLabels = {};
    this.kioskAnchor = null;
    this.kioskRadius = 0;
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
    this.onUpdate(dt => this.#updateNavigationTowers(dt));
  }

  #updaters; #raycaster; #pointerNdc; #hitboxMaterial; #hitboxOverlays = [];
  graphicsSettings = { ...DEFAULT_GRAPHICS };
  #originalEnvironment; #glassMaterials = new Map();
  #basePixelRatio = 1; #resScale = 1; #frameAvgMs = 16.7; #adaptTimer = 0;
  #cadence = new FrameCadence();
  #fpsEl = null; #fpsFrames = 0; #fpsTime = 0;
  #lastActivity = 0; #hidden = false; #colA; #colB;
  #navigationTowers = []; #navigationPoints = null; #towerCheckTimer = 0;
  navigationOcclusion = null;

  async init({ storeIds = [], onProgress = null } = {}) {
    const { config } = this;

    // Önce kaba profil (AA kararı), sonra GPU adına göre tablet kademesi netleşir.
    this.perfProfile = resolvePerfProfile(config);
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.perfProfile.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    const gpuName = this.#readGpuName();
    this.perfProfile = resolvePerfProfile(config, { gpuRenderer: gpuName });
    this.#applyProfilePixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    console.info(`[SceneManager] Perf kademesi: ${this.perfProfile.tier} · GPU: ${gpuName || 'bilinmiyor'} · dpr≤${this.perfProfile.maxPixelRatio}`);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    const day = config.dayNight.day;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(day.bg);
    this.renderer.toneMappingExposure = day.exposure;

    this.camera = new THREE.PerspectiveCamera(
      config.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    this.camera.position.set(20, 20, 20);

    // PBR materyaller için yumuşak stüdyo ortam ışığı
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.#originalEnvironment = this.scene.environment;
    this.scene.environmentIntensity = day.env;
    pmrem.dispose();

    this.hemiLight = new THREE.HemisphereLight(day.hemiSky, day.hemiGround, day.hemi);
    this.scene.add(this.hemiLight);
    this.dirLight = new THREE.DirectionalLight(day.dirColor, day.dir);
    this.dirLight.position.set(1, 2, 1.2);
    this.scene.add(this.dirLight);

    this.onUpdate((dt) => this.#updateDayNight(dt));

    this.controls = new OrbitControls(this.camera, this.canvas);
    const orbit = config.camera.softOrbit ?? {};
    this.controls.enableDamping = true;
    this.controls.dampingFactor = orbit.dampingFactor ?? 0.06;
    this.controls.rotateSpeed = orbit.rotateSpeed ?? 0.55;
    this.controls.panSpeed = orbit.panSpeed ?? 0.4;
    this.controls.zoomSpeed = orbit.zoomSpeed ?? 0.72;
    this.controls.zoomInertia = orbit.zoomInertia ?? 0.9;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(82); // zemin altına inme
    this.controls.screenSpacePanning = false;

    window.addEventListener('resize', () => this.#onResize());

    await this.#loadModel(storeIds, onProgress);
    this.#buildGround();
    this.#fitControlsToBounds();
    this.pokeActivity();

    return this;
  }

  /** Son dokunma / kamera hareketi — boşta kare tavanını geciktirir. */
  pokeActivity() {
    if (this.isIdle) this.#frameAvgMs = Math.min(this.#frameAvgMs, 18);
    this.#lastActivity = performance.now();
  }

  get isIdle() {
    if (this.cameraBusy) return false;
    if (this.#nightMix !== this.#nightTarget) return false;
    const settle = this.config.perf.idle?.settleMs ?? 450;
    return performance.now() - this.#lastActivity > settle;
  }

  async #loadModel(storeIds, onProgress) {
    // gltf-transform Draco + WebP GLB: mesh decode için yerel DRACOLoader şart.
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_GLTF_CONFIG);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);

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
    if (USE_LIGHT_PERF && this.config.paths.modelMobile) {
      try {
        gltf = await loadUrl(this.config.paths.modelMobile);
        console.info('[SceneManager] Mobil model yüklendi:', this.config.paths.modelMobile);
      } catch {
        console.warn('[SceneManager] Mobil model bulunamadı, ana model kullanılıyor.');
      }
    }
    if (!gltf) {
      try {
        gltf = await loadUrl(this.config.paths.model);
      } catch (error) {
        if (!this.config.paths.modelFallback) throw error;
        console.warn('[SceneManager] Optimize model yüklenemedi, kaynak modele dönülüyor.', error);
        gltf = await loadUrl(this.config.paths.modelFallback);
      }
    }
    dracoLoader.dispose();

    this.modelRoot = gltf.scene;
    this.scene.add(this.modelRoot);

    // Remove the unused default Blender cube before baking/batching.
    this.modelRoot.updateMatrixWorld(true);
    this.modelRoot.traverse(obj => {
      if (!obj.isMesh) return;
      if (obj.name.replaceAll('.', '') === 'Cube155') {
        obj.visible = false;
        obj.userData.skipHitbox = true;
        return;
      }
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      if (size.y > 25 && box.max.y > 25) {
        obj.userData.navigationTower = true;
        this.#navigationTowers.push({ mesh: obj, box, original: obj.material, faded: null, alpha: 1, target: 1 });
      }
    });

    const storeIdSet = new Set(storeIds.map((s) => s.toUpperCase()));

    this.#hitboxMaterial = new THREE.MeshBasicMaterial({
      color: this.config.hitbox.debugColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false, // çatı/duvar hitbox'ı örtmesin (Blender outline gibi)
      side: THREE.DoubleSide,
    });

    const nameDump = [];
    const meshes = [];
    this.modelRoot.updateMatrixWorld(true);
    this.modelRoot.traverse((obj) => {
      if (obj.isMesh) meshes.push(obj);
    });

    let kioskObj = null;
    let signCount = 0;
    let planeCount = 0;
    for (const obj of meshes) {
      if (obj.userData.skipHitbox) continue;
      const gltfMeshName = this.#gltfMeshName(obj, gltf);
      const isSign = this.#isStoreSign(obj.name) || this.#isStoreSign(obj.userData?.name) || this.#isStoreSign(gltfMeshName);
      const isPlane = this.#usesNightProofMaterial(obj);
      if (isSign || isPlane) {
        if (isSign) this.#makeStoreSignUnlit(obj);
        else this.#makeSignUnlit(obj);
        if (isSign) signCount += 1;
        else planeCount += 1;
        nameDump.push({
          name: `${gltfMeshName || obj.name}`,
          tur: isSign ? 'isim' : 'duzlem',
          ucgen: (obj.geometry.index?.count ?? 0) / 3,
        });
        continue;
      }
      if (this.#isKioskName(obj.name) || this.#isKioskName(obj.userData?.name) || this.#isKioskName(gltfMeshName)) {
        kioskObj = obj;
      }
      const storeId = this.#resolveStoreId(obj, storeIdSet, gltfMeshName);
      nameDump.push({
        name: `${gltfMeshName || obj.name}${obj.name && gltfMeshName && gltfMeshName !== obj.name ? ` ← ${obj.name}` : ''}`,
        tur: storeId ? `HITBOX (${storeId})` : 'model',
        ucgen: (obj.geometry.index?.count ?? 0) / 3,
      });

      if (storeId) {
        this.#rememberStoreLabel(storeId, obj);
        // Çatı malzemesi durur; tıklama bu mesh'ten, yeşil sadece ayrı overlay.
        obj.userData.storeId = storeId;
        obj.castShadow = false;
        obj.receiveShadow = false;
        this.hitboxes.push(obj);

        const overlay = new THREE.Mesh(obj.geometry, this.#hitboxMaterial);
        overlay.name = 'debug_overlay';
        overlay.userData.skipHitbox = true;
        overlay.raycast = () => {};
        overlay.visible = false;
        overlay.renderOrder = 40;
        obj.add(overlay);
        this.#hitboxOverlays.push(overlay);
      } else {
        obj.castShadow = false;
        obj.receiveShadow = false;
        this.walkableMeshes.push(obj);
      }
    }

    if (!kioskObj) {
      this.modelRoot.traverse((obj) => {
        if (!kioskObj && (this.#isKioskName(obj.name) || this.#isKioskName(obj.userData?.name))) kioskObj = obj;
      });
    }
    if (kioskObj) {
      const box = new THREE.Box3().setFromObject(kioskObj);
      const center = box.getCenter(new THREE.Vector3());
      this.kioskAnchor = new THREE.Vector3(center.x, box.min.y, center.z);
      this.kioskRadius = box.getSize(new THREE.Vector3()).length() * 0.5;
      console.info('[SceneManager] Kiosk orijini:', this.kioskAnchor.toArray().map((n) => +n.toFixed(3)));
    } else {
      console.warn('[SceneManager] KIOSK_OUTDOOR bulunamadı; kamera model merkezinde kalır.');
    }

    if (this.perfProfile.maxTextureSize) {
      this.#downscaleTextures(this.modelRoot, this.perfProfile.maxTextureSize);
    }
    const modelLightData = prepareModelLights(this.modelRoot);
    try {
      const response = await fetch('./assets/data/night-lights.json?v=geceson1');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      modelLightData.layout = await response.json();
    } catch (error) { console.warn('[ModelLights] Referans okunamadı; model ampulleri kullanılıyor.', error); }
    modelLightData.bake = await bakeNightLighting(this.modelRoot, modelLightData.layout);
    prepareNavigationOcclusion(this.modelRoot, this.hitboxes);
    this.#mergeStaticBatches(this.modelRoot);

    // Statik model: her kare matrix yeniden hesaplanmaz (görünüm aynı)
    this.modelRoot.updateMatrixWorld(true);
    this.modelRoot.traverse((obj) => {
      obj.matrixAutoUpdate = false;
      obj.matrixWorldAutoUpdate = false;
    });

    if (new URLSearchParams(location.search).has('debug') || new URLSearchParams(location.search).has('editor')) {
      console.groupCollapsed('[SceneManager] GLB nesne dökümü');
      console.table(nameDump);
      console.groupEnd();
    }
    console.info(`[SceneManager] ${this.hitboxes.length} hitbox bulundu:`, this.hitboxes.map((h) => h.userData.storeId));
    if (signCount) console.info(`[SceneManager] ${signCount} mağaza adı gece ışığından bağımsız bırakıldı.`);
    if (planeCount) console.info(`[SceneManager] ${planeCount} düzlem (Material.173) gece ışığından bağımsız bırakıldı.`);
    if (planeCount) console.info(`[SceneManager] ${planeCount} düzlem (Material.173) gece ışığından bağımsız bırakıldı.`);

    this.bounds.setFromObject(this.modelRoot);
    this.sceneScale = this.bounds.getSize(new THREE.Vector3()).length();
    this.floorY = this.bounds.min.y;
    this.#stackBasementPreview();
    this.navigationOcclusion = new NavigationOcclusion(this.camera);
    this.navigationOcclusion.addRoot(this.modelRoot);
    this.navigationOcclusion.addRoot(this.basementRoot);
    this.modelLights = new ModelLights(this, modelLightData);
  }

  /**
   * Geçici: aynı GLB, bir kat yüksekliğinde aşağıda. Gerçek kat -1 modeli gelince değişir.
   * Tıklama listesine girmez; sadece kamera inişini görmek için.
   */
  #stackBasementPreview() {
    const size = this.bounds.getSize(new THREE.Vector3());
    const drop = Math.max(size.y * 1.6, Math.max(size.x, size.z) * 0.22);
    this.floorDrop = drop;

    const basement = this.modelRoot.clone(true);
    basement.name = 'FLOOR_-1';
    // clone() also copies frozen world matrices. Unfreeze once before moving
    // the hierarchy; otherwise both floors render at the exact same position.
    basement.traverse((obj) => { obj.matrixWorldAutoUpdate = true; });
    basement.position.y -= drop;
    basement.updateMatrix();
    this.scene.add(basement);
    basement.updateMatrixWorld(true);
    basement.traverse((obj) => { obj.matrixWorldAutoUpdate = false; });
    basement.traverse(obj => {
      if (!obj.userData.navigationTower) return;
      this.#navigationTowers.push({ mesh: obj, box: new THREE.Box3().setFromObject(obj), original: obj.material, faded: null, alpha: 1, target: 1 });
    });
    this.basementRoot = basement;
    this.setFloorVisibility(1);
  }

  setNavigationView(points, storeId = null) {
    this.navigationOcclusion?.setRoute(points, storeId);
    this.#navigationPoints = Array.isArray(points) && points.length ? points.map(point => point.clone()) : null;
    this.#towerCheckTimer = 0;
    if (!this.#navigationPoints) for (const tower of this.#navigationTowers) tower.target = 1;
  }

  #updateNavigationTowers(dt) {
    if (this.navigationOcclusion) { this.navigationOcclusion.update(dt); return; }
    if (!this.#navigationTowers.length) return;
    this.#towerCheckTimer -= dt;
    if (this.#navigationPoints && this.#towerCheckTimer <= 0) {
      this.#towerCheckTimer = .18;
      const samples = this.#navigationPoints.filter((_, index) => index % Math.max(1, Math.ceil(this.#navigationPoints.length / 12)) === 0);
      if (samples.at(-1) !== this.#navigationPoints.at(-1)) samples.push(this.#navigationPoints.at(-1));
      for (const tower of this.#navigationTowers) {
        tower.target = 1;
        if (!tower.mesh.visible || !tower.mesh.parent?.visible) continue;
        if (blocksRoute(tower.box, this.camera.position, samples)) tower.target = .09;
      }
    }
    for (const tower of this.#navigationTowers) {
      if (tower.target === 1 && tower.alpha >= .999) continue;
      if (!tower.faded) {
        const copy = material => {
          const cloned = material.clone();
          cloned.transparent = true;
          cloned.depthWrite = false;
          cloned.userData.navigationBaseOpacity = material.opacity;
          return cloned;
        };
        tower.faded = Array.isArray(tower.original) ? tower.original.map(copy) : copy(tower.original);
      }
      if (tower.mesh.material === tower.original) tower.mesh.material = tower.faded;
      const blend = Math.min(1, dt * 5);
      tower.alpha += (tower.target - tower.alpha) * blend;
      if (Math.abs(tower.alpha - tower.target) < .008) tower.alpha = tower.target;
      for (const material of (Array.isArray(tower.faded) ? tower.faded : [tower.faded])) {
        material.opacity = material.userData.navigationBaseOpacity * tower.alpha;
      }
      if (tower.alpha >= .999) tower.mesh.material = tower.original;
    }
  }

  /** Only the selected floor is drawn outside the short camera transition. */
  setFloorVisibility(floor, transitioning = false) {
    this.modelRoot.visible = transitioning || floor !== -1;
    if (this.basementRoot) this.basementRoot.visible = transitioning || floor === -1;
  }

  /** glTF mesh verisinin adı. Three.js nesne adını bunun üzerine yazar. */
  #gltfMeshName(obj, gltf) {
    const index = gltf.parser?.associations?.get(obj)?.meshes;
    if (index == null) return '';
    return gltf.parser.json?.meshes?.[index]?.name ?? '';
  }

  /** Blender metin nesnesi: Text, Text.001 … Mağaza adları bunlar. */
  #isStoreSign(raw) {
    return /^text(\.\d+)?$/i.test(raw || '');
  }

  /**
   * Plane.319 ile aynı malzemeyi paylaşan düzlemler (modelde 62 tane).
   * Nesne adları Plane.233, Plane.319 gibi dağılmış; ortak olan malzeme adı.
   */
  #usesNightProofMaterial(mesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return mats.some((mat) => mat?.name === 'Material.173');
  }

  #storeSignMaterial = null;
  #storeSignDay = new THREE.Color(0x000000);
  #storeSignNight = new THREE.Color(0xffffff);

  /**
   * Mağaza adı: ışıktan bağımsız. Gündüz kendi rengi, gece beyaz.
   * Hepsi aynı malzemeyi paylaşır; gece geçişinde tek renk kayar.
   */
  #makeStoreSignUnlit(mesh) {
    if (!this.#storeSignMaterial) {
      const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (source?.color) this.#storeSignDay.copy(source.color);
      this.#storeSignMaterial = new THREE.MeshBasicMaterial({
        color: this.#storeSignDay.clone().lerp(this.#storeSignNight, this.#nightMix),
        map: source?.map ?? null,
        transparent: !!source?.transparent,
        opacity: source?.opacity ?? 1,
        side: source?.side ?? THREE.DoubleSide,
        alphaTest: source?.alphaTest ?? 0,
        depthWrite: true,
      });
    }
    mesh.material = this.#storeSignMaterial;
    mesh.userData.skipHitbox = true;
    mesh.userData.storeSign = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  /**
   * Düzlem rengini korur ama sahne ışığına girmez; gece/gündüz aynı parlaklıkta kalır.
   * skipHitbox: gece ışık pişirme ve statik birleştirme bu mesh'e dokunmasın.
   */
  #makeSignUnlit(mesh) {
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const unlit = source.map((mat) => {
      if (!mat || mat.isMeshBasicMaterial) return mat;
      return new THREE.MeshBasicMaterial({
        color: mat.color?.clone() ?? new THREE.Color(0xffffff),
        map: mat.map ?? null,
        transparent: !!mat.transparent,
        opacity: mat.opacity ?? 1,
        side: mat.side ?? THREE.FrontSide,
        alphaTest: mat.alphaTest ?? 0,
        depthWrite: true,
        vertexColors: !!mat.vertexColors,
      });
    });
    mesh.material = Array.isArray(mesh.material) ? unlit : unlit[0];
    mesh.userData.skipHitbox = true;
    mesh.userData.storeSign = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  #isKioskName(raw) {
    if (!raw) return false;
    const names = this.config.kioskAnchor?.names ?? ['KIOSK_OUTDOOR'];
    const upper = raw.toUpperCase().replace(/\.\d+$/, '').replaceAll('İ', 'I');
    return names.some((name) => name.toUpperCase().replaceAll('İ', 'I') === upper);
  }

  /**
   * HITBOX_MANGO / HITBOX_MANGO.001 / STORE_Mango → MANGO.
   * gltfMeshName, Blender'daki mesh verisi adıdır (nesne adından ayrı).
   */
  #resolveStoreId(mesh, storeIdSet, gltfMeshName = '') {
    if (mesh.userData?.skipHitbox) return null;
    if (this.#isKioskName(mesh.name) || this.#isKioskName(gltfMeshName)) return null;
    const prefixes = (this.config.hitbox.prefixes ?? [this.config.hitbox.prefix])
      .map((p) => p.toUpperCase())
      .sort((a, b) => b.length - a.length);

    const fromName = (raw) => {
      if (!raw) return null;
      const upper = raw.toUpperCase().replace(/\.\d+$/, '').replaceAll('İ', 'I');
      for (const prefix of prefixes) {
        if (upper.startsWith(prefix) && upper.length > prefix.length) return upper.slice(prefix.length);
      }
      return storeIdSet.has(upper) ? upper : null;
    };

    let found = fromName(gltfMeshName) || fromName(mesh.name) || fromName(mesh.userData?.name);
    if (found) return found;
    let node = mesh.parent;
    let guard = 0;
    while (node && node !== this.modelRoot && guard < 32) {
      if (node.userData?.skipHitbox) break;
      found = fromName(node.name) || fromName(node.userData?.name);
      if (found) return found;
      node = node.parent;
      guard += 1;
    }
    return null;
  }

  #rememberStoreLabel(storeId, mesh) {
    if (this.storeLabels[storeId]) return;
    const raw = mesh.userData?.name || mesh.name || '';
    const compact = (value) => value
      .toLocaleUpperCase('tr')
      .replaceAll('İ', 'I')
      .replaceAll('Ğ', 'G')
      .replaceAll('Ü', 'U')
      .replaceAll('Ş', 'S')
      .replaceAll('Ö', 'O')
      .replaceAll('Ç', 'C')
      .replace(/[^0-9A-Z]/g, '');
    const readable = raw
      && !/^(plane|cube|circle|mesh|object|group)(\.\d+)?$/i.test(raw)
      && !/^hitbox_/i.test(raw);
    const useRaw = readable
      && compact(raw) === compact(storeId)
      && (/[\s&']/.test(raw) || /[ğüşöçıĞÜŞÖÇ]/.test(raw));
    this.storeLabels[storeId] = humanizeLabel(useRaw ? raw : storeId.replaceAll('_', ' '), useRaw);
  }

  /**
   * Mobil GPU belleği koruması: kenarı maxSize'ı aşan dokular canvas ile küçültülür.
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
    if (count) console.info(`[SceneManager] ${count} doku ${maxSize}px'e küçültüldü (mobil bellek koruması).`);
  }

  /**
   * Aynı malzeme örneğini paylaşan statik mesh'leri birleştirir.
   * Renk/doku değişmez; sadece GPU'ya giden çizim komutu azalır.
   */
  #mergeStaticBatches(root) {
    const { removed, batches } = batchStaticMeshes(root);
    this.walkableMeshes = this.walkableMeshes.filter((mesh) => !removed.has(mesh));
    this.walkableMeshes.push(...batches);
    if (batches.length) console.info(`[SceneManager] ${removed.size} mesh ${batches.length} bölgesel batch halinde birleştirildi.`);
  }

  // Bloklar arası yürüyüş alanı GLB'de ayrı bir zemin mesh'i olmayabilir;
  // hem görsel bütünlük hem editörde "boşluğa" node koyabilmek için büyük bir taban diski eklenir.
  #buildGround() {
    const radius = this.sceneScale * 1.2;
    const geo = new THREE.CircleGeometry(radius, 32);
    geo.rotateX(-Math.PI / 2);
    // Görünmez: editör/raycast için durur, kahverengi disk sahneyi dolaşmaz.
    // Arka plan rengi config.dayNight.day.bg olarak kalır.
    const mat = new THREE.MeshBasicMaterial({ visible: false });
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
    this.camera.far = this.sceneScale * 12 + (this.floorDrop || 0) * 4;
    this.camera.updateProjectionMatrix();
  }

  setHitboxDebug(visible) {
    this.#hitboxMaterial.opacity = visible ? this.config.hitbox.debugOpacity : 0;
    this.#hitboxMaterial.needsUpdate = true;
    for (const overlay of this.#hitboxOverlays) overlay.visible = visible;
  }

  // ---------- Gece / Gündüz ----------

  #nightMix = 0;        // 0 = gündüz, 1 = gece
  #nightTarget = 0;
  #lightScale = { exposure: 1, hemi: 1, sun: 1, env: 1, lamps: 1 };

  /** Ayarlar panelindeki ışık yüzdeleri. 1 = config'deki varsayılan şiddet. */
  applyLightingSettings(scale) {
    this.#lightScale = { ...this.#lightScale, ...scale };
    this.#applyLightMix();
    this.modelLights?.setLampScale(this.#lightScale.lamps);
  }

  /** Ortam ışıklarını gece/gündüz durumuna yumuşak geçişle taşır. */
  setNight(night) {
    this.#nightTarget = night ? 1 : 0;
    this.pokeActivity();
  }

  get nightMix() { return this.#nightMix; }

  get isNight() { return this.#nightTarget === 1; }

  #updateDayNight(dt) {
    if (this.#nightMix === this.#nightTarget) return;
    const step = dt / this.config.dayNight.transitionSec;
    this.#nightMix = this.#nightTarget > this.#nightMix
      ? Math.min(this.#nightTarget, this.#nightMix + step)
      : Math.max(this.#nightTarget, this.#nightMix - step);

    this.#applyLightMix();
  }

  #applyLightMix() {
    const { day, night } = this.config.dayNight;
    const mix = this.#nightMix;
    const scale = this.#lightScale;
    const lerp = (a, b) => a + (b - a) * mix;

    this.scene.background.lerpColors(this.#colA.set(day.bg), this.#colB.set(night.bg), mix);
    this.hemiLight.color.lerpColors(this.#colA.set(day.hemiSky), this.#colB.set(night.hemiSky), mix);
    this.hemiLight.groundColor.lerpColors(this.#colA.set(day.hemiGround), this.#colB.set(night.hemiGround), mix);
    this.hemiLight.intensity = lerp(day.hemi, night.hemi) * scale.hemi;
    this.dirLight.color.lerpColors(this.#colA.set(day.dirColor), this.#colB.set(night.dirColor), mix);
    this.dirLight.intensity = lerp(day.dir, night.dir) * scale.sun;
    this.scene.environmentIntensity = lerp(day.env, night.env) * scale.env;
    this.renderer.toneMappingExposure = lerp(day.exposure, night.exposure) * scale.exposure;
    if (this.#storeSignMaterial) {
      this.#storeSignMaterial.color.copy(this.#storeSignDay).lerp(this.#storeSignNight, mix);
    }
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
    {
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
    this.controls.addEventListener('start', poke);
    this.controls.addEventListener('change', poke);

    document.addEventListener('visibilitychange', () => {
      this.#hidden = document.hidden;
      if (this.#hidden) this.renderer.setAnimationLoop(null);
      else {
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
    let lastCallback = last;
    let warmupUntil = last + 2000;
    this.#adaptTimer = 0;
    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      this.#cadence.observe(now - lastCallback);
      lastCallback = now;
      const idleCfg = this.config.perf.idle ?? {};
      const idleCap = this.isIdle
        ? (USE_LIGHT_PERF ? (idleCfg.mobileFps ?? 0) : (idleCfg.desktopFps ?? 0))
        : 0;
      const limit = this.graphicsSettings.fpsLimit;
      const cap = limit && idleCap ? Math.min(limit, idleCap) : limit || idleCap;
      if (cap > 0 && now - lastRender < (1000 / cap)) return;

      const dtMs = now - last;
      const dt = Math.min(dtMs / 1000, 0.1);
      last = now;
      lastRender = cap > 0 ? now - ((now - lastRender) % (1000 / cap)) : now;
      elapsed += dt;
      if (now >= warmupUntil) this.#adaptResolution(dtMs, dt);
      this.#updateFpsCounter(dtMs);
      if (this.cameraBusy) this.controls._zoomInertia = 0;
      this.controls.update(dt);
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
    if (this.perfProfile.tier && this.perfProfile.tier !== 'desktop') bits.push(this.perfProfile.tier);
    if (this.#resScale < 1) bits.push(`${(this.#resScale * 100).toFixed(0)}%`);
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
    if (!cfg.enabled || !this.graphicsSettings.adaptive) return;
    if (this.isIdle || (this.graphicsSettings.fpsLimit > 0 && this.graphicsSettings.fpsLimit < this.graphicsSettings.target)) {
      this.#adaptTimer = 0;
      return;
    }

    if (dtMs >= 100) { this.#adaptTimer = 0; return; }

    // Üstel hareketli ortalama; sekme geri planından dönüşteki dev kareleri yok say
    if (dtMs < 500) this.#frameAvgMs += (dtMs - this.#frameAvgMs) * 0.05;

    this.#adaptTimer += dt;
    if (this.#adaptTimer < cfg.intervalSec) return;
    this.#adaptTimer = 0;

    let next = this.#resScale;
    const targetMs = this.#cadence.targetMs(this.graphicsSettings.target);
    if (this.#frameAvgMs > targetMs * 1.08) next = Math.max(cfg.minScale, this.#resScale * cfg.step);
    else if (this.#frameAvgMs < targetMs * 1.02) next = Math.min(1, this.#resScale / 0.95);
    if (next === this.#resScale) return;

    this.#resScale = next;
    this.renderer.setPixelRatio(this.#basePixelRatio * this.#resScale * this.graphicsSettings.scale / 100);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    console.info(`[SceneManager] Render ölçeği: ${(this.#basePixelRatio * this.#resScale).toFixed(2)} (ort. kare ${this.#frameAvgMs.toFixed(1)} ms)`);
  }

  #applyProfilePixelRatio() {
    this.#basePixelRatio = Math.min(window.devicePixelRatio, this.perfProfile.maxPixelRatio);
    this.#resScale = this.perfProfile.startScale ?? 1;
    this.renderer.setPixelRatio(this.#basePixelRatio * this.#resScale * this.graphicsSettings.scale / 100);
  }

  get fpsText() { return this.#fpsEl?.textContent ?? ''; }

  applyGraphicsSettings(settings) {
    this.graphicsSettings = { ...settings };
    this.#resScale = 1;
    this.#adaptTimer = 0;
    this.#frameAvgMs = 1000 / settings.target;
    this.#basePixelRatio = Math.min(window.devicePixelRatio || 1, this.perfProfile.maxPixelRatio);
    this.renderer.setPixelRatio(this.#basePixelRatio * settings.scale / 100);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene.environment = settings.reflections ? this.#originalEnvironment : null;
    // Malzemeler iki kat arasında paylaşılır; asıllarını bir kere sakla.
    this.scene.traverse(obj => {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) {
        if (m && m.transmission > 0 && !this.#glassMaterials.has(m)) this.#glassMaterials.set(m, m.transmission);
      }
    });
    for (const [material, transmission] of this.#glassMaterials) {
      const next = settings.glass ? transmission : 0;
      if (material.transmission !== next) { material.transmission = next; material.needsUpdate = true; }
    }
    if (this.#fpsEl) this.#fpsEl.hidden = !settings.showFps;
    this.pokeActivity();
  }

  #readGpuName() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return '';
      return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    } catch {
      return '';
    }
  }

  #onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.#basePixelRatio = Math.min(window.devicePixelRatio || 1, this.perfProfile.maxPixelRatio);
    this.renderer.setPixelRatio(this.#basePixelRatio * this.#resScale * this.graphicsSettings.scale / 100);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function humanizeLabel(name, turkish) {
  const lower = turkish ? name.toLocaleLowerCase('tr') : name.toLowerCase();
  let out = '';
  let cap = true;
  for (const ch of lower) {
    if (/\s/.test(ch)) {
      out += ch;
      cap = true;
    } else if (ch === '&' || ch === "'" || ch === '’') {
      out += ch;
      cap = true;
    } else if (cap) {
      out += turkish ? ch.toLocaleUpperCase('tr') : ch.toUpperCase();
      cap = false;
    } else {
      out += ch;
    }
  }
  return out;
}
