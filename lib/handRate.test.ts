import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAND_DETECT_MS, shouldDetect } from "./handRate";

describe("HAND_DETECT_MS", () => {
  it("caps hand detection at 45Hz", () => {
    expect(HAND_DETECT_MS).toBeCloseTo(22.22, 1);
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

  it("never allows more than 45 detections per simulated second", () => {
    let last = -Infinity;
    let count = 0;
    for (let t = 0; t < 1000; t += 4) {
      if (shouldDetect(t, last)) {
        last = t;
        count++;
      }
    }
    // 22.22ms interval quantised to a 4ms sample grid lands on 24ms, so the
    // achieved rate is ~41.7Hz — deliberately on the safe side of the cap.
    expect(count).toBeLessThanOrEqual(45);
    expect(count).toBeGreaterThanOrEqual(38);
  });
});
