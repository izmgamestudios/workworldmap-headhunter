/**
 * When VITE_API_BASE is set (e.g. https://teknodoz-hmap-proxy.<acct>.workers.dev) all routing and
 * geocoding go through our Cloudflare Worker (cached, rate-limited, quota-safe).
 * Otherwise the public OSRM / Nominatim demo servers are used directly (development only).
 */
const raw = (import.meta.env.VITE_API_BASE as string | undefined)?.trim().replace(/\/+$/, '');

export const PROXY = raw || null;

export const routeUrl = (kind: 'route' | 'trip', coords: string) =>
  PROXY
    ? `${PROXY}/api/${kind}?coords=${coords}`
    : kind === 'route'
      ? `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
      : `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&roundtrip=false&geometries=geojson&overview=false`;

export const geocodeUrl = (q: string) =>
  PROXY
    ? `${PROXY}/api/geocode?q=${encodeURIComponent(q)}`
    : `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
