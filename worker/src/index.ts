export interface Env {
  ALLOWED_ORIGINS: string;
  OSRM_URL: string;
  NOMINATIM_URL: string;
  USER_AGENT: string;
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

const MAX_POINTS = 100;
// "lng,lat;lng,lat;…" with plain decimal numbers only (blocks path/URL injection into the upstream request)
const COORD = String.raw`-?\d{1,3}(?:\.\d{1,8})?,-?\d{1,2}(?:\.\d{1,8})?`;
const COORDS_RE = new RegExp(`^${COORD}(?:;${COORD})*$`);

const TTL = { route: 3600, trip: 3600, geocode: 60 * 60 * 24 * 30 };

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}

function validCoords(raw: string | null): string | null {
  if (!raw || !COORDS_RE.test(raw)) return null;
  const pts = raw.split(';');
  if (pts.length < 2 || pts.length > MAX_POINTS) return null;
  for (const p of pts) {
    const [lng, lat] = p.split(',').map(Number);
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  }
  return raw;
}

async function cached(req: Request, ttl: number, ctx: ExecutionContext | undefined, fetchUpstream: () => Promise<Response>) {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null;
  const key = new Request(req.url, { method: 'GET' });
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const upstream = await fetchUpstream();
  const res = new Response(upstream.body, upstream);
  if (upstream.ok) {
    res.headers.set('Cache-Control', `public, max-age=${ttl}`);
    if (cache) {
      const p = cache.put(key, res.clone());
      ctx ? ctx.waitUntil(p) : await p;
    }
  } else {
    res.headers.set('Cache-Control', 'no-store');
  }
  return res;
}

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(req, env);
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

    // Only browsers from allowed origins may use the proxy (blocks hot-linking of your quota).
    const origin = req.headers.get('Origin');
    if (origin && !cors['Access-Control-Allow-Origin']) return json({ error: 'origin_not_allowed' }, 403, cors);

    if (env.RATE_LIMITER) {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'anon';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json({ error: 'rate_limited' }, 429, { ...cors, 'Retry-After': '60' });
    }

    const withCors = (r: Response) => {
      const out = new Response(r.body, r);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
      return out;
    };

    try {
      if (url.pathname === '/api/route') {
        const coords = validCoords(url.searchParams.get('coords'));
        if (!coords) return json({ error: 'invalid_coords' }, 400, cors);
        const q = 'overview=full&geometries=geojson&steps=false';
        return withCors(await cached(req, TTL.route, ctx, () => fetch(`${env.OSRM_URL}/route/v1/driving/${coords}?${q}`)));
      }

      if (url.pathname === '/api/trip') {
        const coords = validCoords(url.searchParams.get('coords'));
        if (!coords) return json({ error: 'invalid_coords' }, 400, cors);
        const q = 'source=first&roundtrip=false&geometries=geojson&overview=false';
        return withCors(await cached(req, TTL.trip, ctx, () => fetch(`${env.OSRM_URL}/trip/v1/driving/${coords}?${q}`)));
      }

      if (url.pathname === '/api/geocode') {
        const q = (url.searchParams.get('q') ?? '').trim();
        if (q.length < 2 || q.length > 200) return json({ error: 'invalid_query' }, 400, cors);
        const target = `${env.NOMINATIM_URL}/search?${new URLSearchParams({ format: 'jsonv2', limit: '1', q })}`;
        return withCors(
          await cached(req, TTL.geocode, ctx, () => fetch(target, { headers: { 'User-Agent': env.USER_AGENT, 'Accept-Language': 'tr' } })),
        );
      }

      if (url.pathname === '/health') return json({ ok: true }, 200, cors);
      return json({ error: 'not_found' }, 404, cors);
    } catch {
      return json({ error: 'upstream_unreachable' }, 502, cors);
    }
  },
};
