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

## Çok kata hazırlık

Şema baştan çok katlıdır: her düğümde `floor`, dikey bağlantılarda `elevator | escalator | stairs`
kenar tipleri ve `oneWay` desteği vardır. İkinci kat eklendiğinde aynı GLB'ye kat mesh'leri,
grafiğe de `ELEV_A_F1 ↔ ELEV_A_F2` gibi kenarlar eklemek yeterlidir; engelsiz mod filtresi
merdiven/yürüyen merdiveni otomatik eler.
