import { useRef, useState } from 'react';
import type { Place } from '../types';
import { geocode } from '../lib/geocode';
import { parseFile, parseText, type ImportResult } from '../lib/importers';

interface Props {
  onClose: () => void;
  onAdd: (places: Place[]) => void;
}

export default function ImportDialog({ onClose, onAdd }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const cancel = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function finish(res: ImportResult) {
    const added = [...res.places];
    const warnings = [...res.warnings];
    let failed = 0;
    cancel.current = false;
    for (let i = 0; i < res.toGeocode.length; i++) {
      if (cancel.current) break;
      setProgress(`Adresler çözümleniyor ${i + 1}/${res.toGeocode.length}…`);
      const { place, query } = res.toGeocode[i];
      const hit = await geocode(query);
      if (hit) added.push({ ...place, lat: hit.lat, lng: hit.lng, address: place.address || hit.label });
      else failed++;
    }
    if (failed) warnings.push(`${failed} adres bulunamadı ve atlandı.`);
    if (res.skipped) warnings.push(`${res.skipped} satır koordinat/adres içermediği için atlandı.`);
    if (!added.length) {
      setNotes(warnings);
      setError('Haritaya eklenecek geçerli kayıt bulunamadı.');
      return;
    }
    onAdd(added);
    if (warnings.length) {
      setNotes([`${added.length} kayıt eklendi.`, ...warnings]);
    } else onClose();
  }

  async function run(job: () => Promise<ImportResult>) {
    setBusy(true);
    setError('');
    setNotes([]);
    try {
      await finish(await job());
    } catch (e) {
      setError((e as Error).message || 'İçe aktarma başarısız.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className="overlay no-print" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="İçe aktar">
        <header>
          <h2>İçe Aktar</h2>
          <button className="icon" onClick={onClose} aria-label="Kapat" disabled={busy}>×</button>
        </header>

        <div
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f && !busy) run(() => parseFile(f));
          }}
          onClick={() => !busy && fileInput.current?.click()}
        >
          <strong>Dosyayı sürükleyin ya da seçin</strong>
          <span>.csv · .xlsx · .json · .geojson · .kml (Google My Maps) · .hmap</span>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.geojson,.kml,.kmz,.hmap"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) run(() => parseFile(f));
            }}
          />
        </div>

        <label className="field">
          <span>Hızlı yapıştır — Google Maps URL'si, "enlem, boylam", adres (her satıra bir kayıt) ya da CSV/JSON</span>
          <textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'https://www.google.com/maps/place/…/@41.0082,28.9784,17z\n41.0370, 28.9850\nİstiklal Cad. No:10, Beyoğlu, İstanbul'}
          />
        </label>
        <p className="hint">
          Kısa linkler (maps.app.goo.gl) tarayıcıdan çözülemez; linki açıp adres çubuğundaki tam URL'yi yapıştırın. Koordinatsız satırlar
          adresten otomatik konumlandırılır (OpenStreetMap, ~1 sn/kayıt).
        </p>

        {progress && <p className="status-line">{progress}</p>}
        {error && <p className="error">{error}</p>}
        {notes.length > 0 && (
          <ul className="notes">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}

        <footer>
          {busy ? (
            <button onClick={() => (cancel.current = true)}>Durdur</button>
          ) : (
            <button onClick={onClose}>Kapat</button>
          )}
          <button className="primary" disabled={busy || !text.trim()} onClick={() => run(async () => parseText(text))}>
            Yapıştırılanı ekle
          </button>
        </footer>
      </div>
    </div>
  );
}
