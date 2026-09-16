import {
  MONO_GAIN,
  clampDepth,
  frameStats,
  freshness,
  tipZ,
} from "./fusion";
import type { DepthProvider, DepthSample } from "./types";

/**
 * Depth Anything V2 monocular depth provider (Transformers.js, in-browser).
 *
 * - Model: onnx-community/depth-anything-v2-small (~100MB, cached after first
 *   load). WebGPU/fp16 when available, WASM fallback otherwise.
 * - Runs at ~2.5fps on a 256px-wide crop in a background loop; sample() reads
 *   the latest cached map, so the 60fps hand loop never blocks on inference.
 * - Output is RELATIVE depth (bigger predicted_depth = nearer). sample()
 *   reports a scale-invariant fingertip z-score delta vs its anchor, mapped to
 *   palm-equivalent cursor units. Positive = hand pushed toward the camera.
 * - Dynamically imports @huggingface/transformers inside start(), so SSR and
 *   the initial page load pay nothing until the user enables Depth AI.
 */

export const DA_V2_MODEL_ID = "onnx-community/depth-anything-v2-small";
const INFER_W = 256;
const INFER_MS = 400;

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
    this.setStatus("loading", "downloading depth model (~100MB, once)…");
    try {
      const { pipeline } = await import("@huggingface/transformers");
      let est: DepthEstimator;
      try {
        est = (await pipeline("depth-estimation", DA_V2_MODEL_ID, {
          device: "webgpu",
          dtype: "fp16",
        })) as unknown as DepthEstimator;
      } catch {
        // No WebGPU (Safari, headless, blocklisted GPU): WASM fallback.
        est = (await pipeline("depth-estimation", DA_V2_MODEL_ID, {
          device: "wasm",
        })) as unknown as DepthEstimator;
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
    try {
      await this.inferOnce();
    } catch {
      /* keep the loop alive; next tick retries */
    }
    if (this.running) this.timer = setTimeout(this.loop, INFER_MS);
  };

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
