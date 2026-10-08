import * as THREE from 'three';

/**
 * Kamera geçişlerini yönetir: rota kadrajlama ve başlangıç (home) görünümüne dönüş.
 * Kullanıcı sahneyi tutup çevirdiği anda aktif geçiş iptal edilir.
 */
export class CameraDirector {
  constructor(sceneManager, config) {
    this.sceneManager = sceneManager;
    this.config = config;

    this.#home = null;
    this.#tween = null;

    sceneManager.controls.addEventListener('start', () => {
      this.#tween = null;
      sceneManager.cameraBusy = false;
      sceneManager.setFloorVisibility(this.activeFloor);
      sceneManager.pokeActivity();
    });
    sceneManager.onUpdate(() => this.#update());
  }

  #home; #tween;
  activeFloor = 1;
  #floorYOffset = 0;

  /** Model yüklendikten sonra çağrılır: home görünümünü hesaplar ve anında uygular. */
  setHomeFromBounds(bounds) {
    this.#applyHome(bounds.getCenter(new THREE.Vector3()), bounds, true);
  }

  #applyHome(center, bounds, useOffset) {
    const cam = this.config.camera;
    if (useOffset && cam.homeTargetOffset) {
      const off = cam.homeTargetOffset;
      center.add(new THREE.Vector3(off.x || 0, off.y || 0, off.z || 0));
    }
    // Küre yarıçapı peyzaj/otopark uçlarını abartır; yatay ayak izi kiosk kadrajına daha yakın.
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.5;
    const distance = this.#fitDistance(radius) * (cam.homePadding ?? cam.fitPadding);

    const position = this.#orbitPosition(
      center, distance,
      THREE.MathUtils.degToRad(cam.homePolarDeg),
      THREE.MathUtils.degToRad(cam.homeAzimuthDeg),
    );

