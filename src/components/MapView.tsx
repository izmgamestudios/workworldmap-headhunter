import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toPng } from 'html-to-image';
import type { Place, RouteResult } from '../types';
import { STATUS_META } from '../types';

export interface MapApi {
  fitAll: () => void;
  /** fits the route (or all places), waits for tiles, returns a PNG data URL */
  snapshot: () => Promise<string>;
}

interface Props {
  places: Place[];
  routeIds: string[];
  route: RouteResult | null;
  selectedId: string | null;
  addMode: boolean;
  onSelect: (id: string | null) => void;
  onMapClick: (lat: number, lng: number) => void;
  onMove: (id: string, lat: number, lng: number) => void;
}

function markerIcon(color: string, order: number | null, selected: boolean) {
  const label = order != null ? String(order) : '';
  return L.divIcon({
    className: 'tk-pin-wrap',
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    html: `<div class="tk-pin${selected ? ' sel' : ''}" style="--c:${color}"><span>${label}</span></div>`,
  });
}

const MapView = forwardRef<MapApi, Props>(function MapView(props, ref) {
  const { places, routeIds, route, selectedId, addMode, onSelect, onMapClick, onMove } = props;
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const line = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onSelect, onMapClick, onMove, addMode });
  cb.current = { onSelect, onMapClick, onMove, addMode };
  const latest = useRef({ places, routeIds, route });
  latest.current = { places, routeIds, route };

  const fit = () => {
    const m = map.current;
    if (!m) return;
    const { places: ps, routeIds: ids, route: r } = latest.current;
    const pts: L.LatLngExpression[] =
      r && r.geometry.length ? r.geometry : (ids.length ? ps.filter((p) => ids.includes(p.id)) : ps).map((p) => [p.lat, p.lng]);
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 15 });
  };

  useImperativeHandle(ref, () => ({
    fitAll: fit,
    snapshot: async () => {
      const m = map.current!;
      fit();
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        m.once('moveend', () => setTimeout(finish, 1200));
        setTimeout(finish, 3500);
      });
      return toPng(host.current!, {
        pixelRatio: 1.5,
        cacheBust: true,
        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        filter: (n) => !(n instanceof HTMLElement && n.classList.contains('leaflet-control-container')),
      });
    },
  }));

  useEffect(() => {
    const m = L.map(host.current!, { zoomControl: false, center: [39, 35], zoom: 6 });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: 'anonymous',
      attribution: '© OpenStreetMap · Rota: OSRM',
    }).addTo(m);
    markers.current = L.layerGroup().addTo(m);
    line.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.addMode) cb.current.onMapClick(e.latlng.lat, e.latlng.lng);
      else cb.current.onSelect(null);
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current!);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    host.current?.classList.toggle('adding', addMode);
  }, [addMode]);

  useEffect(() => {
    const g = markers.current;
    if (!g) return;
    g.clearLayers();
    for (const p of places) {
      const order = routeIds.indexOf(p.id);
      const mk = L.marker([p.lat, p.lng], {
        icon: markerIcon(STATUS_META[p.status].color, order >= 0 ? order + 1 : null, p.id === selectedId),
        draggable: true,
        zIndexOffset: p.id === selectedId ? 1000 : order >= 0 ? 500 : 0,
      });
      const tip = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = p.name || 'İsimsiz';
      tip.appendChild(b);
      const sub = [p.role, p.sector].filter(Boolean).join(' · ');
      if (sub) {
        tip.appendChild(document.createElement('br'));
        tip.appendChild(document.createTextNode(sub));
      }
      mk.bindTooltip(tip, { direction: 'top', offset: [0, -30] });
      mk.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        cb.current.onSelect(p.id);
      });
      mk.on('dragend', () => {
        const ll = mk.getLatLng();
        cb.current.onMove(p.id, ll.lat, ll.lng);
      });
      mk.addTo(g);
    }
  }, [places, routeIds, selectedId]);

  useEffect(() => {
    const g = line.current;
    if (!g) return;
    g.clearLayers();
    if (route && route.geometry.length > 1) {
      if (route.road) {
        L.polyline(route.geometry, { color: '#0b1220', weight: 8, opacity: 0.55 }).addTo(g);
        L.polyline(route.geometry, { color: '#22d3ee', weight: 5, opacity: 0.95 }).addTo(g);
      } else {
        L.polyline(route.geometry, { color: '#f87171', weight: 3, dashArray: '8 8' }).addTo(g);
      }
    }
  }, [route]);

  return <div ref={host} className="map-host" />;
});

export default MapView;
