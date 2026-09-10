/* HANDLAB 2D fallback engine — used when WebGL context creation fails.
 * Same public API surface as HandLabEngine (lib/engine.ts) so
 * components/HandLab.tsx can drive either one through a union type.
 * Renders a top-down 2D scene on the same canvas via Canvas2D, keeps
 * mouse + webcam hand-tracking input, measurements, save/load, PNG export.
 */

import type {
  HandLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import {
  SHAPES,
  initialUiState,
  type CamState,
  type EngineOpts,
  type HudNodes,
  type Measurement,
  type SceneData,
  type ShapeName,
  type UiState,
} from "./engine";

export { SHAPES, initialUiState };
export type { CamState, EngineOpts, HudNodes, Measurement, SceneData, ShapeName, UiState };

export function isWebGLAvailable(): boolean {
  try {
    const cv = document.createElement("canvas");
    const gl2 = cv.getContext("webgl2");
    if (gl2) {
      const lose = gl2.getExtension("WEBGL_lose_context");
      lose?.loseContext();
      return true;
    }
    const gl1 = cv.getContext("webgl");
    if (gl1) {
      const lose = (gl1 as WebGLRenderingContext).getExtension(
        "WEBGL_lose_context",
      );
      lose?.loseContext();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const TASKS_VISION_VERSION = "1.0.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>(
    (_, rej) =>
      (t = setTimeout(
        () => rej(new Error(`${what} timed out after ${ms / 1000}s`)),
        ms,
      )),
  );
  return Promise.race([p, limit]).finally(() => clearTimeout(t));
}

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
  [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

interface Obj2D {
  id: number;
  s: ShapeName;
  c: string;
  x: number;
  y: number;
  rot: number;
}

interface Chain2D {
  id: number;
  pts: { x: number; y: number }[];
  closed: boolean;
}

function isNum3(a: unknown): a is [number, number, number] {
  return (
    Array.isArray(a) &&
    a.length === 3 &&
    a.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

const WORLD_W = 8.4;
const WORLD_H = 5.4;

export class HandLabFallbackEngine {
  readonly isFallback = true as const;
  private opts: EngineOpts;
  private ctx: CanvasRenderingContext2D;
  private sctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private disposed = false;
  private lastT = performance.now();

  private shape: ShapeName = initialUiState.shape;
  private color: string = initialUiState.color;
  private lineMode = false;
  private snapOn = true;
  private spin = true;
  private grid = true;
  private _cam: CamState = "idle";

  private objs: Obj2D[] = [];
  private chains: Chain2D[] = [];
  private activeLine: Chain2D | null = null;
  private idSeq = 0;

  private cursor = { x: 0, y: 0 };
  private hovered: Obj2D | null = null;
  private selected: Obj2D | null = null;
  private dragging: Obj2D | null = null;
  private downPos = { x: 0, y: 0 };
  private pinchDownAt = 0;
  private pinchHeld = false;

  private zoom = 1;
  private toastT: ReturnType<typeof setTimeout> | undefined;
  private hudCache = {} as Record<keyof HudNodes, string>;

  // webcam / hand tracking
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private camStarting = false;
  private camRequest = 0;
  private camLive = false;
  private handRaf = 0;
  private lastVideoT = -1;
  private frames = 0;
  private fT = performance.now();
  private lostFrames = 0;
  private pinchState = false;
  private handActive = false;
  private anchor: { hx: number; hy: number; bx: number; by: number } | null =
    null;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    const ctx = opts.canvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "2D canvas is also unavailable in this browser — HANDLAB cannot render here. Try a standard Chrome, Edge, or Safari window.",
      );
    }
    this.ctx = ctx;
    this.sctx = opts.skel.getContext("2d");

    this.onResize();
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.onResize);
    opts.canvas.addEventListener("pointerdown", this.onCanvasPointerDown);

    const starters: ShapeName[] = ["cube", "sphere", "torus", "cone", "icosa"];
    const colors = ["#4da3ff", "#7c5cff", "#3ddc84", "#ffb224", "#ff5d7a"];
    for (let i = 0; i < 5; i++) {
      this.objs.push({
        id: this.idSeq++,
        s: starters[i],
        c: colors[i],
        x: (i - 2) * 1.3,
        y: Math.sin(i) * 0.6,
        rot: 0,
      });
    }
    this.setCount();
    this.emit();
    this.lastT = performance.now();
    this.loop(this.lastT);
  }

  dispose(): void {
    this.disposed = true;
    this.camRequest++;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.handRaf);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    this.opts.canvas.removeEventListener(
      "pointerdown",
      this.onCanvasPointerDown,
    );
    if (this.toastT) clearTimeout(this.toastT);
    try {
      this.landmarker?.close();
    } catch {
      /* noop */
    }
    this.landmarker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /* ---------- public UI API (mirrors HandLabEngine) ---------- */

  setShape(s: ShapeName): void {
    this.shape = s;
    this.emit();
  }
  setColor(c: string): void {
    this.color = c;
    this.emit();
  }
  setLineMode(on: boolean): void {
    this.lineMode = on;
    if (!on) this.activeLine = null;
    else this.toast("line mode (2D) — click to drop points");
    this.emit();
  }
  toggleSnap(): void {
    this.snapOn = !this.snapOn;
    this.emit();
  }
  clearLines(): void {
    this.chains.length = 0;
    this.activeLine = null;
    this.toast("lines cleared");
    this.emitMath();
  }
  undo(): void {
    const m = this.objs.pop();
    if (m) {
      if (this.selected === m) this.selected = null;
      this.setCount();
    }
  }
  clearAll(): void {
    this.objs.length = 0;
    this.selected = null;
    this.setCount();
  }
  recenter(): void {
    this.anchor = null;
    this.toast("recentered — hold hand still, move from here");
  }
  toggleSpin(): void {
    this.spin = !this.spin;
    this.emit();
  }
  toggleGrid(): void {
    this.grid = !this.grid;
    this.emit();
  }

  exportScene(): SceneData {
    return {
      version: 1,
      objects: this.objs.map((o) => ({
        s: o.s,
        c: o.c,
        p: [o.x, o.y, 0],
        r: [0, 0, o.rot],
      })),
      chains: this.chains.map((L) =>
        L.pts.map((p) => [p.x, p.y, 0] as [number, number, number]),
      ),
    };
  }

  importScene(data: SceneData): boolean {
    const bad = (): boolean => {
      this.toast("scene data invalid — nothing loaded");
      return false;
    };
    if (!data || data.version !== 1) return bad();
    if (
      !Array.isArray(data.objects) ||
      !Array.isArray(data.chains) ||
      data.objects.length > 500 ||
      data.chains.length > 100
    )
      return bad();
    for (const o of data.objects) {
      if (
        !o ||
        !SHAPES.includes(o.s) ||
        typeof o.c !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(o.c) ||
        !isNum3(o.p) ||
        !isNum3(o.r)
      )
        return bad();
    }
    for (const ch of data.chains) {
      if (!Array.isArray(ch) || ch.length > 200 || !ch.every(isNum3))
        return bad();
    }
    this.clearAll();
    this.clearLines();
    for (const o of data.objects) {
      this.objs.push({
        id: this.idSeq++,
        s: o.s,
        c: o.c,
        x: o.p[0],
        y: o.p[1],
        rot: o.r[2] ?? 0,
      });
    }
    for (const ch of data.chains) {
      if (ch.length === 0) continue;
      this.chains.push({
        id: this.idSeq++,
        pts: ch.map((p) => ({ x: p[0], y: p[1] })),
        closed: ch.length >= 3,
      });
    }
    this.setCount();
    this.emitMath();
    this.toast(
      `scene loaded — ${data.objects.length} objects, ${data.chains.length} chains`,
    );
    return true;
  }

  importSceneJson(text: string): boolean {
    try {
      return this.importScene(JSON.parse(text) as SceneData);
    } catch {
      this.toast("scene file is not valid JSON");
      return false;
    }
  }

  private static STORE_KEY = "handlab.scene.v1";

  saveToStorage(): void {
    try {
      localStorage.setItem(
        HandLabFallbackEngine.STORE_KEY,
        JSON.stringify(this.exportScene()),
      );
      this.toast("scene saved in this browser");
    } catch {
      this.toast("scene save failed (storage full?)");
    }
  }

  loadFromStorage(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(HandLabFallbackEngine.STORE_KEY);
    } catch {
      this.toast("saved scene unreadable");
      return;
    }
    if (!raw) {
      this.toast("no saved scene yet");
      return;
    }
    this.importSceneJson(raw);
  }

  exportPNG(): string | null {
    try {
      const url = this.opts.canvas.toDataURL("image/png");
      this.toast("photo captured (2D)");
      return url;
    } catch {
      this.toast("photo capture failed");
      return null;
    }
  }

  getMeasurements(): Measurement[] {
    return this.chains.map((L, i) => this.measure(L, i));
  }

  async enableWebcam(): Promise<void> {
    if (this.camStarting) return;
    this.camStarting = true;
    const req = ++this.camRequest;
    const stale = (): boolean => req !== this.camRequest;
    this.emitCam("loading");
    try {
      const { FilesetResolver, HandLandmarker } = await withTimeout(
        import("@mediapipe/tasks-vision"),
        30000,
        "vision module",
      );
      if (stale() || this.disposed) return;
      const files = await withTimeout(
        FilesetResolver.forVisionTasks(WASM_URL),
        30000,
        "wasm backend",
      );
      if (stale() || this.disposed) return;
      // CPU delegate: works without WebGL/GPU (the whole point of 2D mode)
      const nextLandmarker = await withTimeout(
        HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
        30000,
        "model load",
      );
      if (stale() || this.disposed) {
        try {
          nextLandmarker.close();
        } catch {
          /* noop */
        }
        return;
      }
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        }),
        30000,
        "camera",
      );
      if (stale() || this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        try {
          nextLandmarker.close();
        } catch {
          /* noop */
        }
        return;
      }
      try {
        this.landmarker?.close();
      } catch {
        /* noop */
      }
      this.stream?.getTracks().forEach((t) => t.stop());
      this.landmarker = nextLandmarker;
      this.stream = stream;
      const video = this.opts.video;
      video.srcObject = stream;
      await video.play();
      if (stale() || this.disposed) return;
      this.camLive = true;
      this.setText("t-model", "hand model: live (2D)");
      this.emitCam("live");
      this.toast("webcam live (2D) — move your index finger");
      this.opts.onCamLive?.();
      this.handLoop(performance.now());
    } catch (err) {
      if (stale()) return;
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      if (!this.camLive) {
        this.handActive = false;
        this.pinchState = false;
        this.pinchHeld = false;
        this.anchor = null;
        this.setText("t-model", "camera unavailable — mouse fallback");
        this.emitCam("idle");
        this.toast("camera/model failed: " + msg);
      } else {
        this.toast("webcam restart failed, keeping previous stream: " + msg);
        this.emitCam("live");
      }
    } finally {
      if (req === this.camRequest) this.camStarting = false;
    }
  }

  cancelWebcamLoad(): void {
    if (!this.camStarting) return;
    this.camRequest++;
    this.camStarting = false;
    if (!this.camLive) {
      this.setText("t-model", "camera unavailable — mouse fallback");
      this.emitCam("idle");
      this.toast("model load cancelled");
    } else {
      this.emitCam("live");
    }
  }

  /* ---------- internals ---------- */

  private emit(): void {
    this.opts.emit({
      shape: this.shape,
      color: this.color,
      lineMode: this.lineMode,
      snapOn: this.snapOn,
      spin: this.spin,
      grid: this.grid,
      cam: this._cam,
    });
  }

  private emitCam(s: CamState): void {
    this._cam = s;
    this.emit();
  }

  private toast(s: string): void {
    const t = this.opts.toast;
    t.textContent = s;
    t.style.opacity = "1";
    if (this.toastT) clearTimeout(this.toastT);
    this.toastT = setTimeout(() => {
      t.style.opacity = "0";
    }, 1400);
  }

  private setText(id: keyof HudNodes, txt: string): void {
    if (this.hudCache[id] !== txt) {
      this.hudCache[id] = txt;
      this.opts.hud[id].textContent = txt;
    }
  }

  private setCount(): void {
    this.opts.hud["t-count"].textContent = String(this.objs.length);
  }

  private emitMath(): void {
    this.opts.onMath?.(this.getMeasurements());
  }

  private measure(L: Chain2D, i: number): Measurement {
    const pts = L.pts.map(
      (p) => [p.x, p.y, 0] as [number, number, number],
    );
    let total = 0;
    const segs = Math.max(0, pts.length - 1 + (L.closed && pts.length > 2 ? 1 : 0));
    const n = pts.length;
    const loop = L.closed && n >= 3 ? [...pts, pts[0]] : pts;
    for (let k = 1; k < loop.length; k++) {
      total += Math.hypot(
        loop[k][0] - loop[k - 1][0],
        loop[k][1] - loop[k - 1][1],
      );
    }
    let area = 0;
    let cx = 0;
    let cy = 0;
    if (L.closed && n >= 3) {
      for (let k = 0; k < n; k++) {
        const [x0, y0] = pts[k];
        const [x1, y1] = pts[(k + 1) % n];
        const cr = x0 * y1 - x1 * y0;
        area += cr;
        cx += (x0 + x1) * cr;
        cy += (y0 + y1) * cr;
      }
      area /= 2;
      const denom = 6 * (area || 1e-9);
      cx /= denom;
      cy /= denom;
    } else if (n) {
      for (const p of pts) {
        cx += p[0];
        cy += p[1];
      }
      cx /= n;
      cy /= n;
    }
    const angles: number[] = [];
    if (n >= 3) {
      const seq = L.closed ? pts : pts;
      const lim = L.closed ? n : n - 2;
      for (let k = 0; k < lim; k++) {
        const a = seq[(k + n - 1) % n];
        const b = seq[k % n];
        const c = seq[(k + 1) % n];
        const v1 = [a[0] - b[0], a[1] - b[1]];
        const v2 = [c[0] - b[0], c[1] - b[1]];
        const d1 = Math.hypot(v1[0], v1[1]) || 1e-9;
        const d2 = Math.hypot(v2[0], v2[1]) || 1e-9;
        const cos = Math.min(
          1,
          Math.max(-1, (v1[0] * v2[0] + v1[1] * v2[1]) / (d1 * d2)),
        );
        angles.push((Math.acos(cos) * 180) / Math.PI);
      }
    }
    return {
      id: L.id || i,
      pts,
      segs,
      total,
      closed: L.closed,
      perimeter: L.closed ? total : 0,
      area: Math.abs(area),
      centroid: [cx, cy, 0],
      normal: [0, 0, 1],
      angles,
      minAngle: angles.length ? Math.min(...angles) : null,
      maxAngle: angles.length ? Math.max(...angles) : null,
    };
  }

  private view(): { s: number; ox: number; oy: number } {
    const cv = this.opts.canvas;
    const w = cv.clientWidth || window.innerWidth;
    const h = cv.clientHeight || window.innerHeight;
    const s = Math.min(w / WORLD_W, h / WORLD_H) * this.zoom;
    return { s: s * 60, ox: w / 2, oy: h / 2 };
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.opts.canvas.getBoundingClientRect();
    const px = clientX - r.left;
    const py = clientY - r.top;
    const w = r.width || 1;
    const h = r.height || 1;
    const base = Math.min(w / WORLD_W, h / WORLD_H) * this.zoom;
    return {
      x: (px - w / 2) / base,
      y: -(py - h / 2) / base,
    };
  }

  private toScreen(x: number, y: number): { x: number; y: number } {
    const r = this.opts.canvas.getBoundingClientRect();
    const w = r.width || 1;
    const h = r.height || 1;
    const base = Math.min(w / WORLD_W, h / WORLD_H) * this.zoom;
    return { x: w / 2 + x * base, y: h / 2 - y * base };
  }

  private nearestObj(x: number, y: number, r = 0.5): Obj2D | null {
    let best: Obj2D | null = null;
    let bd = r;
    for (const o of this.objs) {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private snapPt(p: { x: number; y: number }): { x: number; y: number } {
    if (!this.snapOn) return p;
    for (const L of this.chains) {
      for (const q of L.pts) {
        if (Math.hypot(q.x - p.x, q.y - p.y) < 0.3) return { ...q };
      }
    }
    for (const o of this.objs) {
      if (Math.hypot(o.x - p.x, o.y - p.y) < 0.3)
        return { x: o.x, y: o.y };
    }
    return p;
  }

  private onResize = (): void => {
    const cv = this.opts.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // NOTE: #scene is position:fixed;inset:0, but a canvas is a *replaced*
    // element, so inset alone keeps its 300x150 intrinsic box. The WebGL
    // engine avoids this via renderer.setSize (which sets style w/h).
    // Mirror that here or the 2D scene collapses into the top-left corner.
    const w = window.innerWidth;
    const h = window.innerHeight;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.handActive) return; // hand drives the cursor when live
    const p = this.toWorld(e.clientX, e.clientY);
    this.cursor.x = p.x;
    this.cursor.y = p.y;
    if (this.dragging) {
      this.dragging.x = p.x;
      this.dragging.y = p.y;
    } else {
      this.hovered = this.nearestObj(p.x, p.y, 0.5);
      document.body.style.cursor = this.hovered ? "pointer" : "default";
    }
  };

  private onCanvasPointerDown = (e: PointerEvent): void => {
    const p = this.toWorld(e.clientX, e.clientY);
    this.cursor.x = p.x;
    this.cursor.y = p.y;
    this.downPos = { ...p };
    this.pinchDownAt = performance.now();
    this.pinchHeld = true;
    if (this.lineMode) {
      this.placeLinePoint(p);
      this.pinchHeld = false;
      return;
    }
    const hit = this.nearestObj(p.x, p.y, 0.5);
    if (hit) {
      this.selected = hit;
      this.dragging = hit;
    } else {
      const o: Obj2D = {
        id: this.idSeq++,
        s: this.shape,
        c: this.color,
        x: p.x,
        y: p.y,
        rot: 0,
      };
      this.objs.push(o);
      this.selected = o;
      this.setCount();
      this.toast("placed " + this.shape + " (2D)");
    }
  };

  private onPointerUp = (): void => {
    this.pinchHeld = false;
    this.dragging = null;
  };

  private onWheel = (e: WheelEvent): void => {
    this.zoom = Math.min(2.5, Math.max(0.6, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "l" || e.key === "L") this.setLineMode(!this.lineMode);
    else if (e.key === "r" || e.key === "R") this.recenter();
    else if (e.key === "Escape") {
      this.activeLine = null;
      this.dragging = null;
    } else if ((e.key === "Delete" || e.key === "Backspace") && this.selected) {
      this.objs.splice(this.objs.indexOf(this.selected), 1);
      this.selected = null;
      this.setCount();
    }
  };

  private placeLinePoint(raw: { x: number; y: number }): void {
    const p = this.snapPt(raw);
    if (!this.activeLine) {
      this.activeLine = { id: this.idSeq++, pts: [p], closed: false };
      this.chains.push(this.activeLine);
    } else {
      const first = this.activeLine.pts[0];
      if (
        this.activeLine.pts.length >= 3 &&
        Math.hypot(first.x - p.x, first.y - p.y) < 0.3
      ) {
        this.activeLine.closed = true;
        this.activeLine = null;
      } else {
        this.activeLine.pts.push(p);
      }
    }
    this.emitMath();
  }

  /* ---------- hand tracking (simplified 2D drive) ---------- */

  private handLoop = (now: number): void => {
    if (this.disposed) return;
    this.handRaf = requestAnimationFrame(this.handLoop);
    this.frames++;
    if (now - this.fT > 1000) {
      this.setText("t-fps", this.frames + " fps (2D)");
      this.frames = 0;
      this.fT = now;
    }
    const video = this.opts.video;
    if (
      !this.landmarker ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoT
    )
      return;
    this.lastVideoT = video.currentTime;
    let res: {
      landmarks?: NormalizedLandmark[][];
      handednesses?: { categoryName?: string }[][];
    };
    try {
      res = this.landmarker.detectForVideo(video, now) as unknown as typeof res;
    } catch {
      return;
    }
    const hands = res.landmarks ?? [];
    this.drawSkel(hands, this.pinchState);
    if (!hands.length) {
      if (++this.lostFrames >= 4) {
        this.handActive = false;
        this.pinchState = false;
        this.pinchHeld = false;
        this.anchor = null;
        this.opts.hud["d-hand"].className = "dot off";
        this.opts.hud["t-hand"].textContent = "none";
        this.setText("t-pinch", "waiting");
      }
      return;
    }
    this.lostFrames = 0;
    this.handActive = true;
    this.opts.hud["d-hand"].className = "dot on";
    this.opts.hud["t-hand"].textContent =
      hands.length + (hands.length > 1 ? " hands" : " hand");
    this.drive(hands[0]);
  };

  private drive(lm: NormalizedLandmark[]): void {
    const tip = lm[8];
    const thumb = lm[4];
    if (!this.anchor) {
      this.anchor = {
        hx: 1 - tip.x,
        hy: tip.y,
        bx: this.cursor.x,
        by: this.cursor.y,
      };
    }
    const a = this.anchor;
    const gain = 6;
    this.cursor.x = a.bx + ((1 - tip.x) - a.hx) * gain;
    this.cursor.y = a.by - (tip.y - a.hy) * gain;
    this.cursor.x = Math.max(-WORLD_W / 2, Math.min(WORLD_W / 2, this.cursor.x));
    this.cursor.y = Math.max(-WORLD_H / 2, Math.min(WORLD_H / 2, this.cursor.y));

    const d = Math.hypot(thumb.x - tip.x, thumb.y - tip.y);
    if (!this.pinchState && d < 0.045) {
      this.pinchState = true;
      this.setText("t-pinch", "pinch");
      // treat as click at cursor
      if (this.lineMode) this.placeLinePoint({ ...this.cursor });
      else {
        const hit = this.nearestObj(this.cursor.x, this.cursor.y, 0.5);
        if (hit) {
          this.selected = hit;
          this.dragging = hit;
        } else {
          const o: Obj2D = {
            id: this.idSeq++,
            s: this.shape,
            c: this.color,
            x: this.cursor.x,
            y: this.cursor.y,
            rot: 0,
          };
          this.objs.push(o);
          this.selected = o;
          this.setCount();
        }
      }
    } else if (this.pinchState && d > 0.065) {
      this.pinchState = false;
      this.dragging = null;
      this.setText("t-pinch", "open");
      this.emitMath();
    }
    if (this.dragging) {
      this.dragging.x = this.cursor.x;
      this.dragging.y = this.cursor.y;
    }
    this.hovered = this.nearestObj(this.cursor.x, this.cursor.y, 0.5);
    this.setText(
      "t-xyz",
      `${this.cursor.x.toFixed(1)}, ${this.cursor.y.toFixed(1)}, 0.0`,
    );
  }

  private drawSkel(all: NormalizedLandmark[][] | undefined, pinched = false): void {
    if (!this.sctx) return;
    const g = this.sctx;
    g.clearRect(0, 0, 248, 140);
    (all || []).forEach((lm) => {
      g.strokeStyle = pinched
        ? "rgba(61,220,132,.95)"
        : "rgba(77,163,255,.9)";
      g.lineWidth = 1.4;
      g.beginPath();
      EDGES.forEach(([a, b]) => {
        g.moveTo((1 - lm[a].x) * 248, lm[a].y * 140);
        g.lineTo((1 - lm[b].x) * 248, lm[b].y * 140);
      });
      g.stroke();
      g.fillStyle = pinched ? "#3ddc84" : "#9cc6ff";
      lm.forEach((p, i) => {
        if (i === 0 || i === 4 || i === 8 || i === 12 || i === 16 || i === 20) {
          g.beginPath();
          g.arc((1 - p.x) * 248, p.y * 140, i === 8 || i === 4 ? 3.2 : 2.2, 0, 7);
          g.fill();
        }
      });
    });
  }

  /* ---------- render ---------- */

  private loop = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (this.spin) {
      for (const o of this.objs) o.rot += dt * 0.6;
    }
    this.draw();
    if (!this.handActive) {
      this.setText(
        "t-xyz",
        `${this.cursor.x.toFixed(1)}, ${this.cursor.y.toFixed(1)}, 0.0`,
      );
    }
    this.setText("t-z", "0.0");
  };

  private draw(): void {
    const cv = this.opts.canvas;
    const g = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (cv.style.width !== `${w}px` || cv.style.height !== `${h}px`) {
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
    }
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#08090d";
    g.fillRect(0, 0, w, h);

    if (this.grid) {
      const step = 40 * this.zoom;
      g.strokeStyle = "rgba(44,58,85,.5)";
      g.lineWidth = 1;
      g.beginPath();
      for (let x = w / 2 % step; x < w; x += step) {
        g.moveTo(x, 0);
        g.lineTo(x, h);
      }
      for (let y = h / 2 % step; y < h; y += step) {
        g.moveTo(0, y);
        g.lineTo(w, y);
      }
      g.stroke();
    }

    // bounds
    const tl = this.toScreen(-WORLD_W / 2, WORLD_H / 2);
    const br = this.toScreen(WORLD_W / 2, -WORLD_H / 2);
    g.strokeStyle = "#2a3350";
    g.lineWidth = 1.5;
    g.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // chains
    for (const L of this.chains) {
      if (!L.pts.length) continue;
      g.strokeStyle = L.closed ? "#3ddc84" : "#ffb224";
      g.lineWidth = 2;
      g.beginPath();
      L.pts.forEach((p, i) => {
        const s = this.toScreen(p.x, p.y);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      });
      if (L.closed) g.closePath();
      g.stroke();
      g.fillStyle = "#ffd76a";
      for (const p of L.pts) {
        const s = this.toScreen(p.x, p.y);
        g.beginPath();
        g.arc(s.x, s.y, 4, 0, 7);
        g.fill();
      }
    }

    // objects
    for (const o of this.objs) {
      const s = this.toScreen(o.x, o.y);
      const base = Math.min(w / WORLD_W, h / WORLD_H) * this.zoom;
      const r = base * 0.32;
      this.paintShape(g, o.s, s.x, s.y, r, o.c, o.rot);
      if (o === this.hovered || o === this.selected) {
        g.strokeStyle = o === this.selected ? "#ff5d7a" : "#ffe27a";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(s.x, s.y, r + 8, 0, 7);
        g.stroke();
      }
    }

    // cursor
    const c = this.toScreen(this.cursor.x, this.cursor.y);
    g.strokeStyle = this.pinchHeld ? "#3ddc84" : "#4da3ff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c.x, c.y, 10, 0, 7);
    g.stroke();
    g.fillStyle = this.pinchHeld ? "#3ddc84" : "#4da3ff";
    g.beginPath();
    g.arc(c.x, c.y, 3.5, 0, 7);
    g.fill();
    g.strokeStyle = "rgba(77,163,255,.5)";
    g.beginPath();
    g.moveTo(c.x - 16, c.y);
    g.lineTo(c.x + 16, c.y);
    g.moveTo(c.x, c.y - 16);
    g.lineTo(c.x, c.y + 16);
    g.stroke();
  }

  private paintShape(
    g: CanvasRenderingContext2D,
    s: ShapeName,
    x: number,
    y: number,
    r: number,
    color: string,
    rot: number,
  ): void {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = color;
    g.strokeStyle = "rgba(0,0,0,.4)";
    g.lineWidth = 1.5;
    switch (s) {
      case "cube":
        g.fillRect(-r, -r, r * 2, r * 2);
        g.strokeRect(-r, -r, r * 2, r * 2);
        break;
      case "sphere":
        g.beginPath();
        g.arc(0, 0, r, 0, 7);
        g.fill();
        g.stroke();
        break;
      case "cone":
      case "tetra":
        g.beginPath();
        g.moveTo(0, -r);
        g.lineTo(r * 0.9, r * 0.8);
        g.lineTo(-r * 0.9, r * 0.8);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      case "torus":
      case "knot":
        g.lineWidth = r * 0.45;
        g.strokeStyle = color;
        g.beginPath();
        g.arc(0, 0, r * 0.7, 0, 7);
        g.stroke();
        break;
      case "cylinder":
        g.beginPath();
        (g as CanvasRenderingContext2D).roundRect(-r, -r * 0.7, r * 2, r * 1.4, 6);
        g.fill();
        g.stroke();
        break;
      case "icosa":
      case "octa":
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
        g.stroke();
        break;
      case "capsule":
        g.beginPath();
        (g as CanvasRenderingContext2D).roundRect(-r * 0.6, -r, r * 1.2, r * 2, r * 0.6);
        g.fill();
        g.stroke();
        break;
    }
    g.restore();
  }
}
