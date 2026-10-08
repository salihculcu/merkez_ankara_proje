# Merkez Ankara — 3B İç Mekan Navigasyon Kiosku

WebGL/Three.js tabanlı, tek GLB dosyasıyla çalışan etkileşimli AVM yönlendirme uygulaması.
Mağaza hitbox'ına dokunulduğunda Dijkstra ile en kısa yol hesaplanır ve zemin üzerinde
animasyonlu bir 3B rota tüpü çizilir. Tamamen offline çalışır (three.js yerel kopyadır).

## Çalıştırma

ES modülleri `file://` üzerinden açılmaz; proje kök dizinindeki sunucu betiğiyle başlatın
(statik dosyaları sunar ve editörün "Kaydet" düğmesinin `graph.json`'a yazmasını sağlar):

```powershell
cd C:\MERKEZ_ANKARA
python server.py
```

- Kiosk ekranı: <http://localhost:8000>
- Graf editörü: <http://localhost:8000/?editor=1>

## İlk kurulum akışı

1. `?editor=1` ile editörü açın.
2. **Nokta Ekle** modunda önce **Kiosk (başlangıç)** tipini seçip kioskun bulunduğu yere dokunun
   (`NODE_KIOSK_START` oluşur, tektir; tekrar dokunmak taşır).
3. Tip olarak **waypoint** seçin, "Otomatik bağla" açıkken koridor boyunca sırayla dokunun —
   her nokta bir öncekine `walk` kenarıyla zincirlenir.
4. Her mağaza için **door** tipini seçin, panelden mağazayı seçip kapı önüne dokunun
   (`DOOR_ZARA` gibi), sonra **Kenar Ekle** ile kapıyı en yakın waypoint'e bağlayın.
5. **Rota Test** modunda hedef noktaya dokunun — rota her zaman kiosktan çizilir
   ("Engelsiz test" kutusu merdiven/yürüyen merdiven kenarlarını eler).
6. **Kaydet** düğmesine basın: graf doğrudan `assets/data/graph.json` dosyasına yazılır
   (önceki sürüm `graph.json.bak` olarak yedeklenir).
7. Kiosk ekranını açın: mağazaya (3B'de veya listeden) dokunun → rota çizilir.

Önemli: Kiosk noktasının kendisi de yol ağına kenarla bağlanmalıdır; kapıyı bağlamak
yetmez. Paneldeki "hiçbir kenara bağlı değil" uyarıları sıfırlanmadan kaydetmeyin.

Editör taslağı otomatik olarak tarayıcı `localStorage`'ına kaydedilir; sayfa yenilense de kaybolmaz.

## Klasör yapısı

```
index.html                 Tek sayfa + import map
styles/main.css            Kiosk ve editör arayüz stilleri
lib/                       three.js 0.185.1 yerel kopyaları (offline)
src/
  config.js                Tüm ayarlar ve TR metinler
  main.js                  Modülleri bağlayan giriş noktası
  SceneManager.js          Sahne, GLB yükleme, hitbox hazırlama, render döngüsü
  InteractionManager.js    Dokunma -> raycast -> mağaza seçimi
  PathfindingEngine.js     Dijkstra + engelsiz mod filtresi
  RouteRenderer.js         Rota tüpü, akış animasyonu, hedef/başlangıç işaretçileri
  CameraDirector.js        Rota kadrajlama ve başlangıç görünümü geçişleri
  UIManager.js             Liste, arama, bilgi kartı, toast, idle sıfırlama
  editor/GraphEditor.js    Graf düzenleme aracı (?editor=1)
assets/
  models/*.glb             AVM sahnesi
  data/graph.json          Yol ağı (editörle üretilir)
  data/stores.json         Mağaza meta verisi (isim, kategori, kat)
```

## Adlandırma kuralları (Blender)

- Hitbox **nesne adı** `HITBOX_ZARA` biçiminde olmalıdır. Mevcut modelde nesneler küçük
  harfle (`zara`) adlandırıldığı için kod ikinci bir eşleştirme daha yapar: nesne adı
  `stores.json` içindeki bir kimlikle eşleşiyorsa da hitbox sayılır. Yeni mağaza eklerken
  ikisinden birini sağlamanız yeterlidir; `stores.json`'a kaydını eklemeyi unutmayın.
- glTF dışa aktarımında **object** adı sahneye taşınır (mesh datablock adı değil).

## Gece / Gündüz modu ve sokak lambaları

- Üst bardaki güneş/ay düğmesi ortamı yumuşak geçişle gece moduna alır
  (gökyüzü kararır, ay ışığı tonu gelir). Şimdilik elle; saat entegrasyonu planlıdır.
- Editörde Nokta Tipi olarak **Sokak lambası** seçip zemine dokunarak lamba dikilir;
  lambalar `graph.json` içindeki `lamps` dizisinde saklanır (Kaydet/Sıfırla dahildir),
  Seç/Taşı ile sürüklenir, Sil ile kaldırılır.
- Gece modunda lamba başlıkları parlar, zemine ışık havuzu düşer ve gerçek ışık verir.
  Performans için ilk `lamps.maxRealLights` (varsayılan 10) lamba gerçek `PointLight`
  taşır; fazlası yalnızca görsel parlama alır. Renk/şiddet/menzil `config.js`'ten ayarlanır.

## Kalibrasyon ve ayarlar (`src/config.js`)

- `units.metersPerUnit` — editörde bilinen bir mesafeyi (örn. iki kolon arası) ölçüp
  gerçek metre karşılığına bölerek bulun; mesafe/süre etiketleri buna göre hesaplanır.
- `route.*` — tüp kalınlığı, renk, akış hızı, "binaların arkasından görünsün" (`alwaysOnTop`).
- `idle.timeoutMs` — dokunulmadığında başlangıç görünümüne dönme süresi.
- `debug.errorOverlay` — sahada hata ayıklama katmanı; canlı kioskta `false` yapılabilir.

## Kiosk dağıtımı

```powershell
# Chrome/Edge tam ekran kiosk:
chrome --kiosk --app=http://localhost:8000 --disable-pinch --overscroll-history-navigation=0
```

Sunucu olarak Windows'ta görev zamanlayıcıyla `python -m http.server` başlatılabilir;
tüm varlıklar yerel olduğundan internet bağlantısı gerekmez.

## Performans (tablet / telefon)

Mobil cihazlar otomatik algılanır (`?mobile` ile herhangi bir cihazda zorlanabilir) ve şu profil uygulanır:

- **Hafif model**: `assets/models/*_mobile.glb` (üçgen sayısı ~%35'e düşürülmüş) varsa o yüklenir.
- **Doku küçültme**: 1024px üstü dokular yüklemede küçültülür (GPU belleği ~4'te 1).
- **Render**: antialias kapalı, pixelRatio ≤ 1.5, gerçek lamba ışığı ≤ 6.
- **Uyarlanabilir çözünürlük**: ortalama kare süresi 40 ms'yi aşarsa render ölçeği kademeli
  düşürülür (en düşük 0.7×), cihaz rahatlayınca geri yükselir. Eşikler: `config.perf.adaptive`.

Lambalar tüm cihazlarda instancing ile çizilir (lamba sayısından bağımsız ~5 draw call) ve
gündüz modunda gece katmanları (havuz/parlama/ışık) tamamen kapalıdır.

Mobil GLB'yi yeniden üretmek için:

```powershell
cd assets/models
npx @gltf-transform/cli simplify --ratio 0.35 --error 0.001 MERKEZ_ANKARA_KAT_1_DENEME.glb _tmp.glb
npx @gltf-transform/cli draco _tmp.glb MERKEZ_ANKARA_KAT_1_DENEME_mobile.glb
```

## Çok kata hazırlık

Şema baştan çok katlıdır: her düğümde `floor`, dikey bağlantılarda `elevator | escalator | stairs`
kenar tipleri ve `oneWay` desteği vardır. İkinci kat eklendiğinde aynı GLB'ye kat mesh'leri,
grafiğe de `ELEV_A_F1 ↔ ELEV_A_F2` gibi kenarlar eklemek yeterlidir; engelsiz mod filtresi
merdiven/yürüyen merdiveni otomatik eler.


## 7 Ekim 2026 performans güncellemesi

- Aktif model `assets/models/MERKEZ_ANKARA_WEB_OPTIMIZED.glb`: 188.450 üçgen, 12,95 MB. Yalnızca 38 yazı mesh'i geometrik olarak sadeleştirildi; bina/peyzaj geometrisi ve mağaza kimlikleri korundu. Kaynak GLB dosyaları saklandı ve yükleme hatasında ana kaynak modele dönüş var.
- Meshopt çözücüsü `lib/jsm/libs/meshopt_decoder.module.js` içinde yerel; internet/CDN gerektirmez.
- Kat -1 kopyası, donmuş dünya matrisleri nedeniyle ana katla üst üste çiziliyordu. Matrisleri konumlandırma sırasında güncelleniyor; geçiş dışındaki karelerde yalnızca seçili kat çiziliyor.
- Statik birleştirme artık yakın opak nesnelerde, aynı malzeme ve uyumlu vertex alanlarıyla sınırlı. Mağaza hitbox'ları, saydam/transmission malzemeleri, aynalı ve instanced nesneler korunuyor. Paylaşılan geometriler başka bir nesne kullanıyorsa serbest bırakılmıyor.
- Doğrulama: `npm run test:perf` (Node 22). Kat görünürlüğü, kök dönüşümleri, mağaza seçimini koruma ve bölgesel gruplama için dört test.
- Yerel 1280×720, DPR 1 kontrolünde başlangıç kadrajında çizim çağrıları 1.684 → 722; çoklu render geçişleri dahil üçgenler 2.699.860 → 379.578. Sayaçta yaklaşık 160–165 FPS gözlendi; cihaz, kadraj, ekran çözünürlüğü ve editör modu sonucu değiştirir. Masaüstü çözünürlük/ışık ayarları düşürülmedi.
- Boyner rotası, 38 mağaza eşleşmesi, kat geçişleri, 2B/gece görünümü ve editör açılışı kontrol edildi. Mobil profil masaüstünde zorlanarak açıldı; gerçek tablet FPS testi değildir.
- Bu değişiklikler kaynak web uygulamasına uygulanmıştır. APK/www dağıtımı için normal `build:www` ve `android:sync` adımları ayrıca çalıştırılmalıdır.

## Grafik ayarları

Sağ üstteki **Ayarlar** düğmesi oyun benzeri görüntü panelini açar. Yüksek FPS, Dengeli ve Yüksek Kalite profilleri; %50–100 çözünürlük, otomatik çözünürlük/hedef FPS, gerçekçi cam, ortam yansımaları, FPS sınırı ve gösterge seçenekleri anında uygulanır. Seçimler bu tarayıcıda saklanır; İlk ayarlara dön düğmesi başlangıç görünümünü geri getirir. FPS hedefi garanti değildir; ekran yenileme hızı ve donanım sınırları geçerlidir. Düşük çözünürlük görüntüyü yumuşatır, cam/yansıma kapatmak malzeme görünümünü değiştirir. Model geometrisi ve mağaza kimlikleri bu ayarlardan etkilenmez.

## Modeldeki gece ampulleri

Adında ayrı kelime olarak `isik` / `ışık` geçen 32 model parçası gece sıcak sarı (#ffbc55) emisyon alır; gündüz özgün emisyon geri yüklenir. Malzemeler birleştirmeden önce ayrıldığı için aynı malzemeyi kullanan diğer nesneler etkilenmez. Yumuşak parlama ve zeminde ışık lekeleri toplu çizilir. Kameranın görüşündeki en yakın ampullere masaüstünde en fazla dört, tablette cihaz profiline göre sınırlı gölgesiz gerçek ışık atanır. Kat kopyasının ışık katmanı görünür kata uyar. Bunlar web sahnesi değişiklikleridir; Blender kaynağı değiştirilmez.

## 7 Ekim 2026 — cam mekân ve kolon güncellemesi

`Merkez_Ankara_Web_Yuksek_FPS.blend` dosyasının 17:23 kaydı yeniden dışa aktarıldı. 37 ek nesne dahil tüm adlar, mesh adları ve dönüşümler doğrulandı; 38 HITBOX korundu. Geometri sadeleştirilmedi: yeni kolonlar zaten 12 üçgen. Eşdeğer malzemeler 197 → 129 olarak birleştirildi, Meshopt ile 98.662 üçgenli model 11.430.008 bayt oldu. Aktif dosya `assets/models/MERKEZ_ANKARA_WEB_UPDATED.glb`; önceki optimize model yükleme yedeği olarak tutuluyor.

Ayarlar → Işık → Gece lambaları aralığı %0–2000 (20 kat). Mevcut kayıtlar geçerli, varsayılan %100. Sarı/mor statik aydınlatma ve ampuller birlikte etkilenir; gündüz ışık çarpanları ayrı kalır. Web arayüzünde maksimum değer, gündüze dönüş ve Boyner rotası kontrol edildi. Sekiz otomatik test geçti. Kaynak Blender dosyasına yazılmadı.
