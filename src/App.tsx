import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type MapApi } from './components/MapView';
import PlaceForm from './components/PlaceForm';
import ImportDialog from './components/ImportDialog';
import Preview from './components/Preview';
import type { Filters, HuntStatus, Place, RouteResult } from './types';
import { KIND_META, STATUS_META } from './types';
import { emptyPlace, fmtDuration, fmtKm } from './lib/geo';
import { optimizeOrder, routeByRoad } from './lib/routing';
import { googleDirLinks } from './lib/gmaps';
import { parseHmap, serializeHmap } from './lib/hmap';
import { download, placesToCsv, stamp } from './lib/export';

const STORE = 'teknodoz-hmap-v1';
type Tab = 'places' | 'route' | 'detail';

const NO_FILTER: Filters = { q: '', kind: 'all', status: 'all', sector: '', skill: '' };

function loadStore(): { places: Place[]; route: string[] } {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return parseHmap(raw);
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return { places: [], route: [] };
}

export default function App() {
  const initial = useMemo(loadStore, []);
  const [places, setPlaces] = useState<Place[]>(initial.places);
  const [routeIds, setRouteIds] = useState<string[]>(initial.route);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tabRaw, setTab] = useState<Tab>('places');
  const [addMode, setAddMode] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [preview, setPreview] = useState<{ image: string | null } | null>(null);
  const [reportTitle, setReportTitle] = useState('Saha Güzergahı');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const mapApi = useRef<MapApi>(null);
  const openInput = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const stops = useMemo(() => routeIds.map((id) => byId.get(id)).filter((p): p is Place => !!p), [routeIds, byId]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const tab: Tab = tabRaw === 'detail' && !selected ? 'places' : tabRaw;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  // persistence
  useEffect(() => {
    try {
      localStorage.setItem(STORE, serializeHmap(places, routeIds));
    } catch {
      /* quota / private mode */
    }
  }, [places, routeIds]);

  // road routing (debounced; re-run only when stop order/positions change)
  const routeKey = stops.map((s) => `${s.id}:${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join('|');
  useEffect(() => {
    if (stops.length < 2) {
      setRoute(null);
      setRouting(false);
      return;
    }
    const ac = new AbortController();
    setRouting(true);
    const t = setTimeout(() => {
      routeByRoad(stops, ac.signal)
        .then((r) => {
          setRoute(r);
          setRouting(false);
        })
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  // filtering
  const sectors = useMemo(() => [...new Set(places.map((p) => p.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [places]);
  const skills = useMemo(() => [...new Set(places.flatMap((p) => p.skills))].sort((a, b) => a.localeCompare(b, 'tr')), [places]);
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLocaleLowerCase('tr');
    return places.filter(
      (p) =>
        (filters.kind === 'all' || p.kind === filters.kind) &&
        (filters.status === 'all' || p.status === filters.status) &&
        (!filters.sector || p.sector === filters.sector) &&
        (!filters.skill || p.skills.includes(filters.skill)) &&
        (!q || [p.name, p.role, p.sector, p.contact, p.address, p.notes, ...p.skills].join(' ').toLocaleLowerCase('tr').includes(q)),
    );
  }, [places, filters]);
  const visible = useMemo(() => {
    const ids = new Set(filtered.map((p) => p.id));
    return places.filter((p) => ids.has(p.id) || routeIds.includes(p.id));
  }, [places, filtered, routeIds]);
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTER);

  const stats = useMemo(() => {
    const c: Record<HuntStatus, number> = { radar: 0, contacted: 0, interview: 0, closed: 0 };
    places.forEach((p) => c[p.status]++);
    return c;
  }, [places]);

  // actions
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setTab('detail');
  }, []);

  const updatePlace = (p: Place) => setPlaces((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  const movePlace = useCallback(
    (id: string, lat: number, lng: number) => setPlaces((ps) => ps.map((x) => (x.id === id ? { ...x, lat, lng } : x))),
    [],
  );
  const deletePlace = (id: string) => {
    setPlaces((ps) => ps.filter((p) => p.id !== id));
    setRouteIds((r) => r.filter((x) => x !== id));
    setSelectedId(null);
    setTab('places');
  };
  const toggleRoute = (id: string) => setRouteIds((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  const addAt = useCallback((lat: number, lng: number) => {
    const p = emptyPlace(lat, lng);
    setPlaces((ps) => [...ps, p]);
    setSelectedId(p.id);
    setTab('detail');
    setAddMode(false);
  }, []);

  const addImported = (list: Place[]) => {
    setPlaces((ps) => [...ps, ...list]);
    setTab('places');
    setTimeout(() => mapApi.current?.fitAll(), 50);
    flash(`${list.length} kayıt eklendi`);
  };

  async function openHmap(file: File) {
    try {
      const { places: ps, route: r } = parseHmap(await file.text());
      if (places.length && !window.confirm('Mevcut çalışma değiştirilsin mi? (Kaydetmediyseniz kaybolur)')) return;
      setPlaces(ps);
      setRouteIds(r);
      setSelectedId(null);
      setFilters(NO_FILTER);
      setTimeout(() => mapApi.current?.fitAll(), 50);
      flash(`${ps.length} kayıt açıldı`);
    } catch (e) {
      window.alert((e as Error).message || '.hmap dosyası okunamadı.');
    }
  }

  async function optimize() {
    if (stops.length < 3) return;
    setBusy('Rota optimize ediliyor…');
    try {
      const ordered = await optimizeOrder(stops);
      setRouteIds(ordered.map((p) => p.id));
      flash('Duraklar en kısa karayolu sırasına dizildi (ilk durak sabit)');
    } catch {
      flash('Optimizasyon servisine ulaşılamadı');
    } finally {
      setBusy('');
    }
  }

  async function openPreview() {
    setBusy('Harita görüntüsü hazırlanıyor…');
    let image: string | null = null;
    try {
      image = (await mapApi.current?.snapshot()) ?? null;
    } catch {
      image = null;
    }
    setBusy('');
    setPreview({ image });
  }

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= routeIds.length) return;
    setRouteIds((r) => {
      const next = [...r];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };

  const links = googleDirLinks(stops);
  const closedPct = places.length ? Math.round((stats.closed / places.length) * 100) : 0;

  return (
    <>
      <div className="app-shell no-print">
        <header className="topbar">
          <div className="brand">
            <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
              <path d="M16 3a9 9 0 0 0-9 9c0 7 9 17 9 17s9-10 9-17a9 9 0 0 0-9-9Z" fill="#22d3ee" />
              <circle cx="16" cy="12" r="3.5" fill="#0b1220" />
            </svg>
            <div>
              <b>Teknodoz HMAP</b>
              <small>Headhunter · yetenek & işletme avcılığı</small>
            </div>
          </div>
          <div className="row wrap actions">
            <button className="primary" onClick={() => setShowImport(true)}>İçe aktar</button>
            <button className={addMode ? 'on' : ''} onClick={() => setAddMode((a) => !a)}>
              {addMode ? 'Haritaya tıklayın… (iptal)' : '+ Nokta ekle'}
            </button>
            <button onClick={() => openInput.current?.click()}>.hmap aç</button>
            <input ref={openInput} type="file" accept=".hmap,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openHmap(f); }} />
            <button disabled={!places.length} onClick={() => download(`teknodoz-${stamp()}.hmap`, serializeHmap(places, routeIds), 'application/json')}>.hmap kaydet</button>
            <button disabled={!places.length} onClick={() => download(`teknodoz-${stamp()}.csv`, placesToCsv(places), 'text/csv')}>CSV</button>
            <button className="accent" disabled={stops.length < 2 || !!busy} onClick={openPreview}>Önizleme & Çıktı</button>
          </div>
        </header>

        <div className="body">
          <aside className="side">
            <nav className="tabs">
              <button className={tab === 'places' ? 'on' : ''} onClick={() => setTab('places')}>Noktalar <i>{places.length}</i></button>
              <button className={tab === 'route' ? 'on' : ''} onClick={() => setTab('route')}>Rota <i>{stops.length}</i></button>
              <button className={tab === 'detail' ? 'on' : ''} disabled={!selected} onClick={() => setTab('detail')}>Detay</button>
            </nav>

            {tab === 'places' && (
              <div className="pane">
                {places.length > 0 && (
                  <div className="stats">
                    <div className="meter" title={`Anlaşılan: %${closedPct}`}><div style={{ width: `${closedPct}%` }} /></div>
                    <div className="statrow">
                      {(Object.keys(STATUS_META) as HuntStatus[]).map((s) => (
                        <button key={s} className={filters.status === s ? 'on' : ''} onClick={() => setFilters((f) => ({ ...f, status: f.status === s ? 'all' : s }))}>
                          <i style={{ background: STATUS_META[s].color }} />
                          {stats[s]}
                          <span>{STATUS_META[s].label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="filters">
                  <input placeholder="Ara: isim, meslek, yetenek…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
                  <div className="row">
                    <select value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as Filters['kind'] })}>
                      <option value="all">Tüm tipler</option>
                      {(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
                    </select>
                    <select value={filters.sector} onChange={(e) => setFilters({ ...filters, sector: e.target.value })}>
                      <option value="">Tüm sektörler</option>
                      {sectors.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <select value={filters.skill} onChange={(e) => setFilters({ ...filters, skill: e.target.value })}>
                    <option value="">Tüm yetenekler</option>
                    {skills.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  {filtering && (
                    <div className="row between">
                      <small>{filtered.length} / {places.length} kayıt</small>
                      <div className="row">
                        <button className="mini" onClick={() => setRouteIds((r) => [...r, ...filtered.map((p) => p.id).filter((id) => !r.includes(id))])}>Hepsini rotaya ekle</button>
                        <button className="mini" onClick={() => setFilters(NO_FILTER)}>Temizle</button>
                      </div>
                    </div>
                  )}
                </div>

                {places.length === 0 ? (
                  <div className="empty">
                    <p>Henüz kayıt yok.</p>
                    <p>Dosya/URL içe aktarın ya da <b>+ Nokta ekle</b> ile haritaya tıklayın.</p>
                  </div>
                ) : (
                  <ul className="list">
                    {filtered.map((p) => (
                      <li key={p.id} className={p.id === selectedId ? 'sel' : ''}>
                        <button className="item" onClick={() => select(p.id)}>
                          <i style={{ background: STATUS_META[p.status].color }} />
                          <span>
                            <b>{p.name || 'İsimsiz'}</b>
                            <small>{[p.role, p.sector].filter(Boolean).join(' · ') || KIND_META[p.kind].label}</small>
                          </span>
                        </button>
                        <button className={`mini ${routeIds.includes(p.id) ? 'on' : ''}`} onClick={() => toggleRoute(p.id)} title="Rotaya ekle/çıkar" aria-label="Rotaya ekle veya çıkar">
                          {routeIds.includes(p.id) ? `#${routeIds.indexOf(p.id) + 1}` : '+'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'route' && (
              <div className="pane">
                {stops.length === 0 ? (
                  <div className="empty"><p>Rota boş.</p><p>Noktalar sekmesinden <b>+</b> ile durak ekleyin.</p></div>
                ) : (
                  <>
                    <div className="summary">
                      <div><b>{stops.length}</b><span>durak</span></div>
                      <div><b>{route ? fmtKm(route.distance) : '—'}</b><span>karayolu</span></div>
                      <div><b>{route ? fmtDuration(route.duration) : '—'}</b><span>sürüş</span></div>
                    </div>
                    {routing && <p className="status-line">Karayolu hesaplanıyor…</p>}
                    {route && !route.road && !routing && (
                      <p className="warn">Rota servisine ulaşılamadı; kırmızı kesikli çizgi kuş uçuşu tahmindir.</p>
                    )}
                    <ol className="route">
                      {stops.map((p, i) => (
                        <li
                          key={p.id}
                          draggable
                          className={dragIdx === i ? 'drag' : ''}
                          onDragStart={() => setDragIdx(i)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (dragIdx != null) reorder(dragIdx, i); setDragIdx(null); }}
                          onDragEnd={() => setDragIdx(null)}
                        >
                          {i > 0 && route?.legs[i - 1] && <div className="leg">↓ {fmtKm(route.legs[i - 1].distance)} · {fmtDuration(route.legs[i - 1].duration)}</div>}
                          <div className="stop">
                            <span className="grip" aria-hidden="true">⋮⋮</span>
                            <button className="item" onClick={() => select(p.id)}>
                              <em>{i + 1}</em>
                              <span><b>{p.name || 'İsimsiz'}</b><small>{[p.role, p.sector].filter(Boolean).join(' · ')}</small></span>
                            </button>
                            <button className="mini" onClick={() => reorder(i, i - 1)} disabled={i === 0} aria-label="Yukarı taşı">↑</button>
                            <button className="mini" onClick={() => reorder(i, i + 1)} disabled={i === stops.length - 1} aria-label="Aşağı taşı">↓</button>
                            <button className="mini" onClick={() => toggleRoute(p.id)} aria-label="Rotadan çıkar">×</button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <div className="row wrap">
                      <button onClick={optimize} disabled={stops.length < 3 || !!busy}>En kısa sıraya diz</button>
                      <button onClick={() => setRouteIds([...routeIds].reverse())}>Ters çevir</button>
                      <button onClick={() => setRouteIds([])}>Temizle</button>
                    </div>
                    <div className="gm">
                      {links.map((l) => (
                        <a key={l.url} className="btn primary" href={l.url} target="_blank" rel="noopener noreferrer">
                          Google Haritalar'da aç{links.length > 1 ? ` (${l.label})` : ''}
                        </a>
                      ))}
                    </div>
                    <p className="hint">Sürükleyerek veya ↑↓ ile sırayı değiştirin. "En kısa sıraya diz" ilk durağı başlangıç kabul eder.</p>
                  </>
                )}
              </div>
            )}

            {tab === 'detail' && selected && (
              <div className="pane">
                <PlaceForm
                  place={selected}
                  inRoute={routeIds.includes(selected.id)}
                  onChange={updatePlace}
                  onDelete={() => deletePlace(selected.id)}
                  onToggleRoute={() => toggleRoute(selected.id)}
                  onClose={() => { setSelectedId(null); setTab('places'); }}
                />
              </div>
            )}
          </aside>

          <main className="mapwrap">
            <MapView
              ref={mapApi}
              places={visible}
              routeIds={routeIds}
              route={route}
              selectedId={selectedId}
              addMode={addMode}
              onSelect={select}
              onMapClick={addAt}
              onMove={movePlace}
            />
            <button className="fit" onClick={() => mapApi.current?.fitAll()}>Tümünü sığdır</button>
            {addMode && <div className="banner">Yeni kayıt için haritaya tıklayın</div>}
            {(busy || toast) && <div className="toast" role="status">{busy || toast}</div>}
          </main>
        </div>
      </div>

      {showImport && <ImportDialog onClose={() => setShowImport(false)} onAdd={addImported} />}
      {preview && (
        <Preview stops={stops} route={route} mapImage={preview.image} title={reportTitle} onTitle={setReportTitle} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
