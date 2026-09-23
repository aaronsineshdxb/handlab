import type { NextConfig } from "next";

// Audit §2.2: defensive headers. HandLab requests webcam + WebXR, so
// framing (clickjacking/permission-jacking) and over-broad permissions
// are the main risks. The CSP below is deliberately scoped:
//   - WASM + hand model are vendored locally (no jsdelivr/g apis needed)
//   - connect-src still allows Hugging Face Hub: Depth Anything V2
//     (~100MB) downloads at runtime and is cached by Transformers.js
//   - script-src keeps 'unsafe-eval'/'unsafe-inline': required by Next.js
//     runtime + Transformers.js WASM workers. DOM XSS risk stays low —
//     the codebase uses no dangerouslySetInnerHTML/innerHTML/eval.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs.hf.co",
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
