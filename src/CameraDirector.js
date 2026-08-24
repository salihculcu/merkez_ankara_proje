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

    sceneManager.controls.addEventListener('start', () => { this.#tween = null; });
    sceneManager.onUpdate(() => this.#update());
  }

  #home; #tween;

  /** Model yüklendikten sonra çağrılır: home görünümünü hesaplar ve anında uygular. */
  setHomeFromBounds(bounds) {
    const cam = this.config.camera;
    const center = bounds.getCenter(new THREE.Vector3());
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const distance = this.#fitDistance(sphere.radius) * cam.fitPadding;

    const position = this.#orbitPosition(
      center, distance,
      THREE.MathUtils.degToRad(cam.homePolarDeg),
      THREE.MathUtils.degToRad(cam.homeAzimuthDeg),
    );

    this.#home = { position, target: center.clone() };
    this.sceneManager.camera.position.copy(position);
    this.sceneManager.controls.target.copy(center);
    this.sceneManager.controls.update();
  }

  /** Rota noktalarını kadrajlar; mevcut bakış azimutu korunur. */
  frameRoute(points) {
    if (!points || points.length === 0) return;
    const cam = this.config.camera;

    const box = new THREE.Box3().setFromPoints(points);
    const minSize = this.sceneManager.sceneScale * 0.12;
    const size = box.getSize(new THREE.Vector3());
    if (size.length() < minSize) box.expandByScalar(minSize);

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = this.#fitDistance(sphere.radius) * cam.fitPadding;

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

  goHome(instant = false) {
    if (!this.#home) return;
    if (instant) {
      this.sceneManager.camera.position.copy(this.#home.position);
      this.sceneManager.controls.target.copy(this.#home.target);
      this.sceneManager.controls.update();
      return;
    }
    this.#startTween(this.#home.position, this.#home.target, this.config.camera.homeMs);
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
    if (raw >= 1) this.#tween = null;
  }
}
