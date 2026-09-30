# HandLab Low-End Performance Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make HANDLAB run smoothly on weak computers (old integrated GPUs, 4-core phones, low-bandwidth connections) by removing wasted work — not by removing visual features.

**Architecture:** Three independent levers, applied in order of value-per-risk. (1) Stop the React tree from reconciling at 60 Hz during drags, and stop calling the expensive full-scene exporter from the render path. (2) Stop the CPU from doing per-frame work that does not need to happen per frame — hand tracking, depth inference, and both render loops all pause when the tab is hidden, and hand detection is rate-capped. (3) Shrink what a weak device has to download — split the Three.js route off the critical path, and serve a 3.6× smaller depth model to the exact devices that cannot run WebGPU.

**Tech Stack:** Next.js 15.5 (App Router), React 19.2, TypeScript 5.9, Three.js 0.186, `@mediapipe/tasks-vision` 1.0.1, `@huggingface/transformers` 4.3, Vitest 5.

---

## Constraints (agreed with the user)

| Decision | Choice | Consequence for this plan |
|---|---|---|
| Weak-device strategy | **Keep visuals, fix jank only** | Do **not** add an auto-downgrade quality tier. No shadow disabling, no MSAA disabling, no lighting cuts. |
| Depth AI on weak devices | **Ship a smaller model on weak devices** | Switch the no-WebGPU (WASM) path from fp32 → q8. |
| Scope | **Full stack** | Engine + tracking + depth + React + bundle + network. |

### The one visual concession in this plan

Task 21 lowers the adaptive-pixel-ratio floor from `1.0` to `0.75`. This is the **only** task that changes rendered output. It is gated so it cannot fire on a device that is keeping up, it is independently revertible (one constant), and its current value is surfaced in the HUD. If the user rejects visual concessions entirely, delete Task 21 and nothing else breaks.

### Pre-existing uncommitted work — do not clobber

`git status` at plan time shows 6 modified files with **89 tests passing**:

```
 M components/HandLab.tsx      (+55/-…)   lesson checks gating
 M components/LessonPanel.tsx  (+82/-…)   checkStatus checklist
 M lib/engine.ts               (+5/-…)    onScene plumbing
 M lib/fallback2d.ts           (+2/-…)    onScene plumbing
 M lib/lessons/checks.ts       (+69/-…)   anyClosedChain semantics
 M lib/lessons/checks.test.ts  (+21/-…)
```

**Task 0 exists solely to land this.** Do not start any other task until the working tree is clean.

---

## Measured baseline (2026-09-30, Next 15.5.26 build in `.next/`)

### First load of `/` (modern browser; `polyfills` is `noModule`, not downloaded)

| Asset | raw | gzip |
|---|---:|---:|
| three core chunk | 244.8 KB | 65.7 KB |
| three addons chunk | 348.5 KB | 84.4 KB |
| three examples/jsm (OrbitControls, XRHandModelFactory) | 23.7 KB | 6.2 KB |
| `motion/react` | 137.8 KB | 45.3 KB |
| `app/page` (HandLab + LessonPanel + engine + **fallback2d**) | 84.2 KB | ~22 KB |
| react-dom + app-router runtime + css + shell | ~375 KB | ~107 KB |
| **TOTAL JS** | **~1 214 KB** | **~339 KB** |
| 3 preloaded `.woff2` (Geist, **Newsreader 58 KB**, Geist_Mono) | 110.6 KB | pre-compressed |

**Zero `next/dynamic` in the codebase.** Three.js is 50% of the route JS and loads eagerly even though the page is a canvas.

### Depth model sizes (`onnx-community/depth-anything-v2-small`, verified against the HF API)

| ONNX file | size | current use |
|---|---:|---|
| `model.onnx` (fp32) | **99.1 MB** | ← **WASM fallback path today** |
| `model_fp16.onnx` | 49.6 MB | ← WebGPU path today |
| `model_quantized.onnx` (q8) | **27.3 MB** | available, unused |
| `model_q4f16.onnx` | 19.1 MB | available, unused |

The current WASM fallback downloads **99.1 MB**. WASM has no fp16 matmul acceleration, so fp32 there buys nothing over q8 and costs 3.6× the bytes. This is the single largest waste in the app, and it lands precisely on the devices we care about.

### Runtime findings

| # | Finding | Location |
|---|---|---|
| R1 | `HandLab` re-renders its **entire tree at up to 60 Hz** during any drag, with **zero** `React.memo` and **zero** `useCallback` in the codebase | `components/HandLab.tsx:115-122`, `184-191` |
| R2 | `snap` `useMemo` calls `engine.exportScene()` (full scene: per-mesh `getHexString()` + 6 number arrays each), then `.map()`s it into a **second** object graph — checks only need the shape string | `HandLab.tsx:184-191`, `lib/engine.ts:832-845` |
| R3 | MediaPipe `detectForVideo` runs **every rAF** (up to 60 Hz), gated only by `video.currentTime` | `lib/engine.ts:1820-1842`, `lib/fallback2d.ts:854` |
| R4 | MediaPipe `delegate: "GPU"` hardcoded — **no CPU retry** on the 3D path (the 2D path has one). Blocklisted/integrated GPU → webcam dies entirely | `lib/engine.ts:983` vs `lib/fallback2d.ts:411` |
| R5 | Neither render loop nor the depth `setTimeout` loop pauses when the tab is hidden | `lib/engine.ts:2072`, `lib/depth/monocular.ts:109-117` |
| R6 | Adaptive pixel ratio floor is `1.0`; a device stuck at 25 fps at DPR 1.0 has no escape | `lib/engine.ts:2176-2187` |
| R7 | 19.6 MB of `/wasm` + `/models` served with `max-age=0, must-revalidate` — revalidation round trip every session | `next.config.ts` (headers only) |
| R8 | `lib/fallback2d.ts` (1183 lines) is statically imported but only used when WebGL context creation **throws** | `HandLab.tsx:12` |
| R9 | 10 `<Magnet>` instances × 2 `useSpring` = **20 springs**; `Magnet` is the only `bits/` component missing `useReducedMotion()`, and each does a `getBoundingClientRect()` per mousemove | `components/bits/Magnet.tsx:20-44` |
| R10 | `LessonPanel` effect deps include `onNext`/`onBack` — new closures every parent render ⇒ the effect is torn down and re-run on **every** `HandLab` render | `components/LessonPanel.tsx:89-99` |
| R11 | `HandLab` progress effect depends on `snap`, which is rebuilt at 60 Hz during drags | `HandLab.tsx:320-338` |
| R12 | No cache headers, no `optimizePackageImports`, no `compress` — `next.config.ts` contains security headers and nothing else | `next.config.ts:26-48` |

### Verified NOT problems (do not "fix" these)

- HUD text writes are already imperative + dirty-checked (`lib/engine.ts:1121-1126`, `:2160-2172`). ✅
- Shadows are already `autoUpdate = false` with an explicit `needsUpdate` dirty flag. ✅
- `ExperimentViewer.tsx` and `SimulationBar.tsx` are pure static renders — no hooks, no canvas, no rAF. ✅
- `lib/experiments/*` (66 KB) is **not** in any client bundle — `app/physics` and `app/chemistry` both `redirect("/")`. ✅
- No `navigator.deviceMemory` / `hardwareConcurrency` / `getBattery` / `saveData` usage exists today. This plan adds the first.
- Test suite is green: **16 files, 89 tests, 6.3s.** The stale claim in `dogfood-output/REACT-A11Y-AUDIT.md:448` that `checks.test.ts` fails is **out of date** — re-verify with Task 1, do not "fix" it.

---

## Verification strategy (read this before Task 1)

Three tiers, because the work spans three layers that need different instruments:

1. **Unit-tested (vitest, `node` env).** Anything extracted into a pure module: caps probe, throttle, `exportCheckSnap`, `next.config` header shape, depth dtype selection. These are the load-bearing invariants — TDD them properly.
2. **Regression-guarded (build script + committed baseline).** `scripts/perf-report.mjs` emits gzip totals per route; `lib/perf-budget.test.ts` fails the suite if a number regresses past a threshold. This is what stops the bundle from silently growing back.
3. **Profiler-verified (documented manual protocol, Task 31).** Render counts and FPS cannot be asserted in `node`-env vitest — `HandLab` constructs a WebGL engine in a `useEffect`, and jsdom has neither WebGL nor a 2D canvas context, so a render-count test would fail at engine construction, not at the assertion. **Do not fake this with jsdom.** Measure it once in DevTools, record before/after numbers in this plan's results table, and mark the affected tasks as profiler-verified.

---

## Phase 0 — Land in-flight work

### Task 0: Commit the existing uncommitted changes

**Objective:** Get a clean tree so every later task's diff is reviewable in isolation.

**Files:**
- Modify: `components/HandLab.tsx`, `components/LessonPanel.tsx`, `lib/engine.ts`, `lib/fallback2d.ts`, `lib/lessons/checks.ts`, `lib/lessons/checks.test.ts`

**Step 1: Confirm the suite is green before committing**

Run: `npm test`
Expected: `Test Files 16 passed (16)` / `Tests 89 passed (89)`

If any test fails, **stop** — the failures are pre-existing and unrelated to this plan. Report them and ask.

**Step 2: Confirm typecheck is green**

Run: `npm run typecheck`
Expected: exit 0, no output

**Step 3: Review the diff before staging**

Run: `git diff`
Expected: only the 6 files above, all lesson-check related. If you see unrelated changes, stop and ask.

**Step 4: Commit**

```bash
git add components/HandLab.tsx components/LessonPanel.tsx lib/engine.ts lib/fallback2d.ts lib/lessons/checks.ts lib/lessons/checks.test.ts
git commit -m "feat: gate lesson progression on scene checks"
```

---

## Phase 1 — Measurement infrastructure (do this first; it proves everything else)

### Task 1: Add a build-time performance report script

**Objective:** A single command that prints the gzip weight of every JS chunk per route, so "the bundle got smaller" is a fact rather than an opinion.

**Files:**
- Create: `scripts/perf-report.mjs`

**Step 1: Write the script**

