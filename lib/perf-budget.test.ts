import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ceilings for the eager client JS of each route, in gzip bytes.
 *
 * History:
 *   baseline 2026-09-30  /page 324.7 KB, /vr/page 321.5 KB (Three.js eager)
 *   after code splitting  /page 102.0 KB, /vr/page 102.0 KB
 *
 * Numbers below are the post-split measurements plus ~5% headroom. Do not raise
 * one to make a build pass — if a legitimate change needs more weight, say so
 * in review instead.
 *
 * Note: LazyMotion was tried and reverted. Deferring Motion's features put the
 * `m` runtime in both the layout and the lazy HandLab chunk, taking the route
 * to 348KB to interactive versus 321KB without it.
 */
const BUDGET_GZ: Record<string, number> = {
  "/page": 108 * 1024,
  "/vr/page": 108 * 1024,
};

const manifestPath = join(process.cwd(), ".next/app-build-manifest.json");
// No .next build means nothing to measure; skip rather than fail. CI and the
// Task 30 verification run build first.
const hasBuild = existsSync(manifestPath);

describe.skipIf(!hasBuild)("bundle budget", () => {
  const { pages } = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    pages: Record<string, string[]>;
  };

  const gzipOf = (files: string[]): number =>
    files
      .filter((f) => f.endsWith(".js"))
      .reduce(
        (sum, f) =>
          sum + gzipSync(readFileSync(join(process.cwd(), ".next", f))).length,
        0,
      );

  for (const [route, budget] of Object.entries(BUDGET_GZ)) {
    it(`${route} stays under ${(budget / 1024).toFixed(0)}KB gzip`, () => {
      const files = pages[route];
      expect(files, `route ${route} missing from build manifest`).toBeDefined();
      const gz = gzipOf(files);
      expect(
        gz,
        `${route} is ${(gz / 1024).toFixed(1)}KB gzip, budget ${(budget / 1024).toFixed(0)}KB`,
      ).toBeLessThanOrEqual(budget);
    });
  }

  it("keeps three.js out of the / route's eager chunks", () => {
    // Phase 4 splits the lab out, so the renderer loads after first paint.
    // This is the single biggest bundle win, so it gets its own assertion
    // rather than relying on the gzip ceiling alone.
    const heavy = pages["/page"].filter((f) => {
      if (!f.endsWith(".js")) return false;
      const src = readFileSync(join(process.cwd(), ".next", f), "utf8");
      return src.includes("WebGLRenderer") || src.includes("PerspectiveCamera");
    });
    expect(
      heavy,
      `three.js found in eager chunks: ${heavy.join(", ")}`,
    ).toHaveLength(0);
  });
});
