/**
 * Generate precompressed gzip siblings of the vendored hand-tracking payload.
 *
 * `next start` does not compress public/ (measured: 11.8MB wasm + 7.8MB model
 * ship raw). Rather than decompressing client-side — which would need blob:
 * URLs that the hardened CSP (`connect-src 'self'`) deliberately blocks — the
 * build writes .gz copies under a scoped directory (public/wasm/gz/…, …) and
 * next.config.ts serves them with `Content-Encoding: gzip`. The browser
 * decodes transparently, so tasks-vision's own internal fetches (main thread
 * AND the detector worker) get compressed transfer for free.
 *
 * Originals are never modified; if a .gz sibling is missing (fresh checkout
 * without this script) the engines fall back to the plain URLs.
 *
 * Run automatically via `predev`/`prebuild`. Output is gitignored.
 */
import { gzipSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "public");

/** [source file, gz sibling path] — the hand-tracking hot path. */
const TARGETS = [
  ["wasm/vision_wasm_internal.js", "wasm/gz/vision_wasm_internal.js"],
  ["wasm/vision_wasm_internal.wasm", "wasm/gz/vision_wasm_internal.wasm"],
  [
    "wasm/vision_wasm_nosimd_internal.js",
    "wasm/gz/vision_wasm_nosimd_internal.js",
  ],
  [
    "wasm/vision_wasm_nosimd_internal.wasm",
    "wasm/gz/vision_wasm_nosimd_internal.wasm",
  ],
  ["models/hand_landmarker.task", "models/gz/hand_landmarker.task"],
  ["wasm/handlab_sw3d.wasm", "wasm/gz/handlab_sw3d.wasm"],
];

let wrote = 0;
let skipped = 0;
let missing = 0;

for (const [src, gz] of TARGETS) {
  const srcPath = join(ROOT, src);
  const gzPath = join(ROOT, gz);
  if (!existsSync(srcPath)) {
    missing++;
    continue;
  }
  const st = statSync(srcPath);
  if (existsSync(gzPath) && statSync(gzPath).mtimeMs >= st.mtimeMs) {
    skipped++;
    continue;
  }
  const buf = readFileSync(srcPath);
  const out = gzipSync(buf, { level: 9 });
  mkdirSync(join(gzPath, ".."), { recursive: true });
  writeFileSync(gzPath, out);
  wrote++;
  console.log(
    `gz ${src} ${(buf.length / 1e6).toFixed(1)}MB → ${(out.length / 1e6).toFixed(1)}MB`,
  );
}

console.log(
  `compress-assets: ${wrote} written, ${skipped} up-to-date, ${missing} missing sources`,
);
