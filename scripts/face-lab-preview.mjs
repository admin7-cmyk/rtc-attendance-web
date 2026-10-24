// Local synthetic preview only. Never loads .env.local or real school credentials.
import http from 'node:http';
import { fileURLToPath } from 'node:url';
process.env.NODE_ENV = 'production';
process.env.SUPABASE_URL = 'http://127.0.0.1:54339';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-role-key';
process.env.SESSION_SECRET = 'a-private-test-session-key-with-more-than-32-characters';
process.env.FACE_LAB_ENABLED = 'true';
const { default: next } = await import('next');
const app = next({ dev: false, dir: fileURLToPath(new URL('../', import.meta.url)), hostname: '127.0.0.1', port: 3118 });
await app.prepare();
const handler = app.getRequestHandler();
http.createServer(handler).listen(3118, '127.0.0.1', () => console.log('Synthetic face lab: http://127.0.0.1:3118 — test-admin / 2222 (test data only)'));
