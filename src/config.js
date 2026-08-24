// Uygulama genel ayarları — sahne ölçeğine ve kiosk donanımına göre buradan kalibre edilir.
export const CONFIG = {
  paths: {
    model: './assets/models/MERKEZ_ANKARA_KAT_1_DENEME.glb',
    graph: './assets/data/graph.json',
    stores: './assets/data/stores.json',
    // Draco wasm/js: lib/jsm/libs/draco/gltf/ (DRACOLoader DRACO_GLTF_CONFIG)
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
    baseColor: 0x22d3ee,
    baseOpacity: 0.92,
    flowSpeed: 1.4,           // ok akış hızı (uv/sn)
    arrowSpacingRadii: 7,     // oklar arası mesafe (yarıçap katı)
    alwaysOnTop: true,        // rota binaların arkasında kalsa da görünsün
  },

  markers: {
    startColor: 0x22d3ee,     // "Buradasınız"
    destColor: 0xff5470,      // hedef pini
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
