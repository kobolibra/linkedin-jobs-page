const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleVisits(request, env) {
  const origin = request.headers.get('origin');
  const allowedOrigin = origin === new URL(request.url).origin || origin === 'https://kobolibra.github.io';
  const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...(allowedOrigin ? { 'access-control-allow-origin': origin, 'vary': 'Origin' } : {}) } });
  if (request.method === 'OPTIONS') return allowedOrigin
    ? new Response(null, { status: 204, headers: { ...HEADERS, 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'vary': 'Origin' } })
    : respond({ error: 'forbidden_origin' }, 403);
  if (!['GET', 'POST'].includes(request.method)) return respond({ error: 'method_not_allowed' }, 405);
  let visitId;
  if (request.method === 'POST') {
    if (!allowedOrigin) return respond({ error: 'forbidden_origin' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return respond({ error: 'invalid_content_type' }, 415);
    if (Number(request.headers.get('content-length')) > 256) return respond({ error: 'request_too_large' }, 413);
    try {
      const text = await request.text();
      if (text.length > 256) return respond({ error: 'request_too_large' }, 413);
      visitId = JSON.parse(text)?.visitId;
      if (typeof visitId !== 'string' || !UUID.test(visitId)) return respond({ error: 'invalid_visit_id' }, 400);
    } catch { return respond({ error: 'invalid_json' }, 400); }
  }
  if (!env.VISITS) return respond({ error: 'counter_not_configured' }, 503);
  try {
    const counter = env.VISITS.get(env.VISITS.idFromName('site-pv-v1'));
    const response = await counter.fetch(new Request('https://counter.internal/', {
      method: request.method,
      ...(visitId ? { body: JSON.stringify({ visitId: visitId.toLowerCase() }) } : {}),
    }));
    const headers = new Headers(response.headers);
    if (allowedOrigin) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
    return new Response(response.body, { status: response.status, headers });
  } catch { return respond({ error: 'counter_unavailable' }, 503); }
}

// A single SQLite Durable Object serializes updates and survives Worker deploys.
// Store only random request IDs, with a bounded retry window; no IPs or cookies.
export class VisitorCounter {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), site_pv INTEGER NOT NULL, started_at TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS visits (visit_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS visits_created_at ON visits(created_at)');
    this.sql.exec('INSERT OR IGNORE INTO counter VALUES (1, 0, ?)', new Date().toISOString());
  }

  async fetch(request) {
    if (request.method === 'POST') {
      const { visitId } = await request.json();
      if (typeof visitId !== 'string' || !UUID.test(visitId)) return json({ error: 'invalid_visit_id' }, 400);
      this.storage.transactionSync(() => {
        const now = Date.now();
        this.sql.exec('DELETE FROM visits WHERE created_at < ?', now - 48 * 60 * 60 * 1000);
        const inserted = this.sql.exec('INSERT OR IGNORE INTO visits VALUES (?, ?) RETURNING visit_id', visitId.toLowerCase(), now).toArray();
        if (inserted.length) this.sql.exec('UPDATE counter SET site_pv = site_pv + 1 WHERE id = 1');
      });
    } else if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const row = this.sql.exec('SELECT site_pv, started_at FROM counter WHERE id = 1').one();
    return json({ site_pv: row.site_pv, startedAt: row.started_at, source: 'first-party-live' });
  }
}
