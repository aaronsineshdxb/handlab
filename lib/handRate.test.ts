import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAND_DETECT_MS, shouldDetect } from "./handRate";

describe("HAND_DETECT_MS", () => {
  it("caps hand detection at 30Hz", () => {
    expect(HAND_DETECT_MS).toBeCloseTo(33.33, 1);
  });
});

describe("shouldDetect", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows the first detection immediately", () => {
    expect(shouldDetect(0, -Infinity)).toBe(true);
  });

  it("refuses a second detection inside the interval", () => {
    vi.setSystemTime(0);
    expect(shouldDetect(0, -Infinity)).toBe(true);
    expect(shouldDetect(5, 0)).toBe(false);
    expect(shouldDetect(20, 0)).toBe(false);
  });

  it("allows detection again once the interval has elapsed", () => {
    vi.setSystemTime(0);
    shouldDetect(0, -Infinity);
    vi.setSystemTime(34);
    expect(shouldDetect(34, 0)).toBe(true);
  });

  it("accepts a new video frame after a long stall", () => {
    vi.setSystemTime(0);
    shouldDetect(0, -Infinity);
    vi.setSystemTime(5000);
    expect(shouldDetect(5000, 0)).toBe(true);
  });

  it("never allows more than 30 detections per simulated second", () => {
    let last = -Infinity;
    let count = 0;
    for (let t = 0; t < 1000; t += 4) {
      if (shouldDetect(t, last)) {
        last = t;
        count++;
      }
    }
    // 33.33ms interval quantised to a 4ms sample grid lands on 36ms, so the
    // achieved rate is ~27.8Hz — deliberately on the safe side of the cap.
    expect(count).toBeLessThanOrEqual(30);
    expect(count).toBeGreaterThanOrEqual(27);
  });
});
