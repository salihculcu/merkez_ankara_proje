import * as THREE from 'three';

/**
 * graph.json üzerinde Dijkstra en kısa yol hesabı.
 *
 * Şema:
 *  node: { id, type: kiosk|waypoint|door|elevator|escalator|stairs, floor, pos:[x,y,z], storeId?, groupId? }
 *  edge: { from, to, type: walk|elevator|escalator|stairs, cost?, oneWay? }
 *
 * Engelsiz mod: stairs ve escalator tipli kenarlar tamamen elenir;
 * elevator kenarları normal maliyetle kullanılır. Böylece merdivenli rota asla üretilmez.
 */
export class PathfindingEngine {
  constructor(config) {
    this.config = config;
    this.graph = { nodes: [], edges: [], meta: {} };
    this.#nodesById = new Map();
    this.#adjacency = new Map();
  }

  #nodesById; #adjacency;

  async load(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`graph.json yüklenemedi: HTTP ${res.status}`);
    this.setGraph(await res.json());
    return this.graph;
  }

  /** Editör canlı düzenleme için de kullanılır. */
  setGraph(graphData) {
    this.graph = {
      meta: graphData.meta ?? {},
      nodes: graphData.nodes ?? [],
      edges: graphData.edges ?? [],
    };
    this.#buildIndex();
  }

  #buildIndex() {
    this.#nodesById.clear();
    this.#adjacency.clear();

    for (const node of this.graph.nodes) {
      this.#nodesById.set(node.id, node);
      this.#adjacency.set(node.id, []);
    }

    for (const edge of this.graph.edges) {
      const a = this.#nodesById.get(edge.from);
      const b = this.#nodesById.get(edge.to);
      if (!a || !b) {
        console.warn('[Pathfinding] Kenar bilinmeyen düğüme bağlı, atlandı:', edge);
        continue;
      }
      const type = edge.type ?? 'walk';
      const cost = edge.cost ?? (
        type === 'walk'
          ? this.#dist(a, b)
          : this.config.graph.defaultVerticalCost
      );
      this.#adjacency.get(edge.from).push({ to: edge.to, cost, type });
      if (!edge.oneWay) this.#adjacency.get(edge.to).push({ to: edge.from, cost, type });
    }
  }

  #dist(a, b) {
    const [ax, ay, az] = a.pos, [bx, by, bz] = b.pos;
    return Math.hypot(bx - ax, by - ay, bz - az);
  }

  get isEmpty() { return this.graph.nodes.length === 0; }

  hasKioskNode() { return this.#nodesById.has(this.config.graph.kioskNodeId); }

  getNode(id) { return this.#nodesById.get(id) ?? null; }

  findDoorForStore(storeId) {
    const upper = storeId.toUpperCase();
    return this.graph.nodes.find(
      (n) => n.type === 'door' && (n.storeId ?? '').toUpperCase() === upper,
    ) ?? null;
  }

  /** Kiosktan mağaza kapısına rota. Dönüş: { ok, error?, nodeIds?, points?, distance? } */
  findPathToStore(storeId, { accessible = false } = {}) {
    if (this.isEmpty) return { ok: false, error: 'GRAPH_EMPTY' };
    if (!this.hasKioskNode()) return { ok: false, error: 'KIOSK_NODE_MISSING' };

    const kioskId = this.config.graph.kioskNodeId;
    if ((this.#adjacency.get(kioskId) ?? []).length === 0) {
      return { ok: false, error: 'KIOSK_DISCONNECTED' };
    }
    const door = this.findDoorForStore(storeId);
    if (!door) return { ok: false, error: 'STORE_NO_DOOR' };
    if ((this.#adjacency.get(door.id) ?? []).length === 0) {
      return { ok: false, error: 'DOOR_DISCONNECTED' };
    }
    return this.findPath(kioskId, door.id, { accessible });
  }

  findPath(startId, endId, { accessible = false } = {}) {
    if (!this.#nodesById.has(startId) || !this.#nodesById.has(endId)) {
      return { ok: false, error: 'NODE_NOT_FOUND' };
    }

    const dist = new Map([[startId, 0]]);
    const prev = new Map();
    const visited = new Set();
    const heap = new MinHeap();
    heap.push(startId, 0);

    while (heap.size > 0) {
      const { key: current } = heap.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      if (current === endId) break;

      for (const edge of this.#adjacency.get(current) ?? []) {
        if (accessible && (edge.type === 'stairs' || edge.type === 'escalator')) continue;
        if (visited.has(edge.to)) continue;

        const alt = dist.get(current) + edge.cost;
        if (alt < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, current);
          heap.push(edge.to, alt);
        }
      }
    }

    if (!visited.has(endId)) return { ok: false, error: 'NO_ROUTE' };

    const nodeIds = [];
    for (let id = endId; id !== undefined; id = prev.get(id)) nodeIds.unshift(id);

    const points = nodeIds.map((id) => new THREE.Vector3(...this.#nodesById.get(id).pos));

    // Gerçek yürüme mesafesi (birim): sadece geometrik uzunluk toplanır.
    let distance = 0;
    for (let i = 1; i < points.length; i++) distance += points[i].distanceTo(points[i - 1]);

    return { ok: true, nodeIds, points, distance, cost: dist.get(endId) };
  }

  /** Editör için tutarlılık uyarıları üretir. */
  validate() {
    const warnings = [];
    if (!this.hasKioskNode()) warnings.push('NODE_KIOSK_START yok (Kiosk tipinde nokta ekleyin).');

    const connected = new Set();
    for (const [id, edges] of this.#adjacency) if (edges.length > 0) connected.add(id);
    for (const edges of this.#adjacency.values()) for (const e of edges) connected.add(e.to);

    for (const node of this.graph.nodes) {
      if (!connected.has(node.id) && this.graph.nodes.length > 1) {
        warnings.push(`${node.id}: hiçbir kenara bağlı değil.`);
      }
      if (node.type === 'door' && !node.storeId) {
        warnings.push(`${node.id}: door tipinde ama storeId atanmamış.`);
      }
    }
    return warnings;
  }
}

/** İkili min-yığın (öncelik kuyruğu). */
class MinHeap {
  #keys = []; #prios = [];

  get size() { return this.#keys.length; }

  push(key, prio) {
    this.#keys.push(key);
    this.#prios.push(prio);
    let i = this.#keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.#prios[parent] <= this.#prios[i]) break;
      this.#swap(i, parent);
      i = parent;
    }
  }

  pop() {
    const top = { key: this.#keys[0], prio: this.#prios[0] };
    const lastKey = this.#keys.pop();
    const lastPrio = this.#prios.pop();
    if (this.#keys.length > 0) {
      this.#keys[0] = lastKey;
      this.#prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let smallest = i;
        if (l < this.#prios.length && this.#prios[l] < this.#prios[smallest]) smallest = l;
        if (r < this.#prios.length && this.#prios[r] < this.#prios[smallest]) smallest = r;
        if (smallest === i) break;
        this.#swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  #swap(a, b) {
    [this.#keys[a], this.#keys[b]] = [this.#keys[b], this.#keys[a]];
    [this.#prios[a], this.#prios[b]] = [this.#prios[b], this.#prios[a]];
  }
}
