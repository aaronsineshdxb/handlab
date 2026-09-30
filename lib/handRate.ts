/**
 * Rate limiter for MediaPipe hand detection.
 *
 * detectForVideo ran once per requestAnimationFrame, i.e. up to 60 times a
 * second, but the landmarks are consumed at 30Hz by the depth fusion path and
 * a hand physically cannot move faster than that. Capping at 30Hz halves the
 * inference cost of the tracking loop with no perceptible difference.
 */
export const HAND_DETECT_MS = 1000 / 30;

/** True when enough time has passed since the last accepted detection. */
export function shouldDetect(now: number, lastDetectAt: number): boolean {
  return now - lastDetectAt >= HAND_DETECT_MS;
}
