import type { CheckKind } from "./types";

export interface SceneSnap {
  objects: { s: string }[];
  chains: number[][][];
  quizAnswers: Record<string, number>;
}

/** Two points count as the same vertex below this distance (metres). Keeps
 *  snapping and closure checks consistent with the engine's snap radius. */
export const CLOSE_EPS = 0.35;

/** Enclosed area of a 3D polygon via Newell's method. Works for loops that
 *  aren't axis-aligned, and degrades gracefully for degenerate input. */
export function polygonArea(pts: number[][]): number {
  if (pts.length < 3) return 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) return 0;
    nx += (a[1]! - b[1]!) * (a[2]! + b[2]!);
    ny += (a[2]! - b[2]!) * (a[0]! + b[0]!);
    nz += (a[0]! - b[0]!) * (a[1]! + b[1]!);
  }
  return Math.hypot(nx, ny, nz) / 2;
}

/** True when the chain's last vertex is within CLOSE_EPS of its first. */
function isClosedLoop(pts: number[][]): boolean {
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last || pts.length < 3) return false;
  return (
    Math.hypot(
      ...first.map((value, index) => value - (last[index] ?? 0)),
    ) < CLOSE_EPS
  );
}

/** A check passes when *any* chain in the scene satisfies it — a student who
 *  draws a second loop shouldn't be blocked by an unrelated first one. */
function anyClosedChain(
  snap: SceneSnap,
  minPoints: number,
): number[][] | undefined {
  return snap.chains.find(
    (chain) => chain.length >= minPoints && isClosedLoop(chain),
  );
}

export function evalCheck(c: CheckKind, snap: SceneSnap): boolean {
  switch (c.kind) {
    case "place-count":
      return snap.objects.filter((object) => object.s === c.shape).length >= c.count;
    case "chain-closed":
      return anyClosedChain(snap, c.minPoints) !== undefined;
    case "area-gt":
      return snap.chains.some(
        (chain) => isClosedLoop(chain) && polygonArea(chain) > c.min,
      );
    case "quiz":
      return snap.quizAnswers[c.question] === c.answer;
    default:
      return false;
  }
}

/** A step is complete when every one of its checks passes. */
export function evalChecks(
  checks: readonly CheckKind[],
  snap: SceneSnap,
): boolean {
  return checks.every((check) => evalCheck(check, snap));
}