    this.#home = { position, target: center.clone() };
    this.sceneManager.camera.position.copy(position);
    this.sceneManager.controls.target.copy(center);
    // Açılış görünümü aynı zamanda en uzak bakış: daha fazla zoom-out yapılamaz
    this.sceneManager.controls.maxDistance = distance * (cam.maxZoomOutFactor ?? 1.06);
    this.sceneManager.controls.update();
  }

  /** Rota noktalarını kadrajlar; mevcut bakış azimutu korunur. */
  frameRoute(points, storeId = null) {
    if (!points || points.length === 0) return;
    this.sceneManager.setNavigationView(points, storeId);
    const cam = this.config.camera;

    const box = new THREE.Box3().setFromPoints(points);
    const minSize = this.sceneManager.sceneScale * 0.12;
    const size = box.getSize(new THREE.Vector3());
    if (size.length() < minSize) box.expandByScalar(minSize);

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = this.#fitDistance(sphere.radius) * cam.fitPadding;

    // 2B kuş bakışı açıkken kadrajlama da tepeden yapılır (polar kilidiyle çakışmasın)
    if (this.sceneManager.topViewActive) {
      const position = new THREE.Vector3(center.x, center.y + distance, center.z + distance * 0.001);
      this.#startTween(position, center, cam.frameMs);
      return;
    }

    const { camera, controls } = this.sceneManager;
    const offset = camera.position.clone().sub(controls.target);
    const currentAzimuth = Math.atan2(offset.x, offset.z);

    const position = this.#orbitPosition(
      center, distance,
      THREE.MathUtils.degToRad(cam.framePolarDeg),
      currentAzimuth,
    );
    this.#startTween(position, center, cam.frameMs);
  }

  /**
   * Kamerayı aynı açıda bir kat aşağı/yukarı taşır.
   * floor: 1 veya -1. Şimdilik -1, kopya modelin floorDrop kadar altıdır.
   */
  goToFloor(floor) {
    const next = floor === -1 ? -1 : 1;
    if (next === this.activeFloor || !this.#home) return;
    const drop = this.sceneManager.floorDrop || 0;
    const nextOffset = next === -1 ? -drop : 0;
    const delta = nextOffset - this.#floorYOffset;
    this.#floorYOffset = nextOffset;
    this.activeFloor = next;
    this.sceneManager.setFloorVisibility(next, true);

    const { camera, controls } = this.sceneManager;
    const position = camera.position.clone();
    const target = controls.target.clone();
    position.y += delta;
    target.y += delta;
    this.#startTween(position, target, this.config.camera.floorMs ?? 1700);
  }

  goHome(instant = false) {
    this.sceneManager.setNavigationView(false);
    if (!this.#home) return;

    let { position, target } = this.#home;
    position = position.clone();
    target = target.clone();
    position.y += this.#floorYOffset;
    target.y += this.#floorYOffset;
    if (this.sceneManager.topViewActive) {
      const distance = position.clone().sub(target).length();
      position = new THREE.Vector3(target.x, target.y + distance, target.z + distance * 0.001);
    }

    if (instant) {
      this.sceneManager.camera.position.copy(position);
      this.sceneManager.controls.target.copy(target);
      this.sceneManager.controls.update();
      this.sceneManager.setFloorVisibility(this.activeFloor);
      return;
    }
    this.#startTween(position, target, this.config.camera.homeMs);
  }

  focusKiosk() {
    const sm = this.sceneManager;
    if (!sm.kioskAnchor) return;
    sm.setTopView(false);
    document.getElementById('view2d-toggle')?.setAttribute('aria-pressed', 'false');
    this.activeFloor = 1;
    this.#floorYOffset = 0;
    const floorButton = document.getElementById('floor-toggle');
    if (floorButton) { floorButton.textContent = 'Kat -1'; floorButton.setAttribute('aria-pressed', 'false'); }
    const floorLabel = document.getElementById('floor-label');
    if (floorLabel) floorLabel.textContent = 'Kat 1 — Etkileşimli Yönlendirme';
    sm.setFloorVisibility(1);
    sm.setNavigationView([sm.kioskAnchor]);
    // Close oblique courtyard view, with the kiosk in the near foreground.
    const target = sm.kioskAnchor.clone().add(new THREE.Vector3(-14, 0, -4));
    const offset = new THREE.Vector3(42, 60, -8);
    offset.multiplyScalar(Math.max(1, Math.min(1.4, 1 / sm.camera.aspect)));
    sm.controls.minDistance = 12;
    this.#startTween(target.clone().add(offset), target, 1200);
  }

  /** Curated presentation angle; keeps navigation and floor state consistent. */
  showPresentationAngle(targetOffset, cameraOffset) {
    const sm = this.sceneManager;
    if (!sm.kioskAnchor) return;
    sm.setNavigationView(null);
    sm.setTopView(false);
    document.getElementById('view2d-toggle')?.setAttribute('aria-pressed', 'false');
    this.activeFloor = 1;
    this.#floorYOffset = 0;
    sm.setFloorVisibility(1);
    const floorButton = document.getElementById('floor-toggle');
    if (floorButton) { floorButton.textContent = 'Kat -1'; floorButton.setAttribute('aria-pressed', 'false'); }
    const label = document.getElementById('floor-label');
    if (label) label.textContent = 'Kat 1 — Etkileşimli Yönlendirme';
    const target = sm.kioskAnchor.clone().add(new THREE.Vector3(...targetOffset));
    const position = target.clone().add(new THREE.Vector3(...cameraOffset));
    sm.controls.minDistance = 12;
    this.#startTween(position, target, 1400);
  }

  #fitDistance(radius) {
    const { camera } = this.sceneManager;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return radius / Math.sin(Math.min(vFov, hFov) / 2);
  }

  #orbitPosition(center, distance, polar, azimuth) {
    return new THREE.Vector3().setFromSphericalCoords(distance, polar, azimuth).add(center);
  }

  #startTween(toPosition, toTarget, duration) {
    const { camera, controls } = this.sceneManager;
    controls._zoomInertia = 0;
    this.sceneManager.cameraBusy = true;
    this.sceneManager.pokeActivity();
    this.#tween = {
      t0: performance.now(),
      duration,
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition: toPosition.clone(),
      toTarget: toTarget.clone(),
    };
  }

  #update() {
    if (!this.#tween) return;
    const tw = this.#tween;
    const raw = Math.min(1, (performance.now() - tw.t0) / tw.duration);
    const k = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2; // easeInOutCubic

    const { camera, controls } = this.sceneManager;
    camera.position.lerpVectors(tw.fromPosition, tw.toPosition, k);
    controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    if (raw >= 1) {
      this.#tween = null;
      this.sceneManager.cameraBusy = false;
      this.sceneManager.setFloorVisibility(this.activeFloor);
      this.sceneManager.pokeActivity();
    }
  }
}
