/**
 * Dedicated worker owning MediaPipe hand-landmarker inference.
 *
 * Before this worker, `detectForVideo` ran synchronously inside the rAF hand
 * loop: at 30 Hz on a weak device the inference (~130 ms measured under
 * SwiftShader/XNNPACK) starved the render loop entirely — frame time mirrored
 * inference time almost 1:1. Here the model runs in its own thread; the main
 * thread only transfers an ImageBitmap in and receives packed landmarks out.
 *
 * Protocol (see lib/handTracker.ts for the client):
 *   main → worker  { type: "init", wasmUrl, modelUrl }
 *                  { type: "detect", bitmap, ts }   (bitmap transferred)
 *   worker → main  { type: "ready", usedCpu }
 *                  { type: "result", ts, detectMs, hands, handed }
 *                  { type: "detectError", msg }     (bitmap was consumed)
 *                  { type: "error", msg }           (init failed)
 *
 * The GPU delegate is tried first: tasks-vision creates its WebGL context on
 * an OffscreenCanvas in worker scope where that is supported. If GPU
 * instantiation throws, it degrades to CPU — same ladder as the main-thread
 * engines (lib/landmarker.ts).
 */

import type { HandLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { isSoftwareGLRenderer } from "../lib/softwareGl";

interface InitMsg {
  type: "init";
  wasmUrl: string;
  modelUrl: string;
}
interface DetectMsg {
  type: "detect";
  bitmap: ImageBitmap;
  ts: number;
}
type InMsg = InitMsg | DetectMsg;

interface ReadyMsg {
  type: "ready";
  usedCpu: boolean;
}
interface ErrorMsg {
  type: "error";
  msg: string;
}
interface DetectErrorMsg {
  type: "detectError";
  msg: string;
}
interface ResultMsg {
  type: "result";
  ts: number;
  detectMs: number;
  /** One Float32Array of x,y,z triplets (21 landmarks) per hand. */
  hands: Float32Array[];
  handed: string[];
}
type OutMsg = ReadyMsg | ErrorMsg | DetectErrorMsg | ResultMsg;

// Minimal worker-scope typing: the repo's tsconfig uses the "dom" lib, where
// `self` is Window and postMessage has a different signature.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<InMsg>) => void) | null;
  postMessage: (msg: OutMsg, transfer?: Transferable[]) => void;
};

let landmarker: HandLandmarker | null = null;

/**
 * Probe the worker's own WebGL renderer. A GPU delegate layered on a
 * software rasterizer instantiates fine but pays a GL texture round-trip per
 * frame (measured ~2s/detect under SwiftShader vs ~130ms CPU), so software
 * GL goes straight to the CPU delegate.
 */
function workerWebGLIsSoftware(): boolean {
  try {
    const c = new OffscreenCanvas(1, 1);
    const gl = c.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : "";
    return isSoftwareGLRenderer(renderer);
  } catch {
    return true;
  }
}

async function init(msg: InitMsg): Promise<void> {
  const vision = await import("@mediapipe/tasks-vision");
  const files = await vision.FilesetResolver.forVisionTasks(msg.wasmUrl);
  const shared = {
    runningMode: "VIDEO" as const,
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  if (workerWebGLIsSoftware()) {
    landmarker = await vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: msg.modelUrl, delegate: "CPU" },
      ...shared,
    });
    ctx.postMessage({ type: "ready", usedCpu: true });
    return;
  }
  try {
    landmarker = await vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: msg.modelUrl, delegate: "GPU" },
      ...shared,
    });
    ctx.postMessage({ type: "ready", usedCpu: false });
  } catch {
    landmarker = await vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: msg.modelUrl, delegate: "CPU" },
      ...shared,
    });
    ctx.postMessage({ type: "ready", usedCpu: true });
  }
}

function pack(
  lm: NormalizedLandmark[],
): Float32Array {
  const f = new Float32Array(lm.length * 3);
  for (let i = 0; i < lm.length; i++) {
    f[i * 3] = lm[i].x;
    f[i * 3 + 1] = lm[i].y;
    f[i * 3 + 2] = lm[i].z;
  }
  return f;
}

function detect(msg: DetectMsg): void {
  if (!landmarker) return;
  const t0 = performance.now();
  let res: {
    landmarks?: NormalizedLandmark[][];
    handednesses?: { categoryName?: string }[][];
  };
  try {
    res = landmarker.detectForVideo(msg.bitmap, msg.ts);
  } catch (err) {
    ctx.postMessage({
      type: "detectError",
      msg: err instanceof Error ? err.message : String(err),
    });
    return;
  } finally {
    msg.bitmap.close();
  }
  const detectMs = performance.now() - t0;
  const hands: Float32Array[] = [];
  const handed: string[] = [];
  const lms = res.landmarks ?? [];
  for (let h = 0; h < lms.length; h++) {
    hands.push(pack(lms[h]));
    handed.push(res.handednesses?.[h]?.[0]?.categoryName ?? "");
  }
  ctx.postMessage({ type: "result", ts: msg.ts, detectMs, hands, handed }, hands);
}

ctx.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    init(msg).catch((err) =>
      ctx.postMessage({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      }),
    );
  } else if (msg.type === "detect") {
    detect(msg);
  }
};
