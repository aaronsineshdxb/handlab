import {
  MONO_GAIN,
  clampDepth,
  frameStats,
  freshness,
  tipZ,
} from "./fusion";
import type { DepthProvider, DepthSample } from "./types";
import {
  isConstrainedDevice,
  pickDepthDtype,
  readDeviceSignals,
  type DepthDtype,
} from "../caps";

/**
 * Depth Anything V2 monocular depth provider (Transformers.js, in-browser).
 *
 * - Model: onnx-community/depth-anything-v2-small, WebGPU/fp16 (~50MB) or
 *   WASM/q8 (~27MB) chosen by lib/caps.ts — fp32 is never used, because the
 *   WASM path has no fp16 acceleration and would pay 99MB for nothing.
 *   The weights are VENDORED under /public/models, not downloaded.
 * - Runs at ~2.5fps on a 256px-wide crop in a background loop; sample() reads
 *   the latest cached map, so the 60fps hand loop never blocks on inference.
 * - Output is RELATIVE depth (bigger predicted_depth = nearer). sample()
 *   reports a scale-invariant fingertip z-score delta vs its anchor, mapped to
 *   palm-equivalent cursor units. Positive = hand pushed toward the camera.
 * - Dynamically imports @huggingface/transformers inside start(), so SSR and
 *   the initial page load pay nothing until the user enables Depth AI.
 */

export const DA_V2_MODEL_ID = "onnx-community/depth-anything-v2-small";
// Supply-chain note (audit §2.1): the weights ship in this repo under
// /public/models/onnx-community/depth-anything-v2-small and are served
// same-origin, so depth AI works offline and behind a restrictive CSP. The ID
// above is an exact pinned repo — it is the on-disk directory path AND the
// upstream provenance of the bytes; do not change it to a range or alias
// without re-vendoring. Checksums of the vendored files are asserted in
// lib/depthAssets.test.ts. The app treats all depth output as untrusted
// (clamped in fusion.ts).
const INFER_W = 256;
const INFER_MS = 400;

// Vendored weight per dtype, verified against the HF Hub (2026-09-30):
//   model.onnx (fp32)          = 99.1 MB   <- never used
//   model_fp16.onnx            = 49.6 MB
//   model_quantized.onnx (q8)  = 27.3 MB
// A device that lands on the WASM path has no WebGPU, which usually means an
// integrated GPU, older phone, or a browser without the API — precisely the
// hardware where a 72MB difference decides whether the feature ever loads.
// Both live in the repo, so this is a size-of-checkout question, not a
// download that can fail.
export const DEPTH_BYTES: Record<DepthDtype, string> = {
  fp16: "~50MB",
  q8: "~27MB",
};

// Transformers.js resolves a repo id to `${env.localModelPath}/${model}/${file}`.
// We keep the repo id (so provenance is visible in the code and the tests) and
// point localModelPath at the vendored directory, which mirrors the upstream
// repo layout exactly: public/models/<org>/<name>/{config.json,
// preprocessor_config.json, quantize_config.json, onnx/model_<dtype>.onnx}.
export const DEPTH_LOCAL_MODEL_PATH = "/models/";

// Hard offline switch. With allowRemoteModels=false, any file that is missing
// from /public/models fails fast with ModelFileNotFoundError naming the local
// path, instead of silently falling through to a huggingface.co fetch that our
// own CSP no longer permits. That turns "depth AI randomly broken behind a
// proxy" into an actionable error naming the file to re-vendor.
export const DEPTH_ENV_OVERRIDES = {
  allowLocalModels: true,
  allowRemoteModels: false,
  localModelPath: DEPTH_LOCAL_MODEL_PATH,
  // The browser Cache API would keep a second copy of the 50MB weight under an
  // HF-derived cache key; /models is already immutable for a year (see
  // next.config.ts), so a second cache is pure waste.
  useBrowserCache: false,
  // Transformers.js "pre-loads" the ORT glue .mjs as a blob: URL
  // (ensureWasmLoaded in the hub utils) and ORT then dynamic-imports that
  // blob. Our CSP has no blob: in script-src — and adding it would let any
  // blob ever created execute as script — so the import dies with a bare
  // "Failed to fetch dynamically imported module" and no backend is found.
  // Disabling the pre-load cache hands ORT the raw /ort/*.mjs path instead,
  // which script-src 'self' permits; the .mjs (53KB) re-fetches at most
  // twice per page load (once per pipeline attempt), served immutable.
  useWasmCache: false,
} as const;

// ONNX Runtime's WASM build is vendored under /public/ort, same as the
// MediaPipe runtime under /public/wasm.
//
// Why this is required rather than merely nice: transformers.web.js
// unconditionally overwrites `wasmPaths` at module-load time with
//   https://cdn.jsdelivr.net/npm/onnxruntime-web@<ver>/dist/...
// and our own CSP (next.config.ts) does not allow jsdelivr in connect-src.
// So without an explicit same-origin path here, every device that reaches the
// WASM backend has its 27MB runtime request blocked and the feature fails with
// a bare network error. Pointing at /ort also keeps the runtime inside the
// immutable cache rules and off a third-party CDN.
export const ORT_WASM_PATHS = {
  mjs: "/ort/ort-wasm-simd-threaded.asyncify.mjs",
  wasm: "/ort/ort-wasm-simd-threaded.asyncify.wasm",
};

async function hasWebGPU(): Promise<boolean> {
  const gpu = (
    navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }
  ).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

export type DepthStatus = "off" | "loading" | "live" | "error";

interface DepthMap {
  data: Float32Array;
  w: number;
  h: number;
  t: number;
}

