import type { DepthSample } from "./types";

/**
 * Pure depth-fusion helpers (DOM-free, unit-tested).
 *
 * Units: the engine drives cursor depth in "palm-equivalent" cursor units,
 * where the classic palm-size baseline yields `(size - anchor) * PALM_GAIN`.
 * The monocular provider converts its z-score deltas with MONO_GAIN so both
 * samples share the same scale and can be blended directly.
 */

export const PALM_GAIN = 45;
/** Maps a fingertip z-score delta to palm-equivalent cursor units. Tunable. */
export const MONO_GAIN = 3.0;
export const MONO_WEIGHT = 0.3;
export const MIN_CONFIDENCE = 0.25;

export function clampDepth(v: number, lo = -9, hi = 9): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Frame statistics for a cached depth map. Strided sampling keeps this cheap
 * (~1k reads on a 256px-wide map). Returns median + std of the frame plus the
 * bilinear tip value. Depth Anything V2: bigger predicted_depth = nearer.
 */
export function frameStats(
  data: ArrayLike<number>,
  w: number,
  h: number,
  u: number,
  v: number,
): { tip: number; median: number; std: number } {
  const n = w * h;
  const stride = Math.max(1, Math.floor(n / 1024));
  const vals: number[] = [];
  for (let i = 0; i < n; i += stride) vals.push(data[i]);
  vals.sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)] ?? 0;
  let mean = 0;
  for (const x of vals) mean += x;
  mean /= Math.max(1, vals.length);
  let va = 0;
  for (const x of vals) va += (x - mean) * (x - mean);
  const std = Math.sqrt(va / Math.max(1, vals.length));

  // bilinear tip sample (u,v in 0..1, unmirrored video space)
  const fx = Math.min(w - 1.001, Math.max(0, u * w));
  const fy = Math.min(h - 1.001, Math.max(0, v * h));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number): number => data[y * w + x] ?? median;
  const tip =
    at(x0, y0) * (1 - tx) * (1 - ty) +
    at(x0 + 1, y0) * tx * (1 - ty) +
    at(x0, y0 + 1) * (1 - tx) * ty +
    at(x0 + 1, y0 + 1) * tx * ty;
  return { tip, median, std };
}

/** Scale-invariant fingertip closeness: z-score of the tip vs the frame. */
export function tipZ(tip: number, median: number, std: number): number {
  return (tip - median) / (std + 1e-6);
}

/**
 * Blend the palm baseline with an optional monocular sample.
 * Low-confidence (< MIN_CONFIDENCE) or missing mono samples are ignored,
 * so the cursor never depends on a stale neural net.
 */
export function fuseDepth(
  palmDz: number,
  mono: DepthSample | null,
  weight = MONO_WEIGHT,
): number {
  if (!mono || !Number.isFinite(mono.dzMeters) || mono.confidence < MIN_CONFIDENCE)
    return palmDz;
  const w = Math.min(0.6, Math.max(0, weight));
  return palmDz * (1 - w) + clampDepth(mono.dzMeters) * w;
}

/** Confidence from map age: fresh (<1s) = 1, stale (>4s) = 0. */
export function freshness(nowMs: number, mapMs: number): number {
  const age = nowMs - mapMs;
  if (age < 1000) return 1;
  if (age > 4000) return 0;
  return 1 - (age - 1000) / 3000;
}
