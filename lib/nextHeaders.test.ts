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

  it("permits every host the Hugging Face Hub redirects weights to", async () => {
    const all = await rules();
    const rule = all.find((r) => r.source === "/(.*)");
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy")!
      .value;
    const connectSrc = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("connect-src"))!;

    // huggingface.co/.../resolve/main/onnx/<file> 302s to a storage CDN whose
    // host has changed over time (cdn-lfs.huggingface.co -> us.aws.cdn.hf.co,
    // the Xet bridge) and may be region-scoped. An explicit host list broke
    // the depth download the moment HF moved. The wildcard is what keeps it
    // working; assert it rather than a specific CDN name.
    expect(connectSrc).toContain("https://*.hf.co");
    // The wildcard does NOT cover the apex: `huggingface.co` is a different
    // domain from `hf.co`, so config.json / preprocessor_config.json are
    // fetched from the apex and need their own entry.
    expect(connectSrc).toContain("https://huggingface.co");
    // ...and it must stay scoped to Hugging Face rather than opening up to
    // arbitrary CDNs, and must not admit jsdelivr (see monocular.ts).
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).not.toContain("jsdelivr");
    expect(connectSrc).not.toContain("data:");
    // Every scheme source is either a concrete host or a single-subdomain
    // wildcard — never a bare `https://*`, and never plain http.
    const schemes = connectSrc
      .replace(/^connect-src\s*/, "")
      .split(/\s+/)
      .filter((s) => s.startsWith("http"));
    expect(schemes.length).toBeGreaterThan(0);
    for (const s of schemes) {
      expect(s, `${s} must be https and host-scoped`).toMatch(
        /^https:\/\/(\*\.)?[a-z0-9][a-z0-9.-]*$/,
      );
    }
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
