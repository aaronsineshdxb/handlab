# Math Teaching Batch 1 — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn HandLab's geometry lab into a real math teaching surface — wire live scene checks into lessons, add angle/length/numeric check kinds, expose angle-sum + Pythagoras chain readouts, and add a two-hand ruler with span calibration.

**Architecture:** All new math is pure TypeScript in `lib/geometry/chainMath.ts` and `lib/ruler.ts` (unit-tested headless, no THREE needed in eval paths). The engine consumes those builders for its per-chain labels and ruler readout. Lessons become live by mounting the existing `LessonPanel` (which already gates `Next` on scene checks when given a `SceneSnap`) into `ShowcaseLab.tsx`, feeding it `engine.exportCheckSnap()` through the existing `sceneSync` coalescer. Progress reuses `lib/lessons/store.ts`.

**Tech Stack:** Next.js 15 + React 19, Three.js 0.186, TypeScript, vitest 5 (colocated `*.test.ts(x)`, `isolate: false`).

---

## Context the implementer needs

1. **Repo:** `/Users/aaronsinesh/handlab` (a git repo; current HEAD `2b4a1e3`). The working directory has **untracked junk chunk files** `xaa` … `xdy` — never run `git add -A` / `git add .`. Always stage explicit paths.
2. **Stale README:** `README.md` says "scene-check evaluation is not yet wired into lesson progression". That is wrong now: `LessonPanel` evaluates scene checks when given a `snap` prop, but **no lab currently passes one** — and the live geometry lab (`ShowcaseLab.tsx`, loaded by `app/page.tsx` → `components/LabEntry.tsx`) never mounts `LessonPanel` at all. Only `ChemistryLab.tsx` / `PhysicsLab.tsx` do (without `snap`), and those routes currently redirect to the home page. Task group B fixes this by mounting the panel in ShowcaseLab with a live snapshot. The README correction ships with task B2.
3. **Existing wiring to copy from:**
   - `components/PhysicsLab.tsx:32-74` — progress loading, quiz-answer → `saveStep`, lesson import via `addImportedLesson`.
   - `components/LessonPanel.tsx` — scene checklist + `Next` gating (`sceneIncomplete`, lines 123-133), quiz card (286-295), level modes, resume.
   - `lib/engine.ts:1119-1137` — `exportCheckSnap(quizAnswers)` builds a `SceneSnap` straight from the live scene graph.
   - `lib/engine.ts:2161-2164` — `emitMath()` fires `opts.onMath(measurements)` + `opts.onScene()`. `onScene` also fires on place/delete (`lib/engine.ts:1455`) and two-hand scale (`1880`).
   - `lib/sceneSync.ts` — `createSceneSync(fn)` coalesces into one `fn` per 100 ms; `.flush()` / `.dispose()` for teardown.
   - `components/QuizCard.tsx` — model for the new `NumericCard`.
4. **Engine hot-loop rules:** `drive()`/`updateLine()` must not allocate. New pure helpers are called with preallocated scratch (`this.ndc`, `this.ray`, `this.camPlane`, `this._v1`, `this._v2` already exist, `lib/engine.ts:514-516, 1945-1959` — the mouse projection block is the exact pattern the ruler reuses).
5. **Test commands:** `npx vitest run <file>` for one file, `npm test` for all. Engine methods are tested with the prototype-call + fake-`this` pattern from `lib/exportCheckSnap.test.ts:12-52`.
6. **Commit style:** `feat:` / `docs:` / `chore:` prefixes (see `git log`).

---

## Phase A — pure chain math + new check kinds

### Task A1: Create `lib/geometry/chainMath.ts`

**Objective:** Single source of pure chain math shared by lesson checks and engine labels: vertex distances, chain length (closed = perimeter via wrap-around), interior angles (open: joints; closed: every vertex incl. wrap-around), angle sum, and a Pythagoras triple for 3-point open chains.

**Files:**
- Create: `lib/geometry/chainMath.ts`
- Test: `lib/geometry/chainMath.test.ts`

**Step 1: Write failing test**

```ts
// lib/geometry/chainMath.test.ts
import { describe, expect, it } from "vitest";
import {
  chainLength,
  dist3,
  interiorAnglesDeg,
  pythagorasOf,
  sumDegrees,
} from "./chainMath";

type P = [number, number, number];

describe("chainMath.dist3", () => {
  it("measures segment distances", () => {
    expect(dist3([0, 0, 0] as P, [3, 4, 0] as P)).toBe(5);
  });
});

describe("chainMath.chainLength", () => {
  const tri: P[] = [
    [0, 0, 0],
    [3, 0, 0],
    [0, 4, 0],
  ];

  it("open chains count segments between consecutive points", () => {
    expect(chainLength(tri, false)).toBeCloseTo(3 + 5);
  });

  it("closed chains add the wrap-around segment (perimeter)", () => {
    expect(chainLength(tri, true)).toBeCloseTo(3 + 5 + 4);
  });
});

describe("chainMath.interiorAnglesDeg", () => {
  it("open chain: one joint angle for 3 points", () => {
    const angles = interiorAnglesDeg(
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ] as P[],
      false,
    );
    expect(angles).toHaveProperty("length", 1);
    expect(angles[0]).toBeCloseTo(90, 5);
  });

  it("closed 3-4 loop: one angle per unique vertex (not duplicate at both ends)", () => {
    const angles = interiorAnglesDeg(
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
        [0, 0, 0],
      ] as P[],
      true,
    );
    // first == last, so the duplicate gets collapsed: 2 unique vertices here
    // (triangle corner at [3,0,0] = 90° and the degenerate duplicate start).
    expect(angles).toHaveProperty("length", 2);
    const sum = sumDegrees(angles);
    // A nearly-degenerate sliver: allow the engine to answer, just be finite.
    expect(Number.isFinite(sum)).toBe(true);
  });

  it("closed square loop (loop not repeating last): 4 angles summing 360", () => {
    const square: P[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    const angles = interiorAnglesDeg(square, true);
    expect(angles).toHaveProperty("length", 4);
    expect(sumDegrees(angles)).toBeCloseTo(360, 3);
  });
});

describe("chainMath.sumDegrees", () => {
  it("sums the array", () => {
    expect(sumDegrees([10, 20, 30])).toBe(60);
  });
  it("empty array sums to 0", () => {
    expect(sumDegrees([])).toBe(0);
  });
});

describe("chainMath.pythagorasOf", () => {
  it("gives a right-triangle triple for a 3-point open chain", () => {
    const p = pythagorasOf([
      [0, 0, 0],
      [3, 0, 0],
      [3, 4, 0],
    ] as P[]);
    expect(p).not.toBeNull();
    expect(p!.a).toBeCloseTo(3);
    expect(p!.b).toBeCloseTo(4);
    expect(p!.c).toBeCloseTo(5);
    expect(p!.right).toBe(true);
    expect(p!.residual).toBeCloseTo(0);
  });

  it("marks a non-right chain as not right", () => {
    const p = pythagorasOf([
      [0, 0, 0],
      [3, 0, 0],
      [6, 2, 0],
    ] as P[]);
    expect(p).not.toBeNull();
    expect(p!.right).toBe(false);
  });

  it("returns null unless the chain has exactly 3 points", () => {
    expect(pythagorasOf([[0, 0, 0]] as P[])).toBeNull();
    expect(
      pythagorasOf([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ] as P[]),
    ).toBeNull();
  });

  it("matches the interior angle at the middle vertex for rightness", () => {
    const pts: P[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ];
    const angle = interiorAnglesDeg(pts, false)[0];
    const p = pythagorasOf(pts);
    expect(p!.right).toBe(Math.abs(angle - 90) <= pythagorasOf.MATCH_TOL_DEG);
  });
});
```

**Step 2: Run test to verify failure**

Run: `npx vitest run lib/geometry/chainMath.test.ts`
Expected: FAIL — module has no exported member (or file missing).

**Step 3: Write the implementation**

