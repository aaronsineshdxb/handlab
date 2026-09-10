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
| `L` | Line / measure mode |
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

## Line / measure mode

Press `L`, then tap to drop points. Every segment shows its length, every
joint shows its angle, and connecting two lines shows the junction angle in pink.
Endpoints auto-snap when close (green ring, toggleable). White dots can be
dragged anytime with live measurement updates.
Tap near the FIRST point (3+ pts) to close a loop: the centroid badge and the
MEASURE panel show perimeter + area (Newell 3D), centroid, plane normal, and
per-vertex angles. `copy JSON` exports every chain for real math elsewhere.

## Scene save / load / export

The toolbar's SCENE section:

- `save` / `load` — persist the full scene (objects + line chains) to
  localStorage in this browser. Invalid or missing saves toast and change nothing.
- `photo` — capture the viewport as a PNG download.
- `file ↓` / `file ↑` — download the scene as JSON, or load one back from disk.
  Bad files toast (`scene data invalid`, `not valid JSON`) and leave the live
  scene untouched.

## Notes

- Hand tracking: MediaPipe HandLandmarker (GPU delegate), loaded on demand
  when you click Enable webcam. Tip/size EMA filter with motion-adaptive
  response, palm-normalized pinch thresholds, 4-frame loss hysteresis,
  handedness-aware control hand, and stabilized fist/zoom.
- Rendering is optimized: allocation-free hot paths, in-place line updates,
  on-demand shadow maps, shared geometries/materials, throttled HUD,
  and adaptive pixel ratio.
