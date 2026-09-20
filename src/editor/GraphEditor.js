import * as THREE from 'three';

/**
 * Graf editörü (?editor=1 ile açılır).
 *
 * Modlar:
 *  - Seç/Taşı : noktaya dokun -> seç; basılı tutup sürükle -> taşı; Delete -> sil
 *  - Nokta Ekle: zemine dokun -> seçili tipte nokta; "otomatik bağla" açıkken
 *                art arda eklenen noktalar walk kenarıyla zincirlenir (koridor çizimi)
 *  - Kenar Ekle: iki noktaya sırayla dokun; zincir devam eder, Esc bırakır
 *  - Sil       : dokunulan nokta/kenarı kaldırır
 *  - Rota Test : başlangıç + hedef noktaya dokun -> gerçek motorla rota çizilir
 *
 * Taslak her değişiklikte localStorage'a yazılır; "JSON İndir" ile graph.json üretilir.
 */
export class GraphEditor {
  constructor(sceneManager, engine, routeRenderer, lampSystem, storeMarkers, config) {
    this.sm = sceneManager;
    this.engine = engine;
    this.routeRenderer = routeRenderer;
    this.lampSystem = lampSystem;
    this.storeMarkers = storeMarkers;
    this.config = config;

    this.graph = { version: 1, meta: {}, nodes: [], edges: [], lamps: [], storeMarkers: {} };
    this.mode = 'select';
    this.selection = null;      // { kind:'node', id } | { kind:'edge', index }
    this.chainNodeId = null;    // otomatik bağlama / kenar zinciri kaynağı

    this.#nodeMeshes = new Map();
    this.#edgeObjects = [];
    this.#drag = null;
    this.#saveTimer = null;
  }

  #nodeMeshes; #edgeObjects; #drag; #saveTimer; #el = {};
  #layer; #gridHelper; #nodeGeo; #materials; #selectedMat;

  get nodeRadius() { return Math.max(0.08, this.sm.sceneScale * 0.006); }

  async init(storeIds) {
    this.storeIds = storeIds;
    document.body.classList.add('editor-mode');

    this.#layer = new THREE.Group();
    this.#layer.name = 'EDITOR_LAYER';
    this.sm.scene.add(this.#layer);

    this.#nodeGeo = new THREE.SphereGeometry(this.nodeRadius, 20, 16);
    this.#materials = Object.fromEntries(
      Object.entries(this.config.editor.nodeColors)
        .map(([type, color]) => [type, new THREE.MeshBasicMaterial({ color })]),
    );
    this.#selectedMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.#buildGrid();
    this.sm.setHitboxDebug(true);

    await this.#loadInitialGraph();
    this.#buildPanel();
    this.#bindPointerEvents();
    this.#bindKeyboard();
    this.#rebuildVisuals();
    this.#commit(false);

    this.#setStatus('Editör hazır. Önce "Kiosk" tipinde başlangıç noktasını yerleştirin.');
  }

  // ---------------- Yükleme / kalıcılık ----------------

  async #loadInitialGraph() {
    let fileGraph = null;
    try {
      const res = await fetch(this.config.paths.graph, { cache: 'no-store' });
      if (res.ok) fileGraph = await res.json();
    } catch { /* dosya yoksa boş başla */ }

    const draftRaw = localStorage.getItem(this.config.editor.autosaveKey);
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw);
        const fileStr = JSON.stringify(fileGraph ?? {});
        if (JSON.stringify(draft) !== fileStr &&
            confirm('Kaydedilmemiş editör taslağı bulundu. Taslak yüklensin mi?\n(İptal: graph.json dosyası kullanılır)')) {
          this.graph = this.#normalize(draft);
          return;
        }
      } catch { /* bozuk taslak yok sayılır */ }
    }
    if (fileGraph) this.graph = this.#normalize(fileGraph);
  }

  #normalize(g) {
    return {
      version: g.version ?? 1,
      meta: g.meta ?? { building: 'MERKEZ_ANKARA', units: 'scene-units' },
      nodes: g.nodes ?? [],
      edges: g.edges ?? [],
      lamps: g.lamps ?? [],
      storeMarkers: g.storeMarkers ?? {},
    };
  }

  #scheduleAutosave() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      localStorage.setItem(this.config.editor.autosaveKey, JSON.stringify(this.graph));
    }, 300);
  }

  /** Her mutasyon sonrası: motor + görseller + panel istatistikleri güncellenir. */
  #commit(autosave = true) {
    this.engine.setGraph(this.graph);
    this.#rebuildVisuals();
    this.lampSystem.setLamps(this.graph.lamps);
    this.storeMarkers.setMarkers(this.graph.storeMarkers);
    this.#refreshStats();
    if (autosave) this.#scheduleAutosave();
  }

  // ---------------- Görseller ----------------

  #buildGrid() {
    const size = Math.ceil(this.sm.sceneScale * 1.1);
    this.#gridHelper = new THREE.GridHelper(size, size, 0x2e3d4d, 0x1a2430);
    const center = this.sm.bounds.getCenter(new THREE.Vector3());
    this.#gridHelper.position.set(center.x, this.sm.floorY + 0.005, center.z);
    this.sm.scene.add(this.#gridHelper);
  }

  #rebuildVisuals() {
    for (const mesh of this.#nodeMeshes.values()) this.#layer.remove(mesh);
    this.#nodeMeshes.clear();
    for (const obj of this.#edgeObjects) {
      this.#layer.remove(obj);
      obj.traverse?.((c) => { c.geometry?.dispose(); });
      obj.geometry?.dispose();
    }
    this.#edgeObjects = [];

    for (const node of this.graph.nodes) this.#addNodeMesh(node);
    this.graph.edges.forEach((edge, i) => this.#addEdgeObject(edge, i));
    this.#applySelectionHighlight();
  }

  #addNodeMesh(node) {
    const mat = this.#materials[node.type] ?? this.#materials.waypoint;
    const mesh = new THREE.Mesh(this.#nodeGeo, mat);
    mesh.position.set(node.pos[0], node.pos[1] + this.nodeRadius, node.pos[2]);
    mesh.userData.nodeId = node.id;
    mesh.renderOrder = 60;
    if (node.type === 'kiosk') mesh.scale.setScalar(1.5);
    if (node.type === 'door') mesh.scale.setScalar(1.25);
    this.#layer.add(mesh);
    this.#nodeMeshes.set(node.id, mesh);
  }

  #addEdgeObject(edge, index) {
    const a = this.graph.nodes.find((n) => n.id === edge.from);
    const b = this.graph.nodes.find((n) => n.id === edge.to);
    if (!a || !b) return;

    const lift = this.nodeRadius;
    const va = new THREE.Vector3(a.pos[0], a.pos[1] + lift, a.pos[2]);
    const vb = new THREE.Vector3(b.pos[0], b.pos[1] + lift, b.pos[2]);

    const color = this.config.editor.edgeColors[edge.type ?? 'walk'] ?? 0x94a3b8;
    const geo = new THREE.BufferGeometry().setFromPoints([va, vb]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    line.userData.edgeIndex = index;
    line.renderOrder = 59;
    this.#layer.add(line);
    this.#edgeObjects.push(line);

    // Yön göstergesi: tek yönlü kenarlarda orta noktada koni
    if (edge.oneWay) {
      const dir = vb.clone().sub(va);
      const coneGeo = new THREE.ConeGeometry(this.nodeRadius * 0.6, this.nodeRadius * 1.6, 10);
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color }));
      cone.position.copy(va).addScaledVector(dir, 0.55);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      cone.userData.edgeIndex = index;
      this.#layer.add(cone);
      this.#edgeObjects.push(cone);
    }
  }

  #applySelectionHighlight() {
    for (const [id, mesh] of this.#nodeMeshes) {
      const node = this.graph.nodes.find((n) => n.id === id);
      if (!node) continue; // veri silinmiş, görsel commit'te yeniden kurulacak
      mesh.material = (this.selection?.kind === 'node' && this.selection.id === id) ||
                      this.chainNodeId === id
        ? this.#selectedMat
        : (this.#materials[node.type] ?? this.#materials.waypoint);
    }
    for (const obj of this.#edgeObjects) {
      if (!obj.isLine) continue;
      const selected = this.selection?.kind === 'edge' && this.selection.index === obj.userData.edgeIndex;
      obj.material.opacity = selected ? 1 : 0.9;
      obj.material.color.set(selected ? 0xffffff
        : (this.config.editor.edgeColors[this.graph.edges[obj.userData.edgeIndex]?.type ?? 'walk'] ?? 0x94a3b8));
    }
    this.lampSystem.setHighlight(this.selection?.kind === 'lamp' ? this.selection.id : null);
  }

  // ---------------- Pointer etkileşimi ----------------

  #bindPointerEvents() {
    const canvas = this.sm.canvas;
    canvas.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.#onPointerUp(e));
  }

  #onPointerDown(e) {
    if (!e.isPrimary) return;
    this.#drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, kind: null, id: null };

    // Seç modunda bir nokta/lamba üzerinde basılıyorsa sürükleme adayı olur
    if (this.mode === 'select') {
      const node = this.#pickNode(e);
      if (node) {
        this.#drag.kind = 'node';
        this.#drag.id = node.userData.nodeId;
        this.sm.controls.enabled = false; // kamera değil nokta hareket etsin
      } else {
        const lamp = this.#pickLamp(e);
        if (lamp) {
          this.#drag.kind = 'lamp';
          this.#drag.id = lamp.userData.lampId;
          this.sm.controls.enabled = false;
        }
      }
    }
  }

  #onPointerMove(e) {
    if (!this.#drag || !e.isPrimary) return;
    if (Math.hypot(e.clientX - this.#drag.x, e.clientY - this.#drag.y) > 8) this.#drag.moved = true;
    if (!this.#drag.id || !this.#drag.moved) return;

    if (this.#drag.kind === 'node') {
      const node = this.graph.nodes.find((n) => n.id === this.#drag.id);
      const point = this.sm.raycastToPlane(e.clientX, e.clientY, node.pos[1]);
      if (point) {
        node.pos = [point.x, node.pos[1], point.z];
        const mesh = this.#nodeMeshes.get(node.id);
        mesh.position.set(point.x, node.pos[1] + this.nodeRadius, point.z);
        this.#rebuildEdgesOnly();
      }
    } else if (this.#drag.kind === 'lamp') {
      const lamp = this.graph.lamps.find((l) => l.id === this.#drag.id);
      const point = this.sm.raycastToPlane(e.clientX, e.clientY, lamp.pos[1]);
      if (point) {
        lamp.pos = [point.x, lamp.pos[1], point.z];
        this.lampSystem.updateLampPosition(lamp.id, { x: point.x, y: lamp.pos[1], z: point.z });
      }
    }
  }

  #rebuildEdgesOnly() {
    for (const obj of this.#edgeObjects) {
      this.#layer.remove(obj);
      obj.geometry?.dispose();
    }
    this.#edgeObjects = [];
    this.graph.edges.forEach((edge, i) => this.#addEdgeObject(edge, i));
  }

  #onPointerUp(e) {
    if (!this.#drag || !e.isPrimary) return;
    const drag = this.#drag;
    this.#drag = null;
    this.sm.controls.enabled = true;

    if (drag.id && drag.moved) { // sürükleme bitti
      if (drag.kind === 'node') this.#selectNode(drag.id);
      else this.#selectLamp(drag.id);
      this.#commit();
      return;
    }
    if (drag.moved || performance.now() - drag.t > 600) return; // kamera hareketi

    switch (this.mode) {
      case 'select':   this.#tapSelect(e); break;
      case 'addNode':  this.#tapAddNode(e); break;
      case 'addEdge':  this.#tapAddEdge(e); break;
      case 'delete':   this.#tapDelete(e); break;
      case 'test':     this.#tapTest(e); break;
    }
  }

  #pickNode(e) {
    const hits = this.sm.raycastFromScreen(e.clientX, e.clientY, [...this.#nodeMeshes.values()]);
    return hits[0]?.object ?? null;
  }

  // Lambalar InstancedMesh olduğundan kimlik instanceId üzerinden çözülür;
  // çağıran taraflar için eski mesh arayüzü (userData.lampId) taklit edilir.
  #pickLamp(e) {
    const hits = this.sm.raycastFromScreen(e.clientX, e.clientY, this.lampSystem.pickMeshes);
    const lampId = hits.length ? this.lampSystem.lampIdFromHit(hits[0]) : null;
    return lampId ? { userData: { lampId } } : null;
  }

  #pickEdge(e) {
    const ray = this.sm.screenRaycaster(e.clientX, e.clientY);
    ray.params.Line.threshold = this.nodeRadius * 0.9;
    const lines = this.#edgeObjects.filter((o) => o.isLine);
    const hits = ray.intersectObjects(lines, false);
    return hits[0]?.object ?? null;
  }

  #pickGround(e) {
    const hits = this.sm.raycastFromScreen(e.clientX, e.clientY, this.sm.walkableMeshes);
    return hits[0]?.point ?? null;
  }

  // ---------------- Mod işlemleri ----------------

  #tapSelect(e) {
    const node = this.#pickNode(e);
    if (node) { this.#selectNode(node.userData.nodeId); return; }
    const lamp = this.#pickLamp(e);
    if (lamp) { this.#selectLamp(lamp.userData.lampId); return; }
    const edge = this.#pickEdge(e);
    if (edge) { this.#selectEdge(edge.userData.edgeIndex); return; }
    this.#clearSelection();
  }

  #tapAddNode(e) {
    const point = this.#pickGround(e);
    if (!point) { this.#setStatus('Zemin bulunamadı — model üzerine dokunun.'); return; }

    const type = this.#el.nodeType.value;
    let id;

    // Lambalar graf düğümü değildir: rota ağına girmez, ayrı listede tutulur
    if (type === 'lamp') {
      id = this.#nextLampId();
      this.graph.lamps.push({ id, pos: [point.x, point.y, point.z] });
      this.#commit();
      this.#selectLamp(id);
      const real = this.lampSystem.maxRealLights;
      this.#setStatus(this.graph.lamps.length > real
        ? `${id} eklendi (${this.graph.lamps.length}. lamba — geceleyin kameraya en yakın ${real} tanesi gerçek ışık).`
        : `${id} eklendi. Gece modunda yanar.`);
      return;
    }

    if (type === 'kiosk') {
      const existing = this.graph.nodes.find((n) => n.type === 'kiosk');
      if (existing) { // kiosk tekildir: mevcut olanı taşı
        existing.pos = [point.x, point.y, point.z];
        this.#selectNode(existing.id);
        this.#commit();
        this.#setStatus('Kiosk başlangıç noktası taşındı.');
        return;
      }
      id = this.config.graph.kioskNodeId;
    } else if (type === 'door') {
      const storeId = this.#el.storeSelect.value;
      if (!storeId) { this.#setStatus('Önce mağaza seçin.'); return; }
      id = `DOOR_${storeId}`;
      if (this.graph.nodes.some((n) => n.id === id)) {
        this.#setStatus(`${id} zaten var — Seç modunda taşıyabilirsiniz.`);
        this.#selectNode(id);
        return;
      }
    } else {
      id = this.#nextId(type);
    }

    const node = { id, type, floor: 1, pos: [point.x, point.y, point.z] };
    if (type === 'door') node.storeId = this.#el.storeSelect.value;
    this.graph.nodes.push(node);

    // Otomatik zincir: koridoru tık tık ilerleterek çiz
    if (this.#el.autoChain.checked && this.chainNodeId && this.chainNodeId !== id &&
        this.graph.nodes.some((n) => n.id === this.chainNodeId)) {
      this.#addEdge(this.chainNodeId, id, 'walk');
    }
    this.chainNodeId = id;

    this.#selectNode(id);
    this.#commit();
    this.#setStatus(`${id} eklendi.`);
  }

  #tapAddEdge(e) {
    const nodeMesh = this.#pickNode(e);
    if (!nodeMesh) return;
    const id = nodeMesh.userData.nodeId;

    if (!this.chainNodeId) {
      this.chainNodeId = id;
      this.#applySelectionHighlight();
      this.#setStatus(`${id} seçildi → hedef noktaya dokunun.`);
      return;
    }
    if (this.chainNodeId === id) {
      this.chainNodeId = null;
      this.#applySelectionHighlight();
      this.#setStatus('Kenar zinciri bırakıldı.');
      return;
    }

    const added = this.#addEdge(this.chainNodeId, id, this.#el.edgeType.value,
      this.#el.oneWay.checked, this.#parseCost());
    this.chainNodeId = id; // zincir devam eder
    this.#commit();
    this.#setStatus(added ? 'Kenar eklendi. Zincir devam ediyor (Esc: bırak).' : 'Bu kenar zaten var.');
  }

  #addEdge(from, to, type, oneWay = false, cost = null) {
    const dup = this.graph.edges.some((ed) =>
      (ed.from === from && ed.to === to) || (!ed.oneWay && ed.from === to && ed.to === from));
    if (dup) return false;

    const edge = { from, to, type };
    if (oneWay) edge.oneWay = true;
    if (cost != null && !Number.isNaN(cost)) edge.cost = cost;
    this.graph.edges.push(edge);
    return true;
  }

  #tapDelete(e) {
    const node = this.#pickNode(e);
    if (node) { this.#deleteNode(node.userData.nodeId); return; }
    const lamp = this.#pickLamp(e);
    if (lamp) { this.#deleteLamp(lamp.userData.lampId); return; }
    const edge = this.#pickEdge(e);
    if (edge) {
      this.graph.edges.splice(edge.userData.edgeIndex, 1);
      this.#clearSelection();
      this.#commit();
      this.#setStatus('Kenar silindi.');
    }
  }

  #deleteLamp(id) {
    this.graph.lamps = this.graph.lamps.filter((l) => l.id !== id);
    this.#clearSelection();
    this.#commit();
    this.#setStatus(`${id} silindi.`);
  }

  #deleteNode(id) {
    this.graph.nodes = this.graph.nodes.filter((n) => n.id !== id);
    this.graph.edges = this.graph.edges.filter((ed) => ed.from !== id && ed.to !== id);
    if (this.chainNodeId === id) this.chainNodeId = null;
    this.#clearSelection();
    this.#commit();
    this.#setStatus(`${id} ve bağlı kenarları silindi.`);
  }

  // Test rotası her zaman kiosktan başlar; kullanıcı sadece hedefi seçer.
  #tapTest(e) {
    const nodeMesh = this.#pickNode(e);
    if (!nodeMesh) return;
    const targetId = nodeMesh.userData.nodeId;
    const kioskId = this.config.graph.kioskNodeId;

    if (!this.graph.nodes.some((n) => n.id === kioskId)) {
      this.#setStatus('Önce Kiosk noktası ekleyin — test rotası her zaman kiosktan başlar.');
      return;
    }
    if (targetId === kioskId) {
      this.#setStatus('Hedef olarak kiosk dışında bir nokta seçin.');
      return;
    }

    const result = this.engine.findPath(kioskId, targetId, {
      accessible: this.#el.a11yTest.checked,
    });
    if (result.ok) {
      this.routeRenderer.draw(result.points);
      this.#setStatus(`Kiosk → ${targetId}: ${result.nodeIds.length} nokta, ${result.distance.toFixed(1)} birim.`);
    } else {
      this.routeRenderer.clear();
      this.#setStatus(`Rota bulunamadı (${result.error}).`);
    }
  }

  // ---------------- Seçim ----------------

  #selectNode(id) {
    this.selection = { kind: 'node', id };
    this.#applySelectionHighlight();
    this.#refreshSelectionInfo();
  }

  #selectLamp(id) {
    this.selection = { kind: 'lamp', id };
    this.#applySelectionHighlight();
    this.#refreshSelectionInfo();
  }

  #selectEdge(index) {
    this.selection = { kind: 'edge', index };
    const edge = this.graph.edges[index];
    // Panel girdileri seçili kenarı yansıtır; değişiklik anında uygulanır
    this.#el.edgeType.value = edge.type ?? 'walk';
    this.#el.oneWay.checked = !!edge.oneWay;
    this.#el.edgeCost.value = edge.cost ?? '';
    this.#applySelectionHighlight();
    this.#refreshSelectionInfo();
  }

  #clearSelection() {
    this.selection = null;
    this.#applySelectionHighlight();
    this.#refreshSelectionInfo();
  }

  #refreshSelectionInfo() {
    const el = this.#el.selectionInfo;
    if (!this.selection) { el.textContent = 'Seçim yok.'; return; }

    if (this.selection.kind === 'lamp') {
      const lamp = this.graph.lamps.find((l) => l.id === this.selection.id);
      if (!lamp) { el.textContent = 'Seçim yok.'; return; }
      el.textContent =
        `id: ${lamp.id}\ntip: sokak lambası` +
        `\npos: [${lamp.pos.map((v) => v.toFixed(2)).join(', ')}]` +
        `\nışık: geceleyin kameraya en yakın ${this.lampSystem.maxRealLights} lamba gerçek; diğerleri sahte havuz`;
      return;
    }

    if (this.selection.kind === 'node') {
      const n = this.graph.nodes.find((x) => x.id === this.selection.id);
      if (!n) { el.textContent = 'Seçim yok.'; return; }
      el.textContent =
        `id: ${n.id}\ntip: ${n.type}${n.storeId ? `\nstoreId: ${n.storeId}` : ''}` +
        `\npos: [${n.pos.map((v) => v.toFixed(2)).join(', ')}]` +
        `\nbağlantı: ${this.graph.edges.filter((ed) => ed.from === n.id || ed.to === n.id).length} kenar`;
    } else {
      const ed = this.graph.edges[this.selection.index];
      if (!ed) { el.textContent = 'Seçim yok.'; return; }
      el.textContent =
        `kenar: ${ed.from} → ${ed.to}\ntip: ${ed.type ?? 'walk'}` +
        `${ed.oneWay ? '\ntek yön' : ''}${ed.cost != null ? `\nmaliyet: ${ed.cost}` : '\nmaliyet: otomatik (mesafe)'}`;
    }
  }

  // ---------------- Panel ----------------

  #buildPanel() {
    const storeOptions = this.storeIds
      .map((s) => `<option value="${s}">${s}</option>`).join('');

    const panel = document.createElement('div');
    panel.id = 'editor-panel';
    panel.innerHTML = `
      <h3>GRAF EDİTÖRÜ</h3>

      <div class="ed-section">
        <label>Mod</label>
        <div class="ed-modes">
          <button class="ed-mode-btn active" data-mode="select">Seç / Taşı</button>
          <button class="ed-mode-btn" data-mode="addNode">Nokta Ekle</button>
          <button class="ed-mode-btn" data-mode="addEdge">Kenar Ekle</button>
          <button class="ed-mode-btn" data-mode="delete">Sil</button>
          <button class="ed-mode-btn" data-mode="test">Rota Test</button>
        </div>
        <button class="ed-btn" id="ed-2d">2B Kuş Bakışı</button>
        <button class="ed-btn" id="ed-exit">Ana Sayfaya Dön</button>
        <div id="ed-status"></div>
      </div>

      <div class="ed-section" id="ed-node-opts">
        <label>Nokta Tipi</label>
        <select id="ed-node-type">
          <option value="waypoint">Yürüyüş noktası (waypoint)</option>
          <option value="kiosk">Kiosk (başlangıç)</option>
          <option value="door">Mağaza kapısı (door)</option>
          <option value="elevator">Asansör</option>
          <option value="escalator">Yürüyen merdiven</option>
          <option value="stairs">Merdiven</option>
          <option value="lamp">Sokak lambası (gece ışığı)</option>
        </select>
        <div class="ed-row" id="ed-store-row" style="display:none">
          <label class="inline" for="ed-store-select">Mağaza:</label>
          <select id="ed-store-select">${storeOptions}</select>
        </div>
        <label class="inline"><input type="checkbox" id="ed-auto-chain" checked> Otomatik bağla (zincir)</label>
      </div>

      <div class="ed-section" id="ed-edge-opts">
        <label>Kenar Tipi</label>
        <select id="ed-edge-type">
          <option value="walk">Yürüyüş (walk)</option>
          <option value="elevator">Asansör</option>
          <option value="escalator">Yürüyen merdiven</option>
          <option value="stairs">Merdiven</option>
        </select>
        <div class="ed-row">
          <label class="inline"><input type="checkbox" id="ed-one-way"> Tek yön</label>
          <input type="number" id="ed-edge-cost" placeholder="maliyet (boş=oto)" step="0.1" min="0">
        </div>
      </div>

      <div class="ed-section">
        <label>Mağaza Konum İmleci</label>
        <select id="ed-marker-store">${storeOptions}</select>
        <div class="ed-row">
          <button class="ed-btn" id="ed-marker-upload">Logo Yükle</button>
          <button class="ed-btn danger" id="ed-marker-clear">Logoyu Sil</button>
        </div>
        <div class="ed-row">
          <label class="inline"><input type="checkbox" id="ed-marker-auto" checked> Otomatik renk (logodan)</label>
          <input type="color" id="ed-marker-color" value="${this.config.storeMarkers.defaultColor}" title="Elle pin rengi">
        </div>
        <input type="file" id="ed-marker-file" accept="image/*" style="display:none">
      </div>

      <div class="ed-section">
        <label>Seçim</label>
        <div id="ed-selection-info">Seçim yok.</div>
        <button class="ed-btn danger" id="ed-delete-selected">Seçiliyi Sil (Delete)</button>
      </div>

      <div class="ed-section">
        <div class="ed-row">
          <label class="inline"><input type="checkbox" id="ed-a11y-test"> Engelsiz test</label>
          <button class="ed-btn" id="ed-clear-route">Test Rotasını Temizle</button>
        </div>
      </div>

      <div class="ed-section">
        <div id="ed-counts"></div>
        <div id="ed-warnings"></div>
      </div>

      <div class="ed-section">
        <button class="ed-btn primary" id="ed-save">Kaydet (graph.json'a yaz)</button>
        <div class="ed-row">
          <button class="ed-btn" id="ed-download">İndir</button>
          <button class="ed-btn" id="ed-copy">Kopyala</button>
          <button class="ed-btn" id="ed-import">Dosyadan Yükle</button>
        </div>
        <button class="ed-btn danger" id="ed-reset">Sıfırla (tümünü sil, dosyayı boşalt)</button>
        <input type="file" id="ed-file" accept=".json,application/json" style="display:none">
      </div>

      <div style="font-size:11.5px;color:var(--text-dim)">
        Kısayollar: Delete sil · Esc zinciri bırak · H hitbox · G ızgara · 2 kuş bakışı
      </div>`;
    document.body.appendChild(panel);

    this.#el = {
      panel,
      status: panel.querySelector('#ed-status'),
      nodeType: panel.querySelector('#ed-node-type'),
      storeRow: panel.querySelector('#ed-store-row'),
      storeSelect: panel.querySelector('#ed-store-select'),
      autoChain: panel.querySelector('#ed-auto-chain'),
      edgeType: panel.querySelector('#ed-edge-type'),
      oneWay: panel.querySelector('#ed-one-way'),
      edgeCost: panel.querySelector('#ed-edge-cost'),
      selectionInfo: panel.querySelector('#ed-selection-info'),
      counts: panel.querySelector('#ed-counts'),
      warnings: panel.querySelector('#ed-warnings'),
      a11yTest: panel.querySelector('#ed-a11y-test'),
      file: panel.querySelector('#ed-file'),
      markerStore: panel.querySelector('#ed-marker-store'),
      markerAuto: panel.querySelector('#ed-marker-auto'),
      markerColor: panel.querySelector('#ed-marker-color'),
      markerFile: panel.querySelector('#ed-marker-file'),
    };

    this.#bindMarkerControls(panel);

    panel.querySelectorAll('.ed-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.#setMode(btn.dataset.mode, btn));
    });

    this.#el.nodeType.addEventListener('change', () => {
      this.#el.storeRow.style.display = this.#el.nodeType.value === 'door' ? 'flex' : 'none';
      this.chainNodeId = null;
      this.#applySelectionHighlight();
    });

    // Seçili kenar varken tip/yön/maliyet girdileri onu anında günceller
    const applyToSelectedEdge = () => {
      if (this.selection?.kind !== 'edge') return;
      const ed = this.graph.edges[this.selection.index];
      if (!ed) return;
      ed.type = this.#el.edgeType.value;
      if (this.#el.oneWay.checked) ed.oneWay = true; else delete ed.oneWay;
      const cost = this.#parseCost();
      if (cost != null) ed.cost = cost; else delete ed.cost;
      this.#commit();
      this.#refreshSelectionInfo();
    };
    this.#el.edgeType.addEventListener('change', applyToSelectedEdge);
    this.#el.oneWay.addEventListener('change', applyToSelectedEdge);
    this.#el.edgeCost.addEventListener('change', applyToSelectedEdge);

    this.#el.btn2d = panel.querySelector('#ed-2d');
    this.#el.btn2d.addEventListener('click', () => this.#toggle2D());

    // Taslak zaten her değişiklikte localStorage'a yazıldığı için onay sormadan çıkılır
    panel.querySelector('#ed-exit').addEventListener('click', () => { location.href = './'; });

    panel.querySelector('#ed-delete-selected').addEventListener('click', () => this.#deleteSelection());
    panel.querySelector('#ed-clear-route').addEventListener('click', () => {
      this.routeRenderer.clear();
    });
    panel.querySelector('#ed-save').addEventListener('click', () => this.#saveToServer());
    panel.querySelector('#ed-download').addEventListener('click', () => this.#download());
    panel.querySelector('#ed-copy').addEventListener('click', async () => {
      await navigator.clipboard.writeText(this.#exportJson());
      this.#setStatus('JSON panoya kopyalandı.');
    });
    panel.querySelector('#ed-import').addEventListener('click', () => this.#el.file.click());
    this.#el.file.addEventListener('change', async () => {
      const file = this.#el.file.files[0];
      if (!file) return;
      try {
        this.graph = this.#normalize(JSON.parse(await file.text()));
        this.#clearSelection();
        this.#commit();
        this.#setStatus(`${file.name} yüklendi.`);
      } catch (err) {
        this.#setStatus(`Dosya okunamadı: ${err.message}`);
      }
      this.#el.file.value = '';
    });
    panel.querySelector('#ed-reset').addEventListener('click', async () => {
      if (!confirm('TÜM noktalar ve kenarlar silinecek, graph.json dosyası da boşaltılacak.\nEmin misiniz?')) return;
      this.graph = this.#normalize({});
      localStorage.removeItem(this.config.editor.autosaveKey);
      this.#clearSelection();
      this.chainNodeId = null;
      this.routeRenderer.clear();
      this.#commit(false);
      await this.#saveToServer('Graf sıfırlandı ve graph.json boşaltıldı.');
    });
  }

  // ---------------- Mağaza konum imleci düzenleme ----------------

  #bindMarkerControls(panel) {
    const el = this.#el;

    const currentEntry = () => {
      const id = el.markerStore.value;
      const m = this.graph.storeMarkers;
      if (!m[id]) m[id] = { logo: null, color: null };
      return [id, m[id]];
    };

    // Ne logo ne elle renk kaldıysa kaydı temizle (varsayılan pin kullanılır)
    const prune = (id) => {
      const e = this.graph.storeMarkers[id];
      if (e && !e.logo && !e.color) delete this.graph.storeMarkers[id];
    };

    el.markerStore.addEventListener('change', () => this.#syncMarkerControls());

    panel.querySelector('#ed-marker-upload').addEventListener('click', () => el.markerFile.click());
    el.markerFile.addEventListener('change', async () => {
      const file = el.markerFile.files[0];
      el.markerFile.value = '';
      if (!file) return;
      const [id, entry] = currentEntry();
      try {
        entry.logo = await this.#fileToLogoDataUrl(file);
        this.#commit();
        this.#setStatus(`${id} logosu yüklendi${entry.color ? '' : ' — pin rengi logodan alınacak'}.`);
      } catch (err) {
        this.#setStatus(`Görsel okunamadı: ${err.message ?? err}`);
      }
    });

    panel.querySelector('#ed-marker-clear').addEventListener('click', () => {
      const [id, entry] = currentEntry();
      if (!entry.logo) { this.#setStatus(`${id} için yüklü logo yok.`); prune(id); return; }
      entry.logo = null;
      prune(id);
      this.#commit();
      this.#setStatus(`${id} logosu silindi — pinde baş harf gösterilir.`);
    });

    el.markerAuto.addEventListener('change', () => {
      const [id, entry] = currentEntry();
      entry.color = el.markerAuto.checked ? null : el.markerColor.value;
      prune(id);
      this.#commit();
      this.#setStatus(el.markerAuto.checked
        ? `${id}: pin rengi otomatik (logodaki baskın renk).`
        : `${id}: pin rengi elle atandı (${el.markerColor.value}).`);
    });

    el.markerColor.addEventListener('input', () => {
      const [, entry] = currentEntry();
      el.markerAuto.checked = false;
      entry.color = el.markerColor.value;
      this.#commit();
    });

    this.#syncMarkerControls();
  }

  /** Seçili mağazanın kayıtlı imleç ayarlarını form kontrollerine yansıtır. */
  #syncMarkerControls() {
    const entry = this.graph.storeMarkers[this.#el.markerStore.value];
    this.#el.markerAuto.checked = !entry?.color;
    if (entry?.color) this.#el.markerColor.value = entry.color;
  }

  /** Yüklenen görseli kare kırpıp 128px'e küçültür; data-URL graph.json'da saklanır. */
  async #fileToLogoDataUrl(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('geçersiz görsel'));
        i.src = url;
      });
      const S = 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = S;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(S / img.width, S / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------------- 2B kuş bakışı görünümü ----------------

  // Asıl mantık SceneManager.setTopView'da (kiosk moduyla ortak kullanılır)
  #toggle2D() {
    const on = !this.sm.topViewActive;
    this.sm.setTopView(on);
    this.#el.btn2d.classList.toggle('active', on);
    this.#setStatus(on
      ? '2B kuş bakışı açık — sürükle: kaydır · tekerlek: yakınlaş/uzaklaş.'
      : '3B görünüme dönüldü.');
  }

  #setMode(mode, btn) {
    this.mode = mode;
    this.chainNodeId = null;
    this.#el.panel.querySelectorAll('.ed-mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    this.#applySelectionHighlight();

    const hints = {
      select: 'Noktaya dokunun: seç. Basılı tutup sürükleyin: taşı.',
      addNode: 'Zemine dokunarak nokta ekleyin. Zincir açıkken noktalar otomatik bağlanır.',
      addEdge: 'İki noktaya sırayla dokunun. Zincir devam eder; Esc bırakır.',
      delete: 'Silinecek nokta veya kenara dokunun.',
      test: 'Hedef noktaya dokunun — rota kiosktan çizilir.',
    };
    this.#setStatus(hints[mode] ?? '');
  }

  #bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') this.#deleteSelection();
      if (e.key === 'Escape') {
        this.chainNodeId = null;
        this.#clearSelection();
        this.#setStatus('Zincir/seçim bırakıldı.');
      }
      if (e.key.toLowerCase() === 'h') {
        this.#hitboxDebug = !this.#hitboxDebug;
        this.sm.setHitboxDebug(this.#hitboxDebug);
      }
      if (e.key.toLowerCase() === 'g') {
        this.#gridHelper.visible = !this.#gridHelper.visible;
      }
      if (e.key === '2') this.#toggle2D();
    });
  }

  #hitboxDebug = true;

  #deleteSelection() {
    if (!this.selection) return;
    if (this.selection.kind === 'node') this.#deleteNode(this.selection.id);
    else if (this.selection.kind === 'lamp') this.#deleteLamp(this.selection.id);
    else {
      this.graph.edges.splice(this.selection.index, 1);
      this.#clearSelection();
      this.#commit();
      this.#setStatus('Kenar silindi.');
    }
  }

  // ---------------- Dışa aktarma / istatistik ----------------

  #exportJson() {
    const out = {
      version: this.graph.version ?? 1,
      meta: {
        building: 'MERKEZ_ANKARA',
        exportedAt: new Date().toISOString(),
        ...this.graph.meta,
      },
      nodes: this.graph.nodes.map((n) => ({
        ...n,
        pos: n.pos.map((v) => Math.round(v * 1000) / 1000),
      })),
      edges: this.graph.edges,
      lamps: this.graph.lamps.map((l) => ({
        ...l,
        pos: l.pos.map((v) => Math.round(v * 1000) / 1000),
      })),
      storeMarkers: this.graph.storeMarkers,
    };
    return JSON.stringify(out, null, 2);
  }

  /** Grafı sunucudaki assets/data/graph.json dosyasına doğrudan yazar (server.py gerekir). */
  async #saveToServer(successMsg = '✓ graph.json dosyasına kaydedildi. Kiosk ekranı yenilendiğinde bu ağı kullanır.') {
    try {
      const res = await fetch('/api/save-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: this.#exportJson(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.#setStatus(successMsg);
    } catch {
      this.#setStatus('Sunucu kaydı desteklemiyor (server.py ile başlatın) — dosya indiriliyor.');
      this.#download();
    }
  }

  #download() {
    const blob = new Blob([this.#exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'graph.json';
    a.click();
    URL.revokeObjectURL(a.href);
    this.#setStatus('graph.json indirildi → assets/data/ klasörüne kopyalayın.');
  }

  #refreshStats() {
    this.#el.counts.textContent =
      `${this.graph.nodes.length} nokta · ${this.graph.edges.length} kenar · ${this.graph.lamps.length} lamba`;
    const warnings = this.engine.validate();
    this.#el.warnings.textContent = warnings.length
      ? `⚠ ${warnings.slice(0, 6).join('\n⚠ ')}${warnings.length > 6 ? `\n… +${warnings.length - 6}` : ''}`
      : '';
  }

  #setStatus(text) { this.#el.status.textContent = text; }

  #parseCost() {
    const raw = this.#el.edgeCost.value.trim();
    if (raw === '') return null;
    const val = Number(raw);
    return Number.isFinite(val) && val >= 0 ? val : null;
  }

  #nextId(type) {
    const prefixes = { waypoint: 'W_', elevator: 'ELEV_', escalator: 'ESC_', stairs: 'STAIRS_' };
    const prefix = prefixes[type] ?? 'N_';
    let max = 0;
    for (const n of this.graph.nodes) {
      if (n.id.startsWith(prefix)) {
        const num = parseInt(n.id.slice(prefix.length), 10);
        if (!Number.isNaN(num)) max = Math.max(max, num);
      }
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  }

  #nextLampId() {
    let max = 0;
    for (const l of this.graph.lamps) {
      const num = parseInt(l.id.replace('LAMP_', ''), 10);
      if (!Number.isNaN(num)) max = Math.max(max, num);
    }
    return `LAMP_${String(max + 1).padStart(3, '0')}`;
  }
}
