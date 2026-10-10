import Papa from 'papaparse';
import type { Place } from '../types';
import { STATUS_META } from '../types';

export function download(filename: string, content: string | Blob, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV cells starting with = + - @ are executed as formulas by Excel; neutralise them. */
const safeCell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function placesToCsv(places: Place[]): string {
  const rows = places.map((p) => ({
    name: safeCell(p.name),
    kind: p.kind,
    role: safeCell(p.role),
    skills: safeCell(p.skills.join(', ')),
    sector: safeCell(p.sector),
    status: STATUS_META[p.status].label,
    contact: safeCell(p.contact),
    address: safeCell(p.address),
    notes: safeCell(p.notes),
    lat: p.lat,
    lng: p.lng,
  }));
  return '﻿' + Papa.unparse(rows);
}

export const stamp = () => new Date().toISOString().slice(0, 10);
