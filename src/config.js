// Cihaz sınıfı: telefon/tablet tespiti. Kiosk PC'leri (Windows dokunmatik dahil) masaüstü sayılır.
// Test için herhangi bir cihazda `?mobile` parametresiyle mobil profil zorlanabilir.
export const IS_MOBILE = (() => {
  if (new URLSearchParams(location.search).has('mobile')) return true;
  if (navigator.userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ kendini Mac olarak tanıtır
  return navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1;
})();

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

  // Performans profilleri: render çözünürlüğü, antialias ve gerçek lamba ışığı sayısı
  perf: {
    desktop: { maxPixelRatio: 2,   antialias: true,  maxRealLights: null }, // null = lamps.maxRealLights
    mobile:  { maxPixelRatio: 1.5, antialias: false, maxRealLights: 6, maxTextureSize: 1024 },
    // Uyarlanabilir çözünürlük: kare süresi eşiği aşarsa render ölçeği kademeli düşürülür
    adaptive: {
      enabled: true,
      intervalSec: 2.5,   // değerlendirme aralığı
      slowMs: 40,         // ort. kare bu eşiği aşarsa ölçek düşür (≈25 fps altı)
      fastMs: 26,         // ort. kare bunun altındaysa ölçek geri yükselt
      minScale: 0.7,      // taban pixelRatio'nun altına inilmeyecek oran
      step: 0.85,         // her adımda çarpan
    },
  },

  // Hitbox tespiti: nesne adı bu önekle başlıyorsa (HITBOX_ZARA) veya
  // adı stores.json içindeki bir mağaza kimliğiyle eşleşiyorsa (zara -> ZARA) hitbox sayılır.
  hitbox: {
    prefix: 'HITBOX_',
    debugColor: 0x34d399,
    debugOpacity: 0.18,
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
    maxRealLights: 24,       // bu sayıdan sonrası gerçek ışık yerine güçlü sahte havuz alır (performans)
    poolRadiusFactor: 2.6,   // sahte ışık havuzu yarıçapı = lamba boyu * bu katsayı
    transitionSec: 1.0,
  },

  camera: {
    fov: 50,
    homePolarDeg: 50,         // kuşbakışına yakın açı (0 = tepeden)
    homeAzimuthDeg: 35,
    framePolarDeg: 45,
    fitPadding: 1.28,         // kadrajlama payı
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
};