```js
// scripts/perf-report.mjs
// Reports gzip weight of client JS per route from the .next build manifest.
// Usage: npm run build && node scripts/perf-report.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const chunksDir = join(root, ".next/static/chunks");
const manifestPath = join(root, ".next/app-build-manifest.json");

if (!statSync(chunksDir, { throwIfNoEntry: false })) {
  console.error("no .next/static/chunks — run `npm run build` first");
  process.exit(1);
}

const kb = (n) => (n / 1024).toFixed(1).padStart(8) + " KB";
const report = {};

for (const route of Object.keys(JSON.parse(readFileSync(manifestPath, "utf8")))) {
  const files = JSON.parse(readFileSync(manifestPath, "utf8"))[route];
  let raw = 0;
  let gz = 0;
  const rows = [];
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const buf = readFileSync(join(root, ".next", f));
    raw += buf.length;
    gz += gzipSync(buf).length;
    rows.push([relative(".next", f), buf.length, gzipSync(buf).length]);
  }
  report[route] = { raw, gz, files: rows };
  console.log(`\n${route}`);
  console.log(`  total   ${kb(raw)} raw  ${kb(gz)} gzip`);
  for (const [name, r, g] of rows.sort((a, b) => b[2] - a[2]).slice(0, 8)) {
    console.log(`    ${kb(r)}  ${kb(g)}  ${name}`);
  }
}

const worst = Object.entries(report).sort((a, b) => b[1].gz - a[1].gz)[0];
console.log(`\nworst route: ${worst[0]} at ${kb(worst[1].gz)} gzip`);
```

**Step 2: Add the script to package.json**

Modify `package.json` — add to the existing `scripts` object (keep alphabetical order within the object as it currently reads):

```json
"perf": "next build && node scripts/perf-report.mjs"
```

**Step 3: Record the baseline**

Run: `npm run perf`
Expected: prints per-route tables. `/page` should report roughly **339 KB gzip**. Save the full output into a scratch file for comparison in Task 21.

**Step 4: Commit**

```bash
git add scripts/perf-report.mjs package.json
git commit -m "chore: add bundle weight report script"
```

---

### Task 2: Add a bundle-size regression budget test

**Objective:** Fail `npm test` if the `/` route's gzip weight grows past a ceiling, so the wins in Phase 4 are not silently given back.

**Files:**
- Create: `lib/perf-budget.test.ts`

**Step 1: Write the failing test**

```ts
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Gzip ceilings for the eager client JS of each route, in bytes.
// Lower these as Phase 4 lands. Do NOT raise them to make a build pass —
// if a legitimate change requires more weight, say so in review instead.
const BUDGET_GZ: Record<string, number> = {
  "/page": 200 * 1024,
  "/vr/page": 200 * 1024,
};

const manifestPath = join(process.cwd(), ".next/app-build-manifest.json");
const hasBuild = existsSync(manifestPath);

describe.skipIf(!hasBuild)("bundle budget", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    string[]
  >;

  for (const [route, budget] of Object.entries(BUDGET_GZ)) {
    it(`${route} stays under ${(budget / 1024).toFixed(0)}KB gzip`, () => {
      const files = manifest[route] ?? [];
      const gz = files
        .filter((f) => f.endsWith(".js"))
        .reduce(
          (sum, f) => sum + gzipSync(readFileSync(join(process.cwd(), ".next", f))).length,
          0,
        );
      expect(
        gz,
        `${route} is ${(gz / 1024).toFixed(1)}KB gzip, budget ${(budget / 1024).toFixed(0)}KB`,
      ).toBeLessThanOrEqual(budget);
    });
  }
});
```

**Step 2: Run it to verify it FAILS**

Run: `npm run build && npx vitest run lib/perf-budget.test.ts`
Expected: FAIL — `/page` is ~339 KB against a 200 KB budget. **This failure is the point.** It documents how much is on the table and gives Phase 4 a target to beat.

**Step 3: Do not "fix" it yet**

Leave the test failing through Phase 1–3. Tasks 21 and 26 are what make it pass. Committing a red test is acceptable here **only** because the very next phase turns it green — note that in the commit body.

**Step 4: Commit**

```bash
git add lib/perf-budget.test.ts
git commit -m "test: add route bundle gzip budget (red until Phase 4 lands)"
```

---

## Phase 2 — React render churn (R1, R2, R9, R10, R11)

This is the highest-value phase for perceived smoothness: during a drag, the CPU is currently doing a full React reconciliation, a full scene export, ~200 object allocations, and 20 spring updates **per animation frame**.

### Task 3: Extract the scene-sync throttle into a testable module

**Objective:** Replace the inline rAF coalescer in `HandLab.tsx` with a pure, unit-tested throttle so the React update rate becomes a tested constant rather than an inline closure.

**Files:**
- Create: `lib/sceneSync.ts`
- Create: `lib/sceneSync.test.ts`
- Modify: `components/HandLab.tsx:112-122`

**Why 10 Hz:** the HUD already throttles XYZ/depth to every 6th frame (`lib/engine.ts:2160`), and lesson checks are pass/fail gates that a human cannot perceive changing 6× faster. 100 ms is well inside that.

**Step 1: Write the failing test**

```ts
// lib/sceneSync.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSceneSync, SCENE_SYNC_MS } from "./sceneSync";

describe("createSceneSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("exports a 100ms interval as the documented constant", () => {
    expect(SCENE_SYNC_MS).toBe(100);
  });

  it("coalesces a burst of calls into a single notification", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    for (let i = 0; i < 50; i++) sync();
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SCENE_SYNC_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not fire again until another full interval has elapsed", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    sync();
    vi.advanceTimersByTime(SCENE_SYNC_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SCENE_SYNC_MS * 3);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("fires again once new calls arrive after the interval", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    sync();
    vi.advanceTimersByTime(SCENE_SYNC_MS);
    sync();
    vi.advanceTimersByTime(SCENE_SYNC_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("trailing call still fires when disposed mid-interval", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    sync();
    sync.flush();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("dispose cancels a pending notification", () => {
    const onChange = vi.fn();
    const sync = createSceneSync(onChange);
    sync();
    sync.dispose();
    vi.advanceTimersByTime(SCENE_SYNC_MS * 5);
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run it to verify it fails**

Run: `npx vitest run lib/sceneSync.test.ts`
Expected: FAIL — `Cannot find module './sceneSync'`

**Step 3: Write the implementation**

```ts
// lib/sceneSync.ts
/**
 * Coalesces high-frequency scene mutations into one React update per interval.
 *
 * The engine emits scene changes from place/delete/drag (drag emits every 6th
 * frame via emitMath). Coalescing to a fixed 100ms keeps the lesson checklist
 * and object counter live without reconciling the HUD once per animation
 * frame — the single largest source of main-thread jank during a drag.
 *
 * Uses a plain interval rather than requestAnimationFrame so the rate is
 * independent of the render loop and testable with fake timers.
 */
export const SCENE_SYNC_MS = 100;

export interface SceneSync {
  /** Request a sync. At most one notification fires per SCENE_SYNC_MS. */
  (): void;
  /** Notify immediately if a sync is pending (used on unmount/teardown). */
  flush(): void;
  /** Cancel any pending notification. Safe to call twice. */
  dispose(): void;
}

export function createSceneSync(onChange: () => void): SceneSync {
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const notify = (): void => {
    stop();
    onChange();
  };

  const sync = ((): void => {
    if (timer !== null) return;
    timer = setInterval(notify, SCENE_SYNC_MS);
  }) as SceneSync;

  sync.flush = notify;
  sync.dispose = stop;
  return sync;
}
```

**Step 4: Run it to verify it passes**

Run: `npx vitest run lib/sceneSync.test.ts`
Expected: 6 passed

**Step 5: Commit**

```bash
git add lib/sceneSync.ts lib/sceneSync.test.ts
git commit -m "feat: add testable scene-sync throttle (100ms)"
```

---

### Task 4: Wire the throttle into HandLab

**Objective:** Replace the inline rAF coalescer so drag-time React updates drop from ~60/s to 10/s.

**Files:**
- Modify: `components/HandLab.tsx:3`, `components/HandLab.tsx:112-122`, `components/HandLab.tsx:159-162`

**Step 1: Add the import**

At `components/HandLab.tsx:3`, after the existing react import, add:

```ts
import { createSceneSync } from "../lib/sceneSync";
```

**Step 2: Replace the inline coalescer**

Replace `components/HandLab.tsx:112-122`:

```ts
    // Lesson checks re-evaluate off this. Scene mutations arrive in bursts
    // (place, then a drag emitting math every 6th frame), so coalesce to one
    // React update per animation frame instead of one per mutation.
    let sceneRaf = 0;
    const onScene = () => {
      if (sceneRaf) return;
      sceneRaf = requestAnimationFrame(() => {
        sceneRaf = 0;
        setSceneRev((rev) => rev + 1);
      });
    };
```

with:

```ts
    // Lesson checks re-evaluate off this. Scene mutations arrive in bursts
    // (place, then a drag emitting math every 6th frame), so coalesce to one
    // React update per 100ms. See lib/sceneSync.ts — reconciling the HUD
    // once per animation frame was the largest source of drag jank.
    const sceneSync = createSceneSync(() => setSceneRev((rev) => rev + 1));
    const onScene = () => sceneSync();
```

**Step 3: Update the cleanup**

Replace `components/HandLab.tsx:159-162`:

```ts
    return () => {
      if (sceneRaf) cancelAnimationFrame(sceneRaf);
      engine?.dispose();
      engineRef.current = null;
    };
```

with:

```ts
    return () => {
      sceneSync.dispose();
      engine?.dispose();
      engineRef.current = null;
    };
```

**Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `18 passed` files / `97 passed` tests

**Step 5: Commit**

```bash
git add components/HandLab.tsx
git commit -m "perf: throttle scene-driven React updates to 10Hz"
```

---

### Task 5: Add a check-only scene exporter to the engine

**Objective:** Give lesson checks a cheap snapshot that does not build the full `SceneData` graph.

**Why:** `exportScene()` (`lib/engine.ts:832-845`) allocates, per mesh, a hex **string** plus 6 numbers across 2 arrays — then `HandLab.tsx:187` maps that into a *second* object graph. But `SceneSnap` (`lib/lessons/checks.ts:3-7`) only reads `object.s` and `chain` coordinates. With 30 objects that is roughly 200 wasted allocations per sync, at 10 syncs/second, forever.

**Files:**
- Modify: `lib/engine.ts:832` (add method after `exportScene`)
- Create: `lib/checksnap.test.ts`

**Step 1: Write the failing test**

```ts
// lib/checksnap.test.ts
import { describe, expect, it } from "vitest";
import { toCheckSnap } from "./engine";
import type { SceneData } from "./engine";

