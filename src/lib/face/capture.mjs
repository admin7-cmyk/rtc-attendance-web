export function serializeInference(operation) {
  let tail = Promise.resolve();
  return (...args) => {
    const result = tail.then(() => operation(...args));
    tail = result.catch(() => {});
    return result;
  };
}

export async function freshEnrollmentSample({ infer, previousFrame, isCurrent, now = () => performance.now() }) {
  if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
  const faces = await infer();
  if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
  const face = faces[0];
  if (faces.length !== 1 || !face || face.quality < .8 || Math.min(...face.box.slice(2)) < 80 || !Number.isFinite(face.frameTime) || face.frameTime <= previousFrame || !Number.isFinite(face.timestamp) || now() - face.timestamp > 500 || now() < face.timestamp) throw new Error('ต้องเป็นเฟรมใหม่และมีใบหน้าชัดเจนเพียงคนเดียว กรุณาลองอีกครั้ง');
  return face;
}
