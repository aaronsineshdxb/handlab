# HANDLAB — 3D Hand Cursor

site that turns your webcam into a floating 3D pointer. Move your index finger to 
fly a cursor through 3D space,
pinch to click, grab, and place objects 

```Demo online
https://handlab.runs-on.dev/
```

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
```

Requires internet access on the first visit (MediaPipe model, depth weights and
fonts load from the network) and a webcam for hand tracking. Mouse + keyboard
work with no camera, and everything is cached afterwards. The app auto-tunes
render resolution and hand-tracking rate to hold frame rate on modest hardware.

The app starts in a lightweight mouse-first workspace. Use `gestures` to open
the help drawer and `camera` to show the tracking preview when you need it;
the preview opens automatically after webcam permission succeeds.

## Teaching mode

Use the `Lessons` drawer (rail button `≡`), choose Easy/Advanced/Both, and
select a lesson to work through its objectives and steps. Scene checks
(place-count, chain-closed, area-gt, angle-at, length-range) evaluate against
the live scene and gate `Next`; quizzes and numeric checks confirm before
advancing. Progress is stored locally in this browser under the
`handlab.progress.v1` key.

Teachers can author lesson JSON matching `lib/lessons/types.ts`, export the
active lesson with `lesson ↓`, then import validated custom lessons with
`lesson ↑`; lesson IDs must be unique.

### Randomized lessons (template vars)

A lesson can define `vars` (`{ name: { min, max, step?, decimals? } }`) and
reference them as `{{name}}` in prompts/hints/questions and in numeric check
fields (e.g. `{ "kind": "numeric", "answer": "{{h}}", "tolerance": "{{tol}}" }`).
Numbers are rolled per browser and persisted (`handlab.rolls.v1`), so a
refresh keeps the same numbers; the `New numbers` button in the Lessons drawer
re-rolls. Validation rejects references to undefined vars.

### Hint ladder

Each step escalates: prompt → `Show hint` (also auto-revealed after one wrong
quiz/numeric answer) → `Show me`, which renders the step's optional `solution`
scene JSON as a translucent ghost overlay in the 3D scene. Hint/ghost reveals
are counted per lesson (`Progress.hintsUsed`) and reported to the classroom.

### Courses (playlists)

The Lessons drawer has a `Lessons | Courses` switch. Courses are ordered
lesson chains (`lib/lessons/playlists.ts`): a lesson unlocks when the previous
one is done, and the course shows a badge when every lesson in it is done.
Custom playlists import like lessons (`{ id, title, domain?, lessonIds }`).

### Ghost diff overlay

The Settings drawer's `Ghost overlay` section loads any exported scene JSON as
a translucent target to match. Ghosts are display-only: they never enter
picking, measurement, lesson checks, or scene export.

## Classroom (teacher desk)

Hosted at `/teacher` (also linked from the Lessons drawer). The teacher picks
a built-in lesson or imports lesson JSON, presses `Host a class`, and shares
the 5-character code. Students open the same address, enter the code in the
Lessons drawer's `Join your teacher's class` card, and the assigned lesson is
injected into their lab; step completions, scores, and hint usage upload to
the teacher's roster, which polls live (3 s) and exports as CSV.

Hosting uses this app's own server (`next dev` / `npm start`) with one JSON
session file per class under `.handlab-classroom/` (gitignored; override the
directory with `HANDLAB_CLASSROOM_DIR`). No accounts, no external services —
the code is the join capability, the host token (kept in the teacher browser)
gates roster/close endpoints, and sessions expire after 12 h. On serverless
hosts (e.g. Vercel) hosting reports that it needs a persistent machine;
the rest of the app is unaffected.

## Structure

| Path | What |
|---|---|
| `app/page.tsx` | Route entry, renders `LabEntry` |
| `app/layout.tsx` | Metadata, fonts, favicon |
| `components/LabEntry.tsx` | Dynamic entry — lazy-loads `ShowcaseLab` (ssr: false) |
| `components/ShowcaseLab.tsx` | Live lab: rail + drawers, engine lifecycle, lessons |
| `lib/engine.ts` | `HandLabEngine`: Three.js scene, gestures, MediaPipe tracking, measurement |

The 3D engine is imperative and lives in `HandLabEngine` (created in a
`useEffect`, destroyed on unmount). React owns the HUD state; the engine pushes
updates through an `emit` callback and writes high-frequency readouts (XYZ,
fps, depth) straight to DOM nodes via refs.

The app starts in a lightweight mouse-first workspace. Use the `?` rail button
to open the help drawer and the camera rail button (◐) to show the tracking
preview; the preview opens automatically after webcam permission succeeds.

## Controls

| Input | Action |
|---|---|
| Move index finger | Cursor follows your view (screen right / up) |
| Push hand in / out | Cursor depth (into / out of the screen) |
| Left hand height | Depth slider along the view axis |
| Pinch tap | Click / place object / drop line point |
| Pinch hold | Grab + drag objects or line vertices in 3D |
| Fist (hold 0.6s) | Delete hovered object |
| Two-hand pinch + spread/close | Pinch both hands, spread to enlarge / close to shrink shape |
| Mouse move / wheel | Move on view plane (wheel zoom disabled) |
| `1–0` | Select shape (first 10 shapes) |
| `⇧Shift`+`1–5` | Select shapes 11–15 (prism, pyramid, dome, hexPrism, triPrism) |
| `L` | Line mode |
| `P` | Place current shape (works in line mode) |
| `Shift+click` | Place current shape (works in line mode, mouse) |
| `R` | Recenter hand control |
| `Esc` / `Enter` | Finish line chain / exit line mode |
| `Delete` | Delete hovered object |

