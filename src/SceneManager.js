import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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

    this.#updaters = new Set();
    this.#raycaster = new THREE.Raycaster();
    this.#pointerNdc = new THREE.Vector2();
  }

  #updaters; #raycaster; #pointerNdc; #hitboxMaterial;

  async init({ storeIds = [], onProgress = null } = {}) {
    const { config } = this;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f14);

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
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x1c2430, 0.6);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(1, 2, 1.2);
    this.scene.add(dir);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(82); // zemin altına inme
    this.controls.screenSpacePanning = false;

    window.addEventListener('resize', () => this.#onResize());

    await this.#loadModel(storeIds, onProgress);
    this.#buildGround();
    this.#fitControlsToBounds();

    return this;
  }

  async #loadModel(storeIds, onProgress) {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().load(
        this.config.paths.model,
        resolve,
        (xhr) => { if (onProgress) onProgress(xhr.loaded, xhr.total); },
        reject,
      );
    });

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

    console.groupCollapsed('[SceneManager] GLB nesne dökümü');
    console.table(nameDump);
    console.groupEnd();
    console.info(`[SceneManager] ${this.hitboxes.length} hitbox bulundu:`, this.hitboxes.map((h) => h.userData.storeId));

    this.bounds.setFromObject(this.modelRoot);
    this.sceneScale = this.bounds.getSize(new THREE.Vector3()).length();
    this.floorY = this.bounds.min.y;
  }

  // Bloklar arası yürüyüş alanı GLB'de ayrı bir zemin mesh'i olmayabilir;
  // hem görsel bütünlük hem editörde "boşluğa" node koyabilmek için büyük bir taban diski eklenir.
  #buildGround() {
    const radius = this.sceneScale * 1.2;
    const geo = new THREE.CircleGeometry(radius, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.95, metalness: 0 });
    const ground = new THREE.Mesh(geo, mat);
    const center = this.bounds.getCenter(new THREE.Vector3());
    ground.position.set(center.x, this.floorY - 0.02, center.z);
    ground.name = 'GROUND_DISC';
    this.scene.add(ground);
    this.groundMesh = ground;
    this.walkableMeshes.push(ground);
  }

  #fitControlsToBounds() {
    const center = this.bounds.getCenter(new THREE.Vector3());
    this.controls.target.copy(center);
    this.controls.minDistance = this.sceneScale * 0.08;
    this.controls.maxDistance = this.sceneScale * 2.0;
    this.camera.near = Math.max(0.01, this.sceneScale * 0.001);
    this.camera.far = this.sceneScale * 12;
    this.camera.updateProjectionMatrix();
  }

  setHitboxDebug(visible) {
    this.#hitboxMaterial.opacity = visible ? this.config.hitbox.debugOpacity : 0;
    for (const h of this.hitboxes) h.visible = visible;
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

  onUpdate(fn) { this.#updaters.add(fn); return () => this.#updaters.delete(fn); }

  start() {
    let last = performance.now();
    let elapsed = 0;
    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      elapsed += dt;
      this.controls.update();
      for (const fn of this.#updaters) fn(dt, elapsed);
      this.renderer.render(this.scene, this.camera);
    });
  }

  #onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