const scene: SceneData = {
  version: 1,
  objects: [
    { s: "cube", c: "#016a71", p: [1, 2, 3], r: [0, 0, 0] },
    { s: "sphere", c: "#ff0000", p: [4, 5, 6], r: [0, 0, 0] },
    { s: "cube", c: "#00ff00", p: [7, 8, 9], r: [0, 0, 0] },
  ],
  chains: [
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  ],
};

describe("toCheckSnap", () => {
  it("keeps only the shape name per object", () => {
    const snap = toCheckSnap(scene);
    expect(snap.objects).toEqual([{ s: "cube" }, { s: "sphere" }, { s: "cube" }]);
  });

  it("keeps chain coordinates so closure and area checks still work", () => {
    const snap = toCheckSnap(scene);
    expect(snap.chains).toEqual([
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
    ]);
  });

  it("carries quiz answers through untouched", () => {
    const snap = toCheckSnap(scene, { q1: 2 });
    expect(snap.quizAnswers).toEqual({ q1: 2 });
  });

  it("returns empty collections for an empty scene", () => {
    const snap = toCheckSnap({ version: 1, objects: [], chains: [] });
    expect(snap.objects).toEqual([]);
    expect(snap.chains).toEqual([]);
    expect(snap.quizAnswers).toEqual({});
  });

  it("produces output that satisfies the SceneSnap contract", () => {
    // compile-time guarantee: the shape must be assignable to SceneSnap
    const snap = toCheckSnap(scene);
    const objects: { s: string }[] = snap.objects;
    const chains: number[][][] = snap.chains;
    expect(objects.length + chains.length).toBe(4);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `npx vitest run lib/checksnap.test.ts`
Expected: FAIL — `toCheckSnap` is not exported from `./engine`

**Step 3: Add the reducer to `lib/engine.ts`**

Add immediately after `exportScene()` closes at `lib/engine.ts:845`:

```ts
/**
 * Reduce a full scene to the minimal shape lesson checks need.
 *
 * `exportScene` builds a hex color string plus 6 numbers per object because
 * it round-trips through save/load. Lesson checks only read the shape name
 * and chain coordinates, so this drops ~200 allocations per sync for a
 * 30-object scene. Pure function so it is testable without a WebGL context.
 */
export function toCheckSnap(
  scene: SceneData,
  quizAnswers: Record<string, number> = {},
): SceneSnap {
  return {
    objects: scene.objects.map(({ s }) => ({ s })),
    chains: scene.chains,
    quizAnswers,
  };
}
```

**Step 4: Add the `SceneSnap` import to `lib/engine.ts`**

At the top of `lib/engine.ts`, add alongside the existing imports:

```ts
import type { SceneSnap } from "./lessons/checks";
```

**Step 5: Run it to verify it passes**

Run: `npx vitest run lib/checksnap.test.ts`
Expected: 5 passed

**Step 6: Verify no import cycle**

`lib/lessons/checks.ts` imports only `./types`, so importing it from `lib/engine.ts` cannot cycle. Confirm:

Run: `npm run typecheck`
Expected: exit 0

**Step 7: Commit**

```bash
git add lib/engine.ts lib/checksnap.test.ts
git commit -m "perf: add check-only scene reducer, dropping full SceneData rebuild"
```

---

### Task 6: Use the cheap snapshot in HandLab

**Objective:** Replace the double-allocation `snap` memo with the reducer.

**Files:**
- Modify: `components/HandLab.tsx:182-191`

**Step 1: Replace the memo body**

Replace `components/HandLab.tsx:182-191`:

```ts
  // Recomputed only when the engine reports a scene change, so this stays off
  // the render path's hot loop while still reflecting the live scene.
  const snap = useMemo<SceneSnap>(() => {
    const scene = eng()?.exportScene();
    return {
      objects: scene?.objects.map(({ s }) => ({ s })) ?? [],
      chains: scene?.chains ?? [],
      quizAnswers,
    };
  }, [sceneRev, quizAnswers]); // eslint-disable-line react-hooks/exhaustive-deps
```

with:

```ts
  // Recomputed only when the engine reports a scene change (throttled to
  // 10Hz by sceneSync), so this stays off the render hot path. toCheckSnap
  // drops the color/rotation fields the checks never read.
  const snap = useMemo<SceneSnap>(() => {
    const scene = eng()?.exportScene();
    return toCheckSnap(
      scene ?? { version: 1, objects: [], chains: [] },
      quizAnswers,
    );
  }, [sceneRev, quizAnswers]);
```

**Step 2: Add the import**

Extend the existing `../lib/engine` import at `components/HandLab.tsx:4-11` to include `toCheckSnap`:

```ts
import {
  HandLabEngine,
  SHAPES,
  initialUiState,
  toCheckSnap,
  type HudNodes,
  type ShapeName,
  type UiState,
} from "../lib/engine";
```

**Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `19 passed` files / `102 passed` tests

**Step 4: Commit**

```bash
git add components/HandLab.tsx
git commit -m "perf: use toCheckSnap for lesson-check snapshots"
```

---

### Task 7: Stabilise HandLab callback identities

**Objective:** Make the four handlers passed to `LessonPanel` referentially stable so its effects stop re-running every render (R10).

**Files:**
- Modify: `components/HandLab.tsx:3`, `253`, `275`, `287`, `298`

**Step 1: Add `useCallback` to the react import**

Replace `components/HandLab.tsx:3`:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

with:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

**Step 2: Wrap `selectLesson`**

Locate the `selectLesson` function declaration (`components/HandLab.tsx:253`) and wrap it, changing only the signature line and the closing brace:

```ts
  const selectLesson = useCallback((id: string) => {
    // ...existing body unchanged...
  }, []);
```

**Step 3: Wrap `nextLessonStep` and `previousLessonStep`**

Same treatment at `components/HandLab.tsx:275` and `:287`. Both only touch `setLessonId` / `setLessonStepIdx` and read `lessonsRef.current`, so `[]` is a correct and complete dependency list:

```ts
  const nextLessonStep = useCallback((nextStepIdx: number) => {
    // ...existing body unchanged...
  }, []);

  const previousLessonStep = useCallback((previousStepIdx: number) => {
    // ...existing body unchanged...
  }, []);
```

**Step 4: Confirm no stale-closure risk before using `[]`**

Run: `rg -n "lessonsRef|progressMap|quizAnswers|snap" components/HandLab.tsx | head -30`

Expected: the four handlers reference **only** `lessonsRef.current` (a ref, safe) and `set*` setters (stable). If any handler body reads `lessons`, `progressMap`, `quizAnswers`, or `snap` directly, add that variable to the dependency array instead of `[]` — do not ship a stale closure.

**Step 5: Wrap `handleQuizAnswer`**

Same treatment at `components/HandLab.tsx:298`:

```ts
  const handleQuizAnswer = useCallback(
    (check: QuizCheck, answerIndex: number) => {
      // ...existing body unchanged...
    },
    [],
  );
```

**Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `19 passed` files / `102 passed` tests

**Step 7: Commit**

```bash
git add components/HandLab.tsx
git commit -m "perf: stabilise lesson handler identities with useCallback"
```

---

### Task 8: Break the progress effect's 60 Hz dependency

**Objective:** Stop `HandLab.tsx:320-338` from re-running on every `snap` rebuild, and from doing a full localStorage read-modify-write more often than needed (R11).

**Files:**
- Modify: `components/HandLab.tsx:320-338`

**Step 1: Read the effect as it stands**

Run: `sed -n '318,342p' components/HandLab.tsx`

Note the current dependency array `[lessonId, lessonStepIdx, lessons, progressMap, snap]` and that it both reads and writes `progressMap`.

**Step 2: Add an early exit for check-free steps**

The vast majority of steps have no `checks`. Bailing out before touching `progressMap` removes them from this path entirely:

```ts
  useEffect(() => {
    if (!lessonId) return;
    const lesson = lessons.find(({ id }) => id === lessonId);
    const step = lesson?.steps[lessonStepIdx];
    if (!step || step.checks.length === 0) return;
    if (!evalChecks(step.checks, snap)) return;

    const done = progressMap[lessonId];
    if (done?.done && done.stepIdx === lessonStepIdx) return;
    // ...existing progress write unchanged...
  }, [lessonId, lessonStepIdx, lessons, progressMap, snap]);
```

**Step 3: Hoist `progressMap` into a ref**

Add a ref beside the other refs (`components/HandLab.tsx:51` area):

```ts
  const progressRef = useRef<Record<string, Progress>>({});
```

Then, immediately after the `progressMap` state declaration at `components/HandLab.tsx:44`, keep the two in sync:

```ts
  progressRef.current = progressMap;
```

And read through the ref inside the effect, replacing `const done = progressMap[lessonId];` with:

```ts
    const done = progressRef.current[lessonId];
```

**Step 4: Narrow the dependency array**

Because `progressMap` is now read through a ref, drop it from the deps:

```ts
  }, [lessonId, lessonStepIdx, lessons, snap]);
```

**Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `19 passed` files / `102 passed` tests

**Step 6: Commit**

```bash
git add components/HandLab.tsx
git commit -m "perf: decouple progress effect from per-frame progressMap"
```

---

### Task 9: Memoise the Dock item list

**Objective:** Stop `HandLab.tsx:676-727` from allocating a 6-element array of 6 fresh closures on every render, which defeats any `React.memo` added in Task 10.

**Files:**
- Modify: `components/HandLab.tsx:674-727`

**Step 1: Extract the array into a `useMemo`**

Move the `items={[...]}={[...]}` JSX expression into a memo **above** the `return` statement. Its inputs are `ui.cam`, `ui.cam` phase labels, and the handlers:

```ts
  const dockItems = useMemo(
    () => [
      // ...the exact same 6 item objects currently inline, unchanged...
    ],
    [
      ui.cam,
      ui.lineMode,
      ui.snapOn,
      ui.grid,
      ui.spin,
      ui.depthOn,
      eng,
      showToast,
      download,
      onPhoto,
    ],
  );
```

**Step 2: Make `eng` and `showToast` stable first**

`eng` is a function declared in the component body (`components/HandLab.tsx:169`) and `showToast` at `:171`; both are new identities every render, which would defeat the memo. Wrap both:

```ts
  const eng = useCallback(() => engineRef.current, []);

  const showToast = useCallback((message: string) => {
    const toast = toastRef.current;
    if (!toast) return;
    toast.textContent = message;
    toast.style.opacity = "1";
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toast.style.opacity = "0";
    }, 1400);
  }, []);
```

Also confirm `download` and `onPhoto` are stable; wrap each in `useCallback(..., [])` if they only touch refs and `eng`.

**Step 3: Replace the inline array in JSX**

```tsx
      <Dock label="Lab controls" items={dockItems} />
```

**Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `19 passed` files / `102 passed` tests

**Step 5: Commit**

```bash
git add components/HandLab.tsx
git commit -m "perf: memoise dock items and stabilise eng/showToast"
```

---

### Task 10: Memoise the static child subtrees

**Objective:** Stop `Dock`, `LessonPanel`, `DomainSwitcher`, `ColorWell`, `ThemeToggle` and `Magnet` from re-rendering when only `sceneRev` changes.

**Files:**
- Modify: `components/bits/Dock.tsx:23`
- Modify: `components/LessonPanel.tsx:53`
- Modify: `components/DomainSwitcher.tsx`
- Modify: `components/bits/ColorWell.tsx`
- Modify: `components/bits/ThemeToggle.tsx`
- Modify: `components/bits/Magnet.tsx`
- Modify: `components/HandLab.tsx` (imports only)

**Step 1: Convert each default export to a named function + memo**

For each file, find the default export and apply the same shape. Example for `components/bits/Dock.tsx`:

```tsx
function Dock({ label, items }: DockProps) {
  // ...existing body unchanged...
}

export default memo(Dock);
```

Add `memo` to the existing react import in each file (`import { memo } from "react";`).

**Step 2: Do NOT memoise `LessonPanel` blindly**

`LessonPanel` receives `snap`, which is a new object on every `sceneRev`. Memoising it is still correct (it *should* re-render then), but it buys nothing on its own. The win comes from Task 4/6 reducing how often `snap` changes. Memoise it anyway for when `snap` is stable.

**Step 3: Verify the `Dock` prop contract still holds**

`Dock` takes `items` (now memoised in Task 9) and `label` (a string literal). Both are now stable, so `memo` will actually skip renders.

**Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `19 passed` files / `102 passed` tests

**Step 5: Commit**

```bash
git add components/bits/Dock.tsx components/bits/Magnet.tsx components/bits/ColorWell.tsx components/bits/ThemeToggle.tsx components/LessonPanel.tsx components/DomainSwitcher.tsx
git commit -m "perf: wrap static HUD subtrees in React.memo"
```

---

### Task 11: Fix the Magnet spring storm

**Objective:** Remove 20 permanently-subscribed springs, 10 wasted mount renders, and 10 per-mousemove `getBoundingClientRect()` calls (R9).

**Files:**
- Modify: `components/bits/Magnet.tsx:20-49`

**Step 1: Add a shared pointer-capability hook**

Create `lib/useFinePointer.ts`:

```ts
import { useEffect, useState } from "react";

/**
 * True when the primary pointer is a mouse/trackpad. Read once per mount and
 * shared across every Magnet so we stop running 10 identical matchMedia
 * queries and 10 mount-time state flips.
 */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return fine;
}
```

**Step 2: Gate the springs behind reduced-motion**

Replace `components/bits/Magnet.tsx:20-31` so no motion hooks are created at all when the effect would be invisible:

```tsx
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 180, damping: 22 });
  const sy = useSpring(y, { stiffness: 180, damping: 22 });
```

(Keep the hooks unconditional — React rules — but short-circuit the *render output* before subscribing, matching the pattern already used in `Dock.tsx:21`.)

**Step 3: Return the plain div when not needed**

Replace the current `if (!active) return ...` guard with:

```tsx
  if (!fine || reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
```

**Step 4: Cache the bounding rect and throttle to rAF**

The per-mousemove `getBoundingClientRect()` is a forced layout read. Replace the `onMouseMove` handler body with an rAF-coalesced version that reads the rect once per frame:

```tsx
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const node = ref.current;
          if (!node) return;
          const r = node.getBoundingClientRect();
          x.set((e.clientX - (r.left + r.width / 2)) * strength);
          y.set((e.clientY - (r.top + r.height / 2)) * strength);
        });
      }}
      onMouseLeave={() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        x.set(0);
        y.set(0);
      }}
```

Add `const rafRef = useRef(0);` alongside the existing `ref`, and cancel it in a cleanup effect.

**Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `19 passed` files / `102 passed` tests

**Step 6: Commit**

```bash
git add lib/useFinePointer.ts components/bits/Magnet.tsx
git commit -m "perf: share pointer probe, gate magnets on reduced motion, rAF-coalesce hover"
```

---

### Task 12: Stop JSON.stringify in the LessonPanel render path

**Objective:** Remove a `JSON.stringify` per check per render in a list key.

**Files:**
- Modify: `components/LessonPanel.tsx:255-257`

**Step 1: Replace the key**

Replace `components/LessonPanel.tsx:257`:

```tsx
                      key={`${check.kind}:${JSON.stringify(check)}`}
```

with a stable index-based key derived from the already-computed `sceneChecks` array:

```tsx
                      key={`${check.kind}-${index}`}
```

and change `.map(({ check, label, passed }) =>` at `components/LessonPanel.tsx:255` to `.map(({ check, label, passed }, index) =>`.

**Step 2: Confirm keys stay unique**

`checkStatus` derives one entry per element of `sceneChecks` (already filtered at `components/LessonPanel.tsx:121`), so `kind-index` is unique within the list.

**Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `19 passed` files / `102 passed` tests

**Step 4: Commit**

```bash
git add components/LessonPanel.tsx
git commit -m "perf: drop JSON.stringify from lesson check list keys"
```

---

### Task 13: Add an aria-live guard to the lesson panel

**Objective:** Stop a 3D-interactive `aria-live="polite"` region from being re-announced while a user drags an object.

**Files:**
- Modify: `components/LessonPanel.tsx:137`

**Step 1: Scope the live region to the step, not the panel**

Replace `components/LessonPanel.tsx:137`:

```tsx
    <aside className="hint lesson-panel" aria-label="Lessons" aria-live="polite">
```

with a live region that only contains the step heading, so announcements fire on step navigation rather than on every snapshot:

```tsx
    <aside className="hint lesson-panel" aria-label="Lessons">
      {/* announce step changes only — a polite region wrapping the live
          scene checklist re-announces on every drag frame */}
      <div aria-live="polite" aria-atomic="true">
        {/* ...move the step heading JSX here unchanged... */}
      </div>
```

**Step 2: Verify the accessibility test still passes**

Run: `npm test -- components/HandLab.accessibility.test.tsx`
Expected: PASS. The test uses `renderToStaticMarkup`, which renders both structures identically.

**Step 3: Verify manually**

Run: `npm run dev`, open `http://localhost:3000`, enable the Lessons panel with a screen reader running, place and drag an object.
Expected: no repeated announcements while dragging; the step heading is still announced on navigation.

**Step 4: Commit**

```bash
git add components/LessonPanel.tsx
git commit -m "a11y: scope lesson aria-live to step heading, not the live checklist"
```

---

## Phase 3 — Engine runtime (R3, R4, R5, R6)

### Task 14: Extract a device-capability probe

**Objective:** One small, tested module that answers "is this a constrained device?" — used by the depth task and available to future work. Explicitly **not** used to strip visual features.

**Files:**
- Create: `lib/caps.ts`
- Create: `lib/caps.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isConstrainedDevice, pickDepthDtype } from "./caps";

type Env = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  saveData?: boolean;
  effectiveType?: string;
  hasWebGPU?: boolean;
};

const decide = (env: Env) =>
  isConstrainedDevice({
    hardwareConcurrency: env.hardwareConcurrency,
    deviceMemory: env.deviceMemory,
    saveData: env.saveData,
    effectiveType: env.effectiveType,
  });

describe("isConstrainedDevice", () => {
  it("treats 2 cores as constrained", () => {
    expect(decide({ hardwareConcurrency: 2 })).toBe(true);
  });

  it("treats 4 cores as unconstrained", () => {
    expect(decide({ hardwareConcurrency: 4 })).toBe(false);
  });

  it("treats 2GB of RAM as constrained", () => {
    expect(decide({ deviceMemory: 2 })).toBe(true);
  });

  it("treats 8GB of RAM as unconstrained", () => {
    expect(decide({ deviceMemory: 8 })).toBe(false);
  });

  it("honours Save-Data regardless of hardware", () => {
    expect(decide({ hardwareConcurrency: 16, deviceMemory: 16, saveData: true })).toBe(true);
  });

  it("honours a slow effective connection type", () => {
    expect(decide({ hardwareConcurrency: 16, deviceMemory: 16, effectiveType: "2g" })).toBe(true);
  });

  it("defaults to unconstrained when nothing is knowable", () => {
    // Safari/Firefox expose neither deviceMemory nor saveData. Assume capable
    // rather than degrading a device that might be fine.
    expect(decide({})).toBe(false);
  });
});

describe("pickDepthDtype", () => {
  it("uses fp16 on WebGPU", () => {
    expect(pickDepthDtype({ hasWebGPU: true, constrained: false })).toBe("fp16");
  });

  it("uses q8 on WASM — 27MB instead of 99MB fp32", () => {
    expect(pickDepthDtype({ hasWebGPU: false, constrained: false })).toBe("q8");
  });

  it("still uses q8 on a constrained device with WebGPU", () => {
    // WebGPU present but the device is dire: prefer the smaller weights.
    expect(pickDepthDtype({ hasWebGPU: true, constrained: true })).toBe("q8");
  });
});
```

**Step 2: Run it to verify it fails**

Run: `npx vitest run lib/caps.test.ts`
Expected: FAIL — `Cannot find module './caps'`

**Step 3: Write the implementation**

```ts
// lib/caps.ts
/**
 * Device capability probe.
 *
 * SCOPE: this module decides model sizes and inference cadence. It does NOT
 * decide whether to strip visual features — the product decision is that
 * HANDLAB looks the same on every machine, and we fix jank rather than
 * remove polish. Do not add shadow/AA/antialias downgrade logic here.
 */

export interface DeviceSignals {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  saveData?: boolean;
  effectiveType?: string;
}

/** Read the signals this browser exposes. Missing APIs stay undefined. */
export function readDeviceSignals(): DeviceSignals {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  return {
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
  };
}

/**
 * True when the device looks genuinely constrained. Unknown signals resolve
 * to `false` on purpose: a browser that hides deviceMemory (Safari, Firefox)
 * is more likely mid-range than a 2-core machine, and wrongly degrading it
 * costs more than wrongly leaving it alone.
 */
export function isConstrainedDevice(s: DeviceSignals): boolean {
  if (s.saveData === true) return true;
  if (s.effectiveType === "slow-2g" || s.effectiveType === "2g") return true;
  if (typeof s.hardwareConcurrency === "number" && s.hardwareConcurrency <= 2)
    return true;
  if (typeof s.deviceMemory === "number" && s.deviceMemory <= 2) return true;
  return false;
}

export type DepthDtype = "fp16" | "q8";

/**
 * Choose the depth model precision.
 *
 * The WASM path has no fp16 matmul acceleration, so fp32 there costs 99.1MB
 * and buys nothing. q8 is 27.3MB and inference runs on a smaller graph.
 * Constrained devices always take q8, including on WebGPU.
 */
export function pickDepthDtype(opts: {
  hasWebGPU: boolean;
  constrained: boolean;
}): DepthDtype {
  if (opts.constrained) return "q8";
  return opts.hasWebGPU ? "fp16" : "q8";
}
```

**Step 4: Run it to verify it passes**

Run: `npx vitest run lib/caps.test.ts`
Expected: 10 passed

**Step 5: Commit**

```bash
git add lib/caps.ts lib/caps.test.ts
git commit -m "feat: add device capability probe for model size selection"
```

---

### Task 15: Switch the depth WASM path to the q8 model

**Objective:** Cut the no-WebGPU download from **99.1 MB to 27.3 MB** (3.6×). This is the single largest bandwidth win in the plan and it lands on exactly the weak devices that need it.

**Files:**
- Modify: `lib/depth/monocular.ts:24-31`, `87-97`
- Modify: `lib/caps.ts` (no change — `pickDepthDtype` is already exported)

**Step 1: Add the size constant and a real WebGPU probe**

In `lib/depth/monocular.ts`, near the existing `INFER_W`/`INFER_MS` constants (`lib/depth/monocular.ts:30-31`), add:

```ts
// Download weights by dtype (verified against the HF Hub, 2026-09-30):
//   model.onnx  (fp32) = 99.1 MB   model_fp16.onnx   = 49.6 MB
//   model_quantized.onnx (q8) = 27.3 MB
// WASM has no fp16 matmul acceleration, so fp32 on WASM costs 3.6x the bytes
// and buys nothing. Constrained devices take q8 even when WebGPU is present.
export const DEPTH_BYTES: Record<DepthDtype, string> = {
  fp16: "~50MB",
  q8: "~27MB",
};

async function hasWebGPU(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } })
    .gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}
```

Add the import at the top of `lib/depth/monocular.ts`:

```ts
import { isConstrainedDevice, pickDepthDtype, readDeviceSignals, type DepthDtype } from "../caps";
```

**Step 2: Replace the two-step pipeline construction**

Replace `lib/depth/monocular.ts:87-97`:

```ts
      let est: DepthEstimator;
      try {
        est = (await pipeline("depth-estimation", DA_V2_MODEL_ID, {
          device: "webgpu",
          dtype: "fp16",
        })) as unknown as DepthEstimator;
      } catch {
        // No WebGPU (Safari, headless, blocklisted GPU): WASM fallback.
        est = (await pipeline("depth-estimation", DA_V2_MODEL_ID, {
          device: "wasm",
        })) as unknown as DepthEstimator;
      }
```

with:

```ts
      const webgpu = await hasWebGPU();
      const dtype = pickDepthDtype({
        hasWebGPU: webgpu,
        constrained: isConstrainedDevice(readDeviceSignals()),
      });
      const bytes = DEPTH_BYTES[dtype];
      this.setStatus(
        "loading",
        `downloading depth model (${bytes}, once)…`,
      );
      let est: DepthEstimator;
      try {
        est = (await pipeline("depth-estimation", DA_V2_MODEL_ID, {
          device: webgpu ? "webgpu" : "wasm",
          dtype,
        })) as unknown as DepthEstimator;
      } catch (err) {
        if (webgpu) {
          // WebGPU advertised but pipeline() refused (blocklisted driver,
          // headless). Retry on WASM rather than losing depth entirely.
          const wasmDtype: DepthDtype = "q8";
          this.setStatus(
            "loading",
            `downloading depth model (${DEPTH_BYTES[wasmDtype]}, once)…`,
          );
          est = (await pipeline("depth-estimation", DA_V2_MODEL_ID, {
            device: "wasm",
            dtype: wasmDtype,
          })) as unknown as DepthEstimator;
        } else {
          throw err;
        }
      }
```

**Step 3: Update the module docstring to match reality**

Replace the `- Model: onnx-community/depth-anything-v2-small (~100MB, cached after first load). WebGPU/fp16 when available, WASM fallback otherwise.` line at `lib/depth/monocular.ts:14-15` with:

```
 * - Model: onnx-community/depth-anything-v2-small, WebGPU/fp16 (~50MB) or
 *   WASM/q8 (~27MB) chosen by lib/caps.ts — fp32 is never used. Cached by
 *   Transformers.js after first load.
```

**Step 4: Verify the dtype reaches transformers correctly**

`q8` is a valid `DataType` in the installed version — confirm:

Run: `rg -n '"q8"' node_modules/@huggingface/transformers/types/utils/dtypes.d.ts`
Expected: a match on `q8: "q8";`

**Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `20 passed` files / `112 passed` tests

**Step 6: Verify the download actually shrank (manual, one device)**

Run: `npm run dev`, open `http://localhost:3000`, enable the webcam, open DevTools → Network → filter `huggingface.co`.
Expected: the ONNX request is **~27 MB** (`model_quantized.onnx`), not ~99 MB. On a WebGPU machine, confirm it requests `model_fp16.onnx` at ~50 MB.

**Step 7: Commit**

```bash
git add lib/depth/monocular.ts
git commit -m "perf: serve q8 depth weights on WASM (99MB -> 27MB) and constrained devices"
```

---

### Task 16: Add a CPU delegate retry for MediaPipe

**Objective:** Stop the webcam dying outright on blocklisted or integrated GPUs (R4).

**Files:**
- Modify: `lib/engine.ts:981-991`

**Step 1: Extract a creation helper**

Add above the `enableWebcam` method in `lib/engine.ts`:

```ts
/**
 * Create the HandLandmarker, preferring the GPU delegate.
 *
 * `delegate: "GPU"` throws outright on blocklisted drivers and some
 * integrated GPUs, which previously killed the whole webcam path. The 2D
 * fallback engine already retries on CPU (lib/fallback2d.ts:411); do the
 * same here so a weak GPU degrades to a slower tracker instead of no
 * tracker at all.
 */
async function createLandmarker(
  files: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  HandLandmarkerCtor: typeof HandLandmarker,
): Promise<HandLandmarker> {
  const options = {
    runningMode: "VIDEO" as const,
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return await HandLandmarkerCtor.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      ...options,
    });
  } catch {
    return HandLandmarkerCtor.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      ...options,
    });
  }
}
```

If `HandLandmarker` is only available as a value from the dynamic import (it is), take it as a parameter typed loosely rather than importing the type at module scope.

**Step 2: Use it in `enableWebcam`**

Replace `lib/engine.ts:981-991`:

```ts
      const nextLandmarker = await withTimeout(
        HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
        30000,
        "model load",
      );
```

with:

```ts
      const nextLandmarker = await withTimeout(
        createLandmarker(files, HandLandmarker),
        30000,
        "model load",
      );
```

**Step 3: Tell the user when the fallback engaged**

Inside the `catch` of the GPU attempt, surface it so the slowdown is not mysterious. Add after a successful CPU create:

```ts
    this.setText("t-model", "hand model: live (cpu)");
```

**Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `20 passed` files / `112 passed` tests

**Step 5: Commit**

```bash
git add lib/engine.ts
git commit -m "fix: retry MediaPipe on CPU delegate when GPU creation fails"
```

---

### Task 17: Rate-cap hand detection

**Objective:** Stop `detectForVideo` from running at up to 60 Hz. The hand moves at human speed; 30 Hz is indistinguishable and halves the CPU cost of the tracking loop (R3).

**Files:**
- Create: `lib/handRate.ts`
- Create: `lib/handRate.test.ts`
- Modify: `lib/engine.ts:1817-1833`
- Modify: `lib/fallback2d.ts:834-854`

**Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAND_DETECT_MS, shouldDetect } from "./handRate";

describe("shouldDetect", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("caps hand detection at 30Hz", () => {
    expect(HAND_DETECT_MS).toBe(1000 / 30);
  });

  it("allows the first detection immediately", () => {
    expect(shouldDetect(0, -Infinity)).toBe(true);
  });

  it("refuses a second detection inside the interval", () => {
    vi.setSystemTime(0);
    shouldDetect(0, -Infinity);
    expect(shouldDetect(5, 0)).toBe(false);
  });

  it("allows detection again after the interval", () => {
    vi.setSystemTime(0);
    shouldDetect(0, -Infinity);
    vi.setSystemTime(34);
    expect(shouldDetect(34, 0)).toBe(true);
  });

  it("accepts a new video frame after a long stall", () => {
    vi.setSystemTime(0);
    shouldDetect(0, -Infinity);
    vi.setSystemTime(5000);
    expect(shouldDetect(5000, 0)).toBe(true);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `npx vitest run lib/handRate.test.ts`
Expected: FAIL — `Cannot find module './handRate'`

**Step 3: Write the implementation**

```ts
// lib/handRate.ts
/**
 * Rate limiter for MediaPipe hand detection.
 *
 * detectForVideo ran once per requestAnimationFrame, i.e. up to 60 times a
 * second, but the tracked landmarks are consumed at 30Hz by the depth
 * fusion path and the hand physically cannot move faster. 30Hz halves the
 * inference cost with no perceptible difference.
 */
export const HAND_DETECT_MS = 1000 / 30;

/** True when enough time has passed since the last accepted detection. */
export function shouldDetect(now: number, lastDetectAt: number): boolean {
  return now - lastDetectAt >= HAND_DETECT_MS;
}
```

**Step 4: Apply it in `lib/engine.ts`**

Add the import, add a `private lastDetectAt = -Infinity;` field near the other loop state (`lib/engine.ts:445`), and replace `lib/engine.ts:1829-1833`:

```ts
    const video = this.opts.video;
    if (
      !this.landmarker ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoT
    )
      return;
    this.lastVideoT = video.currentTime;
```

with:

```ts
    const video = this.opts.video;
    if (
      !this.landmarker ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoT ||
      !shouldDetect(now, this.lastDetectAt)
    )
      return;
    this.lastVideoT = video.currentTime;
    this.lastDetectAt = now;
```

**Step 5: Apply the same cap in `lib/fallback2d.ts`**

Mirror the identical change in `lib/fallback2d.ts`'s `handLoop` (around `:854`). The fallback engine runs the same tracker, so it must not regress.

**Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `21 passed` files / `117 passed` tests

**Step 7: Verify manually that tracking still feels right**

Run: `npm run dev`, open `http://localhost:3000`, enable the webcam, move your hand.
Expected: the skeleton preview and cursor track smoothly; no visible stutter or lag. If it feels worse, raise `HAND_DETECT_MS` to `1000/24` and re-test — the constant is the only thing to change.

**Step 8: Commit**

```bash
git add lib/handRate.ts lib/handRate.test.ts lib/engine.ts lib/fallback2d.ts
git commit -m "perf: cap hand detection at 30Hz in both engines"
```

---

### Task 18: Pause all loops when the tab is hidden

**Objective:** Stop burning CPU and battery rendering a canvas nobody can see, and stop the depth model inferring in the background (R5).

**Files:**
- Modify: `lib/engine.ts` (add a visibility listener, ~2 lines of call sites)
- Modify: `lib/fallback2d.ts` (same)
- Modify: `lib/depth/monocular.ts` (pause the infer loop)

**Step 1: Pause the depth loop**

Add a `paused` flag to `DepthAnythingV2Provider`. In `lib/depth/monocular.ts`, replace the `loop` at `:109-117`:

```ts
  private paused = false;

  private loop = async (): Promise<void> => {
    if (!this.running) return;
    if (!this.paused) {
      try {
        await this.inferOnce();
      } catch {
        /* keep the loop alive; next tick retries */
      }
    }
    if (this.running) this.timer = setTimeout(this.loop, INFER_MS);
  };
```

**Step 2: Add the public pause API**

Add to `DepthAnythingV2Provider`:

```ts
  /** Stop inferring while the document is hidden; the cached map goes stale
   *  and `freshness()` in fusion.ts already downgrades its confidence. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }
```

**Step 3: Wire visibility in the engines**

In `lib/engine.ts`, inside the `enableWebcam` success path (after `this.camLive = true;` at `:1029`), add:

```ts
      this.onVisibility = () => {
        this.mono.setPaused(document.hidden);
        this.rafPaused = document.hidden;
      };
      document.addEventListener("visibilitychange", this.onVisibility);
```

Add the two fields near the loop state at `lib/engine.ts:445`:

```ts
  private onVisibility: (() => void) | null = null;
  private rafPaused = false;
```

**Step 4: Honour `rafPaused` in both render loops**

At the top of `lib/engine.ts:2072-2074`:

```ts
  private tick = (): void => {
    if (this.disposed) return;
    this.tickRaf = requestAnimationFrame(this.tick);
    if (this.rafPaused) return;
```

And at the top of `lib/fallback2d.ts`'s render loop (around `:970`) and `handLoop` (around `:834`), add the same early return. Note that `requestAnimationFrame` already self-throttles when hidden, so the render pause is mostly a belt-and-braces measure — **the depth model pause is the real win**, since `setTimeout` does not throttle.

**Step 5: Clean up the listener**

In `dispose()`, add:

```ts
    if (this.onVisibility) {
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.onVisibility = null;
    }
```

**Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `21 passed` files / `117 passed` tests

**Step 7: Verify manually**

Run: `npm run dev`, enable the webcam, switch to another tab, open Activity Monitor.
Expected: the browser's CPU usage for the tab drops to near zero. Switch back — the hand re-acquires within one detection frame.

**Step 8: Commit**

```bash
git add lib/engine.ts lib/fallback2d.ts lib/depth/monocular.ts
git commit -m "perf: pause render and depth loops while the tab is hidden"
```

---

### Task 19: Add a minimal-delta guard to the skeleton redraw

**Objective:** Stop redrawing the 248×140 preview canvas when the landmarks have not meaningfully moved.

**Files:**
- Modify: `lib/engine.ts:1865-1880` (`drawSkel`)

**Step 1: Add a change detector**

Add a field near the loop state at `lib/engine.ts:445`:

```ts
  private lastSkelSig = "";
```

**Step 2: Guard the redraw**

At the top of `drawSkel` in `lib/engine.ts`, after the `if (!this.sctx) return;` line, add:

```ts
    // 21 landmarks x 2 hands. Rounding to 2px on a 248x140 preview is below
    // perceptual threshold, so this skips ~95% of redraws while the hand is
    // still or moving slowly.
    const sig = (all || [])
      .map((lm) =>
        lm
          .map((p) => `${Math.round(p.x * 124)},${Math.round(p.y * 70)}`)
          .join(";"),
      )
      .join("|");
    if (sig === this.lastSkelSig) return;
    this.lastSkelSig = sig;
```

**Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `21 passed` files / `117 passed` tests

**Step 4: Verify manually**

Run: `npm run dev`, enable the webcam, watch the preview with the hand held still, then move it.
Expected: the preview still tracks motion; nothing freezes. If motion looks steppy, change the divisor from `124`/`70` to `248`/`140` (finer) and re-test.

**Step 5: Commit**

```bash
git add lib/engine.ts
git commit -m "perf: skip skeleton redraw when landmarks have not moved"
```

---

### Task 20: Move the skel canvas off the main thread of the render loop

**Objective:** Stop the skeleton redraw competing with `renderer.render` inside the same rAF.

**Files:**
- Modify: `lib/engine.ts:1817-1842` (call site of `drawSkel`)

**Step 1: Defer the draw out of the detection frame**

In `handLoop`, the detection and the skeleton draw happen in the same frame as the cursor update. Move the draw behind its own rAF so it never lengthens the detection frame:

```ts
    this.frames++;
    // ...fps bookkeeping...
    const video = this.opts.video;
    if (!this.landmarker || video.readyState < 2) return;
    if (video.currentTime === this.lastVideoT) return;
    if (!shouldDetect(now, this.lastDetectAt)) return;
    this.lastVideoT = video.currentTime;
    this.lastDetectAt = now;
    let res: ...;
    try {
      res = this.landmarker.detectForVideo(video, now) as unknown as typeof res;
    } catch {
      return;
    }
    const hands = res.landmarks ?? [];
    // Draw outside the detection frame so the preview redraw never adds to
    // the cost of inference + gesture processing.
    if (!this.skelRaf) {
      this.skelRaf = requestAnimationFrame(() => {
        this.skelRaf = 0;
        this.drawSkel(this.lastHands, this.pinchState);
      });
    }
    this.lastHands = hands;
```

**Step 2: Add the fields**

```ts
  private skelRaf = 0;
  private lastHands: NormalizedLandmark[][] = [];
```

**Step 3: Cancel on dispose**

In `dispose()`, alongside the other rAF cancellations, add:

```ts
    if (this.skelRaf) cancelAnimationFrame(this.skelRaf);
```

**Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `21 passed` files / `117 passed` tests

**Step 5: Commit**

```bash
git add lib/engine.ts
git commit -m "perf: draw skeleton outside the detection frame"
```

---

### Task 21: Add the adaptive-resolution escape hatch

**Objective:** Give a device that still cannot hold 30 fps at DPR 1.0 a way out. This is the **only task in the plan that changes rendered output** (R6).

**Files:**
- Create: `lib/adaptivePr.ts`
- Create: `lib/adaptivePr.test.ts`
- Modify: `lib/engine.ts:437-438`, `2174-2187`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PR_FLOOR, PR_MAX_CAP, PR_STEP, nextPixelRatio } from "./adaptivePr";

describe("nextPixelRatio", () => {
  it("steps down when frame time is above the slow threshold", () => {
    // 30ms ≈ 33fps. Note the comparison is strictly `>`, matching the
    // existing engine behaviour, so the threshold value itself holds steady.
    expect(nextPixelRatio(1, 30)).toBe(0.75);
  });

  it("holds steady at exactly the slow threshold", () => {
    expect(nextPixelRatio(1, 26)).toBe(1);
  });

  it("never goes below the floor", () => {
    expect(nextPixelRatio(0.75, 40)).toBe(PR_FLOOR);
  });

  it("holds steady inside the target band", () => {
    expect(nextPixelRatio(1, 18)).toBe(1);
  });

  it("steps up when there is clear headroom", () => {
    expect(nextPixelRatio(1, 10)).toBe(1.25);
  });

  it("never exceeds the device cap", () => {
    expect(nextPixelRatio(2, 10)).toBe(PR_MAX_CAP);
  });

  it("uses 0.75 steps and a 0.75 floor", () => {
    expect(PR_STEP).toBe(0.25);
    expect(PR_FLOOR).toBe(0.75);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `npx vitest run lib/adaptivePr.test.ts`
Expected: FAIL — `Cannot find module './adaptivePr'`

**Step 3: Write the implementation**

```ts
// lib/adaptivePr.ts
/**
 * Adaptive render resolution.
 *
 * The engine already scales pixel ratio to hold ~60fps. Its floor was 1.0,
 * which leaves a device that is still below 30fps at native resolution with
 * no escape. Lowering the floor to 0.75 renders at 75% linear scale (56% of
 * the pixels) — the single concession to visual fidelity in the low-end
 * work, and only reachable by a device that is already failing to keep up.
 *
 * Reverting this is a one-line change: set PR_FLOOR back to 1.
 */
export const PR_STEP = 0.25;
export const PR_FLOOR = 0.75;
export const PR_MAX_CAP = 2;

const SLOW_MS = 26; // ~38fps — start shedding pixels
const FAST_MS = 13; // ~77fps  — start adding them back

export function nextPixelRatio(current: number, emaDt: number): number {
  if (emaDt > SLOW_MS) return Math.max(PR_FLOOR, current - PR_STEP);
  if (emaDt < FAST_MS) return Math.min(PR_MAX_CAP, current + PR_STEP);
  return current;
}
```

**Step 4: Run it to verify it passes**

Run: `npx vitest run lib/adaptivePr.test.ts`
Expected: 7 passed

**Step 5: Apply it in the engine**

Add the import, then replace `lib/engine.ts:2174-2187`:

```ts
    // adaptive resolution: hold frame time near 60fps by scaling pixel ratio
    this.emaDt = this.emaDt * 0.95 + dt * 1000 * 0.05;
    if (++this.prTick >= 120) {
      this.prTick = 0;
      const next = nextPixelRatio(this.prNow, this.emaDt);
      if (next !== this.prNow) {
        this.prNow = next;
        this.renderer.setPixelRatio(next);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
      this.setText("t-pr", `render ${next.toFixed(2)}x`);
    }
```

**Step 6: Surface the value so it is observable**

Add `t-pr` to the `HudNodes` type in `lib/engine.ts`, add a `tPrRef` in `components/HandLab.tsx` beside the other HUD refs, add a `<b id="t-pr">` element to the HUD markup, and register it in the `hud` object at `components/HandLab.tsx:100-110`.

**Step 7: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `22 passed` files / `124 passed` tests

**Step 8: Verify it never fires on a capable machine**

Run: `npm run dev`, open on this Mac, drag an object.
Expected: the HUD reads `render 2.00x` and stays there. It should only drop on a device that genuinely cannot keep up.

**Step 9: Commit**

```bash
git add lib/adaptivePr.ts lib/adaptivePr.test.ts lib/engine.ts components/HandLab.tsx
git commit -m "perf: allow adaptive pixel ratio to fall to 0.75x on slow devices"
```

---

## Phase 4 — Bundle and network (R7, R8, R12)

### Task 22: Add long-lived cache headers for the vendored assets

**Objective:** Stop re-validating **19.6 MB** of wasm and model data on every session. These files are content-addressed by the app and never change in place, so they are safe to cache immutably (R7).

**Files:**
- Create: `lib/nextHeaders.test.ts`
- Modify: `next.config.ts:26-48`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

const IMMUTABLE = "public, max-age=31536000, immutable";

describe("static asset cache headers", () => {
  it("declares an immutable rule for the MediaPipe wasm fileset", async () => {
    const rules = (await nextConfig.headers?.()) as Rule[];
    const rule = rules.find((r) => r.source === "/wasm/:path*");
    expect(rule, "missing /wasm/:path* rule").toBeDefined();
    const cache = rule!.headers.find((h) => h.key === "Cache-Control");
    expect(cache?.value).toBe(IMMUTABLE);
  });

  it("declares an immutable rule for the hand model", async () => {
    const rules = (await nextConfig.headers?.()) as Rule[];
    const rule = rules.find((r) => r.source === "/models/:path*");
    expect(rule, "missing /models/:path* rule").toBeDefined();
    const cache = rule!.headers.find((h) => h.key === "Cache-Control");
    expect(cache?.value).toBe(IMMUTABLE);
  });

  it("keeps the existing security headers on the catch-all rule", async () => {
    const rules = (await nextConfig.headers?.()) as Rule[];
    const rule = rules.find((r) => r.source === "/(.*)");
    const keys = rule!.headers.map((h) => h.key);
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("Permissions-Policy");
  });

  it("does not weaken the CSP when adding cache rules", async () => {
    const rules = (await nextConfig.headers?.()) as Rule[];
    const rule = rules.find((r) => r.source === "/(.*)");
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
  });
});
```

**Step 2: Run it to verify it fails**

Run: `npx vitest run lib/nextHeaders.test.ts`
Expected: FAIL — `missing /wasm/:path* rule`

**Step 3: Add the rules**

In `next.config.ts`, insert these two objects **before** the catch-all `/(.*)` rule (order matters — Next matches in order, and the catch-all must stay last):

```ts
      {
        source: "/wasm/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
```

**Step 4: Do NOT add a rule for `/manuals` yet**

The PDFs are 4.9 MB and are linked, not eagerly loaded, so they are off the critical path. Adding an immutable rule to files a teacher may swap out is a footgun. Leave it.

**Step 5: Verify**

Run: `npx vitest run lib/nextHeaders.test.ts`
Expected: 4 passed

**Step 6: Verify in a real build**

Run: `npm run build && npm run start`, then `curl -sI http://localhost:3000/wasm/vision_wasm_internal.wasm | grep -i cache-control`
Expected: `cache-control: public, max-age=31536000, immutable`

**Step 7: Commit**

```bash
git add next.config.ts lib/nextHeaders.test.ts
git commit -m "perf: cache vendored wasm and hand model immutably (19.6MB)"
```

---

### Task 23: Code-split the two heavy routes

**Objective:** Get Three.js out of the initial payload for `/` and `/vr` (R12). The page is a canvas; the engine can load after first paint.

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/vr/page.tsx`

**Step 1: Add a shared boot component**

Create `components/Boot.tsx`:

```tsx
export default function Boot() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100dvh",
        font: "400 14px system-ui, sans-serif",
        color: "var(--muted)",
        background: "var(--color-paper)",
      }}
    >
      starting HANDLAB…
    </div>
  );
}
```

**Step 2: Dynamic-load `HandLab`**

Replace `app/page.tsx` entirely:

```tsx
import dynamic from "next/dynamic";
import Boot from "../components/Boot";

const HandLab = dynamic(() => import("../components/HandLab"), {
  ssr: false,
  loading: () => <Boot />,
});

export default function Page() {
  return <HandLab />;
}
```

**Step 3: Dynamic-load `HandLabVR` the same way**

Apply the identical pattern in `app/vr/page.tsx`.

**Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `23 passed` files / `128 passed` tests

`HandLab.accessibility.test.tsx` imports `./HandLab` **directly**, not through the page, so it is unaffected.

**Step 5: Verify the split happened**

Run: `npm run perf`
Expected: `/page` total gzip drops substantially, and `three` chunks no longer appear in the `app-build-manifest.json` entry for `/page`.

**Step 6: Commit**

```bash
git add app/page.tsx app/vr/page.tsx components/Boot.tsx
git commit -m "perf: code-split the lab and VR routes behind dynamic()"
```

---

### Task 24: Lazy-load the 2D fallback engine

**Objective:** Remove 1183 lines of fallback code from the eager graph — it is only needed when WebGL context creation **throws** (R8).

**Files:**
- Modify: `components/HandLab.tsx:12`
- Modify: `components/HandLab.tsx:136-160`

**Step 1: Replace the static import with a dynamic one**

Remove `import { HandLabFallbackEngine } from "../lib/fallback2d";` from `components/HandLab.tsx:12` and add a dynamic loader inside the effect:

```ts
    const { HandLabFallbackEngine } = await import("../lib/fallback2d");
```

**Step 2: Make the effect body async-safe**

The effect at `components/HandLab.tsx:82` cannot simply become `async` (it must return a cleanup synchronously). Restructure:

```ts
    let disposed = false;
    let engine: HandLabEngine | HandLabFallbackEngine | null = null;
    // ...sceneSync setup unchanged...

    void (async () => {
      try {
        engine = new HandLabEngine({ /* ...unchanged opts... */ });
      } catch (webglErr) {
        if (disposed) return;
        try {
          // Only fetched when WebGL context creation actually fails, so
          // ~1.2k lines of 2D engine stay out of the initial download.
          const { HandLabFallbackEngine } = await import("../lib/fallback2d");
          if (disposed) return;
          engine = new HandLabFallbackEngine({ /* ...unchanged opts... */ });
          setIs2D(true);
        } catch (err2) {
          if (disposed) return;
          console.error(webglErr);
          setFatal(err2 instanceof Error ? err2.message : String(err2));
          return;
        }
      }
      if (disposed) {
        engine?.dispose();
        return;
      }
      engineRef.current = engine;
    })();

    return () => {
      disposed = true;
      sceneSync.dispose();
      engine?.dispose();
      engineRef.current = null;
    };
```

**Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `23 passed` files / `128 passed` tests

**Step 4: Verify the 2D fallback still works**

Run: `npm run dev`, open `http://localhost:3000` in a browser with WebGL disabled (Chrome → Settings → System → "Disable hardware acceleration", restart).
Expected: the 2D mode still initialises and the status reports the fallback. Watch the Network tab: `fallback2d` should only load after the WebGL failure.

**Step 5: Commit**

```bash
git add components/HandLab.tsx
git commit -m "perf: lazy-load the 2D fallback engine"
```

---

### Task 25: Trim the font payload

**Objective:** Drop **58 KB** of preloaded `Newsreader` from a page that is a 3D canvas.

**Files:**
- Modify: `app/layout.tsx:8-21`

**Step 1: Check whether Newsreader is actually visible on `/`**

Run: `rg -n "font-display|--font-display" app/globals.css components/ app/`
Expected: usages of `h1,h2,h3,.nf-code` per the audit. Confirm each is either behind a panel the user must open, or genuinely large display type.

**Step 2: Load it conditionally, or drop it**

If the display font only appears inside the lesson panel and the 404 page, move it to those routes or accept a system-display fallback there. If it is genuinely part of the visual identity, keep it but switch to `display: "swap"` with no preload so it stops blocking first paint:

```ts
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  preload: false, // 58KB of decorative face — never block first paint
  variable: "--font-display",
});
```

**Step 3: Verify**

Run: `npm run build`
Expected: Next no longer lists a Newsreader `.woff2` in the preload list for `/page`. Confirm the HUD still looks right in the browser.

**Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "perf: stop preloading the display face on the canvas route"
```

---

### Task 26: Swap `motion/react` for `LazyMotion`

**Objective:** Cut 45 KB gzip from the critical path by deferring the animation features until something actually animates.

**Files:**
- Modify: `app/layout.tsx` (add a client provider)
- Create: `components/MotionProvider.tsx`
- Modify: `components/bits/Dock.tsx`
- Modify: `components/DomainSwitcher.tsx`
- Modify: `components/bits/SegmentedControl.tsx`
- Modify: `components/bits/AnimatedList.tsx`
- Modify: `components/bits/BlurText.tsx`

**Step 1: Add the provider**

```tsx
"use client";

import { LazyMotion, domAnimation } from "motion/react";

export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
```

Wrap `{children}` in `app/layout.tsx`'s `<body>` with it.

**Step 2: Convert the consumers**

Change `import { motion } from "motion/react"` to `import { m as motion } from "motion/react"` in each of the five files.

**Step 3: Note the `layoutId` caveat**

`m` does not support `layout`/`layoutId` without the `domMax` feature set. `DomainSwitcher.tsx:46` and `SegmentedControl.tsx:22` use `layoutId`. Either:
- use `domMax` instead of `domAnimation` (larger feature chunk), or
- drop the shared-pill `layoutId` animation and animate `opacity`/`transform` via CSS.

**Choose `domMax` for now** — it is still smaller than the eager `motion/react` bundle, and it keeps the pill animation intact.

**Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: exit 0; `23 passed` files / `128 passed` tests

**Step 5: Verify the animations still work**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: the dock buttons, magnet hover, domain-switcher pill, and the 404 page all animate as before. Check `/not-found` for `BlurText` and `AnimatedList`.

**Step 6: Verify the saving**

Run: `npm run perf`
Expected: the `motion/react` chunk no longer appears in the `/(.*)` critical path for `/page`.

**Step 7: Commit**

```bash
git add app/layout.tsx components/MotionProvider.tsx components/bits/Dock.tsx components/DomainSwitcher.tsx components/bits/SegmentedControl.tsx components/bits/AnimatedList.tsx components/bits/BlurText.tsx
git commit -m "perf: defer motion features behind LazyMotion"
```

---

### Task 27: Make the bundle budget test pass

**Objective:** Close the loop opened in Task 2 and lock in the win.

**Files:**
- Modify: `lib/perf-budget.test.ts`

**Step 1: Measure**

Run: `npm run perf`
Expected: record the new `/page` and `/vr/page` gzip totals.

**Step 2: Set the budget just above the measured value**

In `lib/perf-budget.test.ts`, replace the placeholder `200 * 1024` values with the measured totals plus ~5% headroom. Write the real numbers into the commit message so a future reader knows what the ceiling represents.

**Step 3: Verify green**

Run: `npm run build && npx vitest run lib/perf-budget.test.ts`
Expected: 2 passed

**Step 4: Commit**

```bash
git add lib/perf-budget.test.ts
git commit -m "test: lock route bundle budget at the post-optimisation weight"
```

---

## Phase 5 — Documentation and final verification

### Task 28: Update the README

**Objective:** Keep the docs honest. The README currently makes performance claims that this plan changes.

**Files:**
- Modify: `README.md:20`, `README.md:105-121`

**Step 1: Update the runtime-requirements note**

Replace the claim at `README.md:20-21` with:

```
Requires internet access for the first run (MediaPipe model + depth weights
load from the network and are cached afterwards) and a webcam for hand
tracking. Mouse and keyboard work with no camera and no network after the
first visit. The app auto-tunes render resolution and hand-tracking rate to
hold frame rate on modest hardware.
```

**Step 2: Rewrite the depth-AI note**

Replace the depth bullet at `README.md:105-114` with:

```
- Depth AI (on by default): Depth Anything V2
  (`onnx-community/depth-anything-v2-small`, via `@huggingface/transformers`)
  runs monocular depth estimation at ~2.5fps on a 256px crop in a background
  loop, paused while the tab is hidden. Weights are downloaded once and
  cached: ~50MB via WebGPU (fp16) or ~27MB on the WASM fallback (q8). fp32
  is never used — the WASM path has no fp16 acceleration, so it would cost
  99MB for nothing. Constrained devices (2 cores, 2GB RAM, or Save-Data)
  always take the q8 weights. Disable via `depth v2` in the toolbar. The
  inference loop pauses when the tab is hidden, and worst case is pure palm
  baseline. Unavailable in 2D fallback mode.
```

**Step 3: Update the rendering note**

Replace the rendering bullet at `README.md:119-121` with:

```
- Rendering: allocation-free hot paths, in-place line updates, on-demand
  shadow maps, shared geometries/materials, a dirty-checked imperative HUD,
  and adaptive pixel ratio that can fall to 0.75x on a device which cannot
  otherwise hold frame rate. Hand detection is capped at 30Hz.
- Bundle: the lab and VR routes are code-split, so Three.js and the 2D
  fallback engine load after first paint. Vendored wasm/model assets are
  served `immutable` and cached for a year.
```

**Step 4: Verify**

Run: `npm test`
Expected: all green

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update performance and depth-weight notes"
```

---

### Task 29: Add a manual profiling protocol to the repo

**Objective:** Make the profiler-verified claims reproducible by the next person, instead of living only in a chat log.

**Files:**
- Create: `docs/plans/low-end-profiling-protocol.md`

**Step 1: Write the protocol**

Document exactly:

1. **Throttle to a weak machine.** Chrome DevTools → Performance → CPU: `4x` slowdown. Repeat at `6x`.
2. **Measure FPS.** Watch the HUD's `fps` readout while dragging an object, and the `render Nx` readout from Task 21.
3. **Count React renders.** React DevTools Profiler → record 5 seconds of dragging → read the commit count for `HandLab`.
4. **Measure main-thread scripting.** Performance panel → the `Evaluate Script` / self-time total over the same 5 seconds.
5. **Measure load.** Network panel, disable cache, reload, and record the transferred total and the time to interactive.
6. **Record the depth download.** Network panel filtered on `huggingface.co`, note the ONNX filename and size.

**Step 2: Record the results table**

Add a table with `before` and `after` columns and fill in the `after` numbers as you measure them:

| Metric | Before | After | Target |
|---|---:|---:|---:|
| `/` first-load JS (gzip) | 339 KB | _measure_ | < 200 KB |
| Three.js in critical path | 593 KB raw | _measure_ | 0 |
| HandLab commits / 5s drag (4x throttle) | _measure_ | _measure_ | < 60 |
| Drag FPS (4x throttle) | _measure_ | _measure_ | > 30 |
| Depth ONNX download | 99.1 MB | 27.3 MB | 27.3 MB |
| Median main-thread self-time | _measure_ | _measure_ | -50% |

**Step 3: Commit**

```bash
git add docs/plans/low-end-profiling-protocol.md
git commit -m "docs: add low-end profiling protocol and results table"
```

---

### Task 30: Full verification run

**Objective:** Prove the whole suite is green and nothing regressed.

**Step 1: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

**Step 2: Tests**

Run: `npm test`
Expected: exit 0; `23 passed` files / `128 passed` tests. If `lib/perf-budget.test.ts` reports as skipped there is no `.next` build — run `npm run build` first and re-run.

**Step 3: Production build**

Run: `npm run build`
Expected: builds clean, no new warnings beyond the pre-existing `next.config` CSP note.

**Step 4: Bundle report**

Run: `npm run perf`
Expected: `/page` gzip is below the budget set in Task 27.

**Step 5: Manual smoke test**

Run: `npm run start`, open `http://localhost:3000`.

Check each of these, in order:

- [ ] Page paints, then the lab boots (Task 23 loading state is visible briefly)
- [ ] Place, move, and delete a shape with the mouse
- [ ] Enable the webcam; the skeleton preview appears and the cursor tracks
- [ ] Depth AI reaches `live` and the depth indicator moves
- [ ] Pinch-click places a shape; pinch-hold drags it
- [ ] Fist-hold deletes the hovered shape
- [ ] Press `L`, tap out a triangle, close it — the lesson checklist ticks
- [ ] `save` then `load` round-trips the scene
- [ ] `photo` downloads a PNG
- [ ] `lesson ↓` / `lesson ↑` round-trips a lesson
- [ ] Switch tabs for 5 seconds, come back — tracking re-acquires
- [ ] `/vr` loads and the orbit preview responds
- [ ] A 404 page renders with its `BlurText` animation

**Step 6: Confirm the tree is clean**

Run: `git status --short`
Expected: no output

---

## Risks and non-goals

### What could go wrong

| Risk | Likelihood | Mitigation |
|---|---|---|
| 30 Hz hand detection feels laggy to some users | Medium | `HAND_DETECT_MS` is a single constant. If it reads as laggy, drop to `1000/24` and re-test — the cost saving is still ~60%. |
| q8 depth weights measurably reduce depth accuracy | Low-medium | `lib/depth/fusion.ts` already clamps output and falls back to the palm baseline on low confidence. **Verify before shipping:** enable depth, push your hand toward and away from the camera, and confirm the z-score delta tracks monotonically. If it does not, restrict q8 to `constrained === true` and leave the WASM path at fp32. |
| The async fallback-engine restructure (Task 24) races with the cleanup | Medium | The `disposed` flag guards both the post-`await` paths and the final `engineRef` assignment. Task 24 Step 4 requires a real WebGL-disabled browser test. |
| `useCallback` with `[]` captures a stale closure | Medium | Task 7 Step 4 is a mandatory grep before shipping, not an optional check. |
| `React.memo` on `Dock` silently stops working | Low | Task 9 must land before Task 10 — memoising `Dock` while its `items` prop is a fresh array every render is a no-op that looks like a win in code review. |
| `LazyMotion` breaks the `layoutId` pill | Medium | Task 26 Step 3 explicitly chooses `domMax` over `domAnimation` to keep it working, and Step 5 requires a visual check. |
| The bundle budget test blocks a legitimate future feature | Low | The budget is a ceiling with 5% headroom. Raising it requires a deliberate edit with a reason in the commit message. |

### Explicit non-goals

- **No visual downgrade tiers.** No automatic shadow disabling, no MSAA disabling, no lighting cuts, no shape-count reduction. The user chose to keep the visuals and fix the jank.
- **No physics or chemistry routes.** Both currently `redirect("/")`. Their 66 KB of data is already out of the bundle; when they are re-enabled, they must go behind `next/dynamic` — note that in the PR, not here.
- **No replacement of Three.js.** The 593 KB is real, but a renderer swap is a rewrite, not an optimisation.
- **No 2D-renderer rewrite.** The fallback engine is lazy-loaded, which is the 80% win.
- **No service worker.** `immutable` cache headers cover the vendored assets; the app is not offline-first and should not pretend to be.
- **No `lib/experiments/*` refactor.** It is not in any bundle today.

---

## Results (fill in as tasks complete)

| Task | Status | Notes |
|---|---|---|
| 0 — commit in-flight work | ☐ | |
| 1 — perf report script | ☐ | |
| 2 — bundle budget (red) | ☐ | |
| 3 — sceneSync module | ☐ | |
| 4 — wire throttle | ☐ | |
| 5 — toCheckSnap | ☐ | |
| 6 — use toCheckSnap | ☐ | |
| 7 — useCallback handlers | ☐ | |
| 8 — progress effect deps | ☐ | |
| 9 — memoise dock items | ☐ | |
| 10 — React.memo subtrees | ☐ | |
| 11 — Magnet springs | ☐ | |
| 12 — list keys | ☐ | |
| 13 — aria-live scope | ☐ | |
| 14 — device caps | ☐ | |
| 15 — q8 depth weights | ☐ | |
| 16 — CPU delegate retry | ☐ | |
| 17 — 30 Hz hand detection | ☐ | |
| 18 — pause on hidden | ☐ | |
| 19 — skeleton redraw guard | ☐ | |
| 20 — skeleton off-frame | ☐ | |
| 21 — DPR floor 0.75 | ☐ | only visual concession |
| 22 — cache headers | ☐ | |
| 23 — route code splitting | ☐ | |
| 24 — lazy fallback engine | ☐ | |
| 25 — font trim | ☐ | |
| 26 — LazyMotion | ☐ | |
| 27 — budget green | ☐ | |
| 28 — README | ☐ | |
| 29 — profiling protocol | ☐ | |
| 30 — full verification | ☐ | |
