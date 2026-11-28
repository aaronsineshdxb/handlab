/**
 * Synthetic y4m fixture for the perf benchmark (no ffmpeg dependency).
 *
 * Chrome's fake webcam device (`--use-file-for-fake-video-capture`) feeds
 * this file to getUserMedia, so the benchmark can run MediaPipe against a
 * deterministic, repeatably-moving scene without a real camera.
 *
 * The pattern deliberately contains no hand: MediaPipe still runs its full
 * palm-detection stage per frame, so inference cost is measured end-to-end;
 * only the (comparatively cheap) landmark-refinement stage is skipped when
 * no palm is found. Absolute detect-ms therefore slightly under-reports —
 * but baseline and candidate run identical content, so deltas stay valid.
 *
 * y4m = one header line, then per frame "FRAME\n" + raw I420 planes.
 */

export async function makeY4m({
  out,
  w = 320,
  h = 240,
  fps = 30,
  sec = 4,
} = {}) {
  const frames = Math.round(fps * sec);
  const yLen = w * h;
  const cw = w >> 1;
  const ch = h >> 1;
  const cLen = cw * ch;
  const frame = Buffer.alloc(yLen + 2 * cLen);
  const Y = frame.subarray(0, yLen);
  const U = frame.subarray(yLen, yLen + cLen);
  const V = frame.subarray(yLen + cLen);

  const header = `YUV4MPEG2 W${w} H${h} F${fps}:1 Ip A1:1 C420jpeg\n`;
  const chunks = [Buffer.from(header)];

  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    // Two "blobs" orbit the frame over a slowly sweeping luminance gradient.
    const b1x = (0.5 + 0.35 * Math.sin(t * 2.1)) * w;
    const b1y = (0.5 + 0.35 * Math.cos(t * 1.7)) * h;
    const b2x = (0.5 + 0.3 * Math.cos(t * 1.3)) * w;
    const b2y = (0.5 + 0.3 * Math.sin(t * 2.6)) * h;

    let p = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++, p++) {
        let l = 96 + 64 * Math.sin((x + y * 1.7 + t * 90) / 31);
        const d1 = Math.hypot(x - b1x, y - b1y);
        const d2 = Math.hypot(x - b2x, y - b2y);
        if (d1 < 28) l = 235 - d1 * 2.2;
        if (d2 < 22) l = 235 - d2 * 2.6;
        Y[p] = Math.max(16, Math.min(240, l | 0));
      }
    }
    // Chroma planes: gentle drift around neutral gray. A large swing (the
    // first version used ±70) makes the whole feed look green/magenta.
    let c = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++, c++) {
        U[c] = (128 + 18 * Math.sin(t * 1.1) + 8 * Math.cos(x / 24)) | 0;
        V[c] = (128 + 18 * Math.cos(t * 0.9) + 8 * Math.sin(y / 19)) | 0;
      }
    }
    // Copy per frame: chunks must hold this frame's pixels, not a reference
    // to the reused scratch buffer (v1 concatenated AFTER the loop, so every
    // frame in the file was a copy of the final frame — a frozen, green feed).
    chunks.push(Buffer.from("FRAME\n"), Buffer.from(frame));
  }

  const fs = await import("node:fs");
  fs.writeFileSync(out, Buffer.concat(chunks));
  return out;
}

// CLI: node gen-fixture.mjs <out> [w h fps sec]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, w, h, fps, sec] = process.argv.slice(2);
  const path = await makeY4m({
    out,
    ...(w ? { w: +w, h: +h, fps: +fps, sec: +sec } : {}),
  });
  const { statSync } = await import("node:fs");
  console.log(`wrote ${path} (${(statSync(path).size / 1e6).toFixed(1)} MB)`);
}
