import { defineConfig } from "vitest/config";

// Next.js mandates `"jsx": "preserve"` in tsconfig.json (it runs its own
// SWC transform), but vitest/vite also reads that setting and would leave
// JSX untransformed — breaking every .tsx test. This toolchain now
// transforms via oxc by default, so pin the automatic JSX runtime there to
// keep `npm test` green independent of the Next-managed tsconfig.
export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    // All 33 test files are pure CPU tests with no cross-file global state
    // (dom test environments are created per file); reusing workers instead
    // of one-per-file saves several seconds of worker startup every run.
    isolate: false,
  },
});
