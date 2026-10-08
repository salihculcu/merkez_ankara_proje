import { EXTRA_ROWS } from './translations-extra.js?v=1';
// Columns: Turkish | English | German | Arabic | Spanish | French | Simplified Chinese | Japanese.
// Store and brand names are deliberately not translated.
export const LANGUAGE_CODES = ['tr','en','de','ar','es','fr','zh','ja'];
export const LANGUAGE_NAMES = ['Türkçe','English','Deutsch','العربية','Español','Français','简体中文','日本語'];
const rows = `
Dil|Language|Sprache|اللغة|Idioma|Langue|语言|言語
Görünüm|View|Ansicht|العرض|Vista|Vue|视图|表示
Kat ve kamera|Floor and camera|Etage und Kamera|الطابق والكاميرا|Planta y cámara|Étage et caméra|楼层与镜头|フロアとカメラ
Hava ve ışık|Weather and lighting|Wetter und Licht|الطقس والإضاءة|Clima e iluminación|Météo et éclairage|天气与灯光|天候と照明
Yönlendirme|Navigation|Wegführung|الإرشاد|Navegación|Orientation|导航|経路案内
Kat 1 — Etkileşimli Yönlendirme|Floor 1 — Interactive navigation|Etage 1 — Interaktive Wegführung|الطابق 1 — إرشاد تفاعلي|Planta 1 — Navegación interactiva|Étage 1 — Orientation interactive|1层 — 互动导航|1階 — インタラクティブ案内
Kat -1 — deneme|Floor -1 — Preview|Etage -1 — Vorschau|الطابق -1 — معاينة|Planta -1 — Vista previa|Étage -1 — Aperçu|地下1层 — 预览|地下1階 — プレビュー
Kat 1|Floor 1|Etage 1|الطابق 1|Planta 1|Étage 1|1层|1階
Kat -1|Floor -1|Etage -1|الطابق -1|Planta -1|Étage -1|地下1层|地下1階
Kat {n}|Floor {n}|Etage {n}|الطابق {n}|Planta {n}|Étage {n}|{n}层|{n}階
2B|2D|2D|ثنائي الأبعاد|2D|2D|二维|2D
Yağmur|Rain|Regen|مطر|Lluvia|Pluie|下雨|雨
Kış modu|Winter mode|Wintermodus|وضع الشتاء|Modo invierno|Mode hiver|冬季模式|冬モード
Gece|Night|Nacht|ليل|Noche|Nuit|夜间|夜
Gündüz|Day|Tag|نهار|Día|Jour|白天|昼
Engelsiz Rota|Accessible route|Barrierefreie Route|مسار ميسّر|Ruta accesible|Itinéraire accessible|无障碍路线|バリアフリー経路
Engelsiz rota|Accessible route|Barrierefreie Route|مسار ميسّر|Ruta accesible|Itinéraire accessible|无障碍路线|バリアフリー経路
Sunum modu|Presentation mode|Präsentationsmodus|وضع العرض التقديمي|Modo presentación|Mode présentation|演示模式|プレゼンテーション
Edit Mod|Edit mode|Bearbeiten|وضع التحرير|Modo edición|Mode édition|编辑模式|編集モード
Ayarlar|Settings|Einstellungen|الإعدادات|Ajustes|Paramètres|设置|設定
Mağaza Ara|Find a store|Geschäft suchen|ابحث عن متجر|Buscar tienda|Trouver une boutique|查找商店|店舗を探す
Mağaza ara...|Search stores...|Geschäfte suchen...|ابحث عن متجر...|Buscar tiendas...|Rechercher une boutique...|搜索商店…|店舗を検索…
Şu an neredeyim?|Where am I?|Wo bin ich?|أين أنا الآن؟|¿Dónde estoy?|Où suis-je ?|我在哪里？|現在地はどこ？
Rotayı Temizle|Clear route|Route löschen|مسح المسار|Borrar ruta|Effacer l’itinéraire|清除路线|経路をクリア
Tümü|All|Alle|الكل|Todo|Tout|全部|すべて
Sonuç bulunamadı|No results found|Keine Ergebnisse|لا توجد نتائج|Sin resultados|Aucun résultat|未找到结果|結果がありません
Mağaza|Store|Geschäft|متجر|Tienda|Boutique|商店|店舗
Giyim|Fashion|Mode|أزياء|Moda|Mode|服饰|ファッション
Yeme & İçme|Food & drink|Essen & Trinken|مأكولات ومشروبات|Comida y bebida|Restauration|餐饮|飲食
İleri doğru devam edin|Continue straight|Geradeaus weitergehen|تابع السير مباشرة|Sigue recto|Continuez tout droit|继续直行|直進してください
Sağa dönün|Turn right|Rechts abbiegen|انعطف يمينًا|Gira a la derecha|Tournez à droite|向右转|右折してください
Sola dönün|Turn left|Links abbiegen|انعطف يسارًا|Gira a la izquierda|Tournez à gauche|向左转|左折してください
{name} mağazasına ulaştınız|You have arrived at {name}|Sie haben {name} erreicht|لقد وصلت إلى {name}|Has llegado a {name}|Vous êtes arrivé à {name}|您已到达{name}|{name}に到着しました
dk|min|Min.|دقيقة|min|min|分钟|分
m|m|m|م|m|m|米|m
3B model yükleniyor…|Loading 3D model…|3D-Modell wird geladen…|جارٍ تحميل النموذج ثلاثي الأبعاد…|Cargando modelo 3D…|Chargement du modèle 3D…|正在加载三维模型…|3Dモデルを読み込み中…
Sahne hazırlanıyor…|Preparing scene…|Szene wird vorbereitet…|جارٍ تجهيز المشهد…|Preparando escena…|Préparation de la scène…|正在准备场景…|シーンを準備中…
İç mekan yönlendirme|Indoor navigation|Indoor-Navigation|الإرشاد الداخلي|Navegación interior|Orientation intérieure|室内导航|屋内ナビゲーション
Mağazanızı seçin, yolunuz avluda adım adım çizilsin.|Choose a store and follow your route through the courtyard.|Wählen Sie ein Geschäft und folgen Sie Ihrer Route durch den Innenhof.|اختر متجرك واتبع مسارك عبر الساحة خطوة بخطوة.|Elige una tienda y sigue tu ruta por el patio.|Choisissez une boutique et suivez votre itinéraire dans la cour.|选择商店，沿着庭院中的路线前往。|店舗を選び、中庭の経路に沿ってお進みください。
Keşfe başla|Start exploring|Jetzt entdecken|ابدأ الاستكشاف|Empieza a explorar|Commencer la visite|开始探索|探索を始める
Kampanyalar|Promotions|Angebote|العروض|Promociones|Offres|优惠活动|キャンペーン
YAZ KOLEKSİYONUNDA|SUMMER COLLECTION|SOMMERKOLLEKTION|تشكيلة الصيف|COLECCIÓN DE VERANO|COLLECTION ÉTÉ|夏季系列|サマーコレクション
ÖZEL FIRSATLAR|SPECIAL OFFERS|BESONDERE ANGEBOTE|عروض خاصة|OFERTAS ESPECIALES|OFFRES SPÉCIALES|特别优惠|特別オファー
Seçili mağazalarda geçerlidir.|Available at selected stores.|In ausgewählten Geschäften.|متاحة في متاجر مختارة.|Disponible en tiendas seleccionadas.|Dans les boutiques participantes.|适用于指定商店。|対象店舗でご利用いただけます。
Keşfet|Explore|Entdecken|استكشف|Explorar|Découvrir|探索|見る
YENİ SEZON|NEW SEASON|NEUE SAISON|الموسم الجديد|NUEVA TEMPORADA|NOUVELLE SAISON|新季上市|ニューシーズン
%30'A VARAN İNDİRİM|UP TO 30% OFF|BIS ZU 30% RABATT|خصم يصل إلى 30٪|HASTA UN 30% DE DESCUENTO|JUSQU’À −30 %|最高减免30%|最大30%オフ
Boyner'de seçili ürünlerde.|On selected products at Boyner.|Auf ausgewählte Produkte bei Boyner.|على منتجات مختارة لدى Boyner.|En productos seleccionados de Boyner.|Sur une sélection chez Boyner.|适用于Boyner指定商品。|Boynerの対象商品限定。
İncele|View details|Details ansehen|عرض التفاصيل|Ver detalles|Voir les détails|查看详情|詳細を見る
LEZZET MOLASI|A TASTY BREAK|GENUSSPAUSE|استراحة لذيذة|PAUSA DELICIOSA|PAUSE GOURMANDE|美味小憩|おいしいひと休み
KAHVE KEYFİ|COFFEE TIME|KAFFEEZEIT|وقت القهوة|HORA DEL CAFÉ|PAUSE CAFÉ|咖啡时光|コーヒータイム
Yeme & içme katında sizi bekliyor.|Discover the dining floor.|Entdecken Sie die Gastronomie-Etage.|بانتظارك في طابق المطاعم.|Te espera en la planta de restauración.|À découvrir à l’étage restauration.|欢迎前往餐饮楼层。|飲食フロアでお待ちしています。
Gör|View|Ansehen|عرض|Ver|Voir|查看|見る
Tam ekran|Full screen|Vollbild|ملء الشاشة|Pantalla completa|Plein écran|全屏|全画面
Sunumdan çık|Exit presentation|Präsentation beenden|إنهاء العرض|Salir de la presentación|Quitter la présentation|退出演示|プレゼンを終了
GÖRÜNTÜ & PERFORMANS|DISPLAY & PERFORMANCE|BILD & LEISTUNG|العرض والأداء|IMAGEN Y RENDIMIENTO|AFFICHAGE ET PERFORMANCES|显示与性能|画質とパフォーマンス
Ölçülüyor…|Measuring…|Wird gemessen…|جارٍ القياس…|Midiendo…|Mesure en cours…|正在测量…|測定中…
Görüntü|Display|Bild|العرض|Imagen|Affichage|显示|画質
Kalite profili|Quality preset|Qualitätsprofil|إعداد الجودة|Perfil de calidad|Profil de qualité|画质预设|品質プリセット
Tek seçimle görüntü ve hız dengesi.|Balance quality and speed with one choice.|Bild und Geschwindigkeit mit einer Auswahl abstimmen.|وازن بين الجودة والسرعة باختيار واحد.|Equilibra calidad y velocidad con una selección.|Équilibrez qualité et vitesse en un choix.|一键平衡画质与速度。|画質と速度を一度に調整します。
Özel|Custom|Benutzerdefiniert|مخصص|Personalizado|Personnalisé|自定义|カスタム
Yüksek FPS|High FPS|Hohe Bildrate|معدل إطارات مرتفع|FPS altos|FPS élevés|高帧率|高FPS
Dengeli|Balanced|Ausgewogen|متوازن|Equilibrado|Équilibré|均衡|バランス
Yüksek Kalite|High quality|Hohe Qualität|جودة عالية|Alta calidad|Haute qualité|高画质|高品質
Çözünürlük ölçeği|Resolution scale|Auflösungsskalierung|مقياس الدقة|Escala de resolución|Échelle de résolution|分辨率比例|解像度スケール
Otomatik çözünürlük|Adaptive resolution|Adaptive Auflösung|دقة تلقائية|Resolución adaptativa|Résolution adaptative|自适应分辨率|自動解像度
Hedef FPS|Target FPS|Ziel-Bildrate|معدل الإطارات المستهدف|FPS objetivo|FPS cibles|目标帧率|目標FPS
Gerçekçi cam|Realistic glass|Realistisches Glas|زجاج واقعي|Cristal realista|Verre réaliste|真实玻璃|リアルなガラス
Ortam yansımaları|Environment reflections|Umgebungsreflexionen|انعكاسات البيئة|Reflejos ambientales|Reflets ambiants|环境反射|環境反射
FPS sınırı|FPS limit|Bildratenlimit|حد الإطارات|Límite de FPS|Limite de FPS|帧率上限|FPS上限
Sınırsız|Unlimited|Unbegrenzt|بلا حد|Sin límite|Illimité|不限|無制限
FPS göstergesi|FPS counter|Bildratenanzeige|مؤشر الإطارات|Indicador de FPS|Compteur FPS|帧率显示|FPS表示
Işık|Lighting|Beleuchtung|الإضاءة|Iluminación|Éclairage|灯光|照明
Genel parlaklık|Overall brightness|Gesamthelligkeit|السطوع العام|Brillo general|Luminosité globale|整体亮度|全体の明るさ
Ortam ışığı|Ambient light|Umgebungslicht|الإضاءة المحيطة|Luz ambiental|Lumière ambiante|环境光|環境光
Güneş ışığı|Sunlight|Sonnenlicht|ضوء الشمس|Luz solar|Lumière du soleil|阳光|太陽光
Yansıma şiddeti|Reflection intensity|Reflexionsstärke|شدة الانعكاس|Intensidad de reflejos|Intensité des reflets|反射强度|反射の強さ
Gece lambaları|Night lights|Nachtbeleuchtung|الإضاءة الليلية|Luces nocturnas|Éclairage nocturne|夜间灯光|夜間照明
İlk ayarlara dön|Restore defaults|Standard wiederherstellen|استعادة الافتراضي|Restaurar valores|Rétablir les valeurs|恢复默认|初期設定に戻す
Değişiklikler anında uygulanır ve bu cihaza kaydedilir.|Changes apply instantly and are saved on this device.|Änderungen werden sofort angewendet und auf diesem Gerät gespeichert.|تُطبق التغييرات فورًا وتُحفظ على هذا الجهاز.|Los cambios se aplican al instante y se guardan en este dispositivo.|Les changements sont appliqués et enregistrés sur cet appareil.|更改立即生效并保存在此设备上。|変更は即座に適用され、この端末に保存されます。
Uygulandı ve bu cihaza kaydedildi.|Applied and saved on this device.|Angewendet und auf diesem Gerät gespeichert.|تم التطبيق والحفظ على هذا الجهاز.|Aplicado y guardado en este dispositivo.|Appliqué et enregistré sur cet appareil.|已应用并保存到此设备。|適用し、この端末に保存しました。
İlk ayarlara dönüldü.|Defaults restored.|Standard wiederhergestellt.|تمت استعادة الإعدادات الافتراضية.|Valores restaurados.|Valeurs par défaut rétablies.|已恢复默认设置。|初期設定に戻しました。
İstatistikler|Analytics|Statistiken|الإحصاءات|Estadísticas|Statistiques|数据分析|統計
Yönetim paneli|Management dashboard|Verwaltungsübersicht|لوحة الإدارة|Panel de gestión|Tableau de gestion|管理面板|管理ダッシュボード
Genel bakış|Overview|Übersicht|نظرة عامة|Resumen|Vue d’ensemble|概览|概要
Mağaza analizi|Store analysis|Geschäftsanalyse|تحليل المتاجر|Análisis de tiendas|Analyse des boutiques|商店分析|店舗分析
Etkileşim analizi|Engagement analysis|Interaktionsanalyse|تحليل التفاعل|Análisis de interacción|Analyse des interactions|互动分析|インタラクション分析
Raporlar|Reports|Berichte|التقارير|Informes|Rapports|报告|レポート
Haritaya dön|Back to map|Zurück zur Karte|العودة إلى الخريطة|Volver al mapa|Retour à la carte|返回地图|マップに戻る
DEMO VERİ|DEMO DATA|DEM Daten|بيانات تجريبية|DATOS DEMO|DONNÉES DÉMO|演示数据|デモデータ
Bu panel örnek verilerle hazırlanmıştır. Gerçek ziyaretçi ölçümü yapılmaz.|This panel uses sample data. No real visitor measurement is collected.|Dieses Panel verwendet Beispieldaten. Es werden keine echten Besucherdaten erhoben.|تستخدم هذه اللوحة بيانات توضيحية ولا تجمع قياسات حقيقية للزوار.|Este panel usa datos de ejemplo. No se registran mediciones reales de visitantes.|Ce tableau utilise des données fictives. Aucune mesure réelle des visiteurs n’est collectée.|此面板使用示例数据，不收集真实访客数据。|このパネルはサンプルデータを使用し、実際の来訪者計測は行いません。
Ziyaretçi ilgisini anlayın.|Understand visitor interest.|Besucherinteresse verstehen.|افهم اهتمامات الزوار.|Comprende el interés de los visitantes.|Comprenez l’intérêt des visiteurs.|了解访客兴趣。|来訪者の関心を把握。
Aramadan rotaya, mağazalarınızın dijital görünürlüğü.|Your stores’ digital visibility, from searches to routes.|Die digitale Sichtbarkeit Ihrer Geschäfte, von Suchen bis Routen.|حضور متاجرك الرقمي، من البحث إلى المسارات.|La visibilidad digital de tus tiendas, de búsquedas a rutas.|La visibilité numérique de vos boutiques, des recherches aux itinéraires.|从搜索到路线，了解商店的数字曝光。|検索から経路案内まで、店舗のデジタルでの注目度を確認。
Tüm mağazalar|All stores|Alle Geschäfte|جميع المتاجر|Todas las tiendas|Toutes les boutiques|所有商店|すべての店舗
Tüm kiosklar|All kiosks|Alle Kioske|جميع الأكشاك|Todos los kioscos|Toutes les bornes|所有导览机|すべてのキオスク
Son 7 gün|Last 7 days|Letzte 7 Tage|آخر 7 أيام|Últimos 7 días|7 derniers jours|最近7天|過去7日
Son 30 gün|Last 30 days|Letzte 30 Tage|آخر 30 يومًا|Últimos 30 días|30 derniers jours|最近30天|過去30日
Son 90 gün|Last 90 days|Letzte 90 Tage|آخر 90 يومًا|Últimos 90 días|90 derniers jours|最近90天|過去90日
Rapor indir|Download report|Bericht herunterladen|تنزيل التقرير|Descargar informe|Télécharger le rapport|下载报告|レポートをダウンロード
Arama sayısı|Store searches|Suchanfragen|عمليات البحث|Búsquedas|Recherches|搜索次数|検索数
Oluşturulan rota|Routes created|Erstellte Routen|المسارات المنشأة|Rutas creadas|Itinéraires créés|生成路线|作成された経路
Aramadan rotaya|Search-to-route rate|Suche-zu-Route-Rate|نسبة البحث إلى المسار|Tasa de búsqueda a ruta|Taux recherche–itinéraire|搜索转路线率|検索から経路への転換率
Önceki döneme göre|vs. previous period|Zum vorherigen Zeitraum|مقارنة بالفترة السابقة|Frente al período anterior|Par rapport à la période précédente|较上一周期|前期間比
Yeni dönem|New period|Neuer Zeitraum|فترة جديدة|Nuevo período|Nouvelle période|新周期|新期間
Günlük etkileşim|Daily engagement|Tägliche Interaktionen|التفاعل اليومي|Interacción diaria|Interactions quotidiennes|每日互动|日別インタラクション
Aramalar|Searches|Suchen|عمليات البحث|Búsquedas|Recherches|搜索|検索
Rotalar|Routes|Routen|المسارات|Rutas|Itinéraires|路线|経路
En çok aranan mağazalar|Most searched stores|Meistgesuchte Geschäfte|المتاجر الأكثر بحثًا|Tiendas más buscadas|Boutiques les plus recherchées|热门搜索商店|検索数の多い店舗
En çok rota alınan mağazalar|Most routed stores|Geschäfte mit den meisten Routen|المتاجر الأكثر طلبًا للمسارات|Tiendas con más rutas|Boutiques avec le plus d’itinéraires|路线需求最多的商店|経路検索の多い店舗
Saatlik yoğunluk|Hourly activity|Stündliche Aktivität|النشاط حسب الساعة|Actividad por hora|Activité par heure|每小时活跃度|時間帯別の利用状況
Dil tercihleri|Language preferences|Sprachpräferenzen|تفضيلات اللغة|Preferencias de idioma|Préférences linguistiques|语言偏好|言語設定の割合
Mağaza performansı|Store performance|Geschäftsleistung|أداء المتاجر|Rendimiento por tienda|Performance des boutiques|商店表现|店舗別の実績
Kategori|Category|Kategorie|الفئة|Categoría|Catégorie|类别|カテゴリー
Dönüşüm|Conversion|Konversion|التحويل|Conversión|Conversion|转化率|転換率
Kampanya tıklaması|Promotion clicks|Angebotsklicks|نقرات العروض|Clics en promociones|Clics sur les offres|优惠点击|キャンペーンのクリック
Kampanya gösterimi|Promotion impressions|Angebotsanzeigen|مرات عرض العروض|Impresiones de promociones|Affichages des offres|优惠展示|キャンペーン表示数
Tıklama oranı|Click-through rate|Klickrate|نسبة النقر|Tasa de clics|Taux de clics|点击率|クリック率
Engelsiz rota talebi|Accessible route requests|Barrierefreie Routenanfragen|طلبات المسارات الميسّرة|Solicitudes de rutas accesibles|Demandes d’itinéraires accessibles|无障碍路线请求|バリアフリー経路のリクエスト
Kiosk dağılımı|Kiosk breakdown|Kiosk-Verteilung|توزيع الأكشاك|Distribución por kiosco|Répartition par borne|导览机分布|キオスク別内訳
Meydan kiosku|Plaza kiosk|Platz-Kiosk|كشك الساحة|Kiosco de la plaza|Borne de la place|广场导览机|広場キオスク
Giriş kiosku|Entrance kiosk|Eingangs-Kiosk|كشك المدخل|Kiosco de entrada|Borne d’entrée|入口导览机|入口キオスク
Yeme içme kiosku|Dining kiosk|Gastronomie-Kiosk|كشك المطاعم|Kiosco de restauración|Borne restauration|餐饮区导览机|飲食エリアキオスク
İlgi, fiziksel ziyaret veya satış anlamına gelmez.|Interest does not imply a physical visit or a sale.|Interesse bedeutet weder einen Besuch noch einen Kauf.|الاهتمام لا يعني زيارة فعلية أو عملية بيع.|El interés no implica una visita física ni una venta.|L’intérêt ne signifie pas une visite physique ou une vente.|兴趣不代表实际到访或销售。|関心は実際の来店や売上を意味しません。
Filtrelere uygun veri bulunamadı.|No data matches these filters.|Keine Daten für diese Filter.|لا توجد بيانات مطابقة للمرشحات.|No hay datos para estos filtros.|Aucune donnée pour ces filtres.|没有符合筛选条件的数据。|条件に一致するデータがありません。
Filtreleri sıfırla|Reset filters|Filter zurücksetzen|إعادة تعيين المرشحات|Restablecer filtros|Réinitialiser les filtres|重置筛选|フィルターをリセット
CSV raporu|CSV report|CSV-Bericht|تقرير CSV|Informe CSV|Rapport CSV|CSV报告|CSVレポート
Seçili dönem ve mağaza filtreleri rapora uygulanır.|The selected period and store filters apply to the report.|Zeitraum und Geschäftsfilter gelten für den Bericht.|تُطبق مرشحات الفترة والمتجر على التقرير.|El informe aplica los filtros de período y tienda.|Les filtres de période et de boutique s’appliquent au rapport.|报告使用所选时间和商店筛选条件。|選択した期間と店舗の条件がレポートに適用されます。
Veri sözlüğü|Metric definitions|Kennzahlendefinitionen|تعريف المؤشرات|Definición de métricas|Définition des indicateurs|指标说明|指標の定義
Mağaza aramaları, rota talepleri ve kampanya etkileşimleri.|Store searches, route requests and promotion interactions.|Geschäftssuchen, Routenanfragen und Angebotsinteraktionen.|البحث عن المتاجر وطلبات المسارات والتفاعل مع العروض.|Búsquedas, solicitudes de rutas e interacciones con promociones.|Recherches de boutiques, demandes d’itinéraires et interactions avec les offres.|商店搜索、路线请求及优惠互动。|店舗検索、経路リクエスト、キャンペーンへの反応。
Rota oluşturma oranıdır; mağazaya varış ölçümü değildir.|The route creation rate; not a measurement of arrival.|Rate der Routenerstellung; keine Ankunftsmessung.|نسبة إنشاء المسارات، وليست قياسًا للوصول.|Tasa de creación de rutas; no mide llegadas.|Taux de création d’itinéraires, pas de mesure d’arrivée.|路线生成率，并非到店率。|経路作成率であり、到着率ではありません。
Sunum için hazırlanmış tutarlı örnek veriler.|Consistent sample data prepared for presentation.|Konsistente Beispieldaten für die Präsentation.|بيانات توضيحية متسقة أُعدت للعرض.|Datos de ejemplo coherentes para presentaciones.|Données fictives cohérentes pour la présentation.|为演示准备的一致性示例数据。|プレゼンテーション用の整合性のあるサンプルデータ。
Detayları göster|Show details|Details anzeigen|عرض التفاصيل|Mostrar detalles|Afficher les détails|显示详情|詳細を表示
Kapat|Close|Schließen|إغلاق|Cerrar|Fermer|关闭|閉じる
Yönetim|Management|Verwaltung|الإدارة|Gestión|Gestion|管理|管理
Rota bulunamadı. Yol ağı bu mağazaya bağlı olmayabilir.|No route found. This store may not be connected.|Keine Route gefunden. Das Geschäft ist möglicherweise nicht verbunden.|لم يُعثر على مسار. قد لا يكون المتجر متصلاً بالشبكة.|No se encontró una ruta. La tienda puede no estar conectada.|Aucun itinéraire trouvé. La boutique n’est peut-être pas reliée.|未找到路线，此商店可能尚未连接。|経路がありません。店舗が接続されていない可能性があります。
Engelsiz rota bulunamadı. Normal rota gösterilmeye devam ediyor.|No accessible route found. The standard route is still shown.|Keine barrierefreie Route gefunden. Die normale Route bleibt sichtbar.|لم يُعثر على مسار ميسّر. لا يزال المسار العادي معروضًا.|No hay ruta accesible. Se sigue mostrando la ruta normal.|Aucun itinéraire accessible. L’itinéraire normal reste affiché.|未找到无障碍路线，仍显示普通路线。|バリアフリー経路がありません。通常の経路を表示しています。
Paneli kapat|Close panel|Panel schließen|إغلاق اللوحة|Cerrar panel|Fermer le panneau|关闭面板|パネルを閉じる
Ayarları kapat|Close settings|Einstellungen schließen|إغلاق الإعدادات|Cerrar ajustes|Fermer les paramètres|关闭设置|設定を閉じる
Kiosk konumuna yaklaş|Zoom to kiosk|Zum Kiosk zoomen|الاقتراب من الكشك|Acercar al kiosco|Zoomer sur la borne|缩放到导览机|キオスクにズーム
Önceki sahne|Previous scene|Vorherige Szene|المشهد السابق|Escena anterior|Scène précédente|上一个场景|前のシーン
Sonraki sahne|Next scene|Nächste Szene|المشهد التالي|Escena siguiente|Scène suivante|下一个场景|次のシーン
Meydan ve mağaza akslarına genel bakış|Overview of the plaza and retail avenues|Überblick über Platz und Einkaufsachsen|نظرة عامة على الساحة ومحاور المتاجر|Vista de la plaza y los ejes comerciales|Vue de la place et des axes commerciaux|广场及商业街概览|広場と店舗通りの全景
Kiosk ve yönlendirme|Kiosk and navigation|Kiosk und Wegführung|الكشك والإرشاد|Kiosco y navegación|Borne et orientation|导览机与导航|キオスクと案内
Ziyaretçinin başlangıç noktası|The visitor’s starting point|Ausgangspunkt der Besucher|نقطة انطلاق الزائر|Punto de partida del visitante|Point de départ du visiteur|访客起点|来訪者の出発点
Peyzaj ve sosyal alan|Landscape and social spaces|Landschaft und Begegnungsräume|المساحات الخضراء والاجتماعية|Paisaje y espacios sociales|Paysage et espaces de rencontre|景观与公共空间|景観と交流スペース
Açık alanların yaya deneyimi|The outdoor pedestrian experience|Fußgängererlebnis im Freien|تجربة المشاة في المساحات المفتوحة|La experiencia peatonal al aire libre|L’expérience piétonne en plein air|户外步行体验|屋外の歩行体験
Gece aydınlatması|Night lighting|Nachtbeleuchtung|الإضاءة الليلية|Iluminación nocturna|Éclairage nocturne|夜景灯光|夜間のライトアップ
Sıcak yürüyüş ışıkları ve mor asansör vurgusu|Warm pathway lights and purple elevator accents|Warme Wegbeleuchtung und violette Aufzugakzente|إضاءة دافئة للممرات ولمسات بنفسجية للمصعد|Luces cálidas y acentos violetas en el ascensor|Éclairage chaleureux et accents violets de l’ascenseur|温暖步道灯光与紫色电梯照明|暖かな通路照明と紫色のエレベーター照明
Kış mevsimi|Winter season|Wintersaison|موسم الشتاء|Temporada de invierno|Saison hivernale|冬季|冬の季節
Peyzajda kar örtüsü ve hafif yağış|Snow-covered landscaping and gentle snowfall|Verschneite Landschaft und leichter Schneefall|غطاء ثلجي للمساحات الخضراء وتساقط خفيف|Paisaje nevado y nieve suave|Paysage enneigé et neige légère|积雪景观与轻柔降雪|雪に覆われた景観と穏やかな降雪
Projenin genel görünümü|Project overview|Projektübersicht|نظرة عامة على المشروع|Vista general del proyecto|Vue générale du projet|项目概览|プロジェクト全景
`.trim().split('\n');
export const TRANSLATIONS = Object.fromEntries([...rows,...EXTRA_ROWS].map(row => {
  const values = row.split('|');
  if (values.length !== LANGUAGE_CODES.length) throw new Error(`Invalid translation row: ${values[0]}`);
  return [values[0], Object.fromEntries(LANGUAGE_CODES.map((code,index)=>[code,values[index]]))];
}));
