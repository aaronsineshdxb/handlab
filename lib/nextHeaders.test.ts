import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

const IMMUTABLE = "public, max-age=31536000, immutable";

const rules = async (): Promise<Rule[]> =>
  (await nextConfig.headers?.()) as Rule[];

describe("static asset cache headers", () => {
  it("declares an immutable rule for the MediaPipe wasm fileset", async () => {
    const all = await rules();
    const rule = all.find((r) => r.source === "/wasm/:path*");
    expect(rule, "missing /wasm/:path* rule").toBeDefined();
    const cache = rule!.headers.find((h) => h.key === "Cache-Control");
    expect(cache?.value).toBe(IMMUTABLE);
  });

  it("declares an immutable rule for the hand model", async () => {
    const all = await rules();
    const rule = all.find((r) => r.source === "/models/:path*");
    expect(rule, "missing /models/:path* rule").toBeDefined();
    const cache = rule!.headers.find((h) => h.key === "Cache-Control");
    expect(cache?.value).toBe(IMMUTABLE);
  });

  it("keeps the catch-all rule last so it cannot shadow the specific ones", async () => {
    const all = await rules();
    const catchAll = all.findIndex((r) => r.source === "/(.*)");
    const wasm = all.findIndex((r) => r.source === "/wasm/:path*");
    const models = all.findIndex((r) => r.source === "/models/:path*");
    expect(wasm).toBeGreaterThanOrEqual(0);
    expect(models).toBeGreaterThanOrEqual(0);
    expect(wasm).toBeLessThan(catchAll);
    expect(models).toBeLessThan(catchAll);
  });

  it("keeps the existing security headers on the catch-all rule", async () => {
    const all = await rules();
    const rule = all.find((r) => r.source === "/(.*)");
    const keys = rule!.headers.map((h) => h.key);
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("Permissions-Policy");
    expect(keys).toContain("X-Frame-Options");
  });

  it("does not weaken the CSP when adding cache rules", async () => {
    const all = await rules();
    const rule = all.find((r) => r.source === "/(.*)");
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy")!
      .value;
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("default-src 'self'");
  });
});
