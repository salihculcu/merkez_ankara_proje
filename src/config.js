// Cihaz sınıfı: telefon/tablet tespiti.
// `?mobile` ile hafif profil, `?quality` ile tam kalite zorlanır.
export const IS_MOBILE = (() => {
  if (new URLSearchParams(location.search).has('mobile')) return true;
  if (navigator.userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
  return navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1;
})();

// Android tablet + yüksek DPR dokunmatik (Xiaomi vb.): masaüstü AA/DPR=2 tableti 8–10 FPS'e gömer.
export const USE_LIGHT_PERF = (() => {
  if (new URLSearchParams(location.search).has('quality')) return false;
  if (IS_MOBILE) return true;
  if (navigator.maxTouchPoints > 1 && window.devicePixelRatio >= 1.5) return true;
  return false;
})();

/**
 * Tablet kademesi: RAM / çekirdek / GPU.
 * `?tier=low|mid|high` ile test edilir. Zayıf cihazda düşük piksel, güçlüde tavan 1.5.
 */
export function detectTabletTier(gpuRenderer = '') {
  const forced = new URLSearchParams(location.search).get('tier');
  if (forced === 'low' || forced === 'mid' || forced === 'high') return forced;

  const gpu = String(gpuRenderer).toLowerCase();
  if (/mali-g5[0-2]|mali-4|mali-t|adreno \(tm\) [345]|adreno \(tm\) 5[0-4]|powervr/.test(gpu)) {
    return 'low';
  }
  if (/adreno \(tm\) [78]|mali-g7|mali-g8|xclipse|apple gpu|apple m\d|adreno \(tm\) 6[5-9]/.test(gpu)) {
    return 'high';
  }

  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem != null && mem <= 3) return 'low';
  if ((mem ?? 0) >= 6 || cores >= 8) return 'high';
  if ((mem ?? 0) >= 4 || cores >= 6) return 'mid';
  return cores <= 4 ? 'low' : 'mid';
}

export function resolvePerfProfile(config, { gpuRenderer = '' } = {}) {
  if (!USE_LIGHT_PERF) return { ...config.perf.desktop, tier: 'desktop' };
  const tier = detectTabletTier(gpuRenderer);
  return { ...config.perf.tablet[tier], tier };
}

