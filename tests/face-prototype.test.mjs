import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmbedding, createMatcher } from '../src/lib/face/matching.mjs';
import { startFaceCamera } from '../src/lib/face/camera.mjs';
import { faceLabAllowed } from '../src/lib/face/lab-access.mjs';
import { freshEnrollmentSample, serializeInference } from '../src/lib/face/capture.mjs';

const scope = { roomId: 'lab', date: '2026-10-23', generation: 1 };
const policy = { minSimilarity: .95, minMargin: .08, minObservations: 3, maxGapMs: 800, minQuality: .8 };
const templates = [
  { studentId: 'A', modelVersion: 'test', samples: [[1, 0]] },
  { studentId: 'B', modelVersion: 'test', samples: [[0, 1]] },
];
const obs = (trackId, embedding, timestamp, extra = {}) => ({ trackId, embedding, timestamp, quality: 1, box: [0, 0, 100, 100], ...extra });
const matcher = (more = {}) => createMatcher({ templates, policy, scope, modelVersion: 'test', ...more });

test('face vectors reject invalid values and normalize without altering source', () => {
  assert.deepEqual(normalizeEmbedding([3, 4]), [.6, .8]);
  for (const input of [[0, 0], [NaN, 1], [Infinity, 1], [], ['1', 2]]) assert.throws(() => normalizeEmbedding(input));
});
test('several faces require distinct fresh observations before one suggestion each', () => {
  const m = matcher();
  assert.deepEqual(m.update([obs('x', [1, 0], 100), obs('y', [0, 1], 100)]), []);
  assert.deepEqual(m.update([obs('x', [1, 0], 100), obs('y', [0, 1], 100)]), []);
  assert.deepEqual(m.update([obs('x', [1, 0], 200), obs('y', [0, 1], 200)]), []);
  assert.deepEqual(m.update([obs('x', [1, 0], 300), obs('y', [0, 1], 300)]).map(x => x.studentId), ['A', 'B']);
  assert.deepEqual(m.update([obs('x', [1, 0], 400)]), []);
});
test('unknown, low-quality, malformed and conflicting faces do not mark anyone', () => {
  const m = matcher({ policy: { ...policy, minObservations: 1 } });
  assert.deepEqual(m.update([obs('x', [-1, 0], 1)]), []);
  assert.deepEqual(m.update([obs('x', [1, 0], 2, { quality: .2 })]), []);
  assert.deepEqual(m.update([obs('x', [1, 0, 0], 3)]), []);
  assert.deepEqual(m.update([obs('x', [1, 0], 4), obs('y', [1, 0], 4)]), []);
  const tied = matcher({ templates: [...templates, { studentId: 'C', modelVersion: 'test', samples: [[.999, .001]] }], policy: { ...policy, minObservations: 1 } });
  assert.deepEqual(tied.update([obs('x', [1, 0], 1)]), []);
});
test('track changes, missing tracks and scope changes cannot reuse past evidence', () => {
  const m = matcher();
  m.update([obs('x', [1, 0], 100)]); m.update([obs('x', [1, 0], 200)]);
  assert.deepEqual(m.update([obs('x', [0, 1], 300)]), []);
  m.update([]);
  assert.deepEqual(m.update([obs('x', [0, 1], 400)]), []);
  m.reset({ ...scope, generation: 2 });
  assert.deepEqual(m.update([obs('x', [1, 0], 500)]), []);
});
test('template/model mismatch and unsafe matching policy fail closed', () => {
  assert.throws(() => matcher({ modelVersion: 'other' }));
  assert.throws(() => matcher({ policy: { ...policy, minObservations: 0 } }));
});
test('duplicate track observations cannot manufacture a confirmed identity', () => {
  const m = matcher({ policy: { ...policy, minObservations: 1 } });
  assert.deepEqual(m.update([obs('x', [1, 0], 1), obs('x', [1, 0], 1)]), []);
});
test('lab requires explicit server enablement and current admin role', () => {
  assert.equal(faceLabAllowed({ enabled: 'true', user: { role: 'admin', active: true } }), true);
  assert.equal(faceLabAllowed({ enabled: 'true', user: { role: 'admin', active: 'TRUE' } }), true);
  for (const options of [{ enabled: 'false', user: { role: 'admin', active: true } }, { enabled: 'true', user: { role: 'teacher', active: true } }, { enabled: 'true', user: { role: 'admin', active: false } }, { enabled: 'true', user: null }]) assert.equal(faceLabAllowed(options), false);
});

