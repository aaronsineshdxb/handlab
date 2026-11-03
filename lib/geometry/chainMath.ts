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
