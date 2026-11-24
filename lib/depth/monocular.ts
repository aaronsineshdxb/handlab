import {
  MONO_GAIN,
  clampDepth,
  freshness,
  mapDistribution,
  sampleTip,
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
 *   the latest cached map with precomputed median/std, so the 60fps hand loop
 *   never blocks on inference or re-sorts the depth distribution.
 * - Output is RELATIVE depth (bigger predicted_depth = nearer). sample()
 *   reports a scale-invariant fingertip z-score delta vs its anchor, mapped to
 *   palm-equivalent cursor units. Positive = hand pushed toward the camera.
 * - Dynamically imports @huggingface/transformers inside start(), so SSR and
 *   the initial page load pay nothing until the user enables Depth AI.
 */

export const DA_V2_MODEL_ID = "onnx-community/depth-anything-v2-small";
const INFER_W = 256;
const INFER_MS = 700;

export const DEPTH_BYTES: Record<DepthDtype, string> = {
  fp16: "~50MB",
  q8: "~27MB",
};

export const DEPTH_LOCAL_MODEL_PATH = "/models/";

export const DEPTH_ENV_OVERRIDES = {
  allowLocalModels: true,
  allowRemoteModels: false,
  localModelPath: DEPTH_LOCAL_MODEL_PATH,
  useBrowserCache: false,
  useWasmCache: false,
} as const;

export const ORT_WASM_PATHS = {
  mjs: "/ort/ort-wasm-simd-threaded.asyncify.mjs",
  wasm: "/ort/ort-wasm-simd-threaded.asyncify.wasm",
};

// Minimal 15-byte WASM module containing a single v128.const instruction.
// Lets us reject pre-SIMD browsers (Safari < 16.4, older Chromebooks) before
// downloading 26MB of ort-wasm-simd-threaded.asyncify.wasm.
const WASM_SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00,
  0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00,
  0xfd, 0x0f, 0x26, 0x0b,
]);

export function supportsWasmSimd(): boolean {
  try {
    return (
      typeof WebAssembly !== "undefined" &&
      typeof WebAssembly.validate === "function" &&
      WebAssembly.validate(WASM_SIMD_PROBE)
    );
  } catch {
    return false;
  }
}

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
  median: number;
  std: number;
}

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
  private scratchCtx: CanvasRenderingContext2D | null = null;
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
    if (!webgpu && !supportsWasmSimd()) {
      this.running = false;
      this.setStatus(
        "error",
        "Depth AI requires WebGPU or WebAssembly SIMD (unsupported in this browser)",
      );
      return;
    }
    const dtype = pickDepthDtype({
      hasWebGPU: webgpu,
      constrained: isConstrainedDevice(readDeviceSignals()),
    });
    this.setStatus("loading", `loading depth model (${DEPTH_BYTES[dtype]})…`);
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
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
        this.setStatus("loading", `loading depth model (${DEPTH_BYTES.q8})…`);
        est = await load("wasm", "q8");
      }
      if (!this.running) return;
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
    if (!this.paused) {
      try {
        await this.inferOnce();
      } catch {
        /* keep the loop alive; next tick retries */
      }
    }
    if (this.running) this.timer = setTimeout(this.loop, INFER_MS);
  };

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  private async inferOnce(): Promise<void> {
    const video = this.video;
    const est = this.estimator;
    if (!video || !est || video.readyState < 2 || video.videoWidth === 0) return;
    if (!this.scratch) {
      this.scratch = document.createElement("canvas");
      this.scratchCtx =
        this.scratch.getContext("2d", { willReadFrequently: true });
      if (!this.scratchCtx) return;
    }
    const scale = INFER_W / video.videoWidth;
    const w = INFER_W;
    const h = Math.max(16, Math.round(video.videoHeight * scale));
    // Guard canvas resize: assigning width/height unconditionally reallocates
    // the backing store and resets 2D context state on every inference tick.
    if (this.scratch.width !== w || this.scratch.height !== h) {
      this.scratch.width = w;
      this.scratch.height = h;
    }
    const g = this.scratchCtx;
    if (!g) return;
    g.drawImage(video, 0, 0, w, h);
    const out = await est(this.scratch);
    const dims = out.predicted_depth.dims; // [H, W]
    const H = dims[0];
    const W = dims[1];
    const src = out.predicted_depth.data;
    const data = src instanceof Float32Array ? src : Float32Array.from(src);
    // Precompute median & std once per inference instead of sorting 1k floats
    // on every 30Hz hand-tracking tick.
    const { median, std } = mapDistribution(data, W, H);
    this.map = {
      data,
      w: W,
      h: H,
      t: performance.now(),
      median,
      std,
    };
    this.infers++;
    if (this.infers % 8 === 1) this.fpsT0 = performance.now();
    else if (this.infers % 8 === 0 && this.fpsT0 > 0)
      this.fps = 8000 / Math.max(1, performance.now() - this.fpsT0);
  }

  resetAnchor(): void {
    this.anchorZ = null;
  }

  sample(u: number, v: number): DepthSample | null {
    const map = this.map;
    if (!map || this.status !== "live") return null;
    if (!(map.std > 1e-9)) return null; // degenerate flat map
    const tip = sampleTip(map.data, map.w, map.h, u, v, map.median);
    const z = tipZ(tip, map.median, map.std);
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
    this.scratch = null;
    this.scratchCtx = null;
    this.setStatus("off", "");
  }

  mapAge(): number {
    return this.map ? performance.now() - this.map.t : -1;
  }
}
