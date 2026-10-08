import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Yolu zeminde ince bir iz ve üzerinde ileri akan, yanıp sönen oklar olarak çizer.
 * Oklar CatmullRom eğrisi boyunca kayar; her biri kendi fazında parlar.
 * Bina arkasında kalan kısımlar soluk hayalet olarak görünür.
 */
export class RouteRenderer {
  constructor(sceneManager, config) {
    this.sceneManager = sceneManager;
    this.config = config;

    this.group = new THREE.Group();
    this.group.name = 'ROUTE_LAYER';
    sceneManager.scene.add(this.group);

    this.startMarker = null;
    this.#chevronGeo = this.#createChevronGeometry();
    this.#disposables = [];
    this.#arrows = [];

    sceneManager.onUpdate((dt, elapsed) => this.#update(dt, elapsed));
  }

  #chevronGeo; #disposables; #arrows;
  #curve = null; #arrowScale = 1;
  #destPulse = null; #destPin = null; #pinBaseY = 0;
  #aimX = new THREE.Vector3();
  #aimY = new THREE.Vector3();
  #aimZ = new THREE.Vector3();
  #aimM = new THREE.Matrix4();

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
    if (length < 1e-4) return;
    this.#curve = curve;

    const segments = THREE.MathUtils.clamp(Math.round(length / (radius * 0.85)), 24, 420);
    const ribbonGeo = this.#buildRibbon(curve, radius * 0.42, segments);
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: cfg.baseColor,
      transparent: true,
      opacity: cfg.baseOpacity,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbon.renderOrder = 50;
    this.group.add(ribbon);
    const ghosts = this.sceneManager.perfProfile.routeGhosts !== false;
    if (ghosts) this.group.add(this.#ghostOf(ribbon, cfg.occludedOpacity));
    this.#disposables.push(ribbonGeo, ribbonMat);

    const spacing = Math.max(radius * (cfg.arrowSpacingRadii ?? 22), radius * 8);
    const count = THREE.MathUtils.clamp(Math.round(length / spacing), 3, 14);
    this.#arrowScale = radius * (cfg.arrowScale ?? 5.2);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: cfg.arrowColor ?? 0xffe2b8,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.#chevronGeo, mat);
      mesh.renderOrder = 51;
      const rig = new THREE.Group();
      rig.add(mesh);
      let ghostMat = null;
      if (ghosts) {
        const ghost = this.#ghostOf(mesh, cfg.occludedOpacity);
        rig.add(ghost);
        ghostMat = ghost.material;
      }
      rig.scale.setScalar(this.#arrowScale);
      this.group.add(rig);
      this.#disposables.push(mat);
      this.#arrows.push({ rig, mat, ghostMat, phase: i / count });
    }

    this.#buildDestinationMarker(lifted[lifted.length - 1], radius);
    this.sceneManager.pokeActivity();
  }

  /**
   * Kesilme hayaleti: aynı geometri, GreaterDepth — yalnızca GLB arkasında soluk görünür.
   */
  #ghostOf(mesh, opacity) {
    const mat = mesh.material.clone();
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthTest = true;
    mat.depthWrite = false;
    mat.depthFunc = THREE.GreaterDepth;
    const ghost = new THREE.Mesh(mesh.geometry, mat);
    ghost.renderOrder = mesh.renderOrder - 2;
    this.#disposables.push(mat);
    return ghost;
  }

  #buildRibbon(curve, halfWidth, segments) {
    const positions = [];
    const indices = [];
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3();
    const tan = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
      const p = curve.getPointAt(i / segments);
      curve.getTangentAt(i / segments, tan);
      side.crossVectors(Math.abs(tan.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : up, tan);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
      side.normalize().multiplyScalar(halfWidth);
      positions.push(p.x - side.x, p.y + 0.01, p.z - side.z);
      positions.push(p.x + side.x, p.y + 0.01, p.z + side.z);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }

  /** Yere yatırılmış çift şerit ok (»). +Z ileri bakar. */
  #createChevronGeometry() {
    const make = (shift) => {
      const shape = new THREE.Shape();
      const y = shift;
      shape.moveTo(0, 0.5 + y);
      shape.lineTo(0.2, -0.08 + y);
      shape.lineTo(0.08, -0.08 + y);
      shape.lineTo(0, 0.14 + y);
      shape.lineTo(-0.08, -0.08 + y);
      shape.lineTo(-0.2, -0.08 + y);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      // +X dönüşü: şeklin +Y ucu yerel +Z olur (yolun gidiş yönü).
      geo.rotateX(Math.PI / 2);
      return geo;
    };
    const geo = mergeGeometries([make(0.22), make(-0.34)]);
    geo.translate(0, 0.03, 0);
    return geo;
  }

  #aim(rig, tangent) {
    this.#aimZ.copy(tangent);
    if (this.#aimZ.lengthSq() < 1e-8) return;
    this.#aimZ.normalize();
    const ref = Math.abs(this.#aimZ.y) > 0.92
      ? this.#aimX.set(1, 0, 0)
      : this.#aimX.set(0, 1, 0);
    this.#aimX.crossVectors(ref, this.#aimZ).normalize();
    this.#aimY.crossVectors(this.#aimZ, this.#aimX).normalize();
    this.#aimM.makeBasis(this.#aimX, this.#aimY, this.#aimZ);
    rig.quaternion.setFromRotationMatrix(this.#aimM);
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
    this.#curve = null;
    this.#arrows = [];
    this.#destPulse = null;
    this.#destPin = null;
    this.group.clear();
    for (const item of this.#disposables) item.dispose();
    this.#disposables = [];
  }

  get hasRoute() { return this.group.children.length > 0; }

  #update(dt, elapsed) {
    const cfg = this.config.route;
    if (this.#curve && this.#arrows.length) {
      const speed = cfg.flowSpeed ?? 0.22;
      const pulse = cfg.arrowPulse ?? 3.4;
      for (const arrow of this.#arrows) {
        let u = (elapsed * speed + arrow.phase) % 1;
        if (u < 0) u += 1;
        const pos = this.#curve.getPointAt(u);
        const tan = this.#curve.getTangentAt(u);
        arrow.rig.position.copy(pos);
        this.#aim(arrow.rig, tan);
        const blink = 0.5 + 0.5 * Math.sin(elapsed * pulse + arrow.phase * Math.PI * 2);
        const edge = Math.min(1, u * 7, (1 - u) * 7);
        const opacity = (0.4 + 0.6 * blink) * edge;
        arrow.mat.opacity = opacity;
        if (arrow.ghostMat) arrow.ghostMat.opacity = opacity * (cfg.occludedOpacity ?? 0.28);
        const sc = this.#arrowScale * (0.9 + 0.14 * blink);
        arrow.rig.scale.setScalar(sc);
      }
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
}
