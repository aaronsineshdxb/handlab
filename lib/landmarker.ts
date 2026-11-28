/**
 * Hand-landmarker construction shared by the WebGL engine (main thread),
 * the 2D/WASM fallback engine, and the detector worker.
 *
 * Lives outside lib/engine.ts so worker code can import it without pulling
 * three.js into the worker bundle. GPU delegate first with a silent CPU
 * retry — mouse-only is worse than a slower tracker.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { MODEL_URL } from "./handAssets";

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>(
    (_, rej) =>
      (t = setTimeout(
        () => rej(new Error(`${what} timed out after ${ms / 1000}s`)),
        ms,
      )),
  );
  return Promise.race([p, limit]).finally(() => clearTimeout(t));
}

interface LandmarkerCtor {
  createFromOptions(
    files: unknown,
    options: {
      baseOptions: { modelAssetPath: string; delegate: "GPU" | "CPU" };
      runningMode: "VIDEO";
      numHands: number;
      minHandDetectionConfidence: number;
      minTrackingConfidence: number;
    },
  ): Promise<HandLandmarker>;
}

export async function createLandmarker(
  files: unknown,
  Ctor: LandmarkerCtor,
  modelUrl: string = MODEL_URL,
): Promise<{ landmarker: HandLandmarker; usedCpu: boolean }> {
  const shared = {
    runningMode: "VIDEO" as const,
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return {
      landmarker: await Ctor.createFromOptions(files, {
        baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
        ...shared,
      }),
      usedCpu: false,
    };
  } catch {
    return {
      landmarker: await Ctor.createFromOptions(files, {
        baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
        ...shared,
      }),
      usedCpu: true,
    };
  }
}
