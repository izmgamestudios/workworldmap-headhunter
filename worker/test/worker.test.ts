import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { type Env } from '../src/index.ts';

const env: Env = {
  ALLOWED_ORIGINS: 'https://app.example.com',
  OSRM_URL: 'https://osrm.test',
  NOMINATIM_URL: 'https://nom.test',
  USER_AGENT: 'test',
};
const call = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  worker.fetch(new Request(`https://proxy.test${path}`, { method, headers }), env);

const calls: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  calls.push(String(input));
  return new Response(JSON.stringify({ code: 'Ok' }), { status: 200 });
}) as typeof fetch;

test('route: forwards validated coords to OSRM', async () => {
  const r = await call('/api/route?coords=28.97,41.02;29.02,40.99', { Origin: 'https://app.example.com' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://app.example.com');
  assert.match(calls.at(-1)!, /^https:\/\/osrm\.test\/route\/v1\/driving\/28\.97,41\.02;29\.02,40\.99\?/);
});

test('route: rejects injection / bad / out-of-range coords', async () => {
  for (const bad of ['../../admin', '1,2', '999,10;5,5', '28.9,41.0;evil.com/x', '']) {
    assert.equal((await call(`/api/route?coords=${encodeURIComponent(bad)}`)).status, 400, bad);
  }
});

test('route: rejects more than 100 points', async () => {
  const coords = Array.from({ length: 101 }, () => '10,10').join(';');
  assert.equal((await call(`/api/route?coords=${coords}`)).status, 400);
});

test('foreign origin is rejected, no-origin (server/curl) allowed', async () => {
  assert.equal((await call('/api/route?coords=1,1;2,2', { Origin: 'https://evil.com' })).status, 403);
  assert.equal((await call('/health')).status, 200);
});

test('geocode: validates query and sends User-Agent', async () => {
  assert.equal((await call('/api/geocode?q=a')).status, 400);
  assert.equal((await call(`/api/geocode?q=${'x'.repeat(201)}`)).status, 400);
  assert.equal((await call('/api/geocode?q=Kadıköy')).status, 200);
});

test('non-GET and unknown paths', async () => {
  assert.equal((await call('/api/route', {}, 'POST')).status, 405);
  assert.equal((await call('/nope')).status, 404);
});

test('rate limiter blocks with 429', async () => {
  const limited: Env = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const r = await worker.fetch(new Request('https://proxy.test/health'), limited);
  assert.equal(r.status, 429);
});
