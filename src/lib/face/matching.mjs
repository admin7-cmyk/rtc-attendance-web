export function normalizeEmbedding(values) {
  if (!Array.isArray(values) || values.length < 2 || values.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Invalid face vector');
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm < 1e-12) throw new Error('Empty face vector');
  return values.map(v => v / norm);
}

export function createMatcher({ templates, policy, scope, modelVersion }) {
  if (!policy || !Number.isFinite(policy.minSimilarity) || policy.minSimilarity <= 0 || policy.minSimilarity > 1 || !Number.isFinite(policy.minMargin) || policy.minMargin <= 0 || policy.minMargin > 2 || !Number.isInteger(policy.minObservations) || policy.minObservations < 1 || !Number.isFinite(policy.maxGapMs) || policy.maxGapMs <= 0 || !Number.isFinite(policy.minQuality) || policy.minQuality < 0 || policy.minQuality > 1) throw new Error('Invalid matching policy');
  const identities = new Set(); let dimension;
  const enrolled = templates.map(t => {
    if (!t.studentId || identities.has(t.studentId) || t.modelVersion !== modelVersion || !t.samples?.length) throw new Error('Invalid model or duplicate template identity');
    identities.add(t.studentId);
    const samples = t.samples.map(normalizeEmbedding);
    dimension ??= samples[0].length;
    if (samples.some(s => s.length !== dimension)) throw new Error('Incompatible face vectors');
    return { studentId: t.studentId, samples };
  });
  let currentScope = { ...scope }; let tracks = new Map(); const emitted = new Set();
  return {
    reset(nextScope) { currentScope = { ...nextScope }; tracks.clear(); emitted.clear(); },
    update(observations) {
      const candidates = [];
      const trackCounts = new Map();
      for (const o of observations) trackCounts.set(o.trackId, (trackCounts.get(o.trackId) || 0) + 1);
      for (const o of observations) {
        if (typeof o.trackId !== 'string' || trackCounts.get(o.trackId) !== 1) { tracks.delete(o.trackId); continue; }
        let vector;
        try { vector = normalizeEmbedding(o.embedding); } catch { tracks.delete(o.trackId); continue; }
        if (vector.length !== dimension || !Number.isFinite(o.timestamp) || !Number.isFinite(o.quality) || o.quality < policy.minQuality) { tracks.delete(o.trackId); continue; }
        const ranked = enrolled.map(t => ({ studentId: t.studentId, score: Math.max(...t.samples.map(s => s.reduce((sum, v, i) => sum + v * vector[i], 0))) })).sort((a, b) => b.score - a.score);
        const best = ranked[0];
        if (!best || best.score < policy.minSimilarity || (ranked[1] && best.score - ranked[1].score < policy.minMargin)) { tracks.delete(o.trackId); continue; }
        candidates.push({ ...best, observation: o });
      }
      const counts = new Map();
      for (const c of candidates) counts.set(c.studentId, (counts.get(c.studentId) || 0) + 1);
      const next = new Map(); const suggestions = [];
      for (const c of candidates) {
        const o = c.observation;
        if (counts.get(c.studentId) !== 1) continue;
        const prior = tracks.get(o.trackId);
        if (prior && o.timestamp <= prior.last) { next.set(o.trackId, prior); continue; }
        const continuous = prior && prior.studentId === c.studentId && o.timestamp - prior.last <= policy.maxGapMs;
        const evidence = { studentId: c.studentId, count: continuous ? prior.count + 1 : 1, last: o.timestamp };
        next.set(o.trackId, evidence);
        if (evidence.count >= policy.minObservations && !emitted.has(c.studentId)) {
          emitted.add(c.studentId);
          suggestions.push({ studentId: c.studentId, trackId: o.trackId, scope: { ...currentScope } });
        }
      }
      tracks = next;
      return suggestions;
    },
  };
}