// Uygulama genel ayarları — sahne ölçeğine ve kiosk donanımına göre buradan kalibre edilir.
export const CONFIG = {
  paths: {
    model: './assets/models/MERKEZ_ANKARA_KAT_1_DENEME.glb',
    // Telefon/tablet: düşürülmüş üçgen sayısı + 1024px dokular (yoksa otomatik ana modele düşer)
    modelMobile: './assets/models/MERKEZ_ANKARA_KAT_1_DENEME_mobile.glb',
    graph: './assets/data/graph.json',
    stores: './assets/data/stores.json',
    // Draco wasm/js: lib/jsm/libs/draco/gltf/ (DRACOLoader DRACO_GLTF_CONFIG)
  },

  // desktop = fareli kiosk PC. tablet.high/mid/low = dokunmatik; tavan 1.5, zayıf 1.0.
  perf: {
    desktop: { maxPixelRatio: 2, antialias: true, maxRealLights: 4 },
    tablet: {
      high: {
        maxPixelRatio: 1.5,
        antialias: false,
        maxRealLights: 3,
        maxTextureSize: 1024,
        startScale: 1,
        routeGhosts: true,
        markerGhosts: true,
      },
      mid: {
        maxPixelRatio: 1.25,
        antialias: false,
        maxRealLights: 2,
        maxTextureSize: 768,
        startScale: 0.95,
        routeGhosts: false,
        markerGhosts: false,
      },
      low: {
        maxPixelRatio: 1.0,
        antialias: false,
        maxRealLights: 2,
        maxTextureSize: 640,
        startScale: 0.8,
        routeGhosts: false,
        markerGhosts: false,
      },
    },
    adaptive: {
      enabled: true,
      intervalSec: 0.9,
      slowMs: 34,         // ≈30 fps altı — ölçek düşür
      fastMs: 22,
      minScale: 0.5,
      step: 0.8,
    },
    idle: {
      desktopFps: 0,
      mobileFps: 30,
      settleMs: 450,
    },
  },

  // Hitbox: mesh veya parent adı HITBOX_ / STORE_ ile başlıyorsa (HITBOXK_ yazım hatası da).
  hitbox: {
    prefix: 'HITBOX_',
    prefixes: ['HITBOXK_', 'HITBOX_', 'STORE_'],
    debugColor: 0x34d399,
    debugOpacity: 0.32,
  },

  graph: {
    kioskNodeId: 'NODE_KIOSK_START',
    // Yürüyüş dışı kenar tipleri için varsayılan sabit maliyet (mesafe yerine).
    defaultVerticalCost: 8,
  },

  units: {
    // Sahnedeki 1 birimin kaç metre olduğu. Editörde gerçek bir mesafe ölçüp kalibre edin.
    metersPerUnit: 1,
    walkingSpeedMps: 1.2,
  },

  route: {
    yOffset: 0.12,            // zeminden yükseklik (sahne birimi)
    radiusFactor: 0.0032,     // tüp yarıçapı = sahne çapraz uzunluğu * bu katsayı
    minRadius: 0.05,
    baseColor: 0xe08035,      // bakır/terrakota — marka paletiyle uyumlu sıcak vurgu
    baseOpacity: 0.92,
    flowSpeed: 1.4,           // ok akış hızı (uv/sn)
    arrowSpacingRadii: 7,     // oklar arası mesafe (yarıçap katı)
    alwaysOnTop: true,        // hedef pini/halkası binaların arkasında da tam görünsün
    occludedOpacity: 0.28,    // tüpün bina arkasında kalan kısmının soluk opaklığı
  },

  markers: {
    startColor: 0x22d3ee,     // "Buradasınız"
    destColor: 0xff5470,      // hedef pini
  },

  // Mağaza üstü konum imleçleri (logo + zıplama animasyonlu, hep kameraya dönük)
  storeMarkers: {
    defaultColor: '#e08035',  // logo yüklenmemişse / renk çıkarılamazsa kullanılacak ton
    sizeFactor: 0.024,        // pin genişliği = sahne ölçeği * katsayı (önceki 0.016'nın 1.5×'i)
    minSize: 0.35,
    maxSize: 3.5,
    yOffset: 0.25,            // hitbox tavanından yükseklik (pin boyu katı)
    bounceAmp: 0.18,          // zıplama genliği (pin boyu katı)
    bounceSpeed: 2.4,         // zıplama hızı (rad/sn)
    occludedOpacity: 0.3,     // pinin bina arkasında kalan kısmının soluk opaklığı
  },

  // Gece/Gündüz ortam ayarları (geçiş yumuşak yapılır)
  dayNight: {
    transitionSec: 1.4,
    day: {
      // Marka paletiyle uyumlu sıcak, açık gündüz zemini (UI: #F4F1EC ailesi)
      bg: 0xe9e4db, hemi: 0.7, hemiSky: 0xf5efe6, hemiGround: 0x8a8074,
      dir: 1.15, dirColor: 0xfff2df, env: 1.0, exposure: 1.05,
    },
    night: {
      bg: 0x05080f, hemi: 0.14, hemiSky: 0x3a5a8c, hemiGround: 0x05080a,
      dir: 0.18, dirColor: 0x8fb3ff, env: 0.12, exposure: 0.92,
    },
  },

  // Sokak lambaları (editörde yerleştirilir, gece modunda yanar)
  lamps: {
    height: null,            // null = sahne ölçeğinden otomatik hesapla
    color: 0xffd9a0,         // sıcak sodyum ışığı
    intensity: 14,           // PointLight şiddeti (gece)
    distanceFactor: 9,       // ışık menzili = lamba boyu * bu katsayı
    maxRealLights: 4,        // tavan; cihaz profili (4 / 2) bunu kullanır
    assignIntervalSec: 0.28, // gerçek ışıkları kameraya en yakın lambalara bağla
    poolRadiusFactor: 2.6,   // sahte ışık havuzu yarıçapı = lamba boyu * bu katsayı
    transitionSec: 1.0,
  },

  camera: {
    fov: 50,
    homePolarDeg: 50,         // kuşbakışına yakın açı (0 = tepeden)
    homeAzimuthDeg: 35,
    framePolarDeg: 45,
    fitPadding: 1.28,         // rota kadrajlama payı
    homePadding: 0.72,        // başlangıç görünümü payı (küçük = daha yakın; tüm kroki bu mesafeden dolar)
    maxZoomOutFactor: 1.0,    // home mesafesinin ötesine zoom-out yok
    frameMs: 1400,
    homeMs: 1600,
  },

  idle: {
    timeoutMs: 90_000,        // bu süre dokunulmazsa başlangıç görünümüne dön
  },

  debug: {
    errorOverlay: true,       // çalışma zamanı hatalarını ekranda göster (kioskta kapatılabilir)
    fpsCounter: true,         // sol altta FPS/kare süresi göstergesi (canlı kioskta false yapın)
  },

  editor: {
    autosaveKey: 'merkez_ankara_graph_draft',
    nodeColors: {
      kiosk: 0xfacc15,
      waypoint: 0x38bdf8,
      door: 0x34d399,
      elevator: 0xa78bfa,
      escalator: 0xfb923c,
      stairs: 0xf87171,
    },
    edgeColors: {
      walk: 0x94a3b8,
      elevator: 0xa78bfa,
      escalator: 0xfb923c,
      stairs: 0xf87171,
    },
  },
};

// Kiosk UI metinleri — çoklu dile hazırlık için tek noktada.
export const STRINGS = {
  routeNotFound: 'Rota bulunamadı. Yol ağı bu mağazaya bağlı olmayabilir.',
  accessibleRouteNotFound: 'Engelsiz rota bulunamadı. Normal rota gösterilmeye devam ediyor.',
  graphEmpty: 'Yol ağı henüz tanımlanmamış. Editör modunda (?editor) rota noktalarını yerleştirin.',
  kioskNodeMissing: 'Başlangıç noktası (NODE_KIOSK_START) tanımlı değil. Editörde "Kiosk" tipinde bir nokta ekleyin.',
  kioskDisconnected: 'Kiosk (başlangıç) noktası yol ağına bağlı değil. Editörde kiosktan ilk yürüyüş noktasına kenar ekleyin.',
  storeNoDoor: 'Bu mağazanın kapı noktası (door) henüz tanımlanmamış.',
  doorDisconnected: 'Mağazanın kapı noktası yol ağına bağlı değil. Editörde kapıya kenar ekleyin.',
  loadingModel: '3B model yükleniyor…',
  preparingScene: 'Sahne hazırlanıyor…',
  minutesShort: 'dk',
  metersShort: 'm',
  allCategories: 'Tümü',
  noResults: 'Sonuç bulunamadı',
  stepStraight: 'İleri doğru devam edin',
  stepRight: 'Sağa dönün',
  stepLeft: 'Sola dönün',
  stepArriveSuffix: 'mağazasına ulaştınız',
};
