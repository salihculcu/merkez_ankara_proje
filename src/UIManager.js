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
      cardClose: document.getElementById('card-close'),
      cardClear: document.getElementById('card-clear-route'),
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

    this.#el.card.classList.remove('hidden');
    this.closePanel(); // rota görünür kalsın diye seçimden sonra panel kapanır
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
