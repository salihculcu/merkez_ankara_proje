import * as THREE from 'three';

/**
 * Hesaplanan yolu zeminden hafif yükseltilmiş, yumuşatılmış bir 3B tüp olarak çizer.
 * İki katman kullanılır:
 *  - taban tüp: düz renkli, rotanın gövdesi
 *  - ok tüpü: hafifçe daha geniş, kayan şerit dokusuyla yön akışı efekti
 * Ek olarak hedefte nabız atan bir pin, başlangıçta "Buradasınız" halkası gösterilir.
 */
export class RouteRenderer {
  constructor(sceneManager, config) {
    this.sceneManager = sceneManager;
    this.config = config;

    this.group = new THREE.Group();
    this.group.name = 'ROUTE_LAYER';
    sceneManager.scene.add(this.group);

    this.startMarker = null;
    this.#arrowTexture = this.#createArrowTexture();
    this.#disposables = [];

    sceneManager.onUpdate((dt, elapsed) => this.#update(dt, elapsed));
  }

  #arrowTexture; #disposables; #arrowMaterial = null; #destPulse = null; #destPin = null; #pinBaseY = 0;

  get radius() {
    const { radiusFactor, minRadius } = this.config.route;
    return Math.max(minRadius, this.sceneManager.sceneScale * radiusFactor);
  }

  /** points: THREE.Vector3 dizisi (graph düğüm konumları) */
  draw(points) {
    this.clear();
    if (!points || points.length < 2) return;

    const cfg = this.config.route;
    const radius = this.radius;
    const lifted = points.map((p) => new THREE.Vector3(p.x, p.y + cfg.yOffset, p.z));

    const curve = new THREE.CatmullRomCurve3(lifted, false, 'centripetal', 0.5);
    const length = curve.getLength();
    const tubularSegments = THREE.MathUtils.clamp(Math.round(length / (radius * 0.5)), 32, 800);

    // Taban tüp
    const baseGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, 10, false);
    const baseMat = new THREE.MeshBasicMaterial({
      color: cfg.baseColor,
      transparent: true,
      opacity: cfg.baseOpacity,
      depthWrite: false,
      depthTest: !cfg.alwaysOnTop,
    });
    const baseTube = new THREE.Mesh(baseGeo, baseMat);
    baseTube.renderOrder = 50;
    this.group.add(baseTube);
    this.#disposables.push(baseGeo, baseMat);

    // Akış okları
    const arrowGeo = new THREE.TubeGeometry(curve, tubularSegments, radius * 1.06, 10, false);
    const arrowCount = Math.max(2, Math.round(length / (radius * cfg.arrowSpacingRadii)));
    const arrowMap = this.#arrowTexture.clone();
    arrowMap.repeat.set(arrowCount, 1);
    const arrowMat = new THREE.MeshBasicMaterial({
      map: arrowMap,
      transparent: true,
      depthWrite: false,
      depthTest: !cfg.alwaysOnTop,
      blending: THREE.AdditiveBlending,
    });
    const arrowTube = new THREE.Mesh(arrowGeo, arrowMat);
    arrowTube.renderOrder = 51;
    this.group.add(arrowTube);
    this.#disposables.push(arrowGeo, arrowMat, arrowMat.map);
    this.#arrowMaterial = arrowMat;

    this.#buildDestinationMarker(lifted[lifted.length - 1], radius);
  }

  #buildDestinationMarker(pos, radius) {
    const color = this.config.markers.destColor;
    const s = radius * 3.2;

    const ringGeo = new THREE.RingGeometry(s * 0.55, s, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      depthWrite: false, depthTest: !this.config.route.alwaysOnTop,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.renderOrder = 52;
    this.group.add(ring);
    this.#disposables.push(ringGeo, ringMat);
    this.#destPulse = ring;

    // Baş aşağı koni + üstünde küre: klasik harita pini
    const pin = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(s * 0.42, s * 1.5, 20);
    coneGeo.rotateX(Math.PI);
    coneGeo.translate(0, s * 0.75, 0);
    const pinMat = new THREE.MeshBasicMaterial({
      color, depthWrite: false, depthTest: !this.config.route.alwaysOnTop,
    });
    const cone = new THREE.Mesh(coneGeo, pinMat);
    const headGeo = new THREE.SphereGeometry(s * 0.4, 20, 16);
    headGeo.translate(0, s * 1.65, 0);
    const head = new THREE.Mesh(headGeo, pinMat);
    pin.add(cone, head);
    pin.position.copy(pos).y += s * 0.4;
    pin.renderOrder = 53;
    cone.renderOrder = head.renderOrder = 53;
    this.group.add(pin);
    this.#disposables.push(coneGeo, headGeo, pinMat);
    this.#destPin = pin;
    this.#pinBaseY = pin.position.y;
  }

  /** Kiosk konumuna kalıcı "Buradasınız" işaretçisi koyar. */
  setStartMarker(pos) {
    if (this.startMarker) {
      this.sceneManager.scene.remove(this.startMarker);
      this.startMarker.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    const radius = this.radius;
    const color = this.config.markers.startColor;
    const s = radius * 3.0;

    const group = new THREE.Group();
    group.name = 'START_MARKER';

    const dotGeo = new THREE.CylinderGeometry(s * 0.35, s * 0.35, radius * 0.6, 24);
    const dotMat = new THREE.MeshBasicMaterial({ color, depthWrite: false });
    const dot = new THREE.Mesh(dotGeo, dotMat);

    const ringGeo = new THREE.RingGeometry(s * 0.6, s * 0.78, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.userData.isPulseRing = true;

    group.add(dot, ring);
    group.position.set(pos.x, pos.y + this.config.route.yOffset, pos.z);
    group.renderOrder = 52;
    dot.renderOrder = ring.renderOrder = 52;
    this.sceneManager.scene.add(group);
    this.startMarker = group;
  }

  clear() {
    this.#arrowMaterial = null;
    this.#destPulse = null;
    this.#destPin = null;
    this.group.clear();
    for (const item of this.#disposables) item.dispose();
    this.#disposables = [];
  }

  get hasRoute() { return this.group.children.length > 0; }

  #update(dt, elapsed) {
    if (this.#arrowMaterial) {
      // offset azaldıkça desen +u yönünde (hedefe doğru) akar
      this.#arrowMaterial.map.offset.x -= this.config.route.flowSpeed * dt;
    }
    if (this.#destPulse) {
      const k = 1 + 0.18 * Math.sin(elapsed * 4);
      this.#destPulse.scale.set(k, 1, k);
      this.#destPulse.material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 4));
    }
    if (this.#destPin) {
      this.#destPin.position.y = this.#pinBaseY + Math.sin(elapsed * 2.4) * this.radius * 0.5;
      this.#destPin.rotation.y += dt * 1.2;
    }
    if (this.startMarker) {
      const ring = this.startMarker.children.find((c) => c.userData.isPulseRing);
      if (ring) {
        const k = 1 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 2.2));
        ring.scale.set(k, 1, k);
        ring.material.opacity = 0.85 - 0.5 * (0.5 + 0.5 * Math.sin(elapsed * 2.2));
      }
    }
  }

  /** Tüp yüzeyinde +u yönünü gösteren şerit (chevron) dokusu üretir. */
  #createArrowTexture() {
    const w = 128, h = 64;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.30, h * 0.14);
    ctx.lineTo(w * 0.62, h * 0.5);
    ctx.lineTo(w * 0.30, h * 0.86);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    return tex;
  }
}
