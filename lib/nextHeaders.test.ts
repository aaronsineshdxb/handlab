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

  it("locks connect-src to same-origin now that depth weights are vendored", async () => {
    const all = await rules();
    const rule = all.find((r) => r.source === "/(.*)");
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy")!
      .value;
    const connectSrc = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("connect-src"))!;

    // The Depth Anything V2 weights, the ORT runtime, the MediaPipe runtime
    // and the hand model all ship under /public. This used to allow
    // https://huggingface.co plus https://*.hf.co, and it was a standing
    // hazard: HF resolve URLs 302 to a storage CDN whose host moves (cdn-lfs ->
    // us.aws.cdn.hf.co), the apex is not covered by the wildcard, and either
    // entry going stale showed up only as "depth AI network error" in the
    // console. If you ever need a host here again, it is a deliberate change,
    // not a fallback — and depth still works offline because monocular.ts
    // sets env.allowRemoteModels=false.
    expect(connectSrc).toBe("connect-src 'self'");
    expect(connectSrc).not.toContain("huggingface");
    expect(connectSrc).not.toContain("hf.co");
    // jsdelivr is what transformers defaults wasmPaths to; allowing it would
    // mask a broken ORT_WASM_PATHS override behind a third-party CDN.
    expect(connectSrc).not.toContain("jsdelivr");
    expect(connectSrc).not.toContain("data:");
    // No scheme sources at all — nothing off-origin may be fetched.
    const schemes = connectSrc
      .replace(/^connect-src\s*/, "")
      .split(/\s+/)
      .filter((s) => s.startsWith("http"));
    expect(schemes).toEqual([]);
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
