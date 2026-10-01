import type { NextConfig } from "next";

// Audit §2.2: defensive headers. HandLab requests webcam + WebXR, so
// framing (clickjacking/permission-jacking) and over-broad permissions
// are the main risks. The CSP below is deliberately scoped:
//   - WASM + hand model are vendored locally (no jsdelivr/g apis needed)
//   - connect-src allows Hugging Face for the Depth Anything V2 weights.
//     NOTE the wildcard: huggingface.co/…/resolve/main/onnx/<file> answers 302
//     to a storage CDN, and which host that is has changed over time — it was
//     cdn-lfs.huggingface.co, now us.aws.cdn.hf.co (the Xet bridge), and may be
//     region-scoped. Listing individual hosts silently broke the depth download
//     ("network error" in the console) the moment HF moved.
//     BOTH entries are required and neither covers the other: `*.hf.co` does
//     not match the apex `huggingface.co`, which is a separate domain from the
//     `hf.co` CDN. Dropping either one breaks the depth download.
//     Verify with: curl -sI <resolve url> | grep -i location
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
  "connect-src 'self' https://huggingface.co https://*.hf.co",
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
      // The vendored MediaPipe runtime (11.8MB) and hand model (7.8MB) are
      // content-stable and never change in place, so they are safe to cache
      // immutably. Without this, every cold session pays a revalidation round
      // trip for 19.6MB before the webcam can initialise.
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
