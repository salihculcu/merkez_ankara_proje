import { CONFIG, STRINGS } from './config.js';
import { EventBus } from './EventBus.js';
import { SceneManager } from './SceneManager.js';
import { InteractionManager } from './InteractionManager.js';
import { PathfindingEngine } from './PathfindingEngine.js';
import { RouteRenderer } from './RouteRenderer.js';
import { CameraDirector } from './CameraDirector.js';
import { LampSystem } from './LampSystem.js';
import { StoreMarkers } from './StoreMarkers.js';
import { UIManager } from './UIManager.js';

const isEditorMode = new URLSearchParams(location.search).has('editor');

installKioskGuards();
setupErrorOverlay();
boot().catch((err) => {
  console.error('[main] Başlatma hatası:', err);
  showFatal(err);
});

async function boot() {
  const bus = new EventBus();
  const ui = new UIManager(bus, CONFIG);

  // Mağaza meta verisi (hitbox eşleştirmesi için kimlikler burada tanımlı)
  let storesMeta = {};
  try {
    const res = await fetch(CONFIG.paths.stores, { cache: 'no-store' });
    if (res.ok) storesMeta = await res.json();
  } catch {
    console.warn('[main] stores.json okunamadı; yalnızca HITBOX_ öneki kullanılacak.');
  }
  const storeIds = Object.keys(storesMeta);

  // 3B sahne
  const sceneManager = new SceneManager(document.getElementById('app'), CONFIG);
  await sceneManager.init({
    storeIds,
    onProgress: (loaded, total) => ui.setLoadingProgress(loaded, total),
  });

  // Navigasyon motoru
  const engine = new PathfindingEngine(CONFIG);
  try {
    await engine.load(CONFIG.paths.graph);
  } catch (err) {
    console.warn('[main] graph.json yüklenemedi, boş graf ile devam:', err.message);
  }

  const routeRenderer = new RouteRenderer(sceneManager, CONFIG);
  const camera = new CameraDirector(sceneManager, CONFIG);
  camera.setHomeFromBounds(sceneManager.bounds);

  const lampSystem = new LampSystem(sceneManager, CONFIG);
  const storeMarkers = new StoreMarkers(sceneManager, CONFIG);
  wireDayNightToggle(sceneManager, lampSystem);

  sceneManager.start();

  // Sahada performans ayıklama için konsol kancası (ör. __ma.renderer.info.render)
  window.__ma = {
    sceneManager,
    renderer: sceneManager.renderer,
    info: () => sceneManager.renderer.info,
  };

  if (isEditorMode) {
    const { GraphEditor } = await import('./editor/GraphEditor.js');
    const editor = new GraphEditor(sceneManager, engine, routeRenderer, lampSystem, storeMarkers, CONFIG);
    const hitboxIds = sceneManager.hitboxes.map((h) => h.userData.storeId);
    await editor.init([...new Set([...storeIds, ...hitboxIds])]);
    ui.hideLoading();
    return;
  }

  // Kiosk modunda lambalar ve mağaza pinleri graph.json'dan gelir
  lampSystem.setLamps(engine.graph.lamps ?? []);
  storeMarkers.setMarkers(engine.graph.storeMarkers ?? {});

  // ---------- Kiosk modu ----------
  wireTopViewToggle(sceneManager);
  wireEditorLink();
  const interaction = new InteractionManager(sceneManager, bus);
  interaction.setMarkerSource(storeMarkers);
  const hitboxStoreIds = sceneManager.hitboxes.map((h) => h.userData.storeId);
  ui.init(storesMeta, hitboxStoreIds);

  placeStartMarker(engine, routeRenderer);
  if (engine.isEmpty) ui.toast(STRINGS.graphEmpty, 'warn', 6000);

  let activeStoreId = null;

  bus.on('storeSelected', ({ storeId }) => {
    const result = engine.findPathToStore(storeId, { accessible: ui.accessibility });
    if (!result.ok) {
      ui.toast(errorMessage(result.error), 'warn');
      return;
    }
    activeStoreId = storeId;
    routeRenderer.draw(result.points);
    camera.frameRoute(result.points);
    ui.showStoreCard(storeId, { distance: result.distance, accessible: ui.accessibility, points: result.points });
  });

  bus.on('accessibilityChanged', ({ accessible }) => {
    if (!activeStoreId) return;
    const result = engine.findPathToStore(activeStoreId, { accessible });
    if (!result.ok) {
      // Engelsiz rota yoksa mevcut rota korunur, düğme eski hâline döner
      ui.toast(STRINGS.accessibleRouteNotFound, 'warn');
      ui.setAccessibility(!accessible);
      return;
    }
    routeRenderer.draw(result.points);
    camera.frameRoute(result.points);
    ui.showStoreCard(activeStoreId, { distance: result.distance, accessible, points: result.points });
  });

  bus.on('routeCleared', () => {
    activeStoreId = null;
    routeRenderer.clear();
    camera.goHome();
  });

  bus.on('idle', () => {
    activeStoreId = null;
    routeRenderer.clear();
    ui.hideCard();
    ui.closePanel();
    ui.setAccessibility(false);
    sceneManager.setTopView(false);
    document.getElementById('view2d-toggle').setAttribute('aria-pressed', 'false');
    camera.goHome();
  });

  ui.hideLoading();
}

