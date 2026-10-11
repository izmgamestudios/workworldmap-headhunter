import { validCoord } from './geo';
import { PROXY, geocodeUrl } from './api';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

/** Nominatim (OSM) geocoder; the public instance allows 1 request/second. */
export async function geocode(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  // the public Nominatim allows 1 req/s; our proxy caches and rate-limits itself
  const wait = PROXY ? 0 : last + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  try {
    const res = await fetch(geocodeUrl(query), PROXY ? undefined : { headers: { 'Accept-Language': 'tr' } });
    if (!res.ok) return null;
    const [hit] = await res.json();
    if (!hit) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    return validCoord(lat, lng) ? { lat, lng, label: hit.display_name as string } : null;
  } catch {
    return null;
  }
}
