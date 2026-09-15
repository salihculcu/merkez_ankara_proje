/**
 * Dokunma/tıklama olaylarını hitbox'lara raycast ederek mağaza seçimine çevirir.
 * OrbitControls ile çakışmamak için "tap" ayrımı yapılır:
 * parmak/imleç belli bir eşikten fazla hareket ettiyse bu bir kamera sürüklemesidir, seçim yapılmaz.
 */
export class InteractionManager {
  constructor(sceneManager, bus) {
    this.sceneManager = sceneManager;
    this.bus = bus;
    this.enabled = true;

    this.#tapMaxDistPx = 10;
    this.#tapMaxMs = 600;

    const canvas = sceneManager.canvas;
    canvas.addEventListener('pointerdown', (e) => this.#onDown(e));
    canvas.addEventListener('pointerup', (e) => this.#onUp(e));
  }

  #tapMaxDistPx; #tapMaxMs; #down = null; #markers = null;

  /** Mağaza pinlerine dokunmayı da seçim saymak için kaynak bağlar. */
  setMarkerSource(storeMarkers) { this.#markers = storeMarkers; }

  #onDown(e) {
    if (!e.isPrimary) return;
    this.#down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  #onUp(e) {
    if (!this.enabled || !this.#down || !e.isPrimary) return;
    const { x, y, t } = this.#down;
    this.#down = null;

    const moved = Math.hypot(e.clientX - x, e.clientY - y);
    if (moved > this.#tapMaxDistPx || performance.now() - t > this.#tapMaxMs) return;

    // Önce pinler (üstte dururlar), sonra hitbox'lar
    if (this.#markers) {
      const pinHits = this.sceneManager.raycastFromScreen(e.clientX, e.clientY, this.#markers.pickSprites);
      const pinStoreId = pinHits[0]?.object.userData.storeId;
      if (pinStoreId) {
        this.bus.emit('storeSelected', { storeId: pinStoreId, origin: 'pin' });
        return;
      }
    }

    const hits = this.sceneManager.raycastFromScreen(e.clientX, e.clientY, this.sceneManager.hitboxes);
    if (hits.length === 0) return;

    const storeId = hits[0].object.userData.storeId;
    if (storeId) this.bus.emit('storeSelected', { storeId, origin: '3d' });
  }
}
