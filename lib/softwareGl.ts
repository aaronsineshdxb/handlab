/**
 * Shared software-WebGL detection used by the detector worker.
 *
 * `isSoftwareWebGL` (lib/fallback2d.ts) routes the whole engine when the
 * MAIN thread's WebGL is software-rendered; the worker needs the same answer
 * for its own context — a GPU MediaPipe delegate on top of SwiftShader
 * "succeeds" but pays a GL texture round-trip per frame, measured ~16x slower
 * than the CPU delegate.
 */

const SOFTWARE_GL_RE = /swiftshader|llvmpipe|software|basic render/i;

export function isSoftwareGLRenderer(renderer: string): boolean {
  return SOFTWARE_GL_RE.test(renderer);
}
