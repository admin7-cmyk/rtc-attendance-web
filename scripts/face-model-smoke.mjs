// Actual model execution against synthetic tensors, never school photographs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { normalizeEmbedding } from '../src/lib/face/matching.mjs';

const root = fileURLToPath(new URL('../public/models/face/', import.meta.url));
const server = createServer(async (req, res) => {
  const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(path); res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json' : 'application/octet-stream'); res.end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
let human; let embedding;
try {
  // Run the actual browser bundle with a CPU backend, not the Node/native build.
  const context = { console, setTimeout, clearTimeout, performance, fetch, TextEncoder, TextDecoder, URL, atob, btoa, navigator: { userAgent: 'Synthetic CPU model smoke' }, document: { createElement: () => ({ getContext: () => null }) } };
  context.window = context; context.self = context;
  vm.createContext(context);
  vm.runInContext(await readFile(new URL('../public/vendor/human/human-3.3.6.js', import.meta.url), 'utf8'), context);
  const { Human } = context.Human;
  human = new Human({ backend: 'cpu', debug: false, cacheModels: false, modelBasePath: base, warmup: 'none', filter: { enabled: false }, gesture: { enabled: false }, face: { enabled: true, detector: { modelPath: 'blazeface.json', rotation: true, maxDetected: 12, return: true, skipFrames: 0, skipTime: 0 }, mesh: { enabled: true }, iris: { enabled: false }, description: { enabled: false }, emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false } }, body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, segmentation: { enabled: false } });
  await human.load();
  embedding = await human.tf.loadGraphModel(`${base}faceres.json`);
  const input = human.tf.fill([1, 224, 224, 3], 127);
  const output = embedding.execute(input, 'global_pooling/Mean');
  const values = normalizeEmbedding(Array.from(await output.data()));
  assert.equal(values.length, 1024); assert.ok(Math.abs(Math.hypot(...values) - 1) < 1e-6);
  input.dispose(); output.dispose();
  const blank = human.tf.zeros([224, 224, 3]);
  const result = await human.detect(blank); blank.dispose();
  result.face.forEach(f => f.tensor?.dispose());
  assert.equal(result.face.length, 0);
  console.log('PASS: detector + mesh loaded; embedding-only graph produces 1024 finite normalized values; blank image finds zero faces. CPU smoke, not iPhone performance/recognition acceptance.');
} finally {
  embedding?.dispose();
  if (human) for (const model of Object.values(human.models.models)) { try { model?.dispose(); } catch { /* A failed model load may have no executor. */ } }
  await new Promise(r => server.close(r));
}
