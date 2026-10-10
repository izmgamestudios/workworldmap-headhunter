import type { HuntKind, HuntStatus, Place } from '../types';
import { uid, validCoord } from './geo';

export interface HmapFile {
  format: 'hmap';
  version: 1;
  app: 'teknodoz-hmap';
  savedAt: string;
  /** ordered route: place ids in visiting order */
  route: string[];
  places: Place[];
}

const STATUSES: HuntStatus[] = ['radar', 'contacted', 'interview', 'closed'];
const KINDS: HuntKind[] = ['talent', 'business'];

export function serializeHmap(places: Place[], route: string[]): string {
  const file: HmapFile = { format: 'hmap', version: 1, app: 'teknodoz-hmap', savedAt: new Date().toISOString(), route, places };
  return JSON.stringify(file, null, 2);
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function sanitizePlace(raw: unknown): Place | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (!validCoord(lat, lng)) return null;
  return {
    id: str(r.id) || uid(),
    kind: KINDS.includes(r.kind as HuntKind) ? (r.kind as HuntKind) : 'talent',
    name: str(r.name),
    role: str(r.role),
    skills: Array.isArray(r.skills) ? r.skills.map(str).filter(Boolean) : [],
    sector: str(r.sector),
    status: STATUSES.includes(r.status as HuntStatus) ? (r.status as HuntStatus) : 'radar',
    contact: str(r.contact),
    address: str(r.address),
    notes: str(r.notes),
    lat,
    lng,
  };
}

export function parseHmap(text: string): { places: Place[]; route: string[] } {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data?.places;
  if (!Array.isArray(list)) throw new Error('Geçersiz .hmap dosyası: "places" listesi bulunamadı.');
  const places = list.map(sanitizePlace).filter((p): p is Place => p !== null);
  const ids = new Set(places.map((p) => p.id));
  const route = Array.isArray(data?.route) ? (data.route as unknown[]).map(str).filter((id) => ids.has(id)) : [];
  return { places, route };
}
