/**
 * URLs and cache-warming for the vendored hand-tracking payload
 * (~19.5MB: MediaPipe tasks-vision runtime + hand-landmarker model).
 *
 * Supply-chain hardening (audit §2.1): WASM runtime + hand-landmarker model
 * are vendored under /public so no third-party CDN executes WASM at runtime.
 *   public/wasm/  <- copy of node_modules/@mediapipe/tasks-vision@1.0.1/wasm/
 *   public/models/hand_landmarker.task <- float16/1 from GCS, md5 15318430ea3851670fe9914116a9cfad
 * Re-vendor with: cp node_modules/@mediapipe/tasks-vision/wasm/* public/wasm/
 * and re-download the .task URL below, verifying the md5 against x-goog-hash.
 */

/** Hand-landmarker model (float16, ~7.8MB). */
export const MODEL_URL = "/models/hand_landmarker.task";

/** Directory holding the vendored tasks-vision binaries. */
export const WASM_URL = "/wasm";

/** The files `FilesetResolver.forVisionTasks` will fetch for this browser —
 *  wasm SIMD support picks the variant, the same check tasks-vision makes. */
export function handAssetUrls(simd: boolean): string[] {
  const flavor = simd ? "" : "nosimd_";
  return [
    `/wasm/vision_wasm_${flavor}internal.js`,
    `/wasm/vision_wasm_${flavor}internal.wasm`,
    MODEL_URL,
  ];
}

/** 16-byte wasm module using v128 — instantiates iff the engine has wasm SIMD. */
export const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
  8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

/**
 * Warm the HTTP cache for the hand-tracking payload while the student is
 * still reading onboarding, instead of on the camera click. Assets are
 * immutable-cached, so MediaPipe's own later fetches hit the cache. Reading
 * each body is what stores it; failures are irrelevant by design.
 */
export function prefetchHandAssets(fetchImpl: typeof fetch = fetch): void {
  if (typeof WebAssembly === "undefined") return;
  for (const url of handAssetUrls(WebAssembly.validate(SIMD_PROBE))) {
    void fetchImpl(url)
      .then((r) => r.arrayBuffer())
      .catch(() => {});
  }
}
