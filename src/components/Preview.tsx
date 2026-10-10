import { Fragment, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { Place, RouteResult } from '../types';
import { KIND_META, STATUS_META } from '../types';
import { fmtDuration, fmtKm } from '../lib/geo';
import { googleDirLinks, googlePlaceLink } from '../lib/gmaps';
import { download, stamp } from '../lib/export';

interface Props {
  stops: Place[];
  route: RouteResult | null;
  mapImage: string | null;
  title: string;
  onTitle: (t: string) => void;
  onClose: () => void;
}

export default function Preview({ stops, route, mapImage, title, onTitle, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const links = googleDirLinks(stops);

  async function savePng() {
    if (!sheet.current) return;
    setBusy(true);
    try {
      const url = await toPng(sheet.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      const blob = await (await fetch(url)).blob();
      download(`teknodoz-guzergah-${stamp()}.png`, blob);
    } catch {
      window.alert('PNG oluşturulamadı. "PDF / Yazdır" seçeneğini deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="preview-overlay">
      <div className="preview-bar no-print">
        <strong>Önizleme · Güzergah Raporu</strong>
        <input className="title-input" value={title} onChange={(e) => onTitle(e.target.value)} aria-label="Rapor başlığı" />
        <div className="row">
          <button className="primary" onClick={() => window.print()}>PDF / Yazdır</button>
          <button onClick={savePng} disabled={busy}>{busy ? 'Hazırlanıyor…' : 'PNG indir'}</button>
          <button onClick={onClose}>Kapat</button>
        </div>
      </div>

      <div className="sheet-scroll">
        <div className="sheet" ref={sheet}>
          <header className="sheet-head">
            <div>
              <div className="brand-line">TEKNODOZ · HMAP</div>
              <h1>{title || 'Saha Güzergahı'}</h1>
              <div className="muted">{new Date().toLocaleDateString('tr-TR', { dateStyle: 'long' })}</div>
            </div>
            <div className="totals">
              <div><b>{stops.length}</b><span>durak</span></div>
              <div><b>{route ? fmtKm(route.distance) : '—'}</b><span>karayolu</span></div>
              <div><b>{route ? fmtDuration(route.duration) : '—'}</b><span>sürüş</span></div>
            </div>
          </header>

          {route && !route.road && (
            <p className="warn">Rota servisine ulaşılamadı: mesafe/süre kuş uçuşu tahminidir. Kesin güzergah için Google Maps bağlantılarını kullanın.</p>
          )}

          {mapImage ? <img className="sheet-map" src={mapImage} alt="Güzergah haritası" /> : <p className="muted">Harita görüntüsü oluşturulamadı.</p>}

          {links.length > 0 && (
            <section>
              <h2>Google Maps Yönlendirmesi</h2>
              <ul className="links">
                {links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} — Google Haritalar'da aç</a>
                    <code>{l.url}</code>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2>Duraklar</h2>
            <table>
              <thead>
                <tr><th>#</th><th>Kayıt</th><th>Detay</th><th>İletişim / Adres</th></tr>
              </thead>
              <tbody>
                {stops.map((p, i) => {
                  const leg = i > 0 ? route?.legs[i - 1] : undefined;
                  return (
                    <Fragment key={p.id}>
                      {leg && (
                        <tr className="leg">
                          <td colSpan={4}>↓ {fmtKm(leg.distance)} · {fmtDuration(leg.duration)}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="num">{i + 1}</td>
                        <td>
                          <b>{p.name || 'İsimsiz'}</b>
                          <div className="muted">{KIND_META[p.kind].label}</div>
                          <span className="chip" style={{ borderColor: STATUS_META[p.status].color }}>{STATUS_META[p.status].label}</span>
                        </td>
                        <td>
                          {p.role && <div>{p.role}</div>}
                          {p.sector && <div className="muted">{p.sector}</div>}
                          {p.skills.length > 0 && <div className="skills">{p.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
                          {p.notes && <div className="note">{p.notes}</div>}
                        </td>
                        <td>
                          {p.contact && <div>{p.contact}</div>}
                          {p.address && <div className="muted">{p.address}</div>}
                          <a href={googlePlaceLink(p)} target="_blank" rel="noopener noreferrer" className="mono small">
                            {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                          </a>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>

          <footer className="sheet-foot">Teknodoz HMAP · Harita © OpenStreetMap katkıda bulunanlar · Rota: OSRM</footer>
        </div>
      </div>
    </div>
  );
}
