import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DA_V2_MODEL_ID,
  DEPTH_ENV_OVERRIDES,
  DEPTH_LOCAL_MODEL_PATH,
} from "./depth/monocular";
import { pickDepthDtype } from "./caps";
import nextConfig from "../next.config";

const publicDir = join(process.cwd(), "public");

/**
 * Depth Anything V2 weights are vendored under /public/models so depth AI
 * needs no Hugging Face download (works offline, behind any proxy, and with
 * connect-src locked to 'self').
 *
 * Two things can silently break that, and neither throws at build time:
 *   1. a weight file missing or truncated (git-lfs pointer, partial clone,
 *      stray .gitignore rule) — the pipeline fails at runtime with a bare
 *      ModelFileNotFoundError, or worse, ONNX accepts garbage;
 *   2. a weight file replaced with different bytes — no error at all, just a
 *      different model than the one the docs and pins describe.
 * So assert the sha256 of each vendored file against the upstream LFS oid.
 * Re-vendoring from HF produces the same bytes; if it does not, the pin here
 * must be updated deliberately in the same commit.
 */
const REPO_DIR = join(
  publicDir,
  DEPTH_LOCAL_MODEL_PATH.replace(/^\/|\/$/g, ""),
  ...DA_V2_MODEL_ID.split("/"),
);

const VENDORED: Record<string, { file: string; sha256: string; bytes: number }> =
  {
    // oids from huggingface.co/onnx-community/depth-anything-v2-small
    "model_fp16.onnx": {
      file: "onnx/model_fp16.onnx",
      sha256: "2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04",
      bytes: 49642442,
    },
    "model_quantized.onnx": {
      file: "onnx/model_quantized.onnx",
      sha256: "fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d",
      bytes: 27258801,
    },
  };

describe("vendored Depth Anything V2 weights", () => {
  for (const [name, { file, sha256, bytes }] of Object.entries(VENDORED)) {
    it(`matches the pinned sha256 for ${name}`, () => {
      const abs = join(REPO_DIR, file);
      const buf = readFileSync(abs);
      expect(buf.byteLength, `${file} is the wrong size`).toBe(bytes);
      expect(createHash("sha256").update(buf).digest("hex")).toBe(sha256);
    });
  }

  // These are not covered by the dtype pins above: transformers.js loads them
  // by exact filename and there is no 404-with-a-message if one is missing,
  // just a config parse error deep inside the pipeline.
  for (const file of [
    "config.json",
    "preprocessor_config.json",
    "quantize_config.json",
  ]) {
    it(`ships ${file} beside the weights`, () => {
      const abs = join(REPO_DIR, file);
      expect(statSync(abs).size).toBeGreaterThan(2);
      expect(() => JSON.parse(readFileSync(abs, "utf8"))).not.toThrow();
    });
  }

  it("keeps the vendored tree at the path transformers.js will request", () => {
    // buildResourcePaths does pathJoin(localModelPath, model_id, filename), so
    // localModelPath + the repo id must equal REPO_DIR exactly.
    expect(DEPTH_ENV_OVERRIDES.localModelPath).toBe(DEPTH_LOCAL_MODEL_PATH);
    expect(DEPTH_LOCAL_MODEL_PATH.startsWith("/")).toBe(true);
    expect(REPO_DIR).toBe(join(publicDir, "models", DA_V2_MODEL_ID));
    // The repo id doubles as the on-disk path, so it must not be something
    // pathJoin would mangle (leading slash, dot segments, backslashes).
    expect(DA_V2_MODEL_ID.startsWith("/")).toBe(false);
    expect(DA_V2_MODEL_ID).not.toContain("..");
  });

  it("disables remote model fetches", () => {
    expect(DEPTH_ENV_OVERRIDES.allowRemoteModels).toBe(false);
    expect(DEPTH_ENV_OVERRIDES.allowLocalModels).toBe(true);
  });

  it("covers every dtype pickDepthDtype can return", () => {
    const picked = new Set([
      pickDepthDtype({ hasWebGPU: true, constrained: false }),
      pickDepthDtype({ hasWebGPU: false, constrained: true }),
      pickDepthDtype({ hasWebGPU: true, constrained: true }),
      pickDepthDtype({ hasWebGPU: false, constrained: false }),
    ]);
    expect([...picked].sort()).toEqual(["fp16", "q8"]);
    for (const dtype of picked) {
      const key = dtype === "fp16" ? "model_fp16.onnx" : "model_quantized.onnx";
      expect(
        Object.hasOwn(VENDORED, key),
        `${dtype} resolves to onnx/${key}, which is not pinned`,
      ).toBe(true);
    }
  });

  it("serves /models immutably so the weights are fetched at most once", async () => {
    const rules = (await nextConfig.headers?.()) as {
      source: string;
      headers: { key: string; value: string }[];
    }[];
    const rule = rules.find((r) => r.source === "/models/:path*");
    expect(rule, "missing /models/:path* rule").toBeDefined();
    const cache = rule!.headers.find((h) => h.key === "Cache-Control");
    expect(cache?.value).toBe("public, max-age=31536000, immutable");
  });
});