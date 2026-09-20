import * as THREE from 'three';

/**
 * Mağaza üstü konum imleçleri: klasik harita pini şeklinde, içinde yuvarlak
 * kırpılmış mağaza logosu (yoksa baş harfi) taşıyan, hafifçe zıplayan işaretler.
 *
 * - Sprite kullanıldığı için imleç her zaman kameraya dönük 2B'dir.
 * - Pin rengi: elle atanmışsa o; değilse logodan çıkarılan baskın renk;
 *   logo da yoksa config.storeMarkers.defaultColor.
 * - Veri kaynağı graph.json → `storeMarkers: { STOREID: { logo, color } }`
 *   (logo: data-URL, color: '#rrggbb' | null = otomatik).
 * - Konum, mağazanın hitbox'ının tavan orta noktasından türetilir.
 */
export class StoreMarkers {
  constructor(sceneManager, config) {
    this.sm = sceneManager;
    this.config = config;

    this.group = new THREE.Group();
    this.group.name = 'STORE_MARKER_LAYER';
    sceneManager.scene.add(this.group);

    this.#anchors = this.#collectAnchors();
    sceneManager.onUpdate((dt, elapsed) => this.#update(elapsed));
  }

  #anchors;               // storeId -> { pos: Vector3 }
  #sprites = new Map();   // storeId -> { sprite, baseY, phase }
  #buildToken = 0;        // eski async doku yüklemelerini geçersiz kılar

  get size() {
    const cfg = this.config.storeMarkers;
    return THREE.MathUtils.clamp(this.sm.sceneScale * cfg.sizeFactor, cfg.minSize, cfg.maxSize);
  }

  /** Hitbox'lardan pin bağlantı noktalarını (tavan orta) çıkarır. */
  #collectAnchors() {
    const anchors = new Map();
    const box = new THREE.Box3();
    for (const hitbox of this.sm.hitboxes) {
      box.setFromObject(hitbox);
      const center = box.getCenter(new THREE.Vector3());
      anchors.set(hitbox.userData.storeId, {
        pos: new THREE.Vector3(center.x, box.max.y, center.z),
      });
    }
    return anchors;
  }

