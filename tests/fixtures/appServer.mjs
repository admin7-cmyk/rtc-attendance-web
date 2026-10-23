// Production-build smoke-test server. All database traffic is forced to the
// synthetic loopback fixture; no school Supabase credentials are used.
import http from 'node:http';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'production';
process.env.SUPABASE_URL = 'http://127.0.0.1:54329';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-role-key';
process.env.SESSION_SECRET = 'a-private-test-session-key-with-more-than-32-characters';
const { default: next } = await import('next');
const port = 3107;
const app = next({ dev: false, dir: fileURLToPath(new URL('../../', import.meta.url)), hostname: '127.0.0.1', port });
await app.prepare();
const handler = app.getRequestHandler();
const server = http.createServer((request, response) => {
  if (request.url === '/__shutdown' && request.method === 'POST') {
    response.end('Test server stopped');
    response.on('finish', async () => { await app.close(); server.close(); });
    return;
  }
  return handler(request, response);
});
server.listen(port, '127.0.0.1', () => console.log(`Production-build fixture app listening on http://127.0.0.1:${port}`));
