import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';
import type { HuntKind, HuntStatus, Place } from '../types';
import { uid, validCoord } from './geo';
import { isShortGoogleLink, parseGoogleMapsUrl } from './gmaps';
import { parseHmap } from './hmap';

export interface ImportResult {
  places: Place[];
  /** rows with an address but no coordinates; resolved by the geocoder */
  toGeocode: { place: Place; query: string }[];
  route: string[];
  skipped: number;
  warnings: string[];
}

const empty = (): ImportResult => ({ places: [], toGeocode: [], route: [], skipped: 0, warnings: [] });

const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

const ALIASES: Record<string, string[]> = {
  name: ['name', 'ad', 'isim', 'adsoyad', 'isletme', 'isletmeadi', 'firma', 'firmaadi', 'title', 'baslik', 'business', 'company', 'unvan', 'fullname'],
  lat: ['lat', 'latitude', 'enlem', 'y'],
  lng: ['lng', 'lon', 'long', 'longitude', 'boylam', 'x'],
  role: ['role', 'rol', 'meslek', 'pozisyon', 'position', 'job', 'jobtitle', 'gorev'],
  skills: ['skills', 'skill', 'yetenek', 'yetenekler', 'uzmanlik', 'uzmanliklar', 'etiketler', 'tags'],
  sector: ['sector', 'sektor', 'kategori', 'category', 'tur', 'type', 'isletmeturu', 'industry'],
  status: ['status', 'durum', 'asama'],
  contact: ['contact', 'iletisim', 'telefon', 'tel', 'phone', 'email', 'eposta', 'mail'],
  address: ['address', 'adres', 'konum', 'location', 'sehir', 'city'],
  notes: ['notes', 'note', 'not', 'notlar', 'aciklama', 'description', 'yorum'],
  kind: ['kind', 'tip', 'kayittipi', 'avtipi'],
  url: ['url', 'link', 'maps', 'googlemaps', 'googlemapslink', 'mapurl', 'harita', 'haritalink'],
};

function pick(row: Record<string, unknown>, field: string): string {
  const wanted = new Set(ALIASES[field]);
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(norm(k)) && v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

const parseNum = (s: string) => parseFloat(s.replace(',', '.'));

function mapStatus(s: string): HuntStatus {
  const n = norm(s);
  if (!n) return 'radar';
  if (/(interview|mulakat|ziyaret|gorusme)/.test(n)) return 'interview';
  if (/(closed|transfer|anlas|won|hired|kazan)/.test(n)) return 'closed';
  if (/(contact|iletisim|arand|ulas)/.test(n)) return 'contacted';
  return 'radar';
}

function mapKind(s: string, hasRole: boolean): HuntKind {
  const n = norm(s);
  if (/(business|isletme|firma|company)/.test(n)) return 'business';
  if (/(talent|yetenek|kisi|person)/.test(n)) return 'talent';
  return hasRole ? 'talent' : 'business';
}

export function rowsToPlaces(rows: Record<string, unknown>[]): ImportResult {
  const out = empty();
  for (const row of rows) {
    const name = pick(row, 'name');
    let lat = parseNum(pick(row, 'lat'));
    let lng = parseNum(pick(row, 'lng'));
    let address = pick(row, 'address');
    const url = pick(row, 'url');

    if (!validCoord(lat, lng) && url) {
      const link = parseGoogleMapsUrl(url);
      if (link) {
        lat = link.lat;
        lng = link.lng;
      } else if (isShortGoogleLink(url)) {
        out.warnings.push(`Kısa Google linki çözülemedi (tam URL gerekli): ${url}`);
      }
    }

    const role = pick(row, 'role');
    const place: Place = {
      id: uid(),
      kind: mapKind(pick(row, 'kind'), !!role),
      name: name || address || 'İsimsiz',
      role,
      skills: pick(row, 'skills').split(/[,;|]/).map((s) => s.trim()).filter(Boolean),
      sector: pick(row, 'sector'),
      status: mapStatus(pick(row, 'status')),
      contact: pick(row, 'contact'),
      address,
      notes: pick(row, 'notes'),
      lat,
      lng,
    };

    if (validCoord(lat, lng)) out.places.push(place);
    else if (address || name) {
      address = address || name;
      out.toGeocode.push({ place, query: address });
    } else out.skipped++;
  }
  return out;
}

const COORD_LINE = /^\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/;

/** Quick-paste box: URLs, "lat,lng" pairs, addresses (one per line), or pasted CSV/JSON. */
export function parseText(text: string): ImportResult {
  const t = text.trim();
  if (!t) return empty();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return fromJson(t);
    } catch {
      /* fall through to line mode */
    }
  }
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstCells = lines[0].split(/[,;\t]/).map(norm);
  const looksLikeCsv = lines.length > 1 && firstCells.length > 1 && firstCells.some((c) => Object.values(ALIASES).flat().includes(c));
  if (looksLikeCsv) return parseCsv(t);

  const out = empty();
  for (const line of lines) {
    const link = parseGoogleMapsUrl(line);
    if (link) {
      out.places.push(simplePlace(link.name ?? `Nokta ${out.places.length + 1}`, link.lat, link.lng));
    } else if (isShortGoogleLink(line)) {
      out.warnings.push(`Kısa link çözülemedi — tarayıcıda açıp tam URL'yi yapıştırın: ${line}`);
      out.skipped++;
    } else if (COORD_LINE.test(line)) {
      const m = line.match(COORD_LINE)!;
      out.places.push(simplePlace(`Nokta ${out.places.length + 1}`, parseFloat(m[1]), parseFloat(m[2])));
    } else {
      const p = simplePlace(line, NaN, NaN);
      p.address = line;
      out.toGeocode.push({ place: p, query: line });
    }
  }
  return out;
}