```ts
// lib/geometry/chainMath.ts
/**
 * Pure chain math shared by lesson checks (lib/lessons/checks.ts) and the
 * engine's chain labels (lib/engine.ts updateLine / getMeasurements).
 * No THREE dependency and no allocation on the returned numbers so the
 * engine can call it inside per-frame label updates.
 */
export type Pt = [number, number, number];

export const PYTHAG_RIGHT_TOL_DEG = 2;

/** Euclidean distance between two 3D points. */
export function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Total length. Closed adds the first→last wrap-around segment (perimeter). */
export function chainLength(pts: readonly Pt[], closed: boolean): number {
  if (pts.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist3(pts[i - 1]!, pts[i]!);
  if (closed && pts.length > 2) total += dist3(pts[pts.length - 1]!, pts[0]!);
  return total;
}

/** Interior angle at v (degrees), between the two unit vectors v→prev, v→next. */
export function interiorAngleDegAt(
  prev: readonly number[],
  v: readonly number[],
  next: readonly number[],
): number {
  const ax = prev[0] - v[0];
  const ay = prev[1] - v[1];
  const az = prev[2] - v[2];
  const bx = next[0] - v[0];
  const by = next[1] - v[1];
  const bz = next[2] - v[2];
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  if (la <= 1e-9 || lb <= 1e-9) return 0;
  const cos = (ax * bx + ay * by + az * bz) / (la * lb);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** Interior angles in degrees. Open chains: interior joints only.
 *  Closed: every unique vertex incl. wrap-around; if the chain closes by
 *  repeating the first point, the duplicate is collapsed. */
export function interiorAnglesDeg(
  pts: readonly Pt[],
  closed: boolean,
): number[] {
  if (pts.length < 3) return [];
  if (!closed) {
    const angles: number[] = [];
    for (let i = 1; i + 1 < pts.length; i++)
      angles.push(interiorAngleDegAt(pts[i - 1]!, pts[i]!, pts[i + 1]!));
    return angles;
  }
  const loop = dist3(pts[0]!, pts[pts.length - 1]!) < 1e-6 ? pts.slice(0, -1) : pts;
  if (loop.length < 3) return [];
  const angles: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    angles.push(
      interiorAngleDegAt(
        loop[(i - 1 + loop.length) % loop.length]!,
        loop[i]!,
        loop[(i + 1) % loop.length]!,
      ),
    );
  }
  return angles;
}

export function sumDegrees(angles: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < angles.length; i++) sum += angles[i]!;
  return sum;
}

export interface Pythagoras {
  /** Leg 1 = |p0→p1|, leg 2 = |p1→p2|, hypotenuse = |p0→p2|. */
  a: number;
  b: number;
  c: number;
  /** a² + b² − c² (≈0 when right). */
  residual: number;
  /** True when the middle-vertex angle is within MATCH_TOL_DEG of 90°. */
  right: boolean;
}
pythagorasOf.MATCH_TOL_DEG = PYTHAG_RIGHT_TOL_DEG;

/** Pythagoras triple for an open 3-point chain (a leg meeting at p1), else null. */
export function pythagorasOf(points: readonly Pt[]): Pythagoras | null {
  if (points.length !== 3) return null;
  const [p0, p1, p2] = points;
  const a = dist3(p0!, p1!);
  const b = dist3(p1!, p2!);
  const c = dist3(p0!, p2!);
  return {
    a,
    b,
    c,
    residual: a * a + b * b - c * c,
    right: Math.abs(interiorAngleDegAt(p0!, p1!, p2!) - 90) <= PYTHAG_RIGHT_TOL_DEG,
  };
}
```

**Step 4: Run test to verify pass**

Run: `npx vitest run lib/geometry/chainMath.test.ts`
Expected: PASS (all cases, incl. the 90° middle-vertex cases).

Note on `pythagorasOf.MATCH_TOL_DEG`: attaching the constant to the function lets tests read it without exporting five names. If ESLint complains about function-property assignment, export `PYTHAG_RIGHT_TOL_DEG` standalone (it already is) and import it in the test instead — prefer keeping the molecule simple, the test already imports it implicitly through the `pythagorasOf` property.

**Step 5: Commit**

```bash
cd /Users/aaronsinesh/handlab
git add lib/geometry/chainMath.ts lib/geometry/chainMath.test.ts
git commit -m "feat: pure 3D chain math — distances, perimeter, interior angles, angle sum, Pythagoras triple"
```

---

### Task A2: `angle-at` + `length-range` check kinds

**Objective:** Teachers can author checks like "some angle between 80° and 100°" or "a chain between 2.0 m and 2.5 m long". Both evaluate from the existing `SceneSnap.chains` coordinates — no engine change.

**Files:**
- Modify: `lib/lessons/types.ts` (`CheckKind` union, after `area-gt`)
- Modify: `lib/lessons/checks.ts` (`evalCheck`)
- Modify: `lib/lessons/validation.ts` (`isLessonCheck`)
- Modify: `components/LessonPanel.tsx` (`describeCheck`)
- Test: `lib/lessons/checks.test.ts`, `lib/lessons/validation.test.ts`

**Step 1: Write failing tests**

Append to `lib/lessons/checks.test.ts` (it already has a `snap(overrides)` builder and snaps with chains used by existing tests — reuse those shapes; coordinates are `[number, number, number][]` per chain):

```ts
describe("angle-at", () => {
  it("passes when any chain has an interior angle within [min,max] (degrees)", () => {
    const check = { kind: "angle-at", min: 89, max: 91 } as const;
    const rightTriangle: number[][][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: rightTriangle }))).toBe(true);
  });

  it("fails outside the range", () => {
    const check = { kind: "angle-at", min: 120, max: 130 } as const;
    const chain: number[][][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: chain }))).toBe(false);
  });

  it("also looks at closed-loop wrap-around vertices", () => {
    const check = { kind: "angle-at", min: 89, max: 91 } as const;
    const square: number[][][] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: square }))).toBe(true);
  });
});

describe("length-range", () => {
  it("passes when an open chain's total length is within [min,max] inclusive", () => {
    const check = { kind: "length-range", min: 7, max: 9 } as const; // 3+5=8
    const chain: number[][][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: chain }))).toBe(true);
  });

  it("closed chains use the perimeter (incl. wrap-around)", () => {
    const check = { kind: "length-range", min: 11.9, max: 12.1 } as const; // 3+5+4=12
    const closed: number[][][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
        [0, 0, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: closed }))).toBe(true);
  });

  it("fails when no chain fits", () => {
    const check = { kind: "length-range", min: 50, max: 60 } as const;
    expect(evalCheck(check, snap({ chains: [] }))).toBe(false);
  });
});
```

