// Reports gzip weight of client JS per route from the .next build manifest.
// Usage: npm run perf
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const nextDir = join(root, ".next");
const manifestPath = join(nextDir, "app-build-manifest.json");

if (!existsSync(manifestPath)) {
  console.error("no .next/app-build-manifest.json — run `npm run build` first");
  process.exit(1);
}

const kb = (n) => (n / 1024).toFixed(1).padStart(9) + " KB";
// app-build-manifest.json is { pages: { "/page": [files] } }
const { pages } = JSON.parse(readFileSync(manifestPath, "utf8"));
const report = {};

for (const [route, files] of Object.entries(pages)) {
  let raw = 0;
  let gz = 0;
  const rows = [];
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const abs = join(nextDir, f);
    if (!existsSync(abs)) continue;
    const buf = readFileSync(abs);
    const g = gzipSync(buf).length;
    raw += buf.length;
    gz += g;
    rows.push([relative(nextDir, abs), buf.length, g]);
  }
  report[route] = { raw, gz, rows };
  console.log(`\n${route}`);
  console.log(`  total   ${kb(raw)} raw  ${kb(gz)} gzip`);
  for (const [name, r, g] of rows.sort((a, b) => b[2] - a[2]).slice(0, 8)) {
    console.log(`    ${kb(r)}  ${kb(g)}  ${name}`);
  }
}

const entries = Object.entries(report).sort((a, b) => b[1].gz - a[1].gz);
if (entries.length) {
  console.log(`\nworst route: ${entries[0][0]} at ${kb(entries[0][1].gz)} gzip`);
}
