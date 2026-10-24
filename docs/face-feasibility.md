# Face feasibility checkpoint โ€” 2026-10-23

Not approved for student biometric collection or live attendance. Task 1's actual iPhone acceptance gate remains open.

## Candidate selected for the isolated lab

Human 3.3.6 browser bundle (MIT), converted MediaPipe BlazeFace detector and FaceMesh alignment (Apache-2.0), converted HSE FaceRes embedding graph (Apache-2.0). Runtime and model notices: `public/models/face/NOTICE.md`; exact SHA256 values: `manifest.json`. The embedding graph is executed with output `global_pooling/Mean` only: age/gender branches are not requested. Human description/emotion/iris/gesture/body/hand/object/segmentation are disabled.

ONNX Runtime was an architectural example, not a required stack. Human provides the compatible detector/alignment pipeline for this candidate. Archived face-api.js was not selected for new browser integration. InsightFace weights were not selected because permissive library code does not resolve noncommercial model-weight restrictions. No anti-spoof model is shipped: suitable weight provenance and actual replay resistance have not been established. Supervision/review remains mandatory; blinking or repeated frames is not reliable liveness.

## Verified here

- Existing baseline: 25 tests pass.
- New matcher/camera/gate/capture tests: 12 pass (total suite 37).
- Lint passes. Next.js 16.2.6 webpack production build succeeds. The ordinary Turbopack command encounters this local worktree's dependency junction outside its configured root; Vercel should install its own dependencies. No production build configuration was changed for that local junction.
- Real vendored models executed against synthetic CPU tensors: embedding-only output has 1,024 finite normalized values, blank detector input yields zero faces.
- Actual Edge browser opened the admin-gated lab against loopback synthetic Supabase data and loaded the WebGL models; blank canvas inference returned zero faces. This does not establish Chrome/iOS performance or recognition accuracy.
- Camera remains off until explicit participant authorization checkbox and start action. Test aliases and embeddings exist in component memory only. No student roster/template fetch and no attendance write endpoint exists in this prototype.

## Local reproducibility

1. `npm test`, `npm run lint`, `node scripts/verify-face-assets.mjs`.
2. `npm exec next build -- --webpack` (normal installations may use `npm run build`). Windows sandbox may require worker-process permission.
3. Start `node tests/fixtures/supabaseServer.mjs 54339 --small`.
4. Start `node scripts/face-lab-preview.mjs`; it overrides all database settings with the loopback synthetic fixture and enables only the test process's lab flag.
5. Open `http://127.0.0.1:3118/`, sign in with synthetic `test-admin` / `2222`, then open `/face-lab`. Never use these synthetic credentials on the real school site.
6. Select blank-model test to verify loading without a camera. Optional `node scripts/face-model-smoke.mjs` executes the actual bundle/models in a synthetic browser-shaped CPU context; it measures no real-device performance.

## Required next measurements โ€” pending

Use Chrome on the actual iPhone 15 and authorized adult test volunteers before any student collection. Record iOS/Chrome versions, first-load time, warm inference latency, memory/heat observations and a 10-minute sustained trial. Sample 2, 4 and 6 people; these are measurement points, not promised capacity. Collect three individual in-memory samples per test alias, then test on different captures and poses. Include unknown people, similar-looking people, backlight/shade, glasses, crossing/occlusion, duplicate identities, printed-photo and screen-video replay.

Lab policy (cosine .88, margin .08, four observations, quality .8) is explicitly uncalibrated and never exported as an attendance production default. Record wrong-person suggestions, false acceptance/rejection and teacher corrections. Any wrong-person suggestion blocks pilot acceptance pending investigation. A zero-error small sample does not prove zero risk. If performance/accuracy is insufficient, return for an architecture/model decision; never silently transmit frames to an external inference service.

Task 4 onwards (persistent encrypted enrollment, real roster integration, reviewed writes, school pilot) waits for this evidence and school collection conditions. Existing production remains unaffected.

## Preview rollout

Publish only to an isolated feature branch. Set `FACE_LAB_ENABLED=true` only for that preview branch; leave production unset/false. The `/face-lab` server component checks current signed-in admin status in addition to the server flag. A volunteer's face data remains on their supervising admin's browser; there is no database migration or biometric persistence at this stage. Anyone testing must understand that this is a feasibility prototype, not a usable attendance record.

