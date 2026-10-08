import { WinterMode } from './WinterMode.js?v=winter4';
import { initI18n } from './I18n.js';
import { Snowfall } from './Snowfall.js?v=winter2';
import { PresentationMode } from './PresentationMode.js';
import { CONFIG, STRINGS } from './config.js?v=languages1';
import { EventBus } from './EventBus.js';
import { SceneManager } from './SceneManager.js?v=occlusion1';
import { InteractionManager } from './InteractionManager.js';
import { PathfindingEngine } from './PathfindingEngine.js';
import { RouteRenderer } from './RouteRenderer.js';
import { CameraDirector } from './CameraDirector.js?v=occlusion1';
import { LampSystem } from './LampSystem.js?v=navigation2';
import { StoreMarkers } from './StoreMarkers.js';
import { GraphicsSettings } from './GraphicsSettings.js?v=languages1';
import { LightingSettings } from './LightingSettings.js';
import { UIManager } from './UIManager.js?v=languages1';

const isEditorMode = new URLSearchParams(location.search).has('editor');
initI18n();
document.body.classList.toggle('editor-mode', isEditorMode);
if (isEditorMode) document.getElementById('welcome')?.remove();

installKioskGuards();
setupErrorOverlay();
boot().catch((err) => {
  console.error('[main] Başlatma hatası:', err);
  showFatal(err);
});

async function boot() {
  const bus = new EventBus();
  const ui = new UIManager(bus, CONFIG);
  const welcome = wireWelcome();

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
    onProgress: (loaded, total) => {
      ui.setLoadingProgress(loaded, total);
      welcome.progress(loaded, total);
    },
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
  if (sceneManager.kioskAnchor) {
    engine.placeKiosk(sceneManager.kioskAnchor);
    console.info('[main] Kiosk düğümü KIOSK_OUTDOOR konumuna alındı.');
  }
  camera.setHomeFromBounds(sceneManager.bounds);
  if (!isEditorMode) {
    const zoomOut = CONFIG.camera.maxZoomOutFactor ?? 1;
    const homeDistance = sceneManager.controls.maxDistance / zoomOut;
    sceneManager.controls.minDistance = homeDistance * (CONFIG.camera.minDistanceFactor ?? 0.42);
  }

  for (const [id, name] of Object.entries(sceneManager.storeLabels)) {
    const prev = storesMeta[id];
    if (!prev) storesMeta[id] = { name, category: 'Mağaza', floor: 1 };
    else if (!prev.name) prev.name = name;
  }

  const lampSystem = new LampSystem(sceneManager, CONFIG);
  const storeMarkers = new StoreMarkers(sceneManager, CONFIG);
  wireDayNightToggle(sceneManager, lampSystem);
  wireFloorToggle(camera);
  wireRainToggle();
  wireWinterToggle(sceneManager);

  sceneManager.start();
  new GraphicsSettings(sceneManager);
  new LightingSettings(sceneManager, lampSystem);

  // Sahada performans ayıklama için konsol kancası (ör. __ma.renderer.info.render)
  window.__ma = { sceneManager, renderer: sceneManager.renderer, routeRenderer };

  if (isEditorMode) {
    const { GraphEditor } = await import('./editor/GraphEditor.js?v=presentation1');
    const editor = new GraphEditor(sceneManager, engine, routeRenderer, lampSystem, storeMarkers, CONFIG);
    const hitboxIds = sceneManager.hitboxes.map((h) => h.userData.storeId);
    await editor.init([...new Set([...storeIds, ...hitboxIds])]);
    ui.hideLoading();
    return;
  }

  // Kiosk modunda lambalar graph.json'dan gelir. Mağaza adları modelin üstünde; zıplayan pin yok.
  lampSystem.setLamps(engine.graph.lamps ?? []);

  // ---------- Kiosk modu ----------
  wireTopViewToggle(sceneManager);
  wireEditorLink();
  const interaction = new InteractionManager(sceneManager, bus);
  interaction.setMarkerSource(storeMarkers);
  const hitboxStoreIds = sceneManager.hitboxes.map((h) => h.userData.storeId);
  ui.init(storesMeta, hitboxStoreIds);

  placeStartMarker(engine, routeRenderer);
  document.getElementById('legend').addEventListener('click', () => camera.focusKiosk());
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
    camera.frameRoute(result.points, storeId);
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
    camera.frameRoute(result.points, activeStoreId);
    ui.showStoreCard(activeStoreId, { distance: result.distance, accessible, points: result.points });
  });

  bus.on('routeCleared', () => {
    activeStoreId = null;
    routeRenderer.clear();
    camera.goHome();
  });

  bus.on('idle', () => {
    if (document.body.classList.contains('presentation-mode')) return;
    activeStoreId = null;
    routeRenderer.clear();
    ui.hideCard();
    ui.closePanel();
    ui.setAccessibility(false);
    sceneManager.setTopView(false);
    document.getElementById('view2d-toggle').setAttribute('aria-pressed', 'false');
    camera.goHome();
  });

  new PresentationMode(camera, bus, ui);

  ui.hideLoading();
  welcome.ready();
}