The bottom controls stay clear of the shape palette, and the workspace adapts
to smaller screens with a compact scrollable toolbar. When no hand is
detected, the gesture status reads `waiting` instead of reporting a stale
pinch state.

The gesture help and camera preview start hidden in the bottom bar so they no
longer overlap each other or the depth indicator. Losing hand tracking
releases any active pinch/grab state, and webcam restarts are guarded so a
failed retry keeps the previous stream (or mouse fallback) instead of leaving
input dead.

## Line mode

Press `L`, then tap to drop points. Endpoints auto-snap when close (green ring,
toggleable), and white dots can be dragged anytime. Press `Esc` or `Enter` to
finish the current chain.

Shapes stay creatable without leaving line mode: the toolbar `place` button,
the `P` key, or `Shift+click` drops the current solid at the cursor, and
tapping (or pinching) directly on a solid selects / drags it instead of
adding a line point.

## Scene save / load / export

The toolbar's SCENE section:

- `save` / `load` — persist the full scene (objects + line chains) to
  localStorage in this browser. Invalid or missing saves toast and change nothing.
- `photo` — capture the viewport as a PNG download.
- `file ↓` / `file ↑` — download the scene as JSON, or load one back from disk.
  Bad files toast (`scene data invalid`, `not valid JSON`) and leave the live
  scene untouched.

## Notes

- Depth AI (off by default — `depth v2` in the drawer starts it): Depth Anything V2 (`onnx-community/depth-anything-v2-small`,
  via `@huggingface/transformers`) runs monocular depth estimation at ~1.4fps
  on a 256px crop in a background loop. Weights are vendored under
  `/public/models/onnx-community/depth-anything-v2-small`, so there is no
  Hugging Face download: it works offline and `connect-src` is `'self'` only.
  The device picks ~50MB via WebGPU (fp16) or ~27MB on the WASM fallback (q8).
  fp32 is never used — the WASM backend has no fp16 acceleration, so it would
  cost 99MB for nothing. A WebGPU adapter always gets fp16; no-WebGPU always
  gets q8. To re-vendor after a version bump:
  `curl -L https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/{config.json,preprocessor_config.json,quantize_config.json}`
  plus `onnx/model_fp16.onnx` and `onnx/model_quantized.onnx`, then update the
  sha256 pins in `lib/depthAssets.test.ts` in the same commit.
  The ONNX Runtime WASM build is vendored under `/public/ort` and loaded
  same-origin, because transformers.js otherwise rewrites `wasmPaths` to
  jsdelivr — which our CSP blocks — and depth AI fails with a bare network
  error. Re-vendor with
  `cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.* public/ort/`.
  The
  fingertip z-score delta vs its anchor is fused 70/30 with the palm-size
  baseline; stale/low-confidence neural samples are ignored, so worst case is
  pure palm baseline. Inference pauses while the tab is hidden. It loads only
  when you enable it — the palm-size baseline runs alone otherwise.
  Unavailable in 2D fallback mode.
- Hand tracking: MediaPipe HandLandmarker, loaded on demand when you click
  Enable webcam. Prefers the GPU delegate and silently retries on CPU when GPU
  creation fails, so a blocklisted GPU degrades to a slower tracker rather than
  no tracker. Detection is capped at 30Hz. Tip/size EMA filter with
  motion-adaptive response, palm-normalized pinch thresholds, 4-frame loss
  hysteresis, handedness-aware control hand, and stabilized fist detection
  (camera zoom disabled).
- Rendering is optimized: allocation-free hot paths, in-place line updates,
  on-demand shadow maps, shared geometries/materials, a dirty-checked
  imperative HUD, and adaptive pixel ratio that can fall to 0.75x on a device
  which cannot otherwise hold frame rate. Both render loops and the depth loop
  pause while the tab is hidden.
- Bundle: the lab and VR routes are code-split behind `dynamic()` with
  `ssr: false`, so Three.js (and the 1.2k-line 2D fallback engine, which loads
  only when WebGL context creation actually fails) arrive after first paint.
  Eager client JS per route is ~102KB gzip, guarded by
  `lib/perf-budget.test.ts`. Vendored `/wasm` and `/models` assets (19.6MB) are
  served `immutable` and cached for a year.
- Scene changes are coalesced to one React update per 100ms
  (`lib/sceneSync.ts`). Reconciling the HUD once per animation frame, with a
  full scene export each time, was the single largest source of drag jank.

## VR (`/vr` route)


- `Enter VR` requests an `immersive-vr` session (`local-floor` + `hand-tracking`
  optional features) via `lib/xr/session.ts`. Requires HTTPS (Vercel OK) and a
  WebXR browser (Quest Browser, or desktop Chrome + Immersive Web Emulator).
- Controllers: trigger tap = place / line point, grip hold = grab + drag,
  right stick = ray depth, left stick = rig height. Bare hands: XR joint pinch
  (`thumb-tip` vs `index-finger-tip`, hysteresis in `lib/xr/input.ts`) maps to
  the same tap/hold semantics.
- `lib/vr-engine.ts` is a standalone engine (no MediaPipe / depth AI): same v1
  scene JSON as desktop, shared `localStorage` key `handlab.scene.v1`, so
  `save`/`load`/`file ↓↑` transfer scenes between `/` and `/vr`.
- Desktop fallback: orbit preview + click-to-place, so the page is usable
  without a headset.
