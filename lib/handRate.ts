import { isIPadOS } from "./caps";

/**
 * Rate limiter for MediaPipe hand detection.
 *
 * detectForVideo ran once per requestAnimationFrame, i.e. up to 60 times a
 * second, but the landmarks are consumed by the render/depth fusion path and
 * a hand physically cannot move faster than that. Capping at 45Hz keeps
 * tracking smooth on 90/120Hz displays without paying full 60Hz inference
 * cost.
 *
 * iPadOS runs the landmarker on the CPU delegate and thermally throttles
 * with camera + WebGL + WASM together, so it drops to 20Hz there.
 */
export const HAND_DETECT_MS = 1000 / 45;
export const HAND_DETECT_MS_IPAD = 1000 / 20;

/** Current detection interval for this device (SSR-safe via isIPadOS). */
export function currentHandDetectMs(): number {
  return isIPadOS() ? HAND_DETECT_MS_IPAD : HAND_DETECT_MS;
}

/** True when enough time has passed since the last accepted detection. */
export function shouldDetect(
  now: number,
  lastDetectAt: number,
  intervalMs?: number,
): boolean {
  return now - lastDetectAt >= (intervalMs ?? currentHandDetectMs());
}
