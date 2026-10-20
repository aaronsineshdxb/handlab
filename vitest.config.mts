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
});
