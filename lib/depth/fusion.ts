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
 * Compute strided median and standard deviation for a depth map once per
 * inference (~1k reads on a 256px-wide map). Caching these on the DepthMap
 * avoids sorting ~1k floats on every 30Hz hand-tracking tick.
 */
export function mapDistribution(
  data: ArrayLike<number>,
  w: number,
  h: number,
): { median: number; std: number } {
  const n = w * h;
  const stride = Math.max(1, Math.floor(n / 1024));
  const count = Math.ceil(n / stride);
  const vals = new Float32Array(count);
  let mean = 0;
  let k = 0;
  for (let i = 0; i < n; i += stride) {
    const v = data[i];
    vals[k++] = v;
    mean += v;
  }
  const len = Math.max(1, k);
  mean /= len;
  let va = 0;
  for (let i = 0; i < k; i++) {
    const d = vals[i] - mean;
    va += d * d;
  }
  const std = Math.sqrt(va / len);
  vals.subarray(0, k).sort();
  const median = vals[Math.floor(k / 2)] ?? 0;
  return { median, std };
}

/**
 * Bilinear tip sample (u,v in 0..1, unmirrored video space).
 * Depth Anything V2: bigger predicted_depth = nearer.
 */
export function sampleTip(
  data: ArrayLike<number>,
  w: number,
  h: number,
  u: number,
  v: number,
  fallback = 0,
): number {
  const fx = Math.min(w - 1.001, Math.max(0, u * w));
  const fy = Math.min(h - 1.001, Math.max(0, v * h));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const row0 = y0 * w;
  const row1 = (y0 + 1) * w;
  const v00 = data[row0 + x0] ?? fallback;
  const v10 = data[row0 + x0 + 1] ?? fallback;
  const v01 = data[row1 + x0] ?? fallback;
  const v11 = data[row1 + x0 + 1] ?? fallback;
  const ix0 = v00 + (v10 - v00) * tx;
  const ix1 = v01 + (v11 - v01) * tx;
  return ix0 + (ix1 - ix0) * ty;
}

/**
 * Frame statistics for a cached depth map. Returns median + std of the frame
 * plus the bilinear tip value.
 */
export function frameStats(
  data: ArrayLike<number>,
  w: number,
  h: number,
  u: number,
  v: number,
): { tip: number; median: number; std: number } {
  const { median, std } = mapDistribution(data, w, h);
  const tip = sampleTip(data, w, h, u, v, median);
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
