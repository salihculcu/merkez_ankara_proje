import { STRINGS } from './config.js';

/**
 * DOM tarafı: mağaza listesi, arama, kategori filtreleri, bilgi kartı,
 * engelsiz mod düğmesi, toast bildirimleri, saat ve kiosk idle sıfırlama.
 */
export class UIManager {
  constructor(bus, config) {
    this.bus = bus;
    this.config = config;
    this.accessibility = false;

    this.#el = {
      panel: document.getElementById('store-panel'),
      panelToggle: document.getElementById('panel-toggle'),
      panelClose: document.getElementById('panel-close'),
      search: document.getElementById('store-search'),
      chips: document.getElementById('category-chips'),
      list: document.getElementById('store-list'),
      card: document.getElementById('info-card'),
      cardName: document.getElementById('card-name'),
      cardCategory: document.getElementById('card-category'),
      cardFloor: document.getElementById('card-floor'),
      cardDistance: document.getElementById('card-distance'),
      cardEta: document.getElementById('card-eta'),
      cardA11yNote: document.getElementById('card-a11y-note'),
      cardSteps: document.getElementById('card-steps'),
      cardClose: document.getElementById('card-close'),
      cardClear: document.getElementById('card-clear-route'),
      promo: document.getElementById('promo-card'),
      promoTrack: document.getElementById('promo-track'),
      promoDots: document.getElementById('promo-dots'),
      a11yToggle: document.getElementById('a11y-toggle'),
      toasts: document.getElementById('toast-container'),
      clock: document.getElementById('clock'),
      loading: document.getElementById('loading-overlay'),
      loadingSub: document.querySelector('.loading-sub'),
      progressFill: document.getElementById('progress-fill'),
      progressText: document.getElementById('progress-text'),
    };

