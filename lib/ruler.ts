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
