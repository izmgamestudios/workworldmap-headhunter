export type HuntStatus = 'radar' | 'contacted' | 'interview' | 'closed';
export type HuntKind = 'talent' | 'business';

export interface Place {
  id: string;
  kind: HuntKind;
  name: string;
  role: string;
  skills: string[];
  sector: string;
  status: HuntStatus;
  contact: string;
  address: string;
  notes: string;
  lat: number;
  lng: number;
}

export interface RouteLeg {
  distance: number; // meters
  duration: number; // seconds
}

export interface RouteResult {
  /** [lat, lng] pairs following the road network */
  geometry: [number, number][];
  legs: RouteLeg[];
  distance: number;
  duration: number;
  /** false when OSRM was unreachable and a straight-line fallback is shown */
  road: boolean;
}

export interface Filters {
  q: string;
  kind: HuntKind | 'all';
  status: HuntStatus | 'all';
  sector: string;
  skill: string;
}

export const STATUS_META: Record<HuntStatus, { label: string; color: string }> = {
  radar: { label: 'Hedef / Radar', color: '#22d3ee' },
  contacted: { label: 'İletişime Geçildi', color: '#fbbf24' },
  interview: { label: 'Mülakat / Ziyaret', color: '#a78bfa' },
  closed: { label: 'Transfer / Anlaşıldı', color: '#34d399' },
};

export const KIND_META: Record<HuntKind, { label: string }> = {
  talent: { label: 'Yetenek / Meslek' },
  business: { label: 'İşletme' },
};