  /** markerData: graph.storeMarkers — hitbox'ı olan her mağaza için pin kurar. */
  setMarkers(markerData = {}) {
    const token = ++this.#buildToken;
    for (const entry of this.#sprites.values()) {
      this.group.remove(entry.sprite);
      if (entry.ghost) this.group.remove(entry.ghost);
      entry.sprite.material.map?.dispose(); // doku hayaletle paylaşılır, bir kez yeter
      entry.sprite.material.dispose();
      entry.ghost?.material.dispose();
    }
    this.#sprites.clear();

    const size = this.size;
    const cfg = this.config.storeMarkers;
    const useGhosts = this.sm.perfProfile.markerGhosts !== false;
    let phase = 0;

    for (const [storeId, anchor] of this.#anchors) {
      const data = markerData[storeId] ?? {};

      // Görünen kısım: normal derinlik testiyle çizilir
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
      }));
      sprite.center.set(0.5, 0); // konum = pinin ucu
      sprite.scale.set(size, size * 1.25, 1);
      sprite.renderOrder = 56;
      sprite.userData.storeId = storeId;

      // Bina arkasında kalan kısım: ters derinlik testiyle (GreaterDepth)
      // yalnızca kesilen bölgede görünen soluk kopya (tablette kapalı — 2× sprite)
      let ghost = null;
      if (useGhosts) {
        ghost = new THREE.Sprite(new THREE.SpriteMaterial({
          transparent: true,
          opacity: cfg.occludedOpacity,
          depthTest: true,
          depthWrite: false,
          depthFunc: THREE.GreaterDepth,
        }));
        ghost.center.copy(sprite.center);
        ghost.scale.copy(sprite.scale);
        ghost.renderOrder = 55;
      }

      const baseY = anchor.pos.y + size * cfg.yOffset;
      sprite.position.set(anchor.pos.x, baseY, anchor.pos.z);
      if (ghost) ghost.position.copy(sprite.position);
      this.group.add(sprite);
      if (ghost) this.group.add(ghost);
      this.#sprites.set(storeId, { sprite, ghost, baseY, phase: phase += 1.7 });

      this.#applyTexture(sprite, ghost, storeId, data, token);
    }
  }

  /** Logo varsa yükleyip baskın rengi çıkararak, yoksa baş harfiyle pin dokusunu üretir. */
  #applyTexture(sprite, ghost, storeId, data, token) {
    const finish = (logoImg) => {
      if (token !== this.#buildToken) return; // bu arada pinler yeniden kurulmuş
      const color = data.color ?? (logoImg ? this.#dominantColor(logoImg) : null)
        ?? this.config.storeMarkers.defaultColor;
      const canvas = this.#drawPin(color, logoImg, storeId);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 1;
      sprite.material.map?.dispose();
      sprite.material.map = tex;
      sprite.material.needsUpdate = true;
      if (ghost) {
        ghost.material.map = tex; // aynı doku, soluk opaklıkla
        ghost.material.needsUpdate = true;
      }
    };

    if (data.logo) {
      const img = new Image();
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      img.src = data.logo;
    } else {
      finish(null);
    }
  }

  /** Pin çizimi: damla gövde + beyaz halka + yuvarlak logo / baş harf. */
  #drawPin(color, logoImg, storeId) {
    const W = 160, H = 200;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const cx = W * 0.5, cy = H * 0.37, R = W * 0.39;

    // Gövde: üst daire + alt uca inen iki eğri
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 0.85, Math.PI * 0.15);
    ctx.quadraticCurveTo(cx + R * 0.62, cy + R * 0.95, cx, H - 8);
    ctx.quadraticCurveTo(cx - R * 0.62, cy + R * 0.95, cx - R * Math.cos(Math.PI * 0.15), cy + R * Math.sin(Math.PI * 0.15));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Beyaz iç halka
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#faf8f4';
    ctx.fill();

    // Logo (yuvarlak kırpılmış, kapla) veya baş harf
    const r = R * 0.72;
    if (logoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max((r * 2) / logoImg.width, (r * 2) / logoImg.height);
      const w = logoImg.width * scale, h = logoImg.height * scale;
      ctx.drawImage(logoImg, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.font = '700 68px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(storeId.charAt(0).toUpperCase(), cx, cy + 6);
    }
    return canvas;
  }

  /**
   * Logodaki baskın rengi bulur: pikseller kaba renk kovalarına ayrılır,
   * doygun renkler ağırlıklandırılır (beyaz/şeffaf zemin elenir).
   */
  #dominantColor(img) {
    const S = 24;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S, S);
    const { data } = ctx.getImageData(0, 0, S, S);

    const buckets = new Map(); // key -> { w, r, g, b, n }
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue;                     // şeffaf
      if (r > 235 && g > 235 && b > 235) continue; // beyaz zemin
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const weight = 1 + ((max - min) / 255) * 4; // doygun renkler öncelikli
      const key = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5);
      const bucket = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0, n: 0 };
      bucket.w += weight; bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1;
      buckets.set(key, bucket);
    }

    let best = null;
    for (const bucket of buckets.values()) {
      if (!best || bucket.w > best.w) best = bucket;
    }
    if (!best) return null;
    const toHex = (v) => Math.round(v / best.n).toString(16).padStart(2, '0');
    return `#${toHex(best.r)}${toHex(best.g)}${toHex(best.b)}`;
  }

  /** Tıklama testi için sprite listesi (userData.storeId taşır). */
  get pickSprites() {
    return [...this.#sprites.values()].map((e) => e.sprite);
  }

  #update(elapsed) {
    const cfg = this.config.storeMarkers;
    const bounce = cfg.bounceWhenIdle !== false || !this.sm.isIdle;
    const amp = bounce ? this.size * cfg.bounceAmp : 0;
    for (const { sprite, ghost, baseY, phase } of this.#sprites.values()) {
      sprite.position.y = amp
        ? baseY + Math.abs(Math.sin(elapsed * cfg.bounceSpeed + phase)) * amp
        : baseY;
      if (ghost) ghost.position.y = sprite.position.y;
    }
  }
}
