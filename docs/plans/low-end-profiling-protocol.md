# Low-End Profiling Protocol

How to reproduce the measurements behind
[`2026-09-30-low-end-performance.md`](./2026-09-30-low-end-performance.md).
Numbers here were taken on a macOS dev laptop with Chrome DevTools CPU
throttling, which is the closest stand-in for a weak machine we can get without
a device lab. Absolute values on a real phone will differ; the deltas are the
point.

## 1. Throttle to a weak machine

Chrome DevTools → Performance → CPU: **4x slowdown**. Repeat at **6x**.

`6x` is the more honest proxy for a 2019 mid-range phone. If a change only helps
at 4x, it is not a low-end fix.

## 2. Measure FPS and adaptive render ratio

The HUD exposes both, so no profiler is needed:

- `— fps` — engine frame rate
- `render N.NNx` — current adaptive pixel ratio (should read `2.00x` on a
  capable machine and only drop toward `0.75x` when frames are genuinely slow)

Procedure: enable the webcam, then pinch-hold an object and drag it in a
continuous circle for ~10 seconds. Record both readouts. Dragging is the worst
case by design — it drives scene mutations, Math ticks and React updates.

## 3. Count React commits

React DevTools Profiler → record 5 seconds of dragging → read the commit count
for `HandLab`.

This is the number Task 4/6/7/9 targeted. Before, `onScene` coalesced to one
`requestAnimationFrame`, so this was capped only by the display refresh rate.
It should now be bounded by the 100ms `SCENE_SYNC_MS` interval — roughly 50
commits per 5 seconds of continuous dragging, regardless of frame rate.

> Note: this cannot be asserted in `npm test`. Vitest runs in the `node`
> environment, `HandLab` constructs a WebGL engine in a `useEffect`, and jsdom
> has neither WebGL nor a 2D canvas context — so a render-count test would fail
> at engine construction rather than at the assertion. Measure it here instead
> of faking it.

## 4. Measure main-thread scripting

Performance panel → record 5 seconds of dragging → sum `Evaluate Script` and
self-time. Compare against step 3; they should now track each other much more
closely, because most of the scripting work used to be React reconciliation
rather than the engine.

## 5. Measure load

Network panel → tick **Disable cache** → reload.

```bash
npm run build && npm run start
node scripts/perf-report.mjs
```

`perf-report.mjs` prints gzip weight per route from the build manifest. The
complementary number is what loads *after* first paint:

```bash
node -e '
const fs=require("fs"),zlib=require("zlib"),p=".next/";
const lm=JSON.parse(fs.readFileSync(p+"react-loadable-manifest.json"));
const app=JSON.parse(fs.readFileSync(p+"app-build-manifest.json")).pages;
const gz=f=>{const x=p+f;return fs.existsSync(x)?zlib.gzipSync(fs.readFileSync(x)).length:0};
let eager=0; for(const f of app["/page"]) if(f.endsWith(".js")) eager+=gz(f);
let lazy=new Set();
for(const [k,v] of Object.entries(lm)) if(k==="components/LabEntry.tsx -> ./HandLab") for(const f of v.files) lazy.add(f);
let l=0; for(const f of lazy) l+=gz(f);
console.log("eager",(eager/1024).toFixed(1),"KB  lazy",(l/1024).toFixed(1),"KB  total",((eager+l)/1024).toFixed(1),"KB");
'
```

Use this before and after touching bundle config. A change that shrinks the
eager figure while growing the lazy figure may be a net loss — that is exactly
how `LazyMotion` was rejected (see Task 26).

## 6. Confirm the depth download

Network panel → filter `huggingface.co` → enable the webcam.

Expected: one ONNX request for **`model_quantized.onnx` (~27MB)** on the WASM
path, or **`model_fp16.onnx` (~50MB)** where WebGPU is available. `model.onnx`
(fold32, 99MB) should never be requested.

Verify q8 did not degrade depth quality: watch the `DEPTH (Z)` readout while
pushing your hand toward and away from the camera. It should move monotonically
and settle back near the anchor. If it is noisy or drifts, restrict q8 to
constrained devices and leave the WASM path at fp32.

## 7. Confirm cache headers

```bash
npm run build && npm run start
curl -sI http://localhost:3000/wasm/vision_wasm_internal.wasm | grep -i cache-control
curl -sI http://localhost:3000/models/hand_landmarker.task | grep -i cache-control
```

Both must report `public, max-age=31536000, immutable`.

---

## Results

Measured 2026-09-30. `—` means the number was not captured; fill it in when you
run the protocol.

| Metric | Before | After | Target |
|---|---:|---:|---:|
| `/` eager client JS (gzip) | 324.7 KB | **102.2 KB** | < 108 KB (enforced) |
| `/` to interactive (gzip) | 324.7 KB | **323.3 KB** | — |
| Three.js in `/` eager chunks | 3 chunks | **0** | 0 (enforced) |
| 2D fallback engine | eager | **lazy, 6.4 KB on failure** | — |
| Preloaded fonts | 116 KB | **56 KB** | — |
| Depth ONNX download | 99.1 MB | **27.3 MB** (q8) | 27.3 MB |
| `/wasm` + `/models` caching | revalidated | **immutable, 1 year** | — |
| HandLab commits / 5s drag | — | — | ≤ ~50 |
| Drag FPS @ 6x CPU throttle | — | — | > 30 |
| Median main-thread self-time | — | — | −50% |

Load-time numbers are exact and enforced by
`lib/perf-budget.test.ts`. Runtime numbers are left blank because they need a
real device or a DevTools session, and an invented number would be worse than
an empty cell.

## Things that were measured and rejected

| Idea | Result | Why |
|---|---|---|
| `LazyMotion` + `m` components (Task 26) | **27 KB worse** | Puts the `m` runtime in the root layout *and* re-loads features on top of the lazy chunk. Measured 321.2 → 348.1 KB to interactive at the time of the experiment. |
| Deliberately-red bundle budget (Task 2) | **abandoned** | A permanently failing test breaks verification of every later task. The budget starts at the current measurement and is *lowered* as wins land. |
| Render pause via `document.hidden` (Task 18) | **partly dropped** | `requestAnimationFrame` already self-throttles when hidden, so pausing the render loops is near-worthless. The **depth** loop is the real win — `setTimeout` is *not* throttled, so the model kept inferring at full rate in the background. |
| 2D fallback visibility wiring (Task 18) | **skipped** | `lib/fallback2d.ts` has no depth provider at all, so there was nothing to pause. |