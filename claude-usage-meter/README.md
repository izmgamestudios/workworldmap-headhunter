# Claude Usage Meter

Claude.ai Pro kota kullanımını (5 saatlik oturum + haftalık limit) toolbar rozetinde ve popup'ta anlık gösteren Manifest V3 eklentisi.

## Özellikler

| Özellik | Detay |
|---|---|
| Badge | 5 saatlik oturum yüzdesi; yeşil < %60, turuncu < %85, kırmızı ≥ %85 |
| Popup | Oturum / haftalık (tüm modeller) / Opus / Sonnet çubukları + canlı geri sayım |
| Yenileme | Arka planda dakikada bir, popup açıkken 30 sn'de bir, ↻ ile anında |
| Bildirim | Oturum ve haftalık limit %80 ve %95'i geçince (her sıfırlama penceresinde bir kez) |
| Gizlilik | Sadece `claude.ai`'ye, mevcut oturum çerezinle istek atar. Üçüncü taraf sunucu yok, analitik yok |

## Kurulum (Chrome / Edge / Brave)

1. `chrome://extensions` → **Developer mode** aç
2. **Load unpacked** → bu `claude-usage-meter/` klasörünü seç
3. claude.ai'de giriş yapmış ol; rozet birkaç saniyede dolar

Firefox (121+): `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `manifest.json`.

## Nasıl çalışır

- `GET /api/organizations` → org UUID (cache'lenir)
- `GET /api/organizations/{uuid}/usage` → `{ five_hour: { utilization, resets_at }, seven_day: {...}, ... }`
- `utilization` içeren her anahtar otomatik meter olur; Anthropic yeni limit türü eklerse kod değişmeden görünür.

## Bilinmesi gerekenler

- Endpoint **resmi/dokümante değil**; Settings > Usage sayfasının kullandığı iç API. Şema değişirse popup "Veri alınamadı" gösterir ve son başarılı veriyi tutar. Düzeltme yalnızca `normalize()` içinde olur.
- `utilization` 0–100 yüzde kabul edilir.
- Giriş yoksa rozette `!`, geçici hata/şema değişiminde `?` görünür.
