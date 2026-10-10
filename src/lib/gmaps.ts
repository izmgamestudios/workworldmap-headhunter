import type { Place } from '../types';
import { validCoord } from './geo';

export interface ParsedLink {
  lat: number;
  lng: number;
  name?: string;
}

const num = (s: string) => parseFloat(s);

/**
 * Extracts coordinates (and place name when present) from a full Google Maps URL.
 * Short links (maps.app.goo.gl, goo.gl/maps) cannot be resolved in the browser (CORS) and return null.
 */
export function parseGoogleMapsUrl(raw: string): ParsedLink | null {
  const text = raw.trim();
  let decoded = text;
  try {
    decoded = decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    /* keep raw */
  }
  const name = decoded.match(/\/maps\/place\/([^/@?]+)/)?.[1]?.trim();

  const patterns: RegExp[] = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // exact place pin
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // viewport centre
    /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/,
    /^\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/, // bare "lat, lng"
  ];
  for (const re of patterns) {
    const m = decoded.match(re);
    if (m) {
      const lat = num(m[1]);
      const lng = num(m[2]);
      if (validCoord(lat, lng)) return { lat, lng, name };
    }
  }
  return null;
}

export const isShortGoogleLink = (s: string) => /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s);

/** Google Maps URLs accept at most ~10 stops (origin + 8 waypoints + destination); split longer routes. */
const MAX_STOPS = 10;

export function googleDirLinks(stops: Place[]): { label: string; url: string; from: number; to: number }[] {
  if (stops.length < 2) return [];
  const links: { label: string; url: string; from: number; to: number }[] = [];
  for (let start = 0; start < stops.length - 1; start += MAX_STOPS - 1) {
    const chunk = stops.slice(start, start + MAX_STOPS);
    if (chunk.length < 2) break;
    const pt = (p: Place) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const params = new URLSearchParams({
      api: '1',
      travelmode: 'driving',
      origin: pt(chunk[0]),
      destination: pt(chunk[chunk.length - 1]),
    });
    if (chunk.length > 2) params.set('waypoints', chunk.slice(1, -1).map(pt).join('|'));
    links.push({
      label: `Durak ${start + 1} → ${start + chunk.length}`,
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
      from: start,
      to: start + chunk.length - 1,
    });
  }
  return links;
}

export const googlePlaceLink = (p: Place) =>
  `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
