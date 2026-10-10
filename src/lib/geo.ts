import type { Place } from '../types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const validCoord = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

export function fmtKm(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function fmtDuration(s: number) {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} dk`;
  return `${Math.floor(mins / 60)} sa ${mins % 60} dk`;
}

export function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const emptyPlace = (lat: number, lng: number): Place => ({
  id: uid(),
  kind: 'talent',
  name: '',
  role: '',
  skills: [],
  sector: '',
  status: 'radar',
  contact: '',
  address: '',
  notes: '',
  lat,
  lng,
});
