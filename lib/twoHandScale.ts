/* Two-hand pinch-scale helpers — pure functions, no DOM/WebGL.
 * Used by HandLabEngine (and the 2D fallback) so the gesture math is
 * unit-testable without a camera.
 *
 * Gesture: both hands pinched (thumb-index close, palm-normalized with
 * hysteresis). While both stay pinched, the distance between the two pinch
 * midpoints drives a uniform scale factor:
 *   factor = currentDist / baselineDist
 * Spread hands apart -> factor > 1 (enlarge), bring together -> factor < 1.
 */

export const PINCH_DOWN_RATIO = 0.32;
export const PINCH_UP_RATIO = 0.42;
export const PALM_FAR_GATE = 0.035;

/** Per-axis clamp for a placed mesh (matches spawn-scale slider limits). */
export const SCALE_MIN = 0.2;
export const SCALE_MAX = 4;

/** Minimum baseline spread — below this the hands are on top of each other
 *  and a ratio would explode, so scaling refuses to arm. Normalized units. */
export const MIN_BASELINE_DIST = 0.02;

/** Relative clamp for one scale gesture (prevents a single lurch from
 *  teleporting a shape from tiny to huge). */
export const FACTOR_MIN = 0.25;
export const FACTOR_MAX = 4;

export interface PinchPoint {
  x: number;
  y: number;
  z?: number;
}

/** Thumb-index distance normalized by palm size (wrist→middle-knuckle). */
export function pinchRatio(
  thumbTip: PinchPoint,
  indexTip: PinchPoint,
  palmSize: number,
): number {
  const dx = thumbTip.x - indexTip.x;
  const dy = thumbTip.y - indexTip.y;
  const dz = ((thumbTip.z ?? 0) - (indexTip.z ?? 0)) * 0.6;
  const pd = Math.hypot(dx, dy, dz);
  return pd / Math.max(palmSize, 1e-4);
}

/** Hysteresis latch: closes below DOWN, opens above UP (or when too far). */
export function nextPinchState(
  prev: boolean,
  ratio: number,
  palmSize: number,
): boolean {
  const farGate = palmSize > PALM_FAR_GATE;
  if (!prev) return farGate && ratio < PINCH_DOWN_RATIO;
  return !(ratio > PINCH_UP_RATIO || !farGate);
}

/** Mid-point of thumb-tip + index-tip — stable anchor while pinched. */
export function pinchMid(
  thumbTip: PinchPoint,
  indexTip: PinchPoint,
): { x: number; y: number } {
  return {
    x: (thumbTip.x + indexTip.x) / 2,
    y: (thumbTip.y + indexTip.y) / 2,
  };
}

/** Screen-space spread between the two pinch midpoints. */
export function interHandDist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Raw scale factor for the current spread vs the arming spread. */
export function scaleFactorForDist(current: number, baseline: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return 1;
  if (baseline < MIN_BASELINE_DIST) return 1;
  const raw = current / baseline;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, raw));
}

/** Apply a uniform factor to a start scale, clamped per axis. */
export function clampedUniformScale(
  start: readonly [number, number, number],
  factor: number,
): [number, number, number] {
  const cl = (v: number): number =>
    Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return [cl(start[0] * f), cl(start[1] * f), cl(start[2] * f)];
}