Append to `lib/lessons/validation.test.ts` (follow the file's existing `isLesson`/check-case style):

```ts
describe("angle-at + length-range checks", () => {
  it("accepts valid angle-at", () => {
    expect(isLessonCheck({ kind: "angle-at", min: 30, max: 90 })).toBe(true);
  });
  it("rejects angle-at with min > max or out-of-range degrees", () => {
    expect(isLessonCheck({ kind: "angle-at", min: 90, max: 30 })).toBe(false);
    expect(isLessonCheck({ kind: "angle-at", min: -10, max: 30 })).toBe(false);
    expect(isLessonCheck({ kind: "angle-at", min: 30, max: 190 })).toBe(false);
  });
  it("accepts valid length-range and rejects min > max / negative", () => {
    expect(isLessonCheck({ kind: "length-range", min: 1, max: 2 })).toBe(true);
    expect(isLessonCheck({ kind: "length-range", min: 2, max: 1 })).toBe(false);
    expect(isLessonCheck({ kind: "length-range", min: -1, max: 2 })).toBe(false);
  });
});
```

> Note: if `isLessonCheck` is not exported in `validation.test.ts`'s current imports, import it: the file already tests check shapes via whole lessons — either pattern is fine, but direct export of `isLessonCheck` is cleaner. Export it in Task A2 step 3 (currently it is a module-local `const`).

**Step 2: Run tests to verify failure**

Run: `npx vitest run lib/lessons/checks.test.ts lib/lessons/validation.test.ts`
Expected: FAIL — unknown check kinds return `false` in evalCheck and `false` in validation (acceptance tests fail).

**Step 3: Implement**

`lib/lessons/types.ts` — extend the union (keep member order; insert after `area-gt`):

```ts
export type CheckKind =
  | { kind: "place-count"; shape: string; count: number }
  | { kind: "chain-closed"; minPoints: number }
  | { kind: "area-gt"; min: number }
  | { kind: "angle-at"; min: number; max: number }
  | { kind: "length-range"; min: number; max: number }
  | { kind: "numeric"; question: string; answer: number; tolerance: number }
  | { kind: "quiz"; question: string; options: string[]; answer: number };
```

(`numeric` ships in task A3; adding it to the union now avoids a pointless re-edit in 10 minutes. The switch handles unknowns by returning false, so nothing breaks in between.)

`lib/lessons/checks.ts` — add to imports and the switch:

```ts
import {
  chainLength,
  interiorAnglesDeg,
  type Pt,
} from "../geometry/chainMath";
```

```ts
    case "angle-at": {
      // Any interior angle in any chain (open joints + closed wrap-around)
      // inside [min,max] passes. Degrees in lesson JSON, matching the HUD.
      for (const chain of snap.chains) {
        const closed = chain.length >= 3 && sameEnds(chain);
        for (const angle of interiorAnglesDeg(chain as readonly Pt[], closed)) {
          if (angle >= c.min && angle <= c.max) return true;
        }
      }
      return false;
    }
    case "length-range": {
      for (const chain of snap.chains) {
        const closed = chain.length >= 3 && sameEnds(chain);
        const length = chainLength(chain as readonly Pt[], closed);
        if (length >= c.min && length <= c.max) return true;
      }
      return false;
    }
```

Add the tiny helper next to `isClosedLoop` (DRY: same end-detection the closed-loop check uses — refactor `isClosedLoop` to call it):

```ts
/** First/last vertices coincide (chain closes by repeating its start point). */
function sameEnds(pts: readonly number[][]): boolean {
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return false;
  return (
    Math.hypot(...first.map((value, index) => value - (last[index] ?? 0))) < CLOSE_EPS
  );
}
```

and rewrite `isClosedLoop` as:

```ts
function isClosedLoop(pts: number[][]): boolean {
  if (pts.length < 3) return false;
  return sameEnds(pts);
}
```

`lib/lessons/validation.ts` — make the helper exported and add cases:

```ts
export const isLessonCheck = (value: unknown): value is CheckKind => {
```

with two new cases inside the switch:

```ts
    case "angle-at":
      return (
        isFiniteNumber(value.min) &&
        isFiniteNumber(value.max) &&
        value.min >= 0 &&
        value.min <= 180 &&
        value.max >= 0 &&
        value.max <= 180 &&
        value.min <= value.max
      );
    case "length-range":
      return (
        isFiniteNumber(value.min) &&
        isFiniteNumber(value.max) &&
        value.min >= 0 &&
        value.min <= value.max
      );
```

`components/LessonPanel.tsx` — `describeCheck` cases (before `default`):

```ts
    case "angle-at":
      return `Turn an angle between ${check.min}° and ${check.max}°`;
    case "length-range":
      return `Draw a chain between ${check.min} m and ${check.max} m long`;
    case "numeric":
      return check.tolerance > 0
        ? `Type the value of ${check.question} (± ${check.tolerance})`
        : `Type the value of ${check.question}`;
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run lib/lessons lib/geometry/chainMath.test.ts`
Expected: PASS (all existing + new).

Also run `npm run typecheck` — `angle-at` string labels narrow `check.min`; the discriminated union makes this sound.

**Step 5: Commit**

```bash
git add lib/lessons/types.ts lib/lessons/checks.ts lib/lessons/validation.ts components/LessonPanel.tsx lib/lessons/checks.test.ts lib/lessons/validation.test.ts
git commit -m "feat: angle-at + length-range lesson checks evaluated from live chain coordinates"
```

---

### Task A3: `numeric` check kind + `NumericCard`

**Objective:** Free numeric answers with tolerance ("How tall is this prism? Type it."). Reuses the existing `quizAnswers` record — the student's number is stored under the question text, so `exportCheckSnap` carries it with zero API changes.

**Files:**
- Modify: `lib/lessons/checks.ts` (`evalCheck` case — union member already added in A2)
- Modify: `lib/lessons/validation.ts`
- Create: `components/NumericCard.tsx`
- Modify: `components/LessonPanel.tsx` (state, numeric check gating, render `NumericCard`)
- Test: `lib/lessons/checks.test.ts`, `lib/lessons/validation.test.ts`, `components/NumericCard.test.tsx`, `components/LessonPanel.test.tsx`

**Step 1: Write failing tests**

`lib/lessons/checks.test.ts`:

```ts
describe("numeric", () => {
  const check = { kind: "numeric", question: "Volume in m³?", answer: 12, tolerance: 0.5 } as const;

  it("passes within tolerance inclusive", () => {
    expect(evalCheck(check, snap({ quizAnswers: { "Volume in m³?": 12.5 } }))).toBe(true);
    expect(evalCheck(check, snap({ quizAnswers: { "Volume in m³?": 11.5 } }))).toBe(true);
  });
  it("fails outside tolerance, or with no/invalid answer", () => {
    expect(evalCheck(check, snap({ quizAnswers: { "Volume in m³?": 12.51 } }))).toBe(false);
    expect(evalCheck(check, snap({}))).toBe(false);
    expect(evalCheck(check, snap({ quizAnswers: { "Volume in m³?": Number.NaN } }))).toBe(false);
  });
});
```

`lib/lessons/validation.test.ts`:

```ts
describe("numeric checks", () => {
  it("accepts a finite answer + non-negative tolerance", () => {
    expect(isLessonCheck({ kind: "numeric", question: "v?", answer: 5, tolerance: 0 })).toBe(true);
  });
  it("rejects negative tolerance or non-finite answer", () => {
    expect(isLessonCheck({ kind: "numeric", question: "v?", answer: 5, tolerance: -1 })).toBe(false);
    expect(isLessonCheck({ kind: "numeric", question: "v?", answer: Number.NaN, tolerance: 1 })).toBe(false);
    expect(isLessonCheck({ kind: "numeric", question: "", answer: 5, tolerance: 1 })).toBe(false);
  });
});
```

`components/NumericCard.test.tsx` (mirror `components/QuizCard.test.tsx`'s render approach):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NumericCard from "./NumericCard";

describe("NumericCard", () => {
  it("renders the question, an input, and a submit control", () => {
    const html = renderToStaticMarkup(
      <NumericCard
        question="Volume in m³?"
        answer={12}
        tolerance={0.5}
        onAnswer={() => {}}
      />,
    );
    expect(html).toContain("<h1>Volume in m³?</h1>".replace("h1", "p"));
  });

  it("keeps the input labelled for screen readers", () => {
    const html = renderToStaticMarkup(
      <NumericCard question="Q" answer={1} tolerance={0} onAnswer={() => {}} />,
    );
    expect(html).toContain("aria-label");
  });
});
```

Adjust to assert the actual markup once implemented (the first assertion is intentionally loose since the exact class names may differ).

`components/LessonPanel.test.tsx` — add a lesson step with a `numeric` check and assert `Next` is disabled until correct (via snapshot of whether the blocked hint text appears — mirror the existing progress blocking tests).

**Step 2: Run tests to verify failure**

Run: `npx vitest run lib/lessons/checks.test.ts lib/lessons/validation.test.ts components/NumericCard.test.tsx`
Expected: FAIL — no numeric case in `evalCheck` (returns false), no `NumericCard` module.

**Step 3: Implement**

`lib/lessons/checks.ts` — case before `quiz` (numeric reuses the quizAnswers record; index semantics don't apply, the stored value IS the number):

```ts
    case "numeric": {
      const value = snap.quizAnswers[c.question];
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value - c.answer) <= c.tolerance
      );
    }
```

`lib/lessons/validation.ts` — case:

```ts
    case "numeric":
      return (
        isText(value.question, MAX_TEXT_LENGTH) &&
        isFiniteNumber(value.answer) &&
        isFiniteNumber(value.tolerance) &&
        value.tolerance >= 0
      );
```

`components/NumericCard.tsx` (full file, same visual family as QuizCard):

```tsx
"use client";

import { useEffect, useId, useState } from "react";

export interface NumericCardProps {
  question: string;
  answer: number;
  tolerance: number;
  /** Fires on every submit with the parsed value (NaN-guarded upstream). */
  onAnswer: (value: number) => void;
}

/** Free numeric quiz card. Grey = placeholder entry, green = inside
 *  tolerance, red = outside. Same surface family as QuizCard. */