    this.#stores = [];
    this.#activeCategory = null;
    this.#selectedStoreId = null;
    this.#idleTimer = null;
  }

  #el; #stores; #activeCategory; #selectedStoreId; #idleTimer;

  /**
   * Mağaza listesini kurar. Liste, GLB'de bulunan hitbox kimlikleri ile
   * stores.json meta verisinin birleşimidir; meta eksikse kimlikten isim türetilir.
   */
  init(storesMeta, hitboxStoreIds) {
    const ids = new Set([...hitboxStoreIds, ...Object.keys(storesMeta)]);
    this.#stores = [...ids].map((id) => ({
      id,
      name: storesMeta[id]?.name ?? this.#titleCase(id),
      category: storesMeta[id]?.category ?? 'Diğer',
      floor: storesMeta[id]?.floor ?? 1,
      inModel: hitboxStoreIds.includes(id),
    })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    this.#buildChips();
    this.#renderList();

    this.#el.panelToggle.addEventListener('click', () => this.openPanel());
    this.#el.panelClose.addEventListener('click', () => this.closePanel());
    this.#el.search.addEventListener('input', () => this.#renderList());
    this.#el.cardClose.addEventListener('click', () => this.hideCard());
    this.#el.cardClear.addEventListener('click', () => {
      this.hideCard();
      this.bus.emit('routeCleared', {});
    });
    this.#el.a11yToggle.addEventListener('click', () => {
      this.setAccessibility(!this.accessibility);
      this.bus.emit('accessibilityChanged', { accessible: this.accessibility });
    });

    this.#startClock();
    this.#startIdleWatch();
    this.#initPromo();
  }

  setAccessibility(value) {
    this.accessibility = value;
    this.#el.a11yToggle.setAttribute('aria-pressed', String(value));
  }

  // ---------- Panel aç/kapa ----------

  openPanel() {
    this.#el.panel.classList.remove('collapsed');
    document.body.classList.add('panel-open');
    this.#el.panelToggle.setAttribute('aria-expanded', 'true');
  }

  closePanel() {
    this.#el.panel.classList.add('collapsed');
    document.body.classList.remove('panel-open');
    this.#el.panelToggle.setAttribute('aria-expanded', 'false');
  }

  // ---------- Liste ----------

  #buildChips() {
    const categories = [...new Set(this.#stores.map((s) => s.category))].sort((a, b) => a.localeCompare(b, 'tr'));
    const frag = document.createDocumentFragment();

    const all = this.#makeChip(STRINGS.allCategories, null);
    all.classList.add('active');
    frag.appendChild(all);
    for (const cat of categories) frag.appendChild(this.#makeChip(cat, cat));

    this.#el.chips.innerHTML = '';
    this.#el.chips.appendChild(frag);
  }

  #makeChip(label, value) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      this.#activeCategory = value;
      this.#el.chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      this.#renderList();
    });
    return btn;
  }

  #renderList() {
    const query = this.#el.search.value.trim().toLocaleLowerCase('tr');
    const items = this.#stores.filter((s) => {
      if (this.#activeCategory && s.category !== this.#activeCategory) return false;
      if (query && !s.name.toLocaleLowerCase('tr').includes(query)) return false;
      return true;
    });

    this.#el.list.innerHTML = '';
    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'list-empty';
      li.textContent = STRINGS.noResults;
      this.#el.list.appendChild(li);
      return;
    }

    for (const store of items) {
      const li = document.createElement('li');
      li.className = 'store-item';
      li.dataset.storeId = store.id;
      if (store.id === this.#selectedStoreId) li.classList.add('selected');
      li.innerHTML = `
        <div class="store-avatar">${this.#escape(store.name.charAt(0).toUpperCase())}</div>
        <div class="store-info">
          <div class="store-name">${this.#escape(store.name)}</div>
          <div class="store-cat">${this.#escape(store.category)}</div>
        </div>
        <div class="store-floor">K${store.floor}</div>`;
      li.addEventListener('click', () => {
        this.bus.emit('storeSelected', { storeId: store.id, origin: 'ui' });
      });
      this.#el.list.appendChild(li);
    }
  }

  #markSelected(storeId) {
    this.#selectedStoreId = storeId;
    this.#el.list.querySelectorAll('.store-item').forEach((li) => {
      li.classList.toggle('selected', li.dataset.storeId === storeId);
    });
  }

  // ---------- Bilgi kartı ----------

  getStore(storeId) {
    return this.#stores.find((s) => s.id === storeId) ?? null;
  }

  showStoreCard(storeId, routeInfo) {
    const store = this.getStore(storeId) ?? { name: this.#titleCase(storeId), category: '—', floor: 1 };
    this.#markSelected(storeId);

    this.#el.cardName.textContent = store.name;
    this.#el.cardCategory.textContent = store.category;
    this.#el.cardFloor.textContent = `Kat ${store.floor}`;

    const { metersPerUnit, walkingSpeedMps } = this.config.units;
    const meters = routeInfo.distance * metersPerUnit;
    const minutes = Math.max(1, Math.ceil(meters / walkingSpeedMps / 60));
    this.#el.cardDistance.textContent = `${Math.round(meters)} ${STRINGS.metersShort}`;
    this.#el.cardEta.textContent = `~${minutes} ${STRINGS.minutesShort}`;
    this.#el.cardA11yNote.classList.toggle('hidden', !routeInfo.accessible);

    this.#renderSteps(routeInfo.points ?? [], store.name);

    this.#el.card.classList.remove('hidden');
    this.closePanel(); // rota görünür kalsın diye seçimden sonra panel kapanır
  }

  // ---------- Adım adım yönlendirme ----------

  /**
   * Rota noktalarından basit adım listesi üretir: yön değişimi ~30°'yi
   * aşınca yeni adım başlar, son bacak "mağazasına ulaştınız" olur.
   */
  #buildSteps(points, storeName) {
    const mpu = this.config.units.metersPerUnit;
    const raw = points.map((p) => ({ x: p.x * mpu, z: p.z * mpu }));

    // Çok yakın noktaları birleştir (waypoint zinciri gürültüsü)
    const path = raw.length ? [raw[0]] : [];
    for (const p of raw.slice(1)) {
      const last = path[path.length - 1];
      if (Math.hypot(p.x - last.x, p.z - last.z) > 0.8) path.push(p);
    }
    if (path.length < 2) return [];

    // Bacaklar: yön ~30°'den fazla kırılınca yeni bacak
    const legs = [];
    let legDist = 0;
    let legTurn = 'straight';
    let prevDir = null;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dz = path[i].z - path[i - 1].z;
      const len = Math.hypot(dx, dz);
      const dir = { x: dx / len, z: dz / len };
      if (prevDir) {
        const cross = prevDir.z * dir.x - prevDir.x * dir.z;
        const dot = prevDir.x * dir.x + prevDir.z * dir.z;
        const angleDeg = (Math.atan2(cross, dot) * 180) / Math.PI;
        if (Math.abs(angleDeg) > 30) {
          legs.push({ dist: legDist, turn: legTurn });
          legDist = 0;
          legTurn = angleDeg < 0 ? 'right' : 'left';
        }
      }
      legDist += len;
      prevDir = dir;
    }
    legs.push({ dist: legDist, turn: legTurn });

    return legs.map((leg, i) => {
      const dist = `${Math.max(1, Math.round(leg.dist))} ${STRINGS.metersShort}`;
      if (i === legs.length - 1) return { icon: 'arrive', dist, text: `${storeName} ${STRINGS.stepArriveSuffix}` };
      if (i === 0 || leg.turn === 'straight') return { icon: 'straight', dist, text: STRINGS.stepStraight };
      return { icon: leg.turn, dist, text: leg.turn === 'right' ? STRINGS.stepRight : STRINGS.stepLeft };
    });
  }

  #renderSteps(points, storeName) {
    const steps = this.#buildSteps(points, storeName);
    const el = this.#el.cardSteps;
    el.innerHTML = '';
    el.classList.toggle('hidden', steps.length === 0);

    const icons = {
      straight: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
      right: '<path d="M6 20v-8a4 4 0 0 1 4-4h7"/><path d="m13 4 4 4-4 4"/>',
      left: '<path d="M18 20v-8a4 4 0 0 0-4-4H7"/><path d="m11 4-4 4 4 4"/>',
      arrive: '<path d="M12 21s-6-5.1-6-9.8A6 6 0 0 1 18 11.2C18 15.9 12 21 12 21z"/><circle cx="12" cy="11" r="2.4"/>',
    };
    for (const step of steps) {
      const div = document.createElement('div');
      div.className = `step step-${step.icon}`;
      div.innerHTML = `
        <span class="step-icon"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[step.icon]}</svg></span>
        <span class="step-body">
          <span class="step-dist">${this.#escape(step.dist)}</span>
          <span class="step-text">${this.#escape(step.text)}</span>
        </span>`;
      el.appendChild(div);
    }
  }

  // ---------- Kampanya kartı (oto-kayan) ----------

  #promoIdx = 0; #promoTimer = null;

  #initPromo() {
    const track = this.#el.promoTrack;
    if (!track) return;
    const count = track.children.length;

    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.className = 'promo-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Kampanya ${i + 1}`);
      dot.addEventListener('click', () => { this.#promoGo(i); this.#promoRestartAuto(); });
      this.#el.promoDots.appendChild(dot);
    }
    this.#promoGo(0);
    this.#promoRestartAuto();

    // Parmakla kaydırma
    let startX = null;
    this.#el.promo.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    this.#el.promo.addEventListener('pointerup', (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) < 40) return;
      const count = this.#el.promoTrack.children.length;
      this.#promoGo((this.#promoIdx + (dx < 0 ? 1 : -1) + count) % count);
      this.#promoRestartAuto();
    });
  }

  #promoGo(i) {
    this.#promoIdx = i;
    this.#el.promoTrack.style.transform = `translateX(-${i * 100}%)`;
    [...this.#el.promoDots.children].forEach((d, k) => d.classList.toggle('active', k === i));
  }

  #promoRestartAuto() {
    clearInterval(this.#promoTimer);
    this.#promoTimer = setInterval(() => {
      const count = this.#el.promoTrack.children.length;
      this.#promoGo((this.#promoIdx + 1) % count);
    }, 6000);
  }

  hideCard() {
    this.#el.card.classList.add('hidden');
    this.#markSelected(null);
  }

  // ---------- Toast ----------

  toast(message, type = 'info', durationMs = 3200) {
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = message;
    this.#el.toasts.appendChild(div);
    setTimeout(() => {
      div.classList.add('out');
      setTimeout(() => div.remove(), 450);
    }, durationMs);
  }

  // ---------- Yükleme ekranı ----------

  setLoadingProgress(loaded, total) {
    if (total > 0) {
      const pct = Math.min(100, Math.round((loaded / total) * 100));
      this.#el.progressFill.style.width = `${pct}%`;
      this.#el.progressText.textContent = `%${pct}`;
      if (pct >= 100) this.#el.loadingSub.textContent = STRINGS.preparingScene;
    } else {
      this.#el.progressText.textContent = `${(loaded / 1024 / 1024).toFixed(1)} MB`;
    }
  }

  hideLoading() {
    this.#el.loading.classList.add('out');
    setTimeout(() => this.#el.loading.remove(), 600);
  }

  // ---------- Saat + Idle ----------

  #startClock() {
    const tick = () => {
      this.#el.clock.textContent = new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit', minute: '2-digit',
      });
    };
    tick();
    setInterval(tick, 10_000);
  }

  #startIdleWatch() {
    const reset = () => {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = setTimeout(() => this.bus.emit('idle', {}), this.config.idle.timeoutMs);
    };
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) {
      window.addEventListener(ev, reset, { passive: true });
    }
    reset();
  }

  // ---------- Yardımcılar ----------

  #titleCase(id) {
    return id.toLocaleLowerCase('tr').split(/[_\s]+/)
      .map((w) => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1))
      .join(' ');
  }

  #escape(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
}
