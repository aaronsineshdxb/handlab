# HANDLAB — 3D Hand Cursor

A Next.js + React + TypeScript + Three.js site that turns your webcam into a
floating 3D pointer. Move your index finger to fly a cursor through 3D space,
pinch to click, grab, and place objects — all relative to your camera, so
gestures always match the screen.

```Demo online
https://handlab-nine.vercel.app/
```

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
```

Requires internet access (MediaPipe model + fonts load from CDNs) and a webcam
for hand tracking. Everything also works with mouse + keyboard.

The app starts in a lightweight mouse-first workspace. Use `gestures` to open
the help drawer and `camera` to show the tracking preview when you need it;
the preview opens automatically after webcam permission succeeds.

## Teaching mode

Use the `Lessons` panel, choose a difficulty, and select a lesson to work
through its objectives and steps. Checks are modeled for place-count, closed
chains, area thresholds, and quizzes. The current MVP UI provides quiz
feedback; scene-check evaluation is not yet wired into lesson progression.
Progress is stored locally in this browser under the `handlab.progress.v1`
key.

Teachers can author lesson JSON matching `lib/lessons/types.ts`, export an
active lesson with `lesson ↓` as a starting point, then import validated custom
lessons with `lesson ↑`; lesson IDs must be unique.

## Structure

| Path | What |
|---|---|
| `app/page.tsx` | Route entry, renders the lab |
| `app/layout.tsx` | Metadata, fonts, favicon |
| `app/globals.css` | All HUD styling |
| `components/HandLab.tsx` | React HUD (palette, status cards, controls) + engine lifecycle |
| `lib/engine.ts` | `HandLabEngine`: Three.js scene, gestures, MediaPipe tracking, measurement |

The 3D engine is imperative and lives in `HandLabEngine` (created in a
`useEffect`, destroyed on unmount). React owns the HUD state; the engine pushes
updates through an `emit` callback and writes high-frequency readouts (XYZ,
fps, depth) straight to DOM nodes via refs.

The app starts in a lightweight mouse-first workspace. Use `gestures` to open the
help drawer and `camera: hidden` to show the tracking preview when you need it;
the preview opens automatically after webcam permission succeeds.

## Controls

| Input | Action |
|---|---|
| Move index finger | Cursor follows your view (screen right / up) |
| Push hand in / out | Cursor depth (into / out of the screen) |
| Left hand height | Depth slider along the view axis |
| Pinch tap | Click / place object / drop line point |
| Pinch hold | Grab + drag objects or line vertices in 3D |
| Fist (hold 0.6s) | Delete hovered object |
| Two-hand spread | Camera zoom |
| Mouse move / wheel | Move on view plane / dolly in-out |
| `1–0` | Select shape (10 shapes) |
| `L` | Line mode |
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

## Scene save / load / export

The toolbar's SCENE section:

- `save` / `load` — persist the full scene (objects + line chains) to
  localStorage in this browser. Invalid or missing saves toast and change nothing.
- `photo` — capture the viewport as a PNG download.
- `file ↓` / `file ↑` — download the scene as JSON, or load one back from disk.
  Bad files toast (`scene data invalid`, `not valid JSON`) and leave the live
  scene untouched.

## Notes

- Depth AI (on by default): Depth Anything V2 (`onnx-community/depth-anything-v2-small`,
  via `@huggingface/transformers`) runs monocular depth estimation at ~2.5fps
  on a 256px crop in a background loop — WebGPU/fp16 when available, WASM
  fallback otherwise. The fingertip z-score delta vs its anchor is fused 70/30
  with the palm-size baseline; stale/low-confidence neural samples are ignored,
  so worst case is pure palm baseline. Starts automatically with the webcam
  (downloads ~100MB once, cached after); disable via `depth v2` in the toolbar.
  Unavailable in 2D fallback mode.
- Hand tracking: MediaPipe HandLandmarker (GPU delegate), loaded on demand
  when you click Enable webcam. Tip/size EMA filter with motion-adaptive
  response, palm-normalized pinch thresholds, 4-frame loss hysteresis,
  handedness-aware control hand, and stabilized fist/zoom.
- Rendering is optimized: allocation-free hot paths, in-place line updates,
  on-demand shadow maps, shared geometries/materials, throttled HUD,
  and adaptive pixel ratio.

## VR (`/vr` route)

Isolated WebXR page — the desktop `/` lab is untouched. Open `/vr`:

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
