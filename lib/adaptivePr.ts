/**
 * Adaptive render resolution.
 *
 * The engine already scales pixel ratio to hold ~60fps. Its floor was 1.0,
 * which leaves a device that is still below 30fps at native resolution with no
 * escape. Lowering the floor to 0.75 renders at 75% linear scale (56% of the
 * pixels) — the single concession to visual fidelity in the low-end work, and
 * only reachable by a device that is already failing to keep up.
 *
 * Reverting this is a one-line change: set PR_FLOOR back to 1.
 */
export const PR_STEP = 0.25;
export const PR_FLOOR = 0.75;
export const PR_MAX_CAP = 2;

const SLOW_MS = 26; // ~38fps — start shedding pixels
const FAST_MS = 13; // ~77fps — start adding them back

/**
 * @param maxCap Ceiling for this device, normally Math.min(devicePixelRatio, 2).
 *   Must be passed explicitly: without it a 1x display would climb to 2x and
 *   supersample, which is the opposite of what this module is for.
 */
export function nextPixelRatio(
  current: number,
  emaDt: number,
  maxCap: number = PR_MAX_CAP,
): number {
  if (emaDt > SLOW_MS) return Math.max(PR_FLOOR, current - PR_STEP);
  if (emaDt < FAST_MS) return Math.min(maxCap, current + PR_STEP);
  return current;
}
