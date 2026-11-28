import { describe, expect, it } from "vitest";
import {
  MODEL_URL,
  SIMD_PROBE,
  handAssetUrls,
  prefetchHandAssets,
  resetGzProbe,
} from "./handAssets";

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("hand asset prefetch", () => {
  it("probe bytes are a valid SIMD module (guards against typos)", () => {
    expect(WebAssembly.validate(SIMD_PROBE)).toBe(true);
  });

  it("picks the simd variant when SIMD is supported", () => {
    const urls = handAssetUrls(true);
    expect(urls[0]).toBe("/wasm/vision_wasm_internal.js");
    expect(urls[1]).toBe("/wasm/vision_wasm_internal.wasm");
    expect(urls[2]).toBe(MODEL_URL);
    expect(JSON.stringify(urls)).not.toContain("nosimd");
  });

  it("picks the nosimd variant otherwise", () => {
    const urls = handAssetUrls(false);
    expect(urls[0]).toBe("/wasm/vision_wasm_nosimd_internal.js");
    expect(urls[1]).toBe("/wasm/vision_wasm_nosimd_internal.wasm");
    expect(urls[2]).toBe(MODEL_URL);
  });

  it("fetches exactly the chosen variant's files", async () => {
    resetGzProbe();
    const fetched: string[] = [];
    prefetchHandAssets(((url: string, init?: { method?: string }) => {
      // the /gz/ availability probe is a HEAD, not an asset fetch
      if (init?.method !== "HEAD") fetched.push(url);
      return Promise.resolve({
        ok: false,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
    }) as unknown as typeof fetch);
    await flush();
    expect(fetched).toEqual(handAssetUrls(WebAssembly.validate(SIMD_PROBE)));
  });

  it("fetches precompressed variants when the /gz/ siblings exist", async () => {
    resetGzProbe();
    const fetched: string[] = [];
    prefetchHandAssets(((url: string, init?: { method?: string }) => {
      if (init?.method !== "HEAD") fetched.push(url);
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
    }) as unknown as typeof fetch);
    await flush();
    expect(fetched).toEqual(
      handAssetUrls(WebAssembly.validate(SIMD_PROBE), true),
    );
    expect(JSON.stringify(fetched)).toContain("/wasm/gz/");
  });
});