function wireWelcome() {
  const welcome = document.getElementById('welcome');
  const btn = document.getElementById('plans-open');
  if (!welcome || !btn) {
    return { progress() {}, ready() {} };
  }

  let ready = false;
  let queued = false;
  btn.setAttribute('aria-disabled', 'true');

  const video = welcome.querySelector('video');
  if (video) {
    video.muted = true;
    video.loop = true;
    video.play().catch(() => {});
  }
  const open = () => {
    video?.pause();
    welcome.classList.add('out');
    welcome.setAttribute('aria-hidden', 'true');
    setTimeout(() => welcome.remove(), 720);
  };

  btn.addEventListener('click', () => {
    if (!ready) {
      queued = true;
      return;
    }
    open();
  });

  return {
    progress() {},
    ready() {
      ready = true;
      welcome.classList.add('ready');
      btn.classList.add('ready');
      btn.setAttribute('aria-disabled', 'false');
      if (queued) open();
    },
  };
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
function wireFloorToggle(camera) {
  const btn = document.getElementById('floor-toggle');
  const label = document.getElementById('floor-label');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = camera.activeFloor === -1 ? 1 : -1;
    camera.goToFloor(next);
    const onBasement = next === -1;
    btn.textContent = onBasement ? 'Kat 1' : 'Kat -1';
    btn.setAttribute('aria-pressed', String(onBasement));
    if (label) {
      label.textContent = onBasement
        ? 'Kat -1 — deneme'
        : 'Kat 1 — Etkileşimli Yönlendirme';
    }
  });
}

function wireRainToggle() {
  const btn = document.getElementById('rain-toggle');
  const layer = document.getElementById('rain');
  if (!btn || !layer) return;
  fillRainDrops(layer);
  btn.addEventListener('click', () => {
    const on = !layer.classList.contains('on');
    if (on && document.getElementById('winter-toggle')?.getAttribute('aria-pressed') === 'true') document.getElementById('winter-toggle').click();
    layer.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

function fillRainDrops(layer) {
  const host = layer.querySelector('.rain-drops');
  if (!host || host.childElementCount) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 68; i++) {
    const drop = document.createElement('span');
    const blob = Math.random() < 0.28;
    drop.className = blob ? 'rain-drop blob' : 'rain-drop';
    const dur = 1.05 + Math.random() * 0.75;
    drop.style.left = `${Math.random() * 100}%`;
    drop.style.height = blob ? `${4 + Math.random() * 5}px` : `${10 + Math.random() * 28}px`;
    drop.style.opacity = `${0.22 + Math.random() * 0.62}`;
    drop.style.animationDuration = `${dur.toFixed(2)}s`;
    drop.style.animationDelay = `${(-Math.random() * dur).toFixed(2)}s`;
    drop.style.setProperty('--dx', `${((Math.random() - 0.45) * 48).toFixed(1)}px`);
    drop.style.setProperty('--tilt', `${(-6 + Math.random() * 22).toFixed(1)}deg`);
    frag.appendChild(drop);
  }
  host.appendChild(frag);
}

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

function wireWinterToggle(sceneManager) {
  const btn = document.getElementById('winter-toggle');
  const snow = document.getElementById('snow');
  const snowfall = new Snowfall(snow);
  const winter = new WinterMode(sceneManager);
  sceneManager.winterMode = winter;
  btn.addEventListener('click', async () => {
    const on = !winter.enabled;
    btn.setAttribute('aria-pressed', String(on));
    if (on) {
      document.getElementById('rain').classList.remove('on');
      document.getElementById('rain-toggle').setAttribute('aria-pressed', 'false');
    }
    try {
      await winter.setEnabled(on);
      snowfall.setEnabled(winter.enabled);
    } catch (error) {
      winter.enabled = false;
      btn.setAttribute('aria-pressed', 'false');
      snowfall.setEnabled(false);
      console.error('[WinterMode] Kar katmanı yüklenemedi:', error);
      btn.title = 'Kar katmanı yüklenemedi. Tekrar deneyin.';
    }
  });
}
