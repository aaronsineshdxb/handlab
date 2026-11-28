# Make HandLab faster — plan

## Context

HandLab (Next.js 15 + React 19 + three.js + MediaPipe + Rust→WASM rasterizer) is **already heavily performance-engineered**: eager JS is 102 KB gzip against a 108 KB budget enforced by `lib/perf-budget.test.ts`, three.js is fully code-split out of first paint, detection is capped at 30 Hz, pixel ratio is adaptive, shadow maps are on-demand, React updates are coalesced to 100 ms, and the recent commits hoisted wasm sin/cos and idle-prefetch the model.

So the remaining speed is NOT in framework choice or language — it is in two measured bottlenecks plus cheap leftovers:

1. **All ML inference blocks the main thread.** `landmarker.detectForVideo()` runs synchronously in the rAF hand loop (`lib/engine.ts:2812`), stalling rendering/gesture work every detection. Worse, the opt-in Depth Anything V2 loop (`lib/depth/monocular.ts:190`) runs its ORT wasm inference on the **main thread** at ~1.4 fps — each inference can freeze the UI for hundreds of ms on exactly the weak, non-WebGPU devices the q8 path targets. There is no Web Worker anywhere in the repo; CSP already allows `worker-src 'self' blob:`.
2. **`next start` does not compress `public/`** (confirmed earlier). The hand-tracking payload — 11 MB MediaPipe wasm + 7.8 MB model + 323 KB loader — ships uncompressed on every cold cache. We own every fetch boundary for it.
3. **Leftover micro-costs** in the Rust fallback engine (per-byte framebuffer clear instead of a u32 fill, one FFI call per polyline point, a per-frame signature *string* built even when the scene is unchanged) and a `video.currentTime` poll instead of `requestVideoFrameCallback`.

## Rewrite verdict (evaluated, rejected)

A full rewrite in another language was assessed against the constraint "keep all features, stay a web app": the server is 5 tiny JSON-file routes (latency = local disk + network; Go/Rust changes nothing measurable, and classroom hosting must stay plain `npm start` on the teacher's laptop); any web-app rewrite still ships JS/WASM to a browser and calls the same MediaPipe/ORT runtimes; and the one genuine language lever — replacing three.js with the existing Rust sw3d renderer or a custom WebGPU engine everywhere — is months of work for no gain on ≤100-object scenes that adaptive pixel ratio already holds in frame budget. **Targeted surgery gets the real wins at ~10% of the risk.**

## Phase 0 — Instrument first (no perf claim without a number)

- New `lib/perf/recorder.ts`: ring buffer of {frame dt, detect ms, drive ms} wired into `handLoop`/`tick` and the fallback engine; expose `window.__handlabPerf.snapshot()` and add a detect-ms HUD readout next to the existing fps counter (`lib/engine.ts:2792`).
- New benchmark probe `scripts/perf/bench.mjs`: Playwright + Chrome launched with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<hand.y4m>` (a small hand-motion fixture committed under `scripts/perf/`), drives the lab, records 20 s of detect/frame timings, prints p50/p95/max + jank counts. Run locally (recorded baseline before each phase).
- Also baseline cold-load transfer of `/wasm` + `/models` payloads (Network tab or `curl` sizes).

## Phase 1 — Move ML off the main thread (biggest win)

**1a. Hand-tracking worker.**
- New `workers/handDetector.worker.ts`: owns `import("@mediapipe/tasks-vision")` + the landmarker. Delegate preference: GPU via OffscreenCanvas-in-worker when available → CPU-in-worker → never blocks the UI thread either way. Receives `ImageBitmap` frames (transferred, ≤30 Hz via existing `shouldDetect`), posts back per hand a transferable `Float32Array(21×3)` + handedness.
- New `lib/handTracker.ts`: main-thread client with the same call shape the engine uses today (`submitFrame(video, now)` → results callback). Created via `new Worker(new URL(...))` (webpack-native), with automatic fallback to the current inline path if worker creation fails.
- Refactor `lib/engine.ts handLoop` (2785–2833): submit latest frame, consume results in the callback (skeleton queue, drive, 4-frame loss hysteresis keyed on result arrival). The tracker is injected as an engine option so jsdom tests (no Worker) keep passing.

**1b. Depth worker.**
- Move `DepthAnythingV2Provider` inference into `workers/depth.worker.ts`: worker imports transformers.js (officially supported in workers), sets the same vendored `env` overrides (`lib/depth/monocular.ts:160-165`), receives the 256 px crop as ImageBitmap every 700 ms, returns transferable `Float32Array` depth map + precomputed median/std. Main thread keeps the identical `sample()` API (O(1) read of the latest map) — `lib/depth/palm.ts` fusion unchanged.

## Phase 2 — Ship the hand payload compressed

- New `lib/fetchMaybeGzip.ts`: fetch `url + ".gz"` and decompress via `DecompressionStream("gzip")` when supported; transparent fallback to the plain URL (older Safari).
- New `scripts/compress-assets.mjs` (wired as `prebuild`): writes `.gz` siblings for the vendored assets, cached by mtime — not committed (models barely compress; wasm does).
- Wire into the three boundaries we own: `prefetchHandAssets` (`lib/handAssets.ts:42`), landmarker creation via a custom WasmFileset (`wasmBinaryPath` = blob URL of decompressed wasm) + `modelAssetBuffer` (decompressed 7.8 MB as bytes) in `createLandmarker` (`lib/engine.ts:400`), and `Sw3dRenderer.load` (`lib/sw3d.ts:113`). Expected: ~19.5 MB → ~6 MB cold transfer.
- ORT/depth weights stay uncompressed for now (opt-in, transformers fetches internally) — noted as follow-up.

## Phase 3 — Fallback-engine + loop micro-optimizations

- `rust/sw3d/src/lib.rs`: replace the per-byte `chunks_exact_mut(4)` clear with a packed-u32 fill; add `sw3d_push_line_pts(ptr, len)` taking one flat f32 array (reused JS scratch buffer) instead of per-vertex FFI calls (`lib/sw3d.ts:223-234`).
- `lib/fallback2d.ts drawSw3d` (1653–1694): replace the per-frame signature string with a numeric FNV hash (same fields, zero allocation — mirrors the existing skeleton hash at `lib/engine.ts:2855`).
- `requestVideoFrameCallback` for frame submission where available (engine + tracker submit loop), keeping the currentTime gate as fallback.
- Schedule `prefetchHandAssets` via `requestIdleCallback` instead of a mount effect (`components/ShowcaseLab.tsx:281`).

## Phase 4 — Verify

- `npm run lint && npm run typecheck && npm run build && npm test` — perf-budget (108 KB), header, and asset-sha tests must stay green; worker code must remain in lazy chunks.
- Re-run `scripts/perf/bench.mjs`: compare detect-ms p95, frame dt, jank counts against the Phase 0 baseline; expect main-thread inference stalls → 0.
- Cold-load transfer check of the gz path; fallback check by forcing the sw3d path (`--disable-gpu` → software WebGL → fallback2d).
- Manual dogfood on `PORT=3100` (port 3000 is squatted): full lab flow with webcam, `/teacher` host → join → progress → CSV, `/vr` desktop preview.
- Update README Notes + perf-budget history comments with new numbers.

## Features preserved

All of them: gesture set, line/measure tools, lessons (template vars, ghost diff, hint ladder, playlists, checks), classroom, Studio/math panel, nets, VR, save/export, theming, keyboard shortcuts, a11y. Every phase is additive plumbing behind the same public behavior; the inline detection path remains as fallback so no browser loses tracking.