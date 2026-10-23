import { TABLE_KEYS } from './access.mjs';
import { serverConfig } from './supabase.mjs';

export function stableOrder(params, table) {
  const next = new URLSearchParams(params);
  const fields = (next.get('order') || '').split(',').filter(Boolean);
  for (const key of TABLE_KEYS[table]) {
    if (!fields.some((field) => field.split('.')[0] === key)) fields.push(`${key}.asc`);
  }
  next.set('order', fields.join(','));
  return next;
}

export async function databaseFetch(table, params, { method = 'GET', headers = {}, body, signal } = {}) {
  const { url, key } = serverConfig();
  return fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?${params}`, {
    method, body, signal, cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...headers },
  });
}

// Complete both unlimited reads and explicit ranges, even if the remote API
// caps a response below our requested page size. Counts come from PostgREST.
export async function readDatabaseRows(table, params, options = {}, fetchPage = databaseFetch) {
  if (options.method === 'HEAD' || String(options.headers?.Accept || '').includes('vnd.pgrst.object')) {
    return fetchPage(table, params, options);
  }
  const ordered = stableOrder(params, table);
  const offset = Number(ordered.get('offset') || 0);
  const limit = ordered.has('limit') ? Number(ordered.get('limit')) : Infinity;
  if (!Number.isSafeInteger(offset) || offset < 0 || (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0))) {
    return Response.json({ message: 'Invalid range' }, { status: 400 });
  }
  const rows = [];
  let total = null;
  while (rows.length < limit) {
    const page = new URLSearchParams(ordered);
    page.set('offset', String(offset + rows.length));
    page.set('limit', String(Math.min(1000, limit - rows.length)));
    const response = await fetchPage(table, page, {
      ...options,
      headers: { ...options.headers, Accept: 'application/json', Prefer: 'count=exact' },
    });
    if (!response.ok) return response;
    const data = await response.json();
    if (!Array.isArray(data)) return Response.json({ message: 'Invalid database response' }, { status: 502 });
    const count = response.headers.get('content-range')?.split('/')[1];
    if (count && count !== '*') total = Number(count);
    rows.push(...data);
    if (data.length === 0 || (total !== null && offset + rows.length >= total)) break;
  }
  return Response.json(rows, { headers: {
    'Content-Range': `${rows.length ? offset : '*'}${rows.length ? `-${offset + rows.length - 1}` : ''}/${total ?? '*'}`,
    'Cache-Control': 'no-store',
  } });
}
