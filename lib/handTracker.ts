/**
 * Main-thread client for the hand-detector worker
 * (workers/handDetector.worker.ts owns the model + inference).
 *
 * Frames travel as transferred ImageBitmaps (zero-copy); results come back
 * as one packed Float32Array per hand plus handedness. `submit()` is
 * fire-and-forget — the caller keeps at most one bitmap in flight so a slow
 * worker applies natural backpressure instead of queueing stale frames.
 *
 * If Workers are unavailable or construction throws (very old browsers,
 * exotic CSPs), `createWorkerTracker` returns null and the engines keep
 * their inline main-thread paths.
 */

export interface TrackerHand {
  /** 21 x,y,z triplets, packed — the mediapipe result in transferable form. */
  pts: Float32Array;
  handed: string;
}

export interface TrackerResult {
  ts: number;
  /** Wall time of the inference inside the worker. */
  detectMs: number;
  hands: TrackerHand[];
}

export interface HandTracker {
  start(wasmUrl: string, modelUrl: string): Promise<{ usedCpu: boolean }>;
  submit(bitmap: ImageBitmap, ts: number): void;
  onResult(cb: (r: TrackerResult) => void): void;
  /** A single detection threw — the frame is consumed, reset flow control. */
  onError(cb: () => void): void;
  dispose(): void;
}

export type TrackerFactory = () => HandTracker | null;

export function createWorkerTracker(): HandTracker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new WorkerHandTracker();
  } catch {
    return null;
  }
}

type Pending = {
  resolve: (v: { usedCpu: boolean }) => void;
  reject: (e: Error) => void;
};

class WorkerHandTracker implements HandTracker {
  private w: Worker;
  private cb: ((r: TrackerResult) => void) | null = null;
  private errCb: (() => void) | null = null;
  private pending: Pending | null = null;

  constructor() {
    this.w = new Worker(
      new URL("../workers/handDetector.worker.ts", import.meta.url),
    );
    this.w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      switch (m.type) {
        case "ready":
          this.pending?.resolve({ usedCpu: m.usedCpu });
          this.pending = null;
          break;
        case "error":
          this.pending?.reject(new Error(m.msg));
          this.pending = null;
          break;
        case "detectError":
          this.errCb?.();
          break;
        case "result":
          this.cb?.({
            ts: m.ts,
            detectMs: m.detectMs,
            hands: m.hands.map((pts: Float32Array, i: number) => ({
              pts,
              handed: m.handed[i],
            })),
          });
          break;
      }
    };
    this.w.onerror = () => {
      this.pending?.reject(new Error("worker script failed to load"));
      this.pending = null;
    };
  }

  start(wasmUrl: string, modelUrl: string): Promise<{ usedCpu: boolean }> {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.w.postMessage({ type: "init", wasmUrl, modelUrl });
    });
  }

  submit(bitmap: ImageBitmap, ts: number): void {
    this.w.postMessage({ type: "detect", bitmap, ts }, [bitmap]);
  }

  onResult(cb: (r: TrackerResult) => void): void {
    this.cb = cb;
  }

  onError(cb: () => void): void {
    this.errCb = cb;
  }

  dispose(): void {
    this.w.terminate();
    this.cb = null;
    this.errCb = null;
    this.pending = null;
  }
}
