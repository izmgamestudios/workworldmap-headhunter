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

## Cloudflare proxy (OSRM + geocoding)

`worker/` içindeki Cloudflare Worker, uygulamanın rota ve adres sorgularını cache'leyip korur:
`GET /api/route`, `/api/trip`, `/api/geocode` (CORS allowlist, koordinat/sorgu doğrulama, Cache API, opsiyonel IP başına rate limit).

```bash
cd worker && npm install
# wrangler.toml: ALLOWED_ORIGINS (uygulama adresiniz), USER_AGENT (iletişim e-postası), üretimde OSRM_URL
npx wrangler login && npm run deploy
```

Ardından uygulamayı proxy'ye bağlayın (`.env` veya Cloudflare Pages değişkeni): `VITE_API_BASE=https://teknodoz-hmap-proxy.<hesap>.workers.dev`.
Değişken boşsa uygulama doğrudan genel demo sunucularını kullanır (yalnızca geliştirme).
Üretim için kendi OSRM'inizi (Docker: `ghcr.io/project-osrm/osrm-backend`) `OSRM_URL`'e verin; genel demo sunucusunun kullanım koşulları ticari trafiğe uygun değildir.

## Supabase (ekip çalışması temeli)

`supabase/migrations/` ekip çalışma alanı şemasını içerir: `teams`, `team_members` (owner/editor/viewer), `places`, `routes` ve RLS politikaları.
Kayıt kimlikleri UUID'dir, yerel `.hmap` verisi doğrudan eşlenebilir. RLS senaryoları (yabancı erişimi, izleyici yazma, yetki yükseltme, forged owner) PGlite ile test edildi.
Henüz uygulamaya bağlı değildir: bir sonraki sprint = giriş (Supabase Auth) + `places`/`routes` senkronu + Realtime.

Notlar: `.xls` ve `.kmz` desteklenmez (xlsx/csv/kml olarak kaydedin). `maps.app.goo.gl` kısa linkleri tarayıcıdan çözülemez; tam URL gerekir.
Genel OSRM ve Nominatim sunucuları demo amaçlıdır; yoğun kullanımda kendi OSRM'inizi (`src/lib/routing.ts`) kullanın.
