export async function startFaceCamera({ video, signal, onFrame, onResult, onError, onStop = () => {}, mediaDevices = globalThis.navigator?.mediaDevices, documentTarget = globalThis.document, intervalMs = 200 }) {
  if (!mediaDevices?.getUserMedia) throw new Error('เบราว์เซอร์นี้เปิดกล้องไม่ได้ กรุณาใช้ HTTPS และอนุญาตกล้อง');
  let stopped = false; let stream; let timer; let started = false;
  function stop() {
    if (stopped) return;
    stopped = true; clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop());
    video.pause(); video.srcObject = null;
    documentTarget?.removeEventListener('visibilitychange', visibility);
    signal?.removeEventListener('abort', stop);
    onStop();
  }
  function visibility() { if (documentTarget.hidden) stop(); }
  signal?.addEventListener('abort', stop, { once: true });
  documentTarget?.addEventListener('visibilitychange', visibility);
  try {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    stream = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 24 } } });
    if (stopped || signal?.aborted || documentTarget?.hidden) {
      stream.getTracks().forEach(track => track.stop());
      throw new DOMException('Cancelled', 'AbortError');
    }
    video.srcObject = stream;
    await video.play();
    if (documentTarget?.hidden) stop();
    if (stopped) throw new DOMException('Cancelled', 'AbortError');
    started = true;
    async function tick() {
      if (stopped) return;
      try {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const result = await onFrame(video);
          if (!stopped) onResult(result);
        }
      } catch (error) { if (!stopped) { stop(); onError(error); } }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
    timer = setTimeout(tick, 0);
    return { stop };
  } catch (error) {
    if (!stopped) stop();
    // Initialization failures belong to the caller; loop failures use onError.
    if (!started) throw error;
    return { stop };
  }
}
