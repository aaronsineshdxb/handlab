import type { NextConfig } from "next";

// Audit §2.2: defensive headers. HandLab requests webcam + WebXR, so
// framing (clickjacking/permission-jacking) and over-broad permissions
// are the main risks. The CSP below is deliberately scoped:
//   - Everything binary is vendored same-origin: the MediaPipe WASM
//     (/public/wasm), the hand model (/public/models), the ONNX Runtime
//     (/public/ort) and the Depth Anything V2 weights
//     (/public/models/onnx-community/depth-anything-v2-small).
//   - connect-src is therefore 'self' only. It previously allowed
//     https://huggingface.co and https://*.hf.co for the depth weights; both
//     entries were needed because HF resolve URLs 302 to a storage CDN whose
//     host has moved over time (cdn-lfs -> us.aws.cdn.hf.co) and is
//     region-scoped, and `*.hf.co` does not match the apex. Vendoring the
//     weights deletes that whole failure mode — and the dependency on a
//     third-party host staying put — in one step. lib/depth/monocular.ts
//     sets env.allowRemoteModels=false so a missing vendored file fails
//     loudly rather than quietly phoning home.
//   - jsdelivr is deliberately NOT allowed. transformers.web.js rewrites
//     `env.backends.onnx.wasm.wasmPaths` to a cdn.jsdelivr.net URL as a
//     module-load side effect; lib/depth/monocular.ts overrides it to
//     same-origin /ort after import. If that override is ever lost, depth AI
//     fails with a bare network error rather than an obvious 403, so keep
//     jsdelivr out and keep the vendored copy in sync with node_modules:
//       cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.* public/ort/
//   - script-src keeps 'unsafe-eval'/'unsafe-inline': required by Next.js
//     runtime + Transformers.js WASM workers. DOM XSS risk stays low —
//     the codebase uses no dangerouslySetInnerHTML/innerHTML/eval.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Order matters: these specific rules must precede the /(.*) catch-all.
      // The vendored MediaPipe runtime (11.8MB), hand model (7.8MB), ORT
      // runtime (26.8MB) and Depth Anything V2 weights (50MB fp16 / 27MB q8)
      // are content-stable and never change in place, so they are safe to
      // cache immutably. Without this, every cold session pays a
      // revalidation round trip for tens of MB before the webcam can
      // initialise or depth can start.
      {
        source: "/wasm/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/ort/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), xr-spatial-tracking=(self), microphone=()",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
