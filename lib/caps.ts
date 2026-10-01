/**
 * Device capability probe.
 *
 * SCOPE: this module decides model sizes and inference cadence. It does NOT
 * decide whether to strip visual features — the product decision is that
 * HANDLAB looks the same on every machine, and we fix jank rather than
 * remove polish. Do not add shadow/AA/antialias downgrade logic here.
 */

export interface DeviceSignals {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  saveData?: boolean;
  effectiveType?: string;
}

/** Read the signals this browser exposes. Missing APIs stay undefined. */
export function readDeviceSignals(): DeviceSignals {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  return {
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
  };
}

/**
 * True when the device looks genuinely constrained. Unknown signals resolve
 * to `false` on purpose: a browser that hides deviceMemory (Safari, Firefox)
 * is more likely mid-range than a 2-core machine, and wrongly degrading it
 * costs more than wrongly leaving it alone.
 */
export function isConstrainedDevice(s: DeviceSignals): boolean {
  if (s.saveData === true) return true;
  if (s.effectiveType === "slow-2g" || s.effectiveType === "2g") return true;
  if (typeof s.hardwareConcurrency === "number" && s.hardwareConcurrency <= 2)
    return true;
  if (typeof s.deviceMemory === "number" && s.deviceMemory <= 2) return true;
  return false;
}

export type DepthDtype = "fp16" | "q8";

/**
 * Choose the depth model precision.
 *
 * WebGPU => fp16 (~50MB). A WebGPU adapter means the device has a GPU that can
 * run fp16 matmuls, so it is not the weak hardware we are optimising for, and
 * q8 on the WebGPU execution provider is both less accurate and less reliable.
 * `constrained` must NOT override this: hardwareConcurrency is a poor proxy
 * (a capable M-series Mac reports 2 in some configurations), and letting it
 * force q8 here pushed an int8 graph onto the WebGPU EP.
 *
 * No WebGPU => q8 (~27MB). This is the weak-device path by definition — an
 * integrated GPU, older phone, or a browser without the API. The WASM backend
 * has no fp16 matmul acceleration, so fp32 there would cost 99.1MB and buy
 * nothing at all.
 */
export function pickDepthDtype(opts: {
  hasWebGPU: boolean;
  constrained: boolean;
}): DepthDtype {
  if (opts.hasWebGPU) return "fp16";
  return "q8";
}
