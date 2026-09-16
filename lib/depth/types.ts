import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type DepthKind = "hardware" | "estimated" | "baseline";
export type DepthSourceId =
  | "monocular"
  | "palm"
  | "w3c-depth"
  | "webxr"
  | "arkit";

/** Signed depth delta in meters along camera-forward. Null = no data this frame. */
export interface DepthSample {
  /** + = hand pushed toward camera (cursor dives into the screen) */
  dzMeters: number;
  /** 0..1 confidence; fusion ignores samples below 0.25 */
  confidence: number;
  source: DepthSourceId;
}

export interface DepthProvider {
  readonly id: DepthSourceId;
  readonly kind: DepthKind;
  readonly label: string;
  start(video: HTMLVideoElement): Promise<void>;
  /** u,v are fingertip coords in 0..1 unmirrored video space */
  sample(u: number, v: number, lm: NormalizedLandmark[]): DepthSample | null;
  stop(): void;
}