function simplePlace(name: string, lat: number, lng: number): Place {
  return { id: uid(), kind: 'business', name, role: '', skills: [], sector: '', status: 'radar', contact: '', address: '', notes: '', lat, lng };
}

function parseCsv(text: string): ImportResult {
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] });
  const res = rowsToPlaces(parsed.data);
  if (parsed.errors.length) res.warnings.push(`CSV ayrıştırma uyarıları: ${parsed.errors.length}`);
  return res;
}

function fromJson(text: string): ImportResult {
  const data = JSON.parse(text);
  if (data?.format === 'hmap' || (Array.isArray(data?.places) && data.places.every((p: { lat?: unknown }) => p && 'lat' in p))) {
    const { places, route } = parseHmap(text);
    return { ...empty(), places, route };
  }
  const rows: unknown = Array.isArray(data) ? data : data?.features ?? data?.items ?? data?.places;
  if (!Array.isArray(rows)) throw new Error('Tanınmayan JSON yapısı');
  // GeoJSON features → flat rows
  const flat = rows.map((r) => {
    if (r?.geometry?.type === 'Point') {
      const [lng, lat] = r.geometry.coordinates;
      return { ...r.properties, lat, lng };
    }
    return r;
  });
  return rowsToPlaces(flat);
}

/** Google My Maps / Earth export. KMZ is a zip and is not supported. */
function fromKml(text: string): ImportResult {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const rows: Record<string, unknown>[] = [];
  for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
    const coords = pm.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent?.trim();
    const [lng, lat] = (coords ?? '').split(',').map(parseFloat);
    rows.push({
      name: pm.getElementsByTagName('name')[0]?.textContent?.trim() ?? '',
      notes: (pm.getElementsByTagName('description')[0]?.textContent ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      lat,
      lng,
    });
  }
  return rowsToPlaces(rows.map((r) => ({ ...r, lat: String(r.lat), lng: String(r.lng) })));
}

export async function parseFile(file: File): Promise<ImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'kmz') throw new Error('.kmz sıkıştırılmış bir dosyadır — Google My Maps\'ten "KML" olarak (KMZ yerine) dışa aktarın.');
  if (ext === 'xls') throw new Error('.xls (eski Excel) desteklenmiyor — dosyayı .xlsx veya .csv olarak kaydedip tekrar deneyin.');
  if (ext === 'xlsx') {
    const sheet = (await readSheet(file)) as unknown[][];
    const [header, ...body] = sheet;
    if (!header) return empty();
    const rows = body.map((r) => Object.fromEntries(header.map((h, i) => [String(h ?? ''), r[i]])));
    return rowsToPlaces(rows);
  }
  const text = await file.text();
  if (ext === 'json' || ext === 'hmap' || ext === 'geojson') return fromJson(text);
  if (ext === 'kml') return fromKml(text);
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return parseCsv(text);
  return parseText(text);
}
