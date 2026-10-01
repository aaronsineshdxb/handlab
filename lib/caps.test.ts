import { describe, expect, it } from "vitest";
import { isConstrainedDevice, pickDepthDtype, type DeviceSignals } from "./caps";

const decide = (s: DeviceSignals) => isConstrainedDevice(s);

describe("isConstrainedDevice", () => {
  it("treats 2 cores as constrained", () => {
    expect(decide({ hardwareConcurrency: 2 })).toBe(true);
  });

  it("treats 4 cores as unconstrained", () => {
    expect(decide({ hardwareConcurrency: 4 })).toBe(false);
  });

  it("treats 2GB of RAM as constrained", () => {
    expect(decide({ deviceMemory: 2 })).toBe(true);
  });

  it("treats 8GB of RAM as unconstrained", () => {
    expect(decide({ deviceMemory: 8 })).toBe(false);
  });

  it("honours Save-Data regardless of hardware", () => {
    expect(
      decide({ hardwareConcurrency: 16, deviceMemory: 16, saveData: true }),
    ).toBe(true);
  });

  it("honours a slow effective connection type", () => {
    expect(
      decide({ hardwareConcurrency: 16, deviceMemory: 16, effectiveType: "2g" }),
    ).toBe(true);
  });

  it("does not treat a fast connection type as constrained", () => {
    expect(decide({ effectiveType: "4g" })).toBe(false);
  });

  it("defaults to unconstrained when nothing is knowable", () => {
    // Safari/Firefox expose neither deviceMemory nor saveData. Assume capable
    // rather than degrading a device that might be fine.
    expect(decide({})).toBe(false);
  });
});

describe("pickDepthDtype", () => {
  it("uses fp16 on WebGPU", () => {
    expect(pickDepthDtype({ hasWebGPU: true, constrained: false })).toBe("fp16");
  });

  it("uses q8 on WASM — 27MB instead of 99MB fp32", () => {
    expect(pickDepthDtype({ hasWebGPU: false, constrained: false })).toBe("q8");
  });

  it("does not let a constrained signal force q8 onto WebGPU", () => {
    // Regression guard: hardwareConcurrency reported 2 on a capable M-series
    // Mac, and the old logic pushed an int8 graph onto the WebGPU EP.
    expect(pickDepthDtype({ hasWebGPU: true, constrained: true })).toBe("fp16");
    expect(pickDepthDtype({ hasWebGPU: true, constrained: false })).toBe("fp16");
  });
});
