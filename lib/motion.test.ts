import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion } from "./motion";

const realWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  if (realWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = realWindow;
  vi.restoreAllMocks();
});

describe("prefersReducedMotion", () => {
  it("is false when there is no window (SSR)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is false when matchMedia is unavailable", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reflects the media query result", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    (globalThis as { window?: unknown }).window = { matchMedia };
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });
});