// Kiosk sayfasındaki 2B kuş bakışı düğmesi (editörde ayrı düğme var).
function wireTopViewToggle(sceneManager) {
  const btn = document.getElementById('view2d-toggle');
  btn.addEventListener('click', () => {
    const on = !sceneManager.topViewActive;
    sceneManager.setTopView(on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

// "Edit Mod" düğmesi editör sayfasına yönlendirir.
function wireEditorLink() {
  document.getElementById('editor-link').addEventListener('click', () => {
    location.href = './?editor';
  });
}

// Gece/Gündüz düğmesi hem kiosk hem editör modunda çalışır.
function wireDayNightToggle(sceneManager, lampSystem) {
  const btn = document.getElementById('daynight-toggle');
  const label = document.getElementById('daynight-label');
  let night = false;

  const apply = (value) => {
    night = value;
    document.body.classList.toggle('night-mode', night);
    btn.setAttribute('aria-pressed', String(night));
    label.textContent = night ? 'Gece' : 'Gündüz';
    sceneManager.setNight(night);
    lampSystem.setNight(night);
  };
  btn.addEventListener('click', () => apply(!night));
}

function placeStartMarker(engine, routeRenderer) {
  const kiosk = engine.getNode(CONFIG.graph.kioskNodeId);
  if (kiosk) {
    routeRenderer.setStartMarker({ x: kiosk.pos[0], y: kiosk.pos[1], z: kiosk.pos[2] });
  } else {
    console.info('[main] Kiosk düğümü yok; "Buradasınız" işaretçisi editörde nokta eklenince görünür.');
  }
}

function errorMessage(code) {
  return {
    GRAPH_EMPTY: STRINGS.graphEmpty,
    KIOSK_NODE_MISSING: STRINGS.kioskNodeMissing,
    KIOSK_DISCONNECTED: STRINGS.kioskDisconnected,
    STORE_NO_DOOR: STRINGS.storeNoDoor,
    DOOR_DISCONNECTED: STRINGS.doorDisconnected,
  }[code] ?? STRINGS.routeNotFound;
}

// ---------- Kiosk jest kilidi (tablet uzun basış / seçim / menü) ----------

function installKioskGuards() {
  const block = (e) => e.preventDefault();
  document.addEventListener('contextmenu', block);
  document.addEventListener('dragstart', block);
  document.addEventListener('gesturestart', block); // eski iOS sayfa pinch-zoom
  document.addEventListener('selectstart', (e) => {
    const el = e.target;
    if (el && el.closest?.('input, textarea, select')) return;
    e.preventDefault();
  });
}

// ---------- Hata görünürlüğü (kiosk sahada ayıklama için) ----------

function setupErrorOverlay() {
  if (!CONFIG.debug.errorOverlay) return;
  const overlay = document.getElementById('error-overlay');
  const append = (msg) => {
    overlay.classList.remove('hidden');
    overlay.textContent += `${msg}\n\n`;
  };
  window.addEventListener('error', (e) => append(`HATA: ${e.message}\n  ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => append(`PROMISE HATASI: ${e.reason?.message ?? e.reason}`));
}

function showFatal(err) {
  const sub = document.querySelector('.loading-sub');
  if (sub) {
    sub.textContent = `Başlatılamadı: ${err.message}`;
    sub.style.color = '#ffb3c0';
  }
}
