import { normalizeEmbedding } from './matching.mjs';
import { serializeInference } from './capture.mjs';

let scriptPromise;
function loadScript(manifest) {
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/human/human-3.3.6.js';
    script.integrity = manifest.scriptIntegrity;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.Human);
    script.onerror = () => { script.remove(); scriptPromise = null; reject(new Error('โหลดเครื่องมือ AI ไม่สำเร็จ กรุณาลองใหม่')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function overlap(a, b) {
  const area = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return area / (a[2] * a[3] + b[2] * b[3] - area || 1);
}

export async function loadFaceRuntime({ manifestUrl = '/models/face/manifest.json', signal } = {}) {
  if (manifestUrl !== '/models/face/manifest.json') throw new Error('Unsupported model manifest');
  const response = await fetch(manifestUrl, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('ไม่พบโมเดลต้นแบบ');
  const manifest = await response.json();
  const library = await loadScript(manifest);
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const human = new library.Human({
    backend: 'webgl', modelBasePath: '/models/face/', cacheModels: false, debug: false,
    async: false, warmup: 'none', cacheSensitivity: 0, skipAllowed: false,
    filter: { enabled: false, equalization: false }, gesture: { enabled: false },
    face: {
      enabled: true,
      detector: { modelPath: 'blazeface.json', rotation: true, maxDetected: 12, minConfidence: .6, minSize: 48, skipFrames: 0, skipTime: 0, return: true },
      mesh: { enabled: true, modelPath: 'facemesh.json' },
      iris: { enabled: false }, attention: { enabled: false }, emotion: { enabled: false },
      description: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false },
    },
    body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, segmentation: { enabled: false },
  });
  let embeddingModel; let disposed = false; let busy = false; let nextTrack = 1; let prior = [];
  function releaseModels() {
    embeddingModel?.dispose(); embeddingModel = null;
    for (const model of Object.values(human.models.models)) model?.dispose();
    human.models.reset();
    if (human.result?.face) human.result.face = [];
  }
  function dispose() { disposed = true; prior = []; if (!busy) releaseModels(); }
  try {
    await human.load();
    embeddingModel = await human.tf.loadGraphModel('/models/face/faceres.json');
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  } catch (error) { dispose(); throw error; }
  return {
    model: manifest.model,
    dispose,
    infer: serializeInference(async video => {
      if (disposed) throw new Error('Face runtime is closed');
      busy = true; let result;
      try {
        const frameTime = video.currentTime;
        result = await human.detect(video);
        if (disposed) return [];
        const timestamp = performance.now(); const used = new Set(); const observations = [];
        for (const face of result.face) {
          if (!face.tensor) continue;
          // Only request the embedding output. Age/gender graph heads are never executed.
          const output = human.tf.tidy(() => {
            const batch = face.tensor.rank === 3 ? human.tf.expandDims(face.tensor, 0) : face.tensor;
            const resized = human.tf.image.resizeBilinear(batch, [224, 224], false);
            return embeddingModel.execute(human.tf.mul(resized, 255), 'global_pooling/Mean');
          });
          let embedding;
          try { embedding = normalizeEmbedding(Array.from(await output.data())); } finally { output.dispose(); }
          if (embedding.length !== manifest.model.dimension) throw new Error('Incompatible embedding dimension');
          const box = face.box.map(Number);
          const choices = prior.filter(p => !used.has(p.trackId) && timestamp - p.timestamp < 900 && overlap(box, p.box) > .2 && p.embedding.reduce((s, v, i) => s + v * embedding[i], 0) > .75).sort((a, b) => overlap(box, b.box) - overlap(box, a.box));
          const trackId = choices.length && (choices.length === 1 || overlap(box, choices[0].box) - overlap(box, choices[1].box) > .15) ? choices[0].trackId : `track-${nextTrack++}`;
          used.add(trackId);
          observations.push({ trackId, embedding, box, quality: Math.min(face.boxScore || 0, face.faceScore || 0), timestamp, frameTime });
        }
        prior = observations;
        return observations;
      } finally {
        result?.face?.forEach(face => face.tensor?.dispose());
        if (human.result?.face) human.result.face = [];
        busy = false;
        if (disposed) releaseModels();
      }
    }),
  };
}