export default function NumericCard({
  question,
  answer,
  tolerance,
  onAnswer,
}: NumericCardProps) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "correct" | "wrong">("idle");
  const inputId = useId();

  useEffect(() => {
    setValue("");
    setState("idle");
  }, [question, answer, tolerance]);

  const submit = () => {
    if (state === "correct") return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setState("wrong");
      onAnswer(Number.NaN);
      return;
    }
    const correct = Math.abs(parsed - answer) <= tolerance;
    setState(correct ? "correct" : "wrong");
    onAnswer(parsed);
  };

  const borderColor =
    state === "correct"
      ? "var(--good)"
      : state === "wrong"
        ? "var(--bad)"
        : "var(--border)";

  return (
    <section
      aria-label="Numeric challenge"
      style={{
        position: "relative",
        marginTop: 14,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--surface2)",
      }}
    >
      <p style={{ fontWeight: 700, marginBottom: 8 }}>{question}</p>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          id={inputId}
          type="number"
          step="any"
          inputMode="decimal"
          aria-label={`Your answer for ${question}`}
          value={value}
          disabled={state === "correct"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${borderColor}`,
            background: "var(--surface)",
            color: "inherit",
            fontVariantNumeric: "tabular-nums",
          }}
        />
        <button
          type="button"
          className="btn ghost"
          disabled={state === "correct"}
          onClick={submit}
        >
          Submit
        </button>
      </div>
      {state === "correct" && (
        <p className="m-sub" style={{ marginTop: 6, color: "var(--good)" }}>
          Inside tolerance ✓
        </p>
      )}
    </section>
  );
}
```

`components/LessonPanel.tsx`:

1. Import: `import type { ... } from "../lib/lessons/types";` already imports `CheckKind`, `Lesson`, `Progress`, `QuizCheck` — add `NumericCheck`:

```ts
import type {
  CheckKind,
  Lesson,
  NumericCheck,
  Progress,
  QuizCheck,
} from "../lib/lessons/types";
```

`lib/lessons/types.ts` additions:

```ts
export type QuizCheck = Extract<CheckKind, { kind: "quiz" }>;
/** Free numeric answer check. Stored by the question text in the same
 *  quizAnswers record the engine snapshot carries. */
export type NumericCheck = Extract<CheckKind, { kind: "numeric" }>;
```

2. Props — add the optional callback (keeps Physics/Chemistry labs working untouched):

```ts
  onNumericAnswer?: (check: NumericCheck, value: number) => void;
```

(Add to `LessonPanelProps`, destructure in the component via `onNumericAnswer`.)

3. Local state + derived (next to `completedQuizKey`):

```ts
  const [completedNumericKey, setCompletedNumericKey] = useState<string | null>(null);
```

```ts
  const numericCheck = step?.checks.find(
    (check): check is NumericCheck => check.kind === "numeric",
  );
  const numericKey =
    numericCheck?.kind === "numeric"
      ? `${active ?? ""}:${step?.id ?? ""}:${numericCheck.question}`
      : null;
```

```ts
  const numericComplete =
    (numericCheck?.kind === "numeric" && completedNumericKey === numericKey) ||
    isPreviouslyCompleted;
  const numericIncomplete = numericCheck?.kind === "numeric" && !numericComplete;
```

4. `sceneChecks` must exclude numeric too (it can't be satisfied by placing objects):

```ts
  const sceneChecks = (step?.checks ?? []).filter(
    (c) => c.kind !== "quiz" && c.kind !== "numeric",
  );
```

5. `stepBlocked`:

```ts
  const stepBlocked = quizIncomplete || numericIncomplete || sceneIncomplete;
```

6. The reset effect (line ~101) also clears the numeric key:

```ts
  useEffect(() => {
    setCompletedQuizKey(null);
    setCompletedNumericKey(null);
    setQuizIncorrect(false);
  }, [active, stepIdx, step?.id, quizCheck?.question, quizRun]);
```

7. `resetQuiz` also clears `completedNumericKey`.

8. Handler + render (below the QuizCard block):

```ts
  const handleNumericAnswer = (value: number) => {
    if (numericCheck?.kind !== "numeric" || !Number.isFinite(value)) return;
    const correct = Math.abs(value - numericCheck.answer) <= numericCheck.tolerance;
    setCompletedNumericKey(correct ? numericKey : null);
    if (!correct) setQuizIncorrect(true);
    if (correct) setQuizIncorrect(false);
    onNumericAnswer?.(numericCheck, value);
  };
```

```tsx
              {numericCheck?.kind === "numeric" && (
                <NumericCard
                  key={`${active}:${step.id}:${numericCheck.question}:${quizRun}`}
                  question={numericCheck.question}
                  answer={numericCheck.answer}
                  tolerance={numericCheck.tolerance}
                  onAnswer={handleNumericAnswer}
                />
              )}
```

( Import `import NumericCard from "./NumericCard";` at the top. `quizRun` reuse keeps the reset semantics identical to QuizCard.)

**Step 4: Run tests to verify pass**

Run: `npx vitest run lib/lessons components/NumericCard.test.tsx components/LessonPanel.test.tsx`
Expected: PASS. Then `npm run typecheck`.

**Step 5: Commit**

```bash
git add lib/lessons/types.ts lib/lessons/checks.ts lib/lessons/validation.ts lib/lessons/checks.test.ts lib/lessons/validation.test.ts components/NumericCard.tsx components/NumericCard.test.tsx components/LessonPanel.tsx components/LessonPanel.test.tsx
git commit -m "feat: numeric lesson check with tolerance — free-number answers via the quizAnswers record"
```

---

### Task A4: New geometry lessons exercising the new checks

**Objective:** Two advanced lessons authored against `angle-at` / `length-range` / `numeric`, so the features are immediately reachable without custom JSON.

**Files:**
- Modify: `lib/lessons/lessons.geometry.ts`
- Modify: `lib/lessons/lessons.geometry.test.ts`

**Step 1: Write failing test**

Update `lib/lessons/lessons.geometry.test.ts` id assertion and add:

```ts
  it("angles lesson authoring matches its checks", () => {
    const angles = LESSONS.find(({ id }) => id === "angles-adv");
    expect(angles).toBeDefined();
    const step = angles!.steps.find(({ id }) => id === "right");
    expect(step!.checks).toEqual([{ kind: "angle-at", min: 88, max: 92 }]);
  });

  it("estimate-then-verify lesson stores the numeric reveal", () => {
    const lesson = LESSONS.find(({ id }) => id === "estimate-1");
    expect(lesson!.steps.some(({ checks }) =>
      checks.some((check) => check.kind === "numeric"),
    )).toBe(true);
  });
```

**Step 2: Run to verify failure**

Run: `npx vitest run lib/lessons/lessons.geometry.test.ts`
Expected: FAIL — lessons not present yet.

**Step 3: Implement — append two lessons to the `LESSONS` array in `lib/lessons/lessons.geometry.ts`**

```ts
  {
    id: "angles-adv",
    title: "Angle Hunt",
    level: "advanced",
    domain: "geometry",
    topic: "angles",
    objectives: [
      "Read live interior angles",
      "Recognise right angles",
      "Discover the angle sum of polygons",
    ],
    steps: [
      {
        id: "right",
        title: "Make a right angle",
        prompt:
          "Press L, tap 3 points forming an L-shape. The middle angle label shows live — get it between 88° and 92°.",
        level: "advanced",
        hint: "Snap (green ring) keeps segments honest; the angle updates as you drag points.",
        checks: [{ kind: "angle-at", min: 88, max: 92 }],
      },
      {
        id: "triangle-sum",
        title: "Quiz: triangle angle sum",
        prompt: "Close a 3-point loop. What have the three interior angles added up to every time?",
        level: "advanced",
        checks: [
          {
            kind: "quiz",
            question: "Sum of a triangle's interior angles?",
            options: ["90°", "180°", "360°"],
            answer: 1,
          },
        ],
      },
      {
        id: "quad-sum",
        title: "Quiz: quad angle sum",
        prompt: "Now close a 4-point loop (square-ish). The sum changed by…?",
        level: "advanced",
        checks: [
          {
            kind: "quiz",
            question: "Each extra vertex adds how many degrees?",
            options: ["90°", "180°", "270°"],
            answer: 1,
          },
        ],
      },
    ],
  },
  {
    id: "estimate-1",
    title: "Estimate Then Verify",
    level: "advanced",
    domain: "geometry",
    topic: "estimation",
    objectives: ["Estimate before measuring", "Judge your own error"],
    steps: [
      {
        id: "guess",
        title: "Guess the length",
        prompt:
          "Look at the room grid: each large grid square is 1 m. Draw a line-chain you think is exactly 2.00 m long WITHOUT reading the live label carefully. Confidence-check: type your target length next.",
        level: "advanced",
        hint: "Commit to a number first — measurement after estimation trains the eye.",
        checks: [
          {
            kind: "numeric",
            question: "My planned chain length (m)",
            answer: 2,
            tolerance: 0.2,
          },
        ],
      },
      {
        id: "draw",
        title: "Draw it",
        prompt:
          "Now draw the chain. Check the live length — how close were you? ±10% is excellent.",
        level: "advanced",
        checks: [{ kind: "length-range", min: 1.8, max: 2.2 }],
      },
    ],
  },
```

Update the first test's expected id array to `["shapes-101", "measure-lines", "volume-adv", "angles-adv", "estimate-1"]`.

**Step 4: Run tests to verify pass**

Run: `npx vitest run lib/lessons`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/lessons/lessons.geometry.ts lib/lessons/lessons.geometry.test.ts
git commit -m "feat: Angle Hunt + Estimate Then Verify geometry lessons on the new checks"
```

---

## Phase B — live lessons in the geometry lab

### Task B1: Render the Lessons drawer in ShowcaseLab with a live scene snapshot

**Objective:** The main lab gets a `Lessons` rail button + drawer hosting `LessonPanel`, fed a coalesced live `SceneSnap` from `engine.exportCheckSnap`, with progress persistence and lesson import/export (`lesson ↓` / `lesson ↑`).

**Files:**
- Modify: `components/ShowcaseLab.tsx` (state, engine opts, rail, drawer, LessonPanel mount)
- Modify: `components/ShowcaseLab.tsx` `FullEngine` type — add `exportCheckSnap`
- Test: `npm run typecheck` + manual dev walkthrough (component test impractical for engine wiring); guards covered by A-phase tests.

**Step 1: Write the code**

1. Imports (top of `components/ShowcaseLab.tsx`):

```tsx
import LessonPanel from "./LessonPanel";
import { GEOMETRY_LESSONS } from "../lib/lessons/lessons.geometry";
import { loadProgress, saveStep } from "../lib/lessons/store";
import { addImportedLesson } from "../lib/lessons/validation";
import type { Lesson, NumericCheck, Progress, QuizCheck } from "../lib/lessons/types";
import type { SceneSnap } from "../lib/lessons/checks";
import { createSceneSync } from "../lib/sceneSync";
```

2. `FullEngine` type — add after `exportScene`:

```ts
  exportCheckSnap?: (quizAnswers?: Record<string, number>) => SceneSnap;
```

3. State block (after the existing `const [engineRev, setEngineRev] = useState(0);`):

```tsx
  const [lessons, setLessons] = useState<Lesson[]>(GEOMETRY_LESSONS);
  const lessonsRef = useRef<Lesson[]>(GEOMETRY_LESSONS);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lessonStep, setLessonStep] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const lessonFileRef = useRef<HTMLInputElement>(null);
  const quizRef = useRef<Record<string, number>>({});
  const [sceneTick, setSceneTick] = useState(0);
```

4. Load progress once (next to the `lockLightTheme` effect):

```tsx
  useEffect(() => setProgressMap(loadProgress()), []);
```

5. Scene sync + engine opts — in the engine lifecycle effect, replace the `opts` literal:

```tsx
    const sceneSync = createSceneSync(() => setSceneTick((t) => t + 1));
    const opts = {
      canvas: canvasRef.current, video: videoRef.current, skel: skelRef.current,
      cursor2d: cursor2dRef.current, toast: toastRef.current, hud,
      emit: setUi,
      onCamLive: () => setPreviewOpen(true),
      onFatal: (msg: string) => setFatal(msg),
      onScene: (): void => { sceneSync(); },
    };
```

and in the teardown return:

```tsx
    return () => {
      disposed = true;
      sceneSync.flush();
      sceneSync.dispose();
      engine?.dispose?.();
      engineRef.current = null;
    };
```

6. Snapshot memo + handlers (before `selectShape`):

```tsx
  // Live scene snapshot for lesson checks. Rebuilt when the engine reports a
  // scene change (coalesced to ≈10 Hz by sceneSync) or quiz answers change.
  const engineSnap = useMemo<SceneSnap | undefined>(() => {
    const eng = engineRef.current as FullEngine | null;
    if (!eng?.exportCheckSnap) return undefined;
    return eng.exportCheckSnap(quizRef.current);
    // engineRev: the async engine arrives after first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneTick, engineRev]);

  const selectLesson = useCallback(
    (nextId: string) => {
      if (lessonId === nextId) {
        setLessonId(null);
        setLessonStep(0);
        return;
      }
      setLessonId(nextId);
      const lesson = lessons.find(({ id }) => id === nextId);
      const last = Math.max((lesson?.steps.length ?? 1) - 1, 0);
      const stored = progressMap[nextId]?.stepIdx ?? 0;
      setLessonStep(Math.min(Math.max(Math.floor(stored), 0), last));
    },
    [lessonId, lessons, progressMap],
  );

  const bumpProgress = useCallback(
    (stepIdx: number) => {
      if (!lessonId) return;
      const next: Progress = {
        lessonId,
        stepIdx,
        done: true,
        score: 1,
        updatedAt: Date.now(),
      };
      saveStep(next);
      setProgressMap((cur) => ({ ...cur, [lessonId]: next }));
    },
    [lessonId],
  );

  const handleQuizAnswer = useCallback(
    (check: QuizCheck, answerIndex: number) => {
      if (answerIndex !== check.answer || !lessonId) return;
      quizRef.current[check.question] = answerIndex;
      setSceneTick((t) => t + 1);
      bumpProgress(lessonStep);
    },
    [lessonId, lessonStep, bumpProgress],
  );

  const handleNumericAnswer = useCallback(
    (check: NumericCheck, value: number) => {
      quizRef.current[check.question] = value;
      setSceneTick((t) => t + 1);
      if (
        Number.isFinite(value) &&
        Math.abs(value - check.answer) <= check.tolerance
      )
        bumpProgress(lessonStep);
    },
    [lessonStep, bumpProgress],
  );

  const onLessonExport = useCallback(() => {
    const lesson = lessons.find(({ id }) => id === lessonId);
    if (!lesson) return;
    const blob = new Blob([JSON.stringify(lesson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    download(`handlab-lesson-${lesson.id}.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [lessonId, lessons]);

  const onLessonImport = useCallback(async (f: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text()) as unknown;
    } catch {
      return;
    }
    const cur = lessonsRef.current;
    const next = addImportedLesson(cur, parsed);
    if (next === cur) return;
    lessonsRef.current = next;
    setLessons(next);
  }, []);
```

Note: `download` is defined below these handlers in the current file (`const download = (name, url) => …` at ~line 216) — move the `download` helper **above** the lesson handlers (hoisted `const` in the same function body must appear before use at runtime; JSX callbacks execute after render so reference order compiles fine with function declarations — to keep it simple, convert `download` to `function download(...)` declared anywhere in the component, or place the lesson handlers after it. Prefer moving the lesson block *after* the existing `download`/`onExportFile` definitions).

7. Rail button — add after the `∑` math-panel fab:

```tsx
        <button className={"sc-fab" + (drawer === "lessons" ? " active" : "")} aria-pressed={drawer === "lessons"} aria-label="Lessons" title="Guided lessons" onClick={() => setDrawer((d) => (d === "lessons" ? null : "lessons"))}><span aria-hidden="true">≡</span></button>
```

8. Skill-less drawer — add after the `help` drawer block (sibling, not nested):

```tsx
      <div className={"sc-drawer sc-lessons" + (drawer === "lessons" ? "" : " is-hidden")} aria-hidden={drawer !== "lessons"}>
        <div className="sc-drawer__head"><b>Lessons</b><button aria-label="Close" onClick={() => setDrawer(null)}>×</button></div>
        <LessonPanel
          lessons={lessons}
          active={lessonId}
          stepIdx={lessonStep}
          onSelect={selectLesson}
          onNext={(n) => { setLessonStep(n); bumpProgress(n); }}
          onBack={(n) => setLessonStep(n)}
          progress={lessonId ? progressMap[lessonId] : undefined}
          onQuizAnswer={handleQuizAnswer}
          onNumericAnswer={handleNumericAnswer}
          snap={engineSnap}
        />
        <div className="sc-chips" style={{ marginTop: 8 }}>
          <button className="sc-chip" disabled={!lessonId} onClick={onLessonExport}>lesson ↓</button>
          <button className="sc-chip" onClick={() => lessonFileRef.current?.click()}>lesson ↑</button>
        </div>
        <input ref={lessonFileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onLessonImport(f); e.target.value = ""; }} />
      </div>
```

9. CSS — `app/globals.css`: give `.sc-lessons` the same drawer positioning family as the other `.sc-drawer` chrome (reuse existing `.sc-drawer` rules since we re-used the class; only add narrow width + top offset so two drawers don't stack: adjacent in code, and only one `drawer` value active at a time, so plain `.sc-drawer` positioning suffices — no CSS change needed unless QA shows overlap).

**Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

Manual: `npm run dev` → open `http://localhost:3000`:
- Click rail `≡` → Lessons drawer opens, shows the 5 geometry lessons.
- Select `Shapes 101` → place 3 cubes → Next opens (scene check passes live).
- `Estimate Then Verify` → type `2` → Submit → progress ring moves.
- Back button, resume after reload (`handlab.progress.v1` persists).

**Step 3: Commit**

```bash
git add components/ShowcaseLab.tsx
git commit -m "feat: Lessons drawer in the geometry lab — live scene checks gate progression + lesson import/export"
```

---

### Task B2: Correct the README teaching-mode section

**Objective:** The README's "Teaching mode" paragraph is stale (says scene checks aren't wired). Document the drawer + the new checks + the ruler (from Phase D).

**Files:**
- Modify: `README.md` (`## Teaching mode` section)

**Step 1: Edit** — replace the stale paragraph with:

```markdown
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: teaching-mode section — scene checks are live in the geometry lab"
```

---

## Phase C — engine chain readouts

### Task C1: Face-lift `Measurement` with angleSum + pythag

**Objective:** `getMeasurements()` gets `angleSum` (deg, closed loops only) and `pythag` (open 3-point chains), consumed later by UI/lessons if needed; the pure math lives in `chainMath`.

**Files:**
- Modify: `lib/engine.ts` (`Measurement` interface ~line 112, `getMeasurements` ~line 2112)
- Test: `lib/engine.measurements.test.ts`

**Step 1: Write failing test** (prototype-call pattern, fake `this` needs the private angle scratch vectors because `getMeasurements` calls `this.angleAt`):

```ts
// lib/engine.measurements.test.ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HandLabEngine } from "./engine";

/**
 * getMeasurements math tested via prototype calls with minimal fakes —
 * angleAt needs its preallocated scratch vectors on `this`; the rest are
 * free functions over plain points.
 */
function fakeEngine(polylines: unknown): unknown {
  return {
    polylines,
    _aa: new THREE.Vector3(),
    _ab: new THREE.Vector3(),
  };
}

const v = THREE.Vector3;

describe("HandLabEngine.getMeasurements ext fields", () => {
  it("closed square: angleSum = 360 and five fields stay unchanged", () => {
    const pts = [
      new v(0, 0, 0), new v(1, 0, 0), new v(1, 1, 0), new v(0, 1, 0),
    ];
    const engine = HandLabEngine.prototype.getMeasurements.call(
      fakeEngine([{ pts }]),
    );
    expect(engine[0].angleSum).toBeCloseTo(360, 2);
    expect(engine[0].pythag).toBeNull();
  });

  it("open 3-point right chain: angleSum null, pythag describes the triple", () => {
    const pts = [new v(0, 0, 0), new v(3, 0, 0), new v(3, 4, 0)];
    const engine = HandLabEngine.prototype.getMeasurements.call(
      fakeEngine([{ pts }]),
    );
    expect(engine[0].angleSum).toBeNull();
    expect(engine[0].pythag!.right).toBe(true);
    expect(engine[0].pythag!.c).toBeCloseTo(5);
  });

  it("closed chains never report pythag; open non-3-pt chains report neither", () => {
    const open = [new v(0, 0, 0), new v(1, 0, 0)];
    const engine = HandLabEngine.prototype.getMeasurements.call(
      fakeEngine([{ pts: open }]),
    );
    expect(engine[0].angleSum).toBeNull();
    expect(engine[0].pythag).toBeNull();
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run lib/engine.measurements.test.ts`
Expected: FAIL — `angleSum` undefined, typecheck rejects `.pythag`.

**Step 3: Implement**

`lib/engine.ts` — extend the interface:

```ts
export interface Measurement {
  id: number;
  pts: [number, number, number][];
  segs: number;
  total: number;
  closed: boolean;
  perimeter: number;
  area: number;
  centroid: [number, number, number];
  normal: [number, number, number];
  angles: number[];
  minAngle: number | null;
  maxAngle: number | null;
  /** Sum of interior angles in degrees — closed loops only, else null. */
  angleSum: number | null;
  /** Pythagoras triple for open 3-point chains, else null. */
  pythag: {
    a: number;
    b: number;
    c: number;
    residual: number;
    right: boolean;
  } | null;
}
```

`getMeasurements` — after `angles` is built:

```ts
      const angleSum = closed && angles.length > 0 ? angles.reduce((s, a) => s + a, 0) : null;
      const pythag = !closed ? pythagorasOf(L.pts.map((p) => [p.x, p.y, p.z] as const)) : null;
```

Hmm — mapping every point per chain allocates. `getMeasurements` already allocates freely (`pts` array maps), and it fires at ~10 Hz, so this is consistent with the existing budget. Add the import at top:

```ts
import { pythagorasOf } from "./geometry/chainMath";
```

and the return object gains:

```ts
        angleSum,
        pythag,
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run lib/engine.measurements.test.ts lib/exportCheckSnap.test.ts && npm run typecheck`
Expected: PASS — existing prototype-call tests unaffected.

**Step 5: Commit**

```bash
git add lib/engine.ts lib/engine.measurements.test.ts
git commit -m "feat: Measurement.angleSum + Measurement.pythag from pure chainMath"
```

---

### Task C2: Chain label variants — `Σ` sum + Pythagoras labels

**Objective:** Chip toggles in the Line drawer make the in-scene chain summary show `(n−2)·180°` comparison for closed loops and `a²+b²−c²` for open 3-point chains. All label text is built by pure helpers so it's unit-testable.

**Files:**
- Create (extend): `lib/geometry/chainMath.ts` — add `angleSumText`, `pythagText`
- Modify: `lib/engine.ts` (`updateLine` summary branch, `setChainMathMode`)
- Modify: `components/ShowcaseLab.tsx` (chips + `FullEngine` method)
- Test: `lib/geometry/chainMath.test.ts`

**Step 1: Write failing tests** (append to `lib/geometry/chainMath.test.ts`):

```ts
import { angleSumText, pythagText } from "./chainMath";

describe("angleSumText", () => {
  it("shows measured sum vs the (n−2)·180° target", () => {
    expect(angleSumText(359.98, 4)).toBe("Σ 359.98° · target 360° (4×180−360)");
  });
});
describe("pythagText", () => {
  it("formats the residual comparison", () => {
    const p = pythagorasOf([
      [0, 0, 0], [3, 0, 0], [3, 4, 0],
    ] as import("./chainMath").Pt[]);
    expect(pythagText(p!)).toBe("a²+b²−c² = +0.00");
  });
  it("marks sign for longer-than-right residuals", () => {
    const p = pythagorasOf([
      [0, 0, 0], [3, 0, 0], [6, 2, 0],
    ] as import("./chainMath").Pt[]);
    const text = pythagText(p!);
    expect(text.startsWith("a²+b²−c² = ")).toBe(true);
    expect(text.includes("-")).toBe(text.includes("-0."));
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run lib/geometry/chainMath.test.ts`
Expected: FAIL — exports missing.

**Step 3: Implement the builders** (append to `lib/geometry/chainMath.ts`):

```ts
/** e.g. "Σ 359.52° · target 360° (4×180−360)" — the rule, spelled out. */
export function angleSumText(sumDeg: number, vertexCount: number): string {
  const target = (vertexCount - 2) * 180;
  return `Σ ${sumDeg.toFixed(2)}° · target ${target}° (${vertexCount}×180−360)`;
}

/** "a²+b²−c² = +0.00" — sign visible so corrections read as direction. */
export function pythagText(p: Pythagoras): string {
  const sign = p.residual > 0 ? "+" : p.residual < 0 ? "-" : "";
  return `a²+b²−c² = ${sign}${Math.abs(p.residual).toFixed(2)}`;
}
```

**Step 4: Engine wiring**

`lib/engine.ts`:

1. Field near `twoHandScaling` (~line 481):

```ts
  private angleSumLabels = false;
  private pythagLabels = false;
```

2. Public setter next to other toggles (e.g., near `toggleSnap`):

```ts
  setChainMathMode(kind: "angleSum" | "pythag", on: boolean): void {
    if (kind === "angleSum") this.angleSumLabels = on;
    else this.pythagLabels = on;
    this.updateLineLabelsAll();
  }

  private updateLineLabelsAll(): void {
    this.polylines.forEach((L) => this.updateLine(L));
  }
```

3. `updateLine()` summary branch — extend the closed + 3-point-open cases (after the existing `L ${total…}` text is composed, replace `L.sumLabel.userData.set(...)` with a composed string):

```ts
    } else if (closed && L.pts.length >= 3) {
      const loop = /* unchanged existing slice */;
      const { area } = newellArea(loop);
      let text = `L ${total.toFixed(2)}m · A ${area.toFixed(2)}m²`;
      if (this.angleSumLabels && !L.pts[0]!.distanceTo(L.pts[L.pts.length - 1]!)) {
        // loop-without-duplicate vertex count:
        const vertexCount = loop.length;
        const angles = interiorAnglesDeg(loop.map((p) => [p.x, p.y, p.z] as const), true);
        text += ` · ${angleSumText(sumDegrees(angles), vertexCount)}`;
      }
      L.sumLabel.userData.set(text);
    } else {
      let text = `L ${total.toFixed(2)}m · ${L.pts.length - 1} seg`;
      if (this.pythagLabels && L.pts.length === 3) {
        const triple = pythagorasOf([
          [L.pts[0]!.x, L.pts[0]!.y, L.pts[0]!.z],
          [L.pts[1]!.x, L.pts[1]!.y, L.pts[1]!.z],
          [L.pts[2]!.x, L.pts[2]!.y, L.pts[2]!.z],
        ] as Pt[]);
        if (triple) text += ` · ${pythagText(triple)}`;
      }
      L.sumLabel.userData.set(text);
    }
```

(Allocation here: `updateLine` runs on drag/point changes and when labels refresh — the map allocation only happens when the toggles are ON, which is a deliberate teaching affordance, not a hot path. Note that trade-off in the PR description.)

Careful with the `distanceTo` incantation — the existing branch computes `loop` from a duplicate-end check already; reuse `loop`'s length and skip the extra condition:

```ts
      if (this.angleSumLabels && loop.length >= 3) {
        const vertexCount = loop.length;
        const angles = interiorAnglesDeg(loop.map((p) => [p.x, p.y, p.z] as const), true);
        text += ` · ${angleSumText(sumDegrees(angles), vertexCount)}`;
      }
```

4. Imports:

```ts
import {
  interiorAnglesDeg,
  pythagorasOf,
  sumDegrees,
  angleSumText,
  pythagText,
  type Pt,
} from "./geometry/chainMath";
```

5. `components/ShowcaseLab.tsx` — `FullEngine` type addition:

```ts
  setChainMathMode?: (kind: "angleSum" | "pythag", on: boolean) => void;
```

Local ui state (simple component-level booleans, no engine ui emit needed since chips own their state):

```tsx
  const [angleSumChip, setAngleSumChip] = useState(false);
  const [pythagChip, setPythagChip] = useState(false);
```

Chips in the `line` drawer, after the undo/clear chips row:

```tsx
          <div className="sc-chips">
            <button className={"sc-chip" + (angleSumChip ? " on" : "")} aria-pressed={angleSumChip}
              onClick={() => { const on = !angleSumChip; setAngleSumChip(on); engineRef.current?.setChainMathMode?.("angleSum", on); }}
            >Σ angles</button>
            <button className={"sc-chip" + (pythagChip ? " on" : "")} aria-pressed={pythagChip}
              onClick={() => { const on = !pythagChip; setPythagChip(on); engineRef.current?.setChainMathMode?.("pythag", on); }}
            >a²+b²=c²</button>
          </div>
```

**Step 5: Verify**

Run: `npx vitest run lib/geometry/chainMath.test.ts && npm run typecheck && npm run lint`

Manual: `npm run dev` → line drawer → drop an open 3-point chain → toggle `a²+b²=c²` → the floating summary gains `a²+b²−c² = +0.00` when it is a right triangle. Close a 4-point loop, toggle `Σ angles` → `Σ 360.02° · target 360° (4×180−360)`.

**Step 6: Commit**

```bash
git add lib/geometry/chainMath.ts lib/geometry/chainMath.test.ts lib/engine.ts components/ShowcaseLab.tsx
git commit -m "feat: Σ-angle-sum + Pythagoras residual labels on chains, chip-toggled in the line drawer"
```

---

## Phase D — two-hand ruler + span calibration

### Task D1: `lib/ruler.ts` pure helpers

**Objective:** Testable math for the ruler: landmark → NDC conversion (mirrored feed), world-plane distance, span calibration factor, and the readout text.

**Files:**
- Create: `lib/ruler.ts`
- Test: `lib/ruler.test.ts`

**Step 1: Write failing test**

```ts
// lib/ruler.test.ts
import { describe, expect, it } from "vitest";
import { cmPerMeterFor, ndcFromLandmark, rulerText } from "./ruler";

describe("ndcFromLandmark", () => {
  it("mirrors the feed: left-in-image becomes +x on screen", () => {
    const { x } = ndcFromLandmark(0, 0.5); // image left edge
    expect(x).toBeGreaterThan(0);
  });
  it("image top (y=0) maps to +1 NDC", () => {
    expect(ndcFromLandmark(0.5, 0).y).toBeCloseTo(1);
  });
  it("centre maps to (0, 0)", () => {
    const { x, y } = ndcFromLandmark(0.5, 0.5);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });
});

describe("cmPerMeterFor", () => {
  it("span of 20 cm measured as 0.5 scene-m → 40 cm/m", () => {
    expect(cmPerMeterFor(20, 0.5)).toBeCloseTo(40);
  });
  it("degenerate inputs stay finite / 1", () => {
    expect(cmPerMeterFor(20, 0)).toBe(1);
    expect(cmPerMeterFor(0, 0.5)).toBe(1);
  });
});

describe("rulerText", () => {
  it("meters only, uncalibrated", () => {
    expect(rulerText(0.64, null)).toBe("≈ 0.64 m");
  });
  it("meters + calibrated local units", () => {
    expect(rulerText(0.64, 40)).toBe("≈ 0.64 m · 25.6 cm");
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run lib/ruler.test.ts`
Expected: FAIL — module missing.

**Step 3: Implement**

```ts
// lib/ruler.ts
/**
 * Two-hand ruler — pure helpers. The gesture: with the ruler chip ON, pinch
 * both hands; the engine projects each pinch midpoint onto the camera-facing
 * plane through the cursor target and floats a label with the distance.
 *
 * Scene metres are HandLab world units, NOT real-world units; span
 * calibration converts them into the student's local cm for estimation
 * activities. Label prefix "≈" keeps the approximation honest.
 */

export interface Ndc {
  x: number;
  y: number;
}

/** Normalized landmark coords (mirrored feed, y down) → NDC (x right, y up).
 *  Mirrored: NDC x negates the image x. */
export function ndcFromLandmark(lx: number, ly: number): Ndc {
  return { x: -((lx * 2) - 1), y: -(ly * 2) + 1 };
}

/** Calibration factor: cm per scene-metre, from the student's real hand
 *  span (cm) measured against its projected scene length (metres). */
export function cmPerMeterFor(spanCm: number, spanMeters: number): number {
  if (!Number.isFinite(spanCm) || !Number.isFinite(spanMeters)) return 1;
  if (spanMeters < 0.02 || spanCm <= 0) return 1;
  return spanCm / spanMeters;
}

/** Readout line. Calibrated numbers are live-local-unit only. */
export function rulerText(meters: number, cmPerMeter: number | null): string {
  const text = `≈ ${meters.toFixed(2)} m`;
  if (cmPerMeter === null) return text;
  return `${text} · ${(meters * cmPerMeter).toFixed(1)} cm`;
}
```

**Step 4: Run to verify pass**

Run: `npx vitest run lib/ruler.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/ruler.ts lib/ruler.test.ts
git commit -m "feat: pure two-hand ruler math — mirrored landmark NDC, span calibration, readout text"
```

---

### Task D2: Engine two-hand ruler gesture

**Objective:** With the ruler chip on, pinching both hands shows a floating label with the project plane distance between the two pinch midpoints. The gesture deliberately replaces the two-hand *scale* gesture while enabled (avoid gesture collision), and span calibration reuses the same distance sample.

**Files:**
- Modify: `lib/engine.ts` (fields, `toggleRuler`, `drive()` two-hand section ~lines 2616-2700)
- Modify: `components/ShowcaseLab.tsx` (`FullEngine` type, line-drawer chips)
- Test: `npx vitest run lib/ruler.test.ts` + typecheck + manual walkthrough (drive() is not meaningfully unit-testable without a camera pipeline; the pure math is)

**Step 1: Engine implementation**

1. Imports:

```ts
import { cmPerMeterFor, ndcFromLandmark, rulerText } from "./ruler";
```

2. Fields (near `twoHandScaling`, ~line 481):

```ts
  private rulerOn = false;
  private rulerLabel: ReturnType<typeof makeLabel> | null = null;
  private rulerCalibrating = false;
  private rulerSpanCm = 0;
  private rulerCmPerMeter: number | null = null;
  private rulerSpanMeters = 0;
```

(`makeLabel` is the engine's existing sprite-label factory — check its return type; it returns the sprite, used with `.userData.set(text)` and `group.add`; the ruler label must be added to/cleared from the scene: park it in a tiny dedicated group or reuse `this.lineGroup` patterns — simplest: create `private rulerGroup = new THREE.Group();` added to the scene in the existing scene-setup block, so cleanup mirrors junctionGroup lifecycles.)

3. Public API:

```ts
  toggleRuler(): boolean {
    this.rulerOn = !this.rulerOn;
    if (this.rulerOn && this.twoHandScaling) this.endTwoHandScale(true);
    if (!this.rulerOn) {
      if (this.rulerLabel) {
        this.rulerLabel.visible = false;
      }
    }
    return this.rulerOn;
  }

  /** Student enters their real hand span (cm) — next two-hand pinch arms
   *  the conversion factor from that sample's projected metres. */
  setRulerSpanCm(cm: number): void {
    this.rulerSpanCm = cm;
    this.rulerCalibrating = cm > 0 && this.rulerOn;
  }
```

4. In `drive()`, inside the two-hand block. Insert after `const bothHeld = …` (line ~2629):

```ts
    // Two-hand ruler: replaces the scale gesture while armed. Both hands
    // pinched → project each pinch midpoint onto the camera plane through
    // the cursor target and float the distance label at the midpoint.
    if (this.rulerOn && bothHeld) {
      this.updateRulerLabel(main, other!);
      // Ruler owns the two-hand gesture; scale may not arm under it.
      if (this.twoHandScaling) this.endTwoHandScale(true);
    } else if (this.rulerLabel) {
      this.rulerLabel.visible = false;
    }
```

5. The projection + label method (allocation-free scratch):

```ts
  private updateRulerLabel(
    main: NormalizedLandmark[],
    other: NormalizedLandmark[],
  ): void {
    // pinch midpoints in image coords — reuse the two hand-scale anchors
    const axNdc = ndcFromLandmark(
      (main[4]!.x + main[8]!.x) / 2,
      (main[4]!.y + main[8]!.y) / 2,
    );
    const bxNdc = ndcFromLandmark(
      (other[4]!.x + other[8]!.x) / 2,
      (other[4]!.y + other[8]!.y) / 2,
    );
    this.ndc.set(axNdc.x, axNdc.y);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.camera.getWorldDirection(this._v1);
    this.camPlane.setFromNormalAndCoplanarPoint(this._v1.negate(), this.target);
    if (!this.ray.ray.intersectPlane(this.camPlane, this._v2)) return;
    const a = this._v2.clone();
    this.ndc.set(bxNdc.x, bxNdc.y);
    this.ray.setFromCamera(this.ndc, this.camera);
    if (!this.ray.ray.intersectPlane(this.camPlane, this._v2)) return;
    const aMeters = a.distanceTo(this._v2);
    if (this.rulerCalibrating) {
      this.rulerSpanMeters = aMeters;
      this.rulerCmPerMeter = cmPerMeterFor(this.rulerSpanCm, aMeters);
      this.rulerCalibrating = false;
    }
    this.ensureRulerLabel();
    this.rulerLabel!.position
      .copy(a)
      .add(this._v2)
      .multiplyScalar(0.5);
    this.rulerLabel!.position.y += 0.05;
    this.rulerLabel!.userData.set(rulerText(aMeters, this.rulerCmPerMeter));
    this.rulerLabel!.visible = true;
  }

  private ensureRulerLabel(): void {
    if (this.rulerLabel) return;
    this.rulerLabel = makeLabel("#8affc1");
    this.rulerGroup.add(this.rulerLabel);
  }
```

(`this._v2.clone()` — one allocation per frame *while the ruler is active and both hands pinched*. That is a paused-scale, idle-teaching state; acceptable and documented. If review prefers zero-alloc, hoist a dedicated `private rulerA = new THREE.Vector3();` — do that, it's one line: copy `_v2` into `rulerA` instead of cloning.)

6. Dispose path: the existing stage-teardown disposes groups; add `rulerGroup` to the scene-setup alongside equivalent groups and its label reset in `dispose()` (find the engine's dispose: `engineRef.current?.dispose?.()` implies the method clears children — mirror how `junctionGroup` is cleaned).

7. `HandLabFallbackEngine` (2D): add a no-op `toggleRuler(): boolean { return false; }` + `setRulerSpanCm(): void {}` so `FullEngine` stays uniform (mirror how `setClip` fallback stubs behave — check `lib/fallback2d.ts` for the existing stub convention and follow it).

**Step 2: Interface + UI wiring**

`components/ShowcaseLab.tsx`:

```ts
  toggleRuler?: () => boolean;
  setRulerSpanCm?: (cm: number) => void;
```

Line drawer chips + the span input (after the ruler chips row from Task C2):

```tsx
          <div className="sc-chips">
            <button className={"sc-chip" + (rulerChip ? " on" : "")} aria-pressed={rulerChip}
              onClick={() => { const on = !!engineRef.current?.toggleRuler?.(); setRulerChip(on); }}
            >ruler</button>
          </div>
          <label className="sc-slider">
            <span className="sc-slider__head"><span>my hand span</span><b>{spanCm.toFixed(0)} cm</b></span>
            <input type="range" min={10} max={30} step={1} value={spanCm}
              onChange={(e) => { const cm = Number(e.target.value); setSpanCm(cm); if (rulerChip) engineRef.current?.setRulerSpanCm?.(cm); }}
              aria-label="My hand span in centimetres" />
          </label>
          <p className="sc-note">ruler: pinch both hands → distance between pinch points. Measure your real span once with a ruler, set it here, then pinch that same span to calibrate — readouts switch to ≈ cm (view-plane approximation).</p>
```

with state:

```tsx
  const [rulerChip, setRulerChip] = useState(false);
  const [spanCm, setSpanCm] = useState(18);
```

Calibration flow (documented in the drawer note): set span cm → arm ruler → hold hands at your span → both-pinch once samples `spanMeters` → label switches to cm. Re-calibrate by moving the slider again (re-arms).

**Step 3: Verify**

Run: `npx vitest run lib/ruler.test.ts && npm run typecheck && npm run lint && npm test`

Manual: `npm run dev` → enable hand tracking → turn on `ruler` → two-hand pinch → label shows `≈ x.xx m`; set span, re-pinch → label gains `· xx.x cm`; chip off → label hides, two-hand scale works again.

**Step 4: Commit**

```bash
git add lib/engine.ts lib/fallback2d.ts components/ShowcaseLab.tsx
git commit -m "feat: two-hand pinch ruler — view-plane distance label with hand-span calibration to cm"
```

---

## Phase E — final verification

### Task E1: Full gate + manual QA pass

**Step 1: Gates**

```bash
cd /Users/aaronsinesh/handlab
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all green. If `next build` reports the perf budget failing (`lib/perf-budget.test.ts` runs in `npm test`), check eager-graph changes are limited to imports the plan listed (backtracking the bundle is out of scope — escalate instead of shaving random features).

**Step 2: Manual walkthrough** (`npm run dev`, `http://localhost:3000`)

1. `≡` → Lessons → `Shapes 101` → place 3 cubes → scene check ticks → Next.
2. `Angle Hunt` → draw right angle → checklist tick at 88–92°.
3. `Estimate Then Verify` → numeric submit works, progress ring advances.
4. Lesson files round-trip both directions.
5. Reload → resume stepIdx restored.
6. `Σ angles` / `a²+b²=c²` chips toggle labels on chains.
7. Ruler gesture + calibration as in Task D2, including hiding on chip-off.
8. Two-hand scale still works with ruler chip OFF.
9. Mouse-only (no camera) run: lessons still gate via placed objects (mouse click placement).

**Step 3: Commit any stragglers and tag the milestone docs**

```bash
git status --short
# stage ONLY the files this plan touched; the repo contains junk chunks xaa..xdy
git commit -m "chore: math teaching batch 1 — gates + QA pass"
```

---

## Out of scope (deliberately, YAGNI)

- Progress JSON export/import per student (batch 2)
- Mirror/symmetry tool, tessellation checks, function plot checks (batch 2+)
- SceneSnap carrying V/E/F for Euler counters (needs per-face solids enumeration)
- The VR route reusing LessonPanel (scene graph differs; scene JSON is shared but the VR engine has no `exportCheckSnap` yet)