// Loose types: the transformers import is dynamic, so no static dependency.
type DepthEstimator = (
  input: HTMLCanvasElement,
) => Promise<{
  predicted_depth: { data: Float32Array | ArrayLike<number>; dims: number[] };
}>;

export class DepthAnythingV2Provider implements DepthProvider {
  readonly id = "monocular" as const;
  readonly kind = "estimated" as const;
  readonly label = "Depth Anything V2 (monocular)";

  status: DepthStatus = "off";
  detail = "";
  fps = 0;

  private video: HTMLVideoElement | null = null;
  private estimator: DepthEstimator | null = null;
  private map: DepthMap | null = null;
  private anchorZ: number | null = null;
  private running = false;
  private paused = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private scratch: HTMLCanvasElement | null = null;
  private infers = 0;
  private fpsT0 = 0;
  private onStatus: ((s: DepthStatus, detail: string) => void) | null = null;

  setStatusListener(fn: (s: DepthStatus, detail: string) => void): void {
    this.onStatus = fn;
  }

  private setStatus(s: DepthStatus, detail = ""): void {
    this.status = s;
    this.detail = detail;
    this.onStatus?.(s, detail);
  }

  async start(video: HTMLVideoElement): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.video = video;
    const webgpu = await hasWebGPU();
    if (!this.running) return;
    const dtype = pickDepthDtype({
      hasWebGPU: webgpu,
      constrained: isConstrainedDevice(readDeviceSignals()),
    });
    this.setStatus("loading", `loading depth model (${DEPTH_BYTES[dtype]})…`);
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Must be set after the module is evaluated: transformers replaces
      // wasmPaths with its CDN default as a module-load side effect.
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.wasmPaths = ORT_WASM_PATHS;
        env.backends.onnx.wasm.numThreads = 1;
      }
      Object.assign(env, DEPTH_ENV_OVERRIDES);
      const load = (device: "webgpu" | "wasm", d: DepthDtype) =>
        pipeline("depth-estimation", DA_V2_MODEL_ID, {
          device,
          dtype: d,
        }) as Promise<DepthEstimator>;
      let est: DepthEstimator;
      try {
        est = await load(webgpu ? "webgpu" : "wasm", dtype);
      } catch (err) {
        if (!webgpu) throw err;
        // WebGPU advertised but the pipeline refused (blocklisted driver,
        // headless). Retry on WASM rather than losing depth entirely.
        this.setStatus("loading", `loading depth model (${DEPTH_BYTES.q8})…`);
        est = await load("wasm", "q8");
      }
      if (!this.running) return; // stopped while loading
      this.estimator = est;
      this.setStatus("live", "depth AI live");
      void this.loop();
    } catch (err) {
      this.running = false;
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus("error", msg.slice(0, 120));
    }
  }

  private loop = async (): Promise<void> => {
    if (!this.running) return;
    // setTimeout is not throttled by the browser when a tab is hidden, so an
    // unpaged depth model keeps inferring at full rate in the background.
    if (!this.paused) {
      try {
        await this.inferOnce();
      } catch {
        /* keep the loop alive; next tick retries */
      }
    }
    if (this.running) this.timer = setTimeout(this.loop, INFER_MS);
  };

  /**
   * Stop inferring while the document is hidden. The cached map goes stale,
   * and freshness() in fusion.ts already downgrades its confidence to zero
   * as it ages, so sample() degrades to the palm baseline rather than
   * reporting a confident stale value.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  private async inferOnce(): Promise<void> {
    const video = this.video;
    const est = this.estimator;
    if (!video || !est || video.readyState < 2 || video.videoWidth === 0) return;
    if (!this.scratch) this.scratch = document.createElement("canvas");
    const scale = INFER_W / video.videoWidth;
    const w = INFER_W;
    const h = Math.max(16, Math.round(video.videoHeight * scale));
    this.scratch.width = w;
    this.scratch.height = h;
    const g = this.scratch.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.drawImage(video, 0, 0, w, h);
    const out = await est(this.scratch);
    const dims = out.predicted_depth.dims; // [H, W]
    const H = dims[0];
    const W = dims[1];
    const src = out.predicted_depth.data;
    this.map = { data: Float32Array.from(src), w: W, h: H, t: performance.now() };
    // rolling fps over an 8-inference window
    this.infers++;
    if (this.infers % 8 === 1) this.fpsT0 = performance.now();
    else if (this.infers % 8 === 0 && this.fpsT0 > 0)
      this.fps = 8000 / Math.max(1, performance.now() - this.fpsT0);
  }

  /** Re-anchor to the current hand pose (called on recenter). */
  resetAnchor(): void {
    this.anchorZ = null;
  }

  sample(u: number, v: number): DepthSample | null {
    const map = this.map;
    if (!map || this.status !== "live") return null;
    const { tip, median, std } = frameStats(map.data, map.w, map.h, u, v);
    if (!(std > 1e-9)) return null; // degenerate flat map
    const z = tipZ(tip, median, std);
    if (this.anchorZ === null) {
      this.anchorZ = z; // auto-anchor on first sample
      return { dzMeters: 0, confidence: 1, source: "monocular" };
    }
    return {
      dzMeters: clampDepth((z - this.anchorZ) * MONO_GAIN),
      confidence: freshness(performance.now(), map.t),
      source: "monocular",
    };
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.estimator = null;
    this.map = null;
    this.anchorZ = null;
    this.video = null;
    this.setStatus("off", "");
  }

  /** Last-map age for debugging (ms), -1 when no map yet. */
  mapAge(): number {
    return this.map ? performance.now() - this.map.t : -1;
  }
}
