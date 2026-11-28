import { afterEach, describe, expect, it } from "vitest";
import { DepthAnythingV2Provider, supportsWasmSimd } from "./monocular";
import type { DepthStatus } from "./monocular";

/**
 * Glue tests for the worker backend (workers/depth.worker.ts): the provider
 * must post init, go live on "ready", apply "map" replies, and stop cleanly.
 * The model itself cannot load in jsdom — capability probing and the
 * transformers pipeline are exercised in a real browser only.
 */

type Msg = { data: unknown };

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((e: Msg) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor(public url: string | URL) {
    FakeWorker.last = this;
  }
  postMessage(m: unknown): void {
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const prevWorker = (globalThis as { Worker?: unknown }).Worker;

afterEach(() => {
  (globalThis as { Worker?: unknown }).Worker = prevWorker;
  FakeWorker.last = null;
});

describe("DepthAnythingV2Provider worker backend", () => {
  it("SIMD probe is a valid module (an invalid one silently killed the q8 depth path)", () => {
    expect(supportsWasmSimd()).toBe(true);
  });

  it("posts init and goes live on ready", async () => {
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;
    const p = new DepthAnythingV2Provider();
    const statuses: DepthStatus[] = [];
    p.setStatusListener((s) => statuses.push(s));
    // start() only resolves once the worker reports ready — fire it, then
    // drive the message protocol from the test side.
    void p.start({ readyState: 0 } as unknown as HTMLVideoElement);
    await flush();
    const w = FakeWorker.last;
    expect(w, "worker spawned").toBeTruthy();
    expect(w!.posted[0]).toEqual({ type: "init" });
    expect(p.status).toBe("loading");
    w!.onmessage?.({
      data: { type: "ready", device: "wasm", dtype: "q8" },
    });
    await flush();
    expect(p.status).toBe("live");
    expect(statuses).toContain("loading");
    expect(statuses).toContain("live");
    p.stop();
    expect(p.status).toBe("off");
    expect(w!.terminated).toBe(true);
  });

  it("applies packed map replies so sample() stays O(1) on the main thread", async () => {
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;
    const p = new DepthAnythingV2Provider();
    void p.start({ readyState: 0 } as unknown as HTMLVideoElement);
    await flush();
    const w = FakeWorker.last!;
    w.onmessage?.({ data: { type: "ready", device: "wasm", dtype: "q8" } });
    await flush();
    // depth map 3x1: values 1,2,3 → median 2
    w.onmessage?.({
      data: {
        type: "map",
        data: new Float32Array([1, 2, 3]),
        w: 3,
        h: 1,
        median: 2,
        std: 1,
        ms: 5,
      },
    });
    await flush();
    const s = p.sample(0.5, 0.5);
    // first sample anchors at zero delta
    expect(s?.source).toBe("monocular");
    expect(s?.dzMeters).toBe(0);
    expect(s?.confidence).toBeGreaterThan(0);
    p.stop();
  });

  it("terminates the worker and surfaces the error when init fails", async () => {
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;
    const p = new DepthAnythingV2Provider();
    void p.start({ readyState: 0 } as unknown as HTMLVideoElement);
    await flush();
    const w = FakeWorker.last!;
    w.onmessage?.({
      data: { type: "error", msg: "simulated worker init failure" },
    });
    await flush();
    // bail() terminates the failed worker and the provider continues into the
    // inline path (which only completes in a real browser; in Node the
    // transformers import rejects and lands in the error status).
    expect(w.terminated).toBe(true);
    p.stop();
  });
});
