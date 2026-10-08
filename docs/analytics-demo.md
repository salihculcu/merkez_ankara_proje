# İstatistik demosu ve dil desteği

Panel: `/analytics.html`. Haritada Görünüm → İstatistikler bağlantısı bulunur.
Bu sayfa 3B modeli yüklemez. Tüm sayılar DEMO olarak işaretlenir ve gerçek kullanıcı
olayları toplanmaz. Örnek verinin son günü 7 Ekim 2026'dır; 180 günlük kayıt,
7/30/90 günlük dönem ve aynı uzunluktaki önceki dönem karşılaştırmasını destekler.

## Gerçek veriye geçiş noktası

`src/analytics/DemoAnalytics.js` içindeki `DemoAnalyticsProvider` yerine aynı
`getReport({days, storeId, kioskId})` sözleşmesini uygulayan bir API sağlayıcısı
Dashboard'a verilebilir. Ekran, veri üretiminden ayrıdır. Sonuç şeması:
`mode`, `asOf`, `start`, `end`, `filters`, `summary`, `previous`, `byStore`,
`daily`, `hourly`, `languages`, `kiosks`.

Ölçümün başlangıç olayları mağaza araması/seçimi, başarılı rota oluşturma,
engelsiz rota isteği, kampanya gösterimi/tıklaması ve arayüz dili olabilir.
Zaman, mağaza kimliği, kiosk kimliği ve dil ile sunucu tarafında birleştirilir.
Tekrar gönderilen olaylar bir eventId ile tekilleştirilmelidir. Mağazaya varış,
satış veya gerçek kişi sayısı bu olaylardan çıkarılmaz. Aramadan rotaya oranı
yalnızca aramaya bağlı rota olaylarıyla hesaplanmalıdır.

Gerçek sürümde API, mağaza kullanıcısının yalnızca yetkili olduğu mağazanın
verisini almasını sağlamalıdır. Demo filtresi yetkilendirme yerine geçmez.
CSV dosyası seçili filtrelerin mağaza toplamlarını, dönemini ve DEMO kaynağını içerir.

## Diller

TR, EN, DE, AR, ES, FR, ZH (basitleştirilmiş Çince), JA. Tercih cihazın
`merkez_ankara_language` anahtarında saklanır. Arapçada HTML yönü RTL olur.
Mağaza/marka isimleri çevrilmez. `I18n.js` ortak `t()` ve sayı biçimlendirmeyi
sağlar; arayüzdeki durağan ve sonradan eklenen metinler de güncellenir.
Yeni çeviriler `translations.js` veya `translations-extra.js` içinde sekiz sütunla
eklenir. 3B modele gömülü mağaza tabelaları modelin parçasıdır ve değişmez.

Doğrulama: `node --import ./tests/register-three.mjs --test tests/analytics-languages.test.mjs`.