function cameraFixture() {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const listeners = new Map();
  const doc = { hidden: false, addEventListener: (n, fn) => listeners.set(n, fn), removeEventListener: n => listeners.delete(n) };
  const video = { srcObject: null, readyState: 4, videoWidth: 640, play: async () => {}, pause() {} };
  return { stream, doc, video, stopped: () => stopped, hide() { doc.hidden = true; listeners.get('visibilitychange')?.(); } };
}

test('camera selection requests the chosen side and releases the old stream before reopening', async () => {
  for (const facingMode of ['environment', 'user']) {
    const f = cameraFixture(); let requested;
    const c = await startFaceCamera({ video: f.video, facingMode, documentTarget: f.doc,
      mediaDevices: { getUserMedia: async constraints => { requested = constraints; return f.stream; } },
      onFrame: async () => [], onResult() {}, onError() {} });
    c.stop();
    assert.equal(f.stopped(), 1);
    assert.equal(requested.video.facingMode.ideal, facingMode);
    assert.equal(requested.audio, false);
  }
});
test('camera stop releases tracks and suppresses in-flight results', async () => {
  const f = cameraFixture(); let finish; let frames = 0;
  const camera = await startFaceCamera({ video: f.video, mediaDevices: { getUserMedia: async () => f.stream }, documentTarget: f.doc, onFrame: () => new Promise(r => { finish = r; }), onResult: () => frames++, onError: e => { throw e; } });
  await new Promise(r => setTimeout(r, 10));
  camera.stop(); finish?.(['late']);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(f.stopped(), 1); assert.equal(f.video.srcObject, null); assert.equal(frames, 0);
});
test('backgrounding stops camera; late permission success is released after abort', async () => {
  const f = cameraFixture();
  const c = await startFaceCamera({ video: f.video, mediaDevices: { getUserMedia: async () => f.stream }, documentTarget: f.doc, onFrame: async () => [], onResult() {}, onError() {} });
  f.hide(); c.stop(); assert.equal(f.stopped(), 1);
  const pending = cameraFixture(); const abort = new AbortController(); let grant;
  const promise = startFaceCamera({ video: pending.video, mediaDevices: { getUserMedia: () => new Promise(r => { grant = r; }) }, documentTarget: pending.doc, signal: abort.signal, onFrame() {}, onResult() {}, onError() {} });
  abort.abort(); grant(pending.stream);
  await assert.rejects(promise, { name: 'AbortError' }); assert.equal(pending.stopped(), 1);
});
test('backgrounding during pending video playback releases the stream immediately', async () => {
  const f = cameraFixture(); let play; f.video.play = () => new Promise(r => { play = r; });
  const promise = startFaceCamera({ video: f.video, mediaDevices: { getUserMedia: async () => f.stream }, documentTarget: f.doc, onFrame() {}, onResult() {}, onError() {} });
  await new Promise(r => setTimeout(r, 0));
  f.hide(); assert.equal(f.stopped(), 1); assert.equal(f.video.srcObject, null);
  play(); await assert.rejects(promise, { name: 'AbortError' });
});
test('enrollment requests fresh inference, rejects stale/duplicate frames and invalidated capture', async () => {
  let calls = 0;
  const fresh = () => { calls++; return Promise.resolve([obs('x', [1, 0], performance.now(), { frameTime: 2 })]); };
  const result = await freshEnrollmentSample({ infer: fresh, previousFrame: 1, isCurrent: () => true });
  assert.equal(calls, 1); assert.equal(result.frameTime, 2);
  await assert.rejects(freshEnrollmentSample({ infer: fresh, previousFrame: 2, isCurrent: () => true }));
  await assert.rejects(freshEnrollmentSample({ infer: async () => [obs('x', [1, 0], performance.now() - 5000, { frameTime: 3 })], previousFrame: 2, isCurrent: () => true }));
  await assert.rejects(freshEnrollmentSample({ infer: fresh, previousFrame: 1, isCurrent: () => false }));
});
test('restarting inference waits for the previous operation instead of overlapping models', async () => {
  let active = 0; let maximum = 0;
  const run = serializeInference(async value => { active++; maximum = Math.max(maximum, active); await new Promise(r => setTimeout(r, 2)); active--; return value; });
  assert.deepEqual(await Promise.all([run('old'), run('new')]), ['old', 'new']);
  assert.equal(maximum, 1);
});
