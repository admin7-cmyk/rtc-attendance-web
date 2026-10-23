// Best-effort per-instance protection. On Vercel this is not a global quota;
// deployment-level rate limits should protect /api/login across instances.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;

export function allowLoginAttempt(key, now = Date.now(), limit = 20) {
  const entry = attempts.get(key);
  if (!entry || entry.until <= now) {
    if (attempts.size >= 10000) {
      for (const [id, value] of attempts) if (value.until <= now) attempts.delete(id);
      if (attempts.size >= 10000) return false;
    }
    attempts.set(key, { count: 1, until: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function clearLoginAttempts(key) {
  attempts.delete(key);
}
