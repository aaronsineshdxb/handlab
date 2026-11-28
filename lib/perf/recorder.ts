/**
 * Allocation-free timing recorder shared by the WebGL engine, the 2D/WASM
 * fallback engine, and the benchmark probe (`scripts/perf/bench.mjs`).
 *
 * Two series are tracked:
 *   - `render`: raw rAF frame delta (ms) — the main-thread smoothness signal.
 *   - `detect`: wall time of one hand-landmarker inference (ms) — the ML cost.
 *
 * Pushes write two numbers into pre-allocated ring buffers, so sampling never
 * allocates or perturbs the loop it measures. `snapshot()` allocates freely —
 * it only runs on demand (HUD readout, benchmark, console).
 *
 * Exposed as `window.__handlabPerf` so benchmarks and devtools can pull a
 * summary without touching engine internals.
 */

/** ~34 s of 60 Hz frames, ~68 s of 30 Hz detections. */
const RING = 2048;

/** Jank threshold: a frame longer than two 60 Hz vsyncs. */
export const JANK_MS = 32;

class Series {
  private buf = new Float32Array(RING);
  private stamps = new Float64Array(RING);
  private n = 0;
  private i = 0;

  push(v: number, now: number): void {
    this.buf[this.i] = v;
    this.stamps[this.i] = now;
    this.i = (this.i + 1) % RING;
    if (this.n < RING) this.n++;
  }

  reset(): void {
    this.n = 0;
    this.i = 0;
  }

  get count(): number {
    return this.n;
  }

  /** Mean of entries recorded within the last `ms` of `now`. */
  meanOver(now: number, ms: number): number {
    if (!this.n) return -1;
    let sum = 0;
    let c = 0;
    for (let k = 0; k < this.n; k++) {
      const idx = (this.i - 1 - k + RING * 2) % RING;
      if (now - this.stamps[idx] > ms) break;
      sum += this.buf[idx];
      c++;
    }
    return c ? sum / c : -1;
  }

  /** p50/p95/max over the whole window. */
  percentiles(): { p50: number; p95: number; max: number } {
    if (!this.n) return { p50: -1, p95: -1, max: -1 };
    const vals = Array.from(this.buf.subarray(0, this.n)).sort((a, b) => a - b);
    const pick = (q: number) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))];
    return { p50: pick(0.5), p95: pick(0.95), max: vals[vals.length - 1] };
  }

  /** Share of entries above `threshold` (0..1), or -1 when empty. */
  aboveRatio(threshold: number): number {
    if (!this.n) return -1;
    let over = 0;
    for (let k = 0; k < this.n; k++) if (this.buf[k] > threshold) over++;
    return over / this.n;
  }
}

export interface PerfSnapshot {
  windowNote: string;
  frames: {
    count: number;
    p50: number;
    p95: number;
    max: number;
    jankRatio: number;
  };
  detect: {
    count: number;
    p50: number;
    p95: number;
    max: number;
  };
}

export const perf = {
  render: new Series(),
  detect: new Series(),
  reset(): void {
    perf.render.reset();
    perf.detect.reset();
  },
  snapshot(): PerfSnapshot {
    const f = perf.render.percentiles();
    const d = perf.detect.percentiles();
    return {
      windowNote: `${RING}-sample ring buffers`,
      frames: {
        count: perf.render.count,
        p50: round(f.p50),
        p95: round(f.p95),
        max: round(f.max),
        jankRatio: round(perf.render.aboveRatio(JANK_MS)),
      },
      detect: {
        count: perf.detect.count,
        p50: round(d.p50),
        p95: round(d.p95),
        max: round(d.max),
      },
    };
  },
};

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface PerfBridge {
  snapshot: () => PerfSnapshot;
  reset: () => void;
}

declare global {
  interface Window {
    __handlabPerf?: PerfBridge;
  }
}

// Installed at import time: this module is only imported by the lazy engine
// chunks (and tests), so there is no SSR window to worry about.
if (typeof window !== "undefined") {
  window.__handlabPerf = {
    snapshot: () => perf.snapshot(),
    reset: () => perf.reset(),
  };
}
