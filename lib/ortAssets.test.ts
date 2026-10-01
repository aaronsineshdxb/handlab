import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORT_WASM_PATHS } from "./depth/monocular";
import nextConfig from "../next.config";

const publicDir = join(process.cwd(), "public");

/**
 * transformers.web.js overwrites env.backends.onnx.wasm.wasmPaths with a
 * cdn.jsdelivr.net URL as a module-load side effect, and next.config.ts does
 * not allow jsdelivr in connect-src. If the vendored copy is deleted or the
 * override is lost, depth AI fails at runtime with a bare "network error" and
 * no other signal — so assert the files exist at import time instead.
 */
describe("vendored ONNX Runtime wasm", () => {
  for (const [kind, rel] of Object.entries(
    ORT_WASM_PATHS as Record<string, string>,
  )) {
    it(`serves the ${kind} build from same-origin`, () => {
      expect(rel.startsWith("/"), `${kind} must be a same-origin path`).toBe(
        true,
      );
      const file = join(publicDir, rel.replace(/^\//, ""));
      expect(
        existsSync(file),
        `missing vendored ORT asset: public${rel} — see the re-vendor ` +
          `command in next.config.ts`,
      ).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1024);
    });
  }

  it("is cached immutably for a year", async () => {
    const rules = (await nextConfig.headers?.()) as {
      source: string;
      headers: { key: string; value: string }[];
    }[];
    const rule = rules.find((r) => r.source === "/ort/:path*");
    expect(rule, "missing /ort/:path* rule").toBeDefined();
    const cache = rule!.headers.find((h) => h.key === "Cache-Control");
    expect(cache?.value).toBe("public, max-age=31536000, immutable");
  });

  it("keeps the ONNX runtime off the jsdelivr CDN", async () => {
    const rules = (await nextConfig.headers?.()) as {
      source: string;
      headers: { key: string; value: string }[];
    }[];
    const rule = rules.find((r) => r.source === "/(.*)");
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy")!
      .value;
    // jsdelivr is what transformers defaults to; allowing it would mask a
    // broken ORT_WASM_PATHS override behind a third-party CDN.
    expect(csp).not.toContain("jsdelivr");
    expect(csp).toContain("connect-src 'self'");
  });
});