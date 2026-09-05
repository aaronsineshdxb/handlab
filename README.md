# HANDLAB — 3D Hand Cursor

A single-file Three.js site that turns your webcam into a floating 3D pointer.
Move your index finger to fly a cursor through 3D space, pinch to click, grab,
and place objects — all relative to your camera, so gestures always match the screen.

No build step. Just serve the folder and open it.

## Run

```bash
cd handlab
python3 -m http.server 8000
# open http://localhost:8000/index.html
```

Requires internet access (Three.js, MediaPipe, and fonts load from CDNs)
and a webcam for hand tracking. Everything also works with mouse + keyboard.

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

The bottom controls stay clear of the shape palette, and the workspace adapts to
smaller screens with a compact horizontal shape rail. When no hand is detected,
the gesture status reads `waiting` instead of reporting a stale pinch state.

The gesture help and camera preview are stacked in the right rail so they no
longer overlap each other or the depth indicator. Losing hand tracking releases
any active pinch/grab state, and webcam restarts are guarded so a failed retry
keeps the previous stream (or mouse fallback) instead of leaving input dead.

## Line / measure mode

Press `L`, then tap to drop points. Every segment shows its length, every
joint shows its angle, and connecting two lines shows the junction angle in pink.
Endpoints auto-snap when close (green ring, toggleable). White dots can be
dragged anytime with live measurement updates.

## Notes

- Hand tracking: MediaPipe HandLandmarker (GPU delegate), loaded on demand
  when you click Enable webcam. `window.__lab` exposes internals for debugging.
- Rendering is optimized: allocation-free hot paths, in-place line updates,
  on-demand shadow maps, shared geometries/materials, throttled HUD,
  and adaptive pixel ratio.
