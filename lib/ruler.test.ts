// lib/ruler.test.ts
import { describe, expect, it } from "vitest";
import { cmPerMeterFor, ndcFromLandmark, rulerText } from "./ruler";

describe("ndcFromLandmark", () => {
  it("mirrors the feed: left-in-image becomes +x on screen", () => {
    const { x } = ndcFromLandmark(0, 0.5); // image left edge
    expect(x).toBeGreaterThan(0);
  });
  it("image top (y=0) maps to +1 NDC", () => {
    expect(ndcFromLandmark(0.5, 0).y).toBeCloseTo(1);
  });
  it("centre maps to (0, 0)", () => {
    const { x, y } = ndcFromLandmark(0.5, 0.5);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });
});

describe("cmPerMeterFor", () => {
  it("span of 20 cm measured as 0.5 scene-m → 40 cm/m", () => {
    expect(cmPerMeterFor(20, 0.5)).toBeCloseTo(40);
  });
  it("degenerate inputs stay finite / 1", () => {
    expect(cmPerMeterFor(20, 0)).toBe(1);
    expect(cmPerMeterFor(0, 0.5)).toBe(1);
  });
});

describe("rulerText", () => {
  it("meters only, uncalibrated", () => {
    expect(rulerText(0.64, null)).toBe("≈ 0.64 m");
  });
  it("meters + calibrated local units", () => {
    expect(rulerText(0.64, 40)).toBe("≈ 0.64 m · 25.6 cm");
  });
});
