/**
 * Dedicated worker owning Depth Anything V2 inference (Transformers.js + ORT).
 *
 * On non-WebGPU devices the q8/WASM pipeline runs on the CPU — on the main
 * thread each ~700ms inference froze the whole UI, and those devices are
 * exactly the ones the q8 path targets. Here the pipeline lives in its own
 * thread: the main thread ships a 256px crop as a transferable ImageBitmap
 * every INFER_MS, and receives a packed Float32Array depth map with
 * median/std precomputed (lib/depth/fusion.ts mapDistribution), so the 30Hz
 * sample() stays O(1) on the main thread.
 *
 * Protocol (main-side client: DepthAnythingV2Provider in
 * lib/depth/monocular.ts):
 *   main → worker   { type: "init" }        { type: "infer", bitmap }
 *   worker → main   { type: "ready", device, dtype }
 *                   { type: "map", data, w, h, median, std, ms }
 *                   { type: "error", msg }  (init failure)
 *
 * Capability probing (WebGPU, wasm SIMD, dtype choice) happens in the worker
 * — navigator.gpu and WebAssembly exist in dedicated worker scope — so the
 * main thread pays nothing for depth until the user enables it.
 */

import type { DepthDtype } from "../lib/caps";
import { isConstrainedDevice, pickDepthDtype, readDeviceSignals } from "../lib/caps";
import {
  DA_V2_MODEL_ID,
  DEPTH_ENV_OVERRIDES,
  ORT_WASM_PATHS,
  supportsWasmSimd,
} from "../lib/depth/monocular";
import { mapDistribution } from "../lib/depth/fusion";

interface ReadyMsg {
  type: "ready";
  device: "webgpu" | "wasm";
  dtype: DepthDtype;
}
interface ErrorMsg {
  type: "error";
  msg: string;
}
interface MapMsg {
  type: "map";
  data: Float32Array;
  w: number;
  h: number;
  median: number;
  std: number;
  ms: number;
}
type OutMsg = ReadyMsg | ErrorMsg | MapMsg;

interface InferInMsg {
  type: "infer";
  bitmap: ImageBitmap;
}
type InMsg = { type: "init" } | InferInMsg;

// Minimal worker-scope typing (repo tsconfig uses the "dom" lib).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<InMsg>) => void) | null;
  postMessage: (msg: OutMsg, transfer?: Transferable[]) => void;
};

type DepthEstimator = (
  input: ImageBitmap,
) => Promise<{
  predicted_depth: { data: Float32Array | ArrayLike<number>; dims: number[] };
}>;

let estimator: DepthEstimator | null = null;

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

async function init(): Promise<void> {
  const webgpu = await hasWebGPU();
  if (!webgpu && !supportsWasmSimd()) {
    ctx.postMessage({
      type: "error",
      msg: "Depth AI requires WebGPU or WebAssembly SIMD (unsupported in this browser)",
    });
    return;
  }
  const dtype = pickDepthDtype({
    hasWebGPU: webgpu,
    constrained: isConstrainedDevice(readDeviceSignals()),
  });
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
    est = await load("wasm", "q8");
  }
  estimator = est;
  ctx.postMessage({ type: "ready", device: webgpu ? "webgpu" : "wasm", dtype });
}

async function infer(msg: InferInMsg): Promise<void> {
  const est = estimator;
  if (!est) return;
  const t0 = performance.now();
  try {
    const out = await est(msg.bitmap);
    const dims = out.predicted_depth.dims; // [H, W]
    const H = dims[0];
    const W = dims[1];
    const src = out.predicted_depth.data;
    const data =
      src instanceof Float32Array ? src : Float32Array.from(src);
    // Median/std once per inference so the 30Hz sample() never re-sorts.
    const { median, std } = mapDistribution(data, W, H);
    ctx.postMessage(
      {
        type: "map",
        data,
        w: W,
        h: H,
        median,
        std,
        ms: performance.now() - t0,
      },
      [data.buffer],
    );
  } finally {
    msg.bitmap.close();
  }
}

ctx.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    init().catch((err) =>
      ctx.postMessage({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      }),
    );
  } else if (msg.type === "infer") {
    infer(msg);
  }
};
