'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { loadFaceRuntime } from '@/lib/face/runtime';
import { startFaceCamera } from '@/lib/face/camera.mjs';
import { createMatcher } from '@/lib/face/matching.mjs';
import { freshEnrollmentSample } from '@/lib/face/capture.mjs';

// LAB ONLY: deliberately visible, uncalibrated policy; never used for live attendance.
const trialPolicy = { minSimilarity: .88, minMargin: .08, minObservations: 4, maxGapMs: 1500, minQuality: .8 };
export default function FaceLab() {
  const video = useRef(null); const runtime = useRef(null); const camera = useRef(null);
  const controller = useRef(null); const samples = useRef([]); const last = useRef([]); const matcher = useRef(null);
  const modeRef = useRef('detect'); const detected = useRef(new Set());
  const capturePending = useRef(false); const lastCapturedFrame = useRef(-1);
  const [approved, setApproved] = useState(false); const [busy, setBusy] = useState(false); const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('พร้อมทดสอบกล้อง'); const [faces, setFaces] = useState([]);
  const [roster, setRoster] = useState([]); const [present, setPresent] = useState([]); const [alias, setAlias] = useState('');
  const [mode, setMode] = useState('detect'); const [stats, setStats] = useState({ frames: 0, ms: 0, maxFaces: 0 });
  const [dimensions, setDimensions] = useState({ width: 1280, height: 720 });
  const [facingMode, setFacingMode] = useState('environment');

  function stop() {
    controller.current?.abort(); camera.current?.stop(); camera.current = null;
    last.current = []; setFaces([]); setRunning(false);
  }
  useEffect(() => {
    return () => { controller.current?.abort(); camera.current?.stop(); runtime.current?.dispose(); samples.current = []; last.current = []; };
  }, []);
  async function start() {
    if (!approved || busy || running) return;
    setBusy(true); setMessage('กำลังโหลดโมเดลบนเครื่อง…');
    const abort = new AbortController(); controller.current = abort;
    try {
      if (!runtime.current) runtime.current = await loadFaceRuntime({ signal: abort.signal });
      modeRef.current = mode;
      lastCapturedFrame.current = -1;
      detected.current = new Set(); setPresent([]);
      matcher.current = createMatcher({ templates: samples.current, policy: trialPolicy, scope: { roomId: 'lab-only', date: 'test', generation: Date.now() }, modelVersion: runtime.current.model.version });
      setStats({ frames: 0, ms: 0, maxFaces: 0 });
      camera.current = await startFaceCamera({
        video: video.current, signal: abort.signal, facingMode,
        onFrame: async input => {
          const started = performance.now(); const observations = await runtime.current.infer(input);
          return { observations, ms: performance.now() - started, width: input.videoWidth, height: input.videoHeight };
        },
        onResult: result => {
          last.current = result.observations;
          setDimensions({ width: result.width, height: result.height });
          setStats(prev => ({ frames: prev.frames + 1, ms: Math.round(result.ms), maxFaces: Math.max(prev.maxFaces, result.observations.length) }));
          if (modeRef.current === 'match') {
            const suggestions = matcher.current.update(result.observations);
            for (const suggestion of suggestions) detected.current.add(suggestion.studentId);
            setPresent([...detected.current]);
            // Names are deliberately shown in the draft list, not retained on stale face tracks.
          }
          setFaces(result.observations.map(o => ({ box: o.box, quality: o.quality, trackId: o.trackId })));
        },
        onError: error => { setMessage(error.message || 'ประมวลผลไม่สำเร็จ'); setRunning(false); },
        onStop: () => { last.current = []; setFaces([]); setRunning(false); setMessage('หยุดกล้องแล้ว กดเปิดเพื่อเริ่มใหม่'); },
      });
      if (abort.signal.aborted) camera.current.stop();
      else { setRunning(true); setMessage('กำลังทดสอบ — ไม่มีการบันทึกเข้าแถว'); }
    } catch (error) { if (error.name !== 'AbortError') setMessage(error.message || 'เปิดกล้องไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  async function testModels() {
    if (busy || running) return;
    setBusy(true); setMessage('กำลังทดสอบโมเดลด้วยภาพว่าง ไม่มีการเปิดกล้อง…');
    const abort = new AbortController(); controller.current = abort;
    try {
      if (!runtime.current) runtime.current = await loadFaceRuntime({ signal: abort.signal });
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      canvas.getContext('2d').fillRect(0, 0, 320, 240);
      const result = await runtime.current.infer(canvas);
      if (!abort.signal.aborted) setMessage(`โมเดลพร้อม: ภาพว่างตรวจพบ ${result.length} ใบหน้า · เวกเตอร์ ${runtime.current.model.dimension} มิติ (ยังไม่ใช่ผลทดสอบความแม่นยำ)`);
    } catch (error) { if (error.name !== 'AbortError') setMessage(error.message || 'ทดสอบโมเดลไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  async function capture() {
    const name = alias.trim();
    if (!running || capturePending.current || !name) { setMessage('ระบุรหัสทดลอง และให้มีใบหน้าชัดเจนเพียงคนเดียวก่อนเก็บตัวอย่าง'); return; }
    if (samples.current.length >= 6 && !samples.current.some(t => t.studentId === name)) { setMessage('ต้นแบบทดสอบได้สูงสุด 6 รหัสต่อรอบ'); return; }
    const session = controller.current;
    capturePending.current = true; setBusy(true);
    try {
      const sample = await freshEnrollmentSample({ infer: () => runtime.current.infer(video.current), previousFrame: lastCapturedFrame.current, isCurrent: () => controller.current === session && !session.signal.aborted });
      let person = samples.current.find(t => t.studentId === name);
      if (!person) { person = { studentId: name, modelVersion: runtime.current.model.version, samples: [] }; samples.current.push(person); }
      if (person.samples.length >= 3) { setMessage('รหัสนี้มี 3 ตัวอย่างแล้ว เลือกรหัสถัดไป'); return; }
      person.samples.push([...sample.embedding]); lastCapturedFrame.current = sample.frameTime;
      setRoster(samples.current.map(t => ({ name: t.studentId, count: t.samples.length })));
      setMessage(`เก็บตัวอย่าง ${name} ${person.samples.length}/3 ในหน่วยความจำแล้ว`);
    } catch (error) { if (error.name !== 'AbortError') setMessage(error.message); }
    finally { capturePending.current = false; setBusy(false); }
  }
  function clear() { stop(); samples.current = []; matcher.current = null; detected.current.clear(); setRoster([]); setPresent([]); setApproved(false); setMessage('ล้างข้อมูลทดลองแล้ว'); }
  const button = 'rounded-xl bg-slate-900 px-4 py-3 text-white disabled:opacity-40';
  return <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="rounded-2xl bg-white p-5 shadow-sm"><Link href="/" className="text-sm text-sky-700">← กลับระบบเช็กชื่อ</Link><h1 className="mt-3 text-2xl font-bold">ห้องทดลองสแกนหลายใบหน้า</h1><p className="mt-2">สำหรับผู้ดูแลทดสอบกับอาสาสมัครที่อนุญาตเท่านั้น ใช้รหัสทดลอง A–F ไม่ใช้รายชื่อนักเรียนจริง</p><p className="mt-2 text-sm text-amber-800">ยังไม่ผ่านการวัดความแม่นยำ/การป้องกันรูปปลอม ไม่มีการส่งภาพหรือข้อมูลใบหน้าไปบันทึก และไม่มีปุ่มบันทึกเข้าแถว</p></header>
      <section className="space-y-3 rounded-2xl bg-white p-4">
        <label className="flex gap-3"><input type="checkbox" checked={approved} disabled={running || busy} onChange={e => setApproved(e.target.checked)} /><span>ผู้ร่วมทดลองอนุญาตแล้ว และจะไม่เก็บภาพบุคคลอื่นที่ไม่ได้อนุญาต</span></label>
        <label className="block">โหมดทดลอง <select className="ml-2 rounded border p-2" value={mode} disabled={running || busy} onChange={e => setMode(e.target.value)}><option value="detect">ตรวจจับ / เก็บตัวอย่างทีละคน</option><option value="match">เทียบหลายคนกับตัวอย่างชั่วคราว</option></select></label>
        <label className="block">เลือกกล้อง <select className="ml-2 rounded border p-2" value={facingMode} disabled={busy} onChange={e => { stop(); setFacingMode(e.target.value); }}><option value="environment">กล้องหลัง</option><option value="user">กล้องหน้า</option></select></label>
        <p className="text-sm text-slate-600">เปลี่ยนกล้องแล้วกดเปิดกล้องอีกครั้ง ตัวอย่างที่เก็บไว้ยังอยู่ หากอุปกรณ์มีกล้องเดียว เบราว์เซอร์อาจใช้กล้องที่มี</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={!approved || running || busy || (mode === 'match' && roster.length < 2)} onClick={start}>{busy ? 'กำลังเตรียม…' : (facingMode === 'user' ? 'เปิดกล้องหน้า' : 'เปิดกล้องหลัง')}</button><button className={button} disabled={!running && !busy} onClick={stop}>หยุดกล้อง</button><button className={button} onClick={clear}>ล้างข้อมูลทดลอง</button><button className={button} disabled={running || busy} onClick={testModels}>ทดสอบโมเดลด้วยภาพว่าง</button></div>
        <p role="status" aria-live="polite">{message}</p>
      </section>
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}>
        <video ref={video} muted playsInline className="h-full w-full object-contain" />
        <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-label={`ตรวจพบ ${faces.length} ใบหน้า`}>
          {faces.map(f => <g key={f.trackId}><rect x={f.box[0]} y={f.box[1]} width={f.box[2]} height={f.box[3]} fill="none" stroke={f.quality >= .8 ? '#4ade80' : '#fbbf24'} strokeWidth="4" /><text x={f.box[0]} y={Math.max(20, f.box[1] - 8)} fill="white" fontSize="22">{f.quality >= .8 ? 'ตรวจพบใบหน้า' : 'ขยับใกล้ / เพิ่มแสง'}</text></g>)}
        </svg>
      </div>
      <section className="space-y-3 rounded-2xl bg-white p-4">
        <p>พบตอนนี้ {faces.length} คน · สูงสุด {stats.maxFaces} คน · ประมวลผลล่าสุด {stats.ms} ms · {stats.frames} เฟรม</p>
        <p className="text-sm text-slate-600">ทดสอบ 2, 4 และ 6 คน ตัวเลขสูงสุดที่พบไม่ใช่จำนวนที่รับรองความแม่นยำ</p>
        <label>รหัสอาสาสมัคร <input className="ml-2 w-32 rounded border p-2" maxLength={12} placeholder="เช่น A" value={alias} disabled={busy} onChange={e => setAlias(e.target.value)} /></label>
        <button className={`${button} ml-2`} disabled={!running || busy || mode !== 'detect'} onClick={capture}>เก็บตัวอย่าง 1 ภาพ</button>
        <p>เก็บ 3 ตัวอย่างต่อคน: หน้าตรง หันซ้ายเล็กน้อย หันขวาเล็กน้อย จากนั้นหยุดกล้องแล้วเปลี่ยนโหมด</p>
        <ul>{roster.map(r => <li key={r.name}>{r.name}: {r.count}/3 ตัวอย่างชั่วคราว</li>)}</ul>
        <h2 className="font-bold">รายชื่อที่เสนอว่า “มา” — ทดลองเท่านั้น</h2><p>{present.join(', ') || 'ยังไม่มีผลจับคู่'}</p>
        <p className="text-sm text-amber-800">เกณฑ์ทดลอง cosine ≥ 0.88, ห่างอันดับสอง ≥ 0.08, ต่อเนื่อง 4 ครั้ง ยังไม่ใช่เกณฑ์ใช้งานจริง</p>
      </section>
    </div>
  </main>;
}
