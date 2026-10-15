import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isConstrainedDevice,
  isIPadOS,
  pickDepthDtype,
  type DeviceSignals,
} from "./caps";

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
    // (iPads bypass this via isIPadOS — see below.)
    expect(decide({})).toBe(false);
  });

  it("treats iPads as constrained even with no other signals", () => {
    vi.stubGlobal("navigator", {
      platform: "iPad",
      maxTouchPoints: 5,
      userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
    });
    try {
      expect(isIPadOS()).toBe(true);
      expect(decide({})).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("isIPadOS", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects classic iPad platform", () => {
    vi.stubGlobal("navigator", {
      platform: "iPad",
      maxTouchPoints: 5,
      userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
    });
    expect(isIPadOS()).toBe(true);
  });

  it("detects iPadOS 13+ masquerading as MacIntel with touch", () => {
    vi.stubGlobal("navigator", {
      platform: "MacIntel",
      maxTouchPoints: 5,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
    });
    expect(isIPadOS()).toBe(true);
  });

  it("does not flag a touch-less Mac as iPad", () => {
    vi.stubGlobal("navigator", {
      platform: "MacIntel",
      maxTouchPoints: 0,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
    });
    expect(isIPadOS()).toBe(false);
  });

  it("is SSR-safe", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isIPadOS()).toBe(false);
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
