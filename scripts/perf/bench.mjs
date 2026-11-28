/**
 * HandLab perf benchmark: drives the real app in Chrome with a fake webcam
 * and reports main-thread frame timing + MediaPipe inference cost.
 *
 * Prereqs:
 *   - a running server (production preferred):  PORT=3100 npm start
 *   - playwright chromium installed:            npx playwright install chromium
 *
 * Usage:
 *   node scripts/perf/bench.mjs --url http://127.0.0.1:3100 --sec 20
 *     --headless      run without a window (uses SwiftShader → measures the
 *                     WASM fallback engine, not the WebGL engine)
 *     --sw            force software WebGL (--disable-gpu) → fallback engine
 *     --chrome        use installed Chrome (real GPU → WebGL engine) instead
 *                     of the bundled chromium (always SwiftShader)
 *     --out <file>    write the JSON sample (default: scripts/perf/results/)
 *
 * The synthetic fixture contains no hand (see gen-fixture.mjs): both engines
 * still run MediaPipe's full palm-detection stage every frame, so the
 * inference-cost numbers are comparable across runs.
 */

import { chromium } from "playwright";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeY4m } from "./gen-fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const url = arg("url", "http://127.0.0.1:3100");
const sec = Number(arg("sec", "20"));
const out = arg("out", null);
const fixture =
  arg("fixture", null) ?? join(HERE, ".tmp", `fixture_${sec >= 4 ? 4 : sec}s.y4m`);

// Generate the fixture if missing (kept out of git; deterministic content).
try {
  statSync(fixture);
} catch {
  mkdirSync(dirname(fixture), { recursive: true });
  await makeY4m({ out: fixture, w: 320, h: 240, fps: 30, sec: 4 });
  console.log(`generated fixture ${fixture}`);
}

const launchArgs = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  `--use-file-for-fake-video-capture=${fixture}`,
  "--autoplay-policy=no-user-gesture-required",
  "--window-size=1280,800",
];
if (hasFlag("sw")) launchArgs.push("--disable-gpu");

console.log(`benchmarking ${url} for ${sec}s (headless: ${hasFlag("headless") ? "yes" : "no"})…`);
const browser = await chromium.launch({
  headless: hasFlag("headless"),
  ...(hasFlag("chrome") ? { channel: "chrome" } : {}),
  args: launchArgs,
});
// viewport: null = follow the real OS window, so fullscreen/resizing the
// window behaves like a normal browser (a pinned emulated viewport ignores
// window resizes, which looks like a scaling bug in the app).
const page = await browser.newPage({ viewport: null });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

try {
  await page.goto(url, { timeout: 60_000, waitUntil: "load" });
  // The lab chunk is lazy; wait for the webcam button the header renders.
  const btn = page.getByRole("button", { name: "Enable hand tracking" });
  await btn.waitFor({ timeout: 60_000 });
  await btn.click();

  // Wait until the landmarker is producing detections (fake cam loops y4m).
  try {
    await page.waitForFunction(
      () => (window.__handlabPerf?.snapshot?.().detect.count ?? 0) > 0,
      null,
      { timeout: 90_000, polling: 500 },
    );
  } catch (e) {
    // Dump pipeline state so a stall is diagnosable from the log alone.
    const state = await page.evaluate(() => ({
      perf: !!window.__handlabPerf,
      detectCount: window.__handlabPerf?.snapshot?.().detect.count ?? -1,
      model: document.getElementById("t-model")?.textContent,
      fps: document.getElementById("t-fps")?.textContent,
      video: (() => {
        const v = document.getElementById("cam");
        return v ? { rs: v.readyState, t: v.currentTime, w: v.videoWidth } : null;
      })(),
    }));
    console.error("detection never started; state:", JSON.stringify(state));
    throw e;
  }

  // Let the pipeline settle (renderer warm, pixel ratio stabilized), then
  // measure a clean window.
  await page.waitForTimeout(3_000);
  await page.evaluate(() => window.__handlabPerf.reset());
  await page.waitForTimeout(sec * 1000);
  const snap = await page.evaluate(() => window.__handlabPerf.snapshot());
  snap.detectHz = snap.detect.count / sec;
  snap.engine = await page.evaluate(() => {
    // Both engines install window.__lab (lib/engine.ts, lib/fallback2d.ts);
    // the fallback engine declares a `sw3d` field, the WebGL one does not.
    const eng = window.__lab?.engine;
    return eng && "sw3d" in eng ? "wasm-fallback" : "webgl";
  });
  snap.url = url;
  snap.sec = sec;
  snap.pageErrors = errors.slice(0, 5);

  console.log("\n=== handlab perf ===");
  console.log(`engine        ${snap.engine}`);
  console.log(`frame p50/p95 ${snap.frames.p50} / ${snap.frames.p95} ms (max ${snap.frames.max})`);
  console.log(`jank ratio    ${(snap.frames.jankRatio * 100).toFixed(1)}% frames > 32ms`);
  console.log(`detect p50/p95 ${snap.detect.p50} / ${snap.detect.p95} ms (max ${snap.detect.max})`);
  console.log(`detect rate   ${snap.detectHz.toFixed(1)} Hz`);
  if (errors.length) console.log(`page errors   ${errors.length} (first 5 in JSON)`);

  if (out) {
    const outPath = resolve(out);
    mkdirSync(dirname(outPath), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(outPath, JSON.stringify(snap, null, 2));
    console.log(`saved ${outPath}`);
  }
} finally {
  await browser.close();
}
