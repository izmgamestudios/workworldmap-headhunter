# Teknodoz HMAP · Headhunter

Yetenek, meslek ve işletme avcılığı için harita tabanlı saha planlayıcı (React + TypeScript + Vite + Leaflet).

- **Karayolu rotası:** OSRM ile gerçek yol geometrisi, durak arası km/süre, "en kısa sıraya diz". Servis erişilemezse kırmızı kesikli kuş uçuşu tahmini gösterilir ve uyarı verilir.
- **İçe aktarma:** CSV, XLSX, JSON/GeoJSON, KML (Google My Maps), `.hmap`, Google Maps tam URL'si, `enlem, boylam`, adres (Nominatim ile konumlandırılır). Türkçe/İngilizce kolon adları otomatik eşlenir.
- **Harita üzerinde düzenleme:** tıklayarak ekle, işaretçiyi sürükleyerek konum değiştir, detay formu, sil, rota sırasını sürükle-bırak.
- **Headhunter alanları:** meslek/rol, yetenekler, sektör, durum (Radar → İletişim → Mülakat → Anlaşıldı), iletişim, notlar; filtreleme ve durum ilerleme çubuğu.
- **Çıktı:** önizleme sayfası → PDF/Yazdır (tarayıcı), PNG, Google Maps çoklu durak linkleri (10 durağı aşınca otomatik bölünür), `.hmap` ve CSV kaydet.

```bash
npm install
npm run dev     # geliştirme
npm run build   # tip kontrolü + üretim derlemesi
```

Notlar: `.xls` ve `.kmz` desteklenmez (xlsx/csv/kml olarak kaydedin). `maps.app.goo.gl` kısa linkleri tarayıcıdan çözülemez; tam URL gerekir.
Genel OSRM ve Nominatim sunucuları demo amaçlıdır; yoğun kullanımda kendi OSRM'inizi (`src/lib/routing.ts`) kullanın.
