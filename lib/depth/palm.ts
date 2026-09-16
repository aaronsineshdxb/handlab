import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { PALM_GAIN, clampDepth } from "./fusion";
import type { DepthProvider, DepthSample } from "./types";

const dist2d = (a: NormalizedLandmark, b: NormalizedLandmark): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Baseline depth provider: palm size grows as the hand nears the camera.
 * The engine feeds it the EMA-filtered palm size each frame via observe();
 * sample() reports the anchored delta in cursor-depth units.
 * Positive = hand pushed toward the camera.
 */
export class PalmDepthProvider implements DepthProvider {
  readonly id = "palm" as const;
  readonly kind = "baseline" as const;
  readonly label = "Palm size (baseline)";

  private anchor: number | null = null;
  private latest = 0;
  private haveLatest = false;

  /** Engine calls this every tracked frame with the filtered palm size. */
  observe(filteredSize: number): void {
    this.latest = filteredSize;
    this.haveLatest = true;
  }

  reset(): void {
    this.anchor = null;
  }

  async start(): Promise<void> {
    this.reset();
  }

  sample(): DepthSample | null {
    if (!this.haveLatest) return null;
    if (this.anchor === null) {
      this.anchor = this.latest; // auto-anchor on first sample
      return { dzMeters: 0, confidence: 1, source: "palm" };
    }
    return {
      dzMeters: clampDepth((this.latest - this.anchor) * PALM_GAIN),
      confidence: 1,
      source: "palm",
    };
  }

  stop(): void {
    this.reset();
    this.haveLatest = false;
  }
}
