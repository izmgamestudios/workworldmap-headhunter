import type { Place, RouteResult } from '../types';
import { haversine } from './geo';
import { routeUrl } from './api';

const coords = (stops: Place[]) => stops.map((s) => `${s.lng.toFixed(6)},${s.lat.toFixed(6)}`).join(';');

/** Road-network route through the stops, in the given order. */
export async function routeByRoad(stops: Place[], signal?: AbortSignal): Promise<RouteResult> {
  if (stops.length < 2) return { geometry: [], legs: [], distance: 0, duration: 0, road: true };
  try {
    const res = await fetch(routeUrl('route', coords(stops)), { signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error(data.message ?? data.code);
    const r = data.routes[0];
    return {
      geometry: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
      legs: r.legs.map((l: { distance: number; duration: number }) => ({ distance: l.distance, duration: l.duration })),
      distance: r.distance,
      duration: r.duration,
      road: true,
    };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return straightFallback(stops);
  }
}

/** Only used when the routing service is unreachable; clearly flagged in the UI. */
function straightFallback(stops: Place[]): RouteResult {
  const legs = stops.slice(1).map((s, i) => {
    const d = haversine([stops[i].lat, stops[i].lng], [s.lat, s.lng]) * 1.3; // rough road factor
    return { distance: d, duration: d / (50 / 3.6) };
  });
  return {
    geometry: stops.map((s) => [s.lat, s.lng] as [number, number]),
    legs,
    distance: legs.reduce((a, l) => a + l.distance, 0),
    duration: legs.reduce((a, l) => a + l.duration, 0),
    road: false,
  };
}

/**
 * Returns the stops reordered for the shortest road trip (OSRM /trip),
 * keeping the first stop as the start. Throws if the service fails.
 */
export async function optimizeOrder(stops: Place[]): Promise<Place[]> {
  if (stops.length < 3) return stops;
  const res = await fetch(routeUrl('trip', coords(stops)));
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(data.message ?? data.code);
  const order: Place[] = new Array(stops.length);
  (data.waypoints as { waypoint_index: number }[]).forEach((w, i) => {
    order[w.waypoint_index] = stops[i];
  });
  return order;
}
