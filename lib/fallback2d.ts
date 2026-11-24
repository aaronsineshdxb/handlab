import { onReducedMotionChange, prefersReducedMotion } from "./motion";
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
  type ClipAxis,
  type EngineOpts,
  type HudNodes,
  type Measurement,
  type SceneData,
  type ShapeName,
  type StudioMaterial,
  type UiState,
} from "./engine";
import { Sw3dRenderer, parseHexColor } from "./sw3d";
import type { SceneSnap } from "./lessons/checks";
import { pythagorasOf } from "./geometry/chainMath";
import { shouldDetect } from "./handRate";
import {
  SCALE_MAX,
  SCALE_MIN,
  interHandDist,
  pinchMid,
  scaleFactorForDist,
} from "./twoHandScale";
import {
  sceneThemeNow,
  ACCENTS,
  SCENE_THEMES,
  currentTheme,
  isAccentName,
  isValidCustomHex,
  onThemeChange,
} from "./theme";

export { SHAPES, initialUiState };
export type { CamState, EngineOpts, HudNodes, Measurement, SceneData, ShapeName, UiState };

const SOFTWARE_WEBGL_RE =
  /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render|mesa offscreen|angle.*swiftshader/i;

/** True when WebGL is backed by a slow CPU software rasterizer (SwiftShader,
 *  llvmpipe, WARP) where the Rust/WASM 3D engine is significantly faster. */
export function isSoftwareWebGL(): boolean {
  try {
    const cv = document.createElement("canvas");
    const gl =
      (cv.getContext("webgl2") as WebGLRenderingContext | null) ??
      (cv.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl) return false;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "")
      : String(gl.getParameter(gl.RENDERER) ?? "");
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return SOFTWARE_WEBGL_RE.test(renderer);
  } catch {
    return false;
  }
}

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

// Supply-chain hardening (audit §2.1): same vendored assets as lib/engine.ts.
// See the comment there for re-vendoring + checksum verification steps.
const WASM_URL = "/wasm";
const MODEL_URL = "/models/hand_landmarker.task";

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
  /** Uniform scale (two-hand pinch). Defaults to 1 for legacy objects. */
  k: number;
}

interface Chain2D {
  id: number;
  pts: { x: number; y: number }[];
  closed: boolean;
}

// Audit §3.1: see lib/engine.ts — same bound for the 2D fallback importer.
const SCENE_COORD_LIMIT = 100;

function isNum3(a: unknown): a is [number, number, number] {
  return (
    Array.isArray(a) &&
    a.length === 3 &&
    a.every(
      (v) =>
        typeof v === "number" &&
        Number.isFinite(v) &&
        Math.abs(v) <= SCENE_COORD_LIMIT,
    )
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
  private spin = false;
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

  // Zoom disabled: view scale stays fixed at 1.
  private zoom = 1;
  private toastT: ReturnType<typeof setTimeout> | undefined;
  private hudCache = {} as Record<keyof HudNodes, string>;
  // Perf: canvas is position:fixed inset:0 with style w/h synced to the
  // viewport in onResize, so getBoundingClientRect() is stable between
  // resizes. Cache it (and the derived world scale + theme palette) instead
  // of forcing layout + style recalc per object per frame.
  private viewW = 0;
  private viewH = 0;
  private viewBase = 1;
  private themeOff: (() => void) | null = null;
  private reducedMotion = prefersReducedMotion();
  private motionOff: (() => void) | null = null;
  // Rust/WASM software 3D rasterizer (loaded async, zero WebGL required).
  private sw3d: Sw3dRenderer | null = null;
  private wireframe = false;
  private matMode: StudioMaterial = "standard";
  private detail = 1;
  private clipAxis: ClipAxis = null;
  private clipPos = 0;
  private camYaw = 0.22;
  private camPitch = 0.26;
  private camDist = 9.0;
  private orbiting = false;
  private pendingOrbit = false;
  private orbitStartX = 0;
  private orbitStartY = 0;
  private orbitLastX = 0;
  private orbitLastY = 0;
  private lastSw3dSig = "";
  private cachedC: {
    bg: string;
    gridFaint: string;
    grid: string;
    snap: string;
    line: string;
    vertex: string;
    unselected: string;
    cursor: string;
    pinch: string;
    halo: string;
  } | null = null;

  // webcam / hand tracking
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private camStarting = false;
  private camRequest = 0;
  private camLive = false;
  private handRaf = 0;
  private lastVideoT = -1;
  private lastDetectAt = -Infinity;
  private frames = 0;
  private fT = performance.now();
  private lostFrames = 0;
  private pinchState = false;
  private pinchState2 = false;
  private handActive = false;
  private anchor: { hx: number; hy: number; bx: number; by: number } | null =
    null;
  // two-hand pinch-scale (mirrors the WebGL engine gesture)
  private twoHandScaling = false;
  private scaleTarget: Obj2D | null = null;
  private scaleStartK = 1;
  private pinchDist0 = 0;
  private pinchDistSmooth = 0;
  private scaleFactor = 1;

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
    this.refreshTheme();
    this.themeOff = onThemeChange(() => this.refreshTheme());
    this.motionOff = onReducedMotionChange((reduced) => {
      this.reducedMotion = reduced;
      if (reduced && this.spin) {
        this.spin = false;
        this.emit();
      }
    });
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    // Zoom disabled: no wheel listener.
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    opts.canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
    opts.canvas.addEventListener("contextmenu", this.onContextMenu);
    opts.canvas.addEventListener("wheel", this.onWheel, { passive: false });

    // Load the Rust/WASM 3D software rasterizer asynchronously (~59KB).
    // Until it resolves, draw() uses the instant 2D canvas path so first paint
    // is never blocked.
    void Sw3dRenderer.load()
      .then((renderer) => {
        if (this.disposed) return;
        this.sw3d = renderer;
        this.syncSw3dTheme();
        this.syncSw3dFlags();
        renderer.setCamera(this.camYaw, this.camPitch, this.camDist);
      })
      .catch(() => {
        /* stay on 2D canvas fallback if WASM fails to load */
      });

    // Start with an empty scene — user places shapes.
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
    this.themeOff?.();
    this.themeOff = null;
    this.motionOff?.();
    this.motionOff = null;
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    // No wheel listener (zoom disabled) — nothing to remove.
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    this.opts.canvas.removeEventListener(
      "pointerdown",
      this.onCanvasPointerDown,
    );
    this.opts.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.opts.canvas.removeEventListener("wheel", this.onWheel);
    this.sw3d = null;
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
  /** Place the current shape at the live cursor — works in any mode,
   *  including line mode, so solids stay creatable while drawing chains. */
  placeCurrentShape(): void {
    this.placeShapeAt({ x: this.cursor.x, y: this.cursor.y });
  }
  /** Showcase first paint: hero solid at the world centre (API parity with
   *  the WebGL engine's placeCenter, so the landing stage isn't empty). */
  placeCenter(): void {
    this.placeShapeAt({ x: 0, y: 0 });
  }
  toggleSpin(): void {
    this.spin = !this.spin;
    this.emit();
  }
  toggleGrid(): void {
    this.grid = !this.grid;
    this.emit();
  }
  /** Depth AI needs the WebGL engine — no-op here, kept for API parity. */
  async setDepthEnabled(on: boolean): Promise<void> {
    void on;
    this.toast("depth AI needs WebGL mode — unavailable in 2D fallback");
  }

  /** The two-hand ruler measures in the WebGL scene — no-ops here, kept for
   *  API parity so the drawer chip stays inert in 2D fallback. */
  toggleRuler(): boolean {
    return false;
  }
  setRulerSpanCm(_cm: number): void {}

  exportScene(): SceneData {
    return {
      version: 1,
      objects: this.objs.map((o) => ({
        s: o.s,
        c: o.c,
        p: [o.x, o.y, 0],
        r: [0, 0, o.rot],
        k: [o.k, o.k, 1],
      })),
      chains: this.chains.map((L) =>
        L.pts.map((p) => [p.x, p.y, 0] as [number, number, number]),
      ),
    };
  }

  /** Check-only snapshot without color/rotation fields (API parity with the
   *  WebGL engine's exportCheckSnap so HandLab calls one method on either). */
  exportCheckSnap(
    quizAnswers: Record<string, number> = {},
  ): SceneSnap {
    return {
      objects: this.objs.map((o) => ({ s: o.s })),
      chains: this.chains.map((L) =>
        L.pts.map((p) => [p.x, p.y, 0] as [number, number, number]),
      ),
      quizAnswers,
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
        k: o.k?.[0] && Number.isFinite(o.k[0]) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, o.k[0])) : 1,
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
      // Start webcam permission/hardware warm-up in parallel with MediaPipe WASM/model load.
      const streamPromise = withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: "user",
            frameRate: { ideal: 30, max: 30 },
          },
        }),
        30000,
        "camera",
      );
      const modelPromise = (async () => {
        const { FilesetResolver, HandLandmarker } = await withTimeout(
          import("@mediapipe/tasks-vision"),
          30000,
          "vision module",
        );
        if (stale() || this.disposed) return null;
        const files = await withTimeout(
          FilesetResolver.forVisionTasks(WASM_URL),
          30000,
          "wasm backend",
        );
        if (stale() || this.disposed) return null;
        // CPU delegate: works without WebGL/GPU (the whole point of 2D mode)
        return withTimeout(
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
      })();
      let nextLandmarker: HandLandmarker | null = null;
      let stream: MediaStream | null = null;
      const [modelRes, streamRes] = await Promise.allSettled([
        modelPromise,
        streamPromise,
      ]);
      if (modelRes.status === "fulfilled") nextLandmarker = modelRes.value;
      if (streamRes.status === "fulfilled") stream = streamRes.value;
      if (modelRes.status === "rejected" || streamRes.status === "rejected") {
        stream?.getTracks().forEach((t) => t.stop());
        try {
          nextLandmarker?.close();
        } catch {
          /* noop */
        }
        throw modelRes.status === "rejected"
          ? modelRes.reason
          : (streamRes as PromiseRejectedResult).reason;
      }
      if (!nextLandmarker || !stream) {
        stream?.getTracks().forEach((t) => t.stop());
        try {
          nextLandmarker?.close();
        } catch {
          /* noop */
        }
        return;
      }
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
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      try { this.landmarker?.close(); } catch {}
      this.landmarker = null;
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
      depthOn: false,
      depth: "2D fallback — unavailable",
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
    this.opts.onScene?.();
  }

  private emitMath(): void {
    this.opts.onMath?.(this.getMeasurements());
    this.opts.onScene?.();
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
    if (L.closed && n >= 3) {
      for (let k = 0; k < n; k++) {
        const a = pts[(k + n - 1) % n];
        const b = pts[k];
        const c = pts[(k + 1) % n];
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
    } else if (!L.closed && n >= 3) {
      for (let k = 1; k + 1 < n; k++) {
        const a = pts[k - 1];
        const b = pts[k];
        const c = pts[k + 1];
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
    // Mirrors lib/engine.ts getMeasurements: sum of interior angles for
    // closed loops, Pythagoras triple data for open 3-point chains.
    const angleSum =
      L.closed && angles.length > 0 ? angles.reduce((s, a) => s + a, 0) : null;
    const pythag = !L.closed ? pythagorasOf(pts) : null;
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
      angleSum,
      pythag,
    };
  }

  private view(): { s: number; ox: number; oy: number } {
    const cv = this.opts.canvas;
    const w = cv.clientWidth || window.innerWidth;
    const h = cv.clientHeight || window.innerHeight;
    const s = Math.min(w / WORLD_W, h / WORLD_H) * this.zoom;
    return { s: s * 60, ox: w / 2, oy: h / 2 };
  }

  private updateViewCache(): void {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.viewW = w;
    this.viewH = h;
    this.viewBase = Math.min(w / WORLD_W, h / WORLD_H) * this.zoom;
  }

  /** Wireframe overlay for placed solids (Rust/WASM 3D Studio). */
  setWireframe(on: boolean): void {
    this.wireframe = on;
    this.syncSw3dFlags();
  }

  /** Material shading mode (standard / clay / flat) in Rust/WASM 3D. */
  setMaterialMode(mode: StudioMaterial): void {
    this.matMode = mode;
    this.syncSw3dFlags();
  }

  /** Tessellation level 0-2 in Rust/WASM 3D. */
  setDetail(level: number): void {
    this.detail = Math.min(2, Math.max(0, Math.round(level)));
    this.syncSw3dFlags();
  }

  /** Cross-section slicing plane in Rust/WASM 3D. */
  setClip(axis: ClipAxis, pos: number): void {
    this.clipAxis = axis;
    this.clipPos = Number.isFinite(pos) ? Math.min(3, Math.max(-3, pos)) : 0;
    this.syncSw3dFlags();
  }

  /** Match WebGL camera distance framing (used by ShowcaseLab hero paint). */
  setCameraDistance(d: number): void {
    if (!Number.isFinite(d)) return;
    this.camDist = Math.max(3.2, Math.min(16, d));
    this.sw3d?.setCamera(this.camYaw, this.camPitch, this.camDist);
  }

  private onWheel = (e: WheelEvent): void => {
    if (!this.sw3d) return;
    e.preventDefault();
    this.camDist = Math.max(3.2, Math.min(16, this.camDist + e.deltaY * 0.006));
    this.sw3d.setCamera(this.camYaw, this.camPitch, this.camDist);
  };

  private syncSw3dFlags(): void {
    this.sw3d?.setFlags({
      showGrid: this.grid,
      wireframe: this.wireframe,
      matMode: this.matMode,
      detail: this.detail,
      clipAxis: this.clipAxis,
      clipPos: this.clipPos,
    });
  }

  private syncSw3dTheme(): void {
    if (!this.sw3d) return;
    const t = SCENE_THEMES[currentTheme()];
    this.sw3d.setTheme(t.bg, t.gridMain, t.gridCenter, t.bounds);
  }

  private onContextMenu = (e: MouseEvent): void => {
    if (this.sw3d) e.preventDefault();
  };

  private refreshTheme(): void {
    this.syncSw3dTheme();
    // Mirrors sceneAccentFor() in lib/theme.ts — keep the preset/custom
    // mapping in sync if that function changes.
    const dark = document.documentElement.dataset.theme === "dark";
    const rawScheme = document.documentElement.dataset.accent ?? "teal";
    const scheme = isAccentName(rawScheme) ? rawScheme : "teal";
    let accentNum: number;
    if (scheme === "custom") {
      const inline = document.documentElement.style
        .getPropertyValue("--color-accent")
        .trim();
      accentNum = isValidCustomHex(inline)
        ? parseInt(inline.slice(1), 16)
        : dark
          ? ACCENTS.teal.dark.scene
          : ACCENTS.teal.light.scene;
    } else {
      accentNum = dark ? ACCENTS[scheme].dark.scene : ACCENTS[scheme].light.scene;
    }
    const accentCss = `#${accentNum.toString(16).padStart(6, "0")}`;
    const ar = (accentNum >> 16) & 255;
    const ag = (accentNum >> 8) & 255;
    const ab = accentNum & 255;
    this.cachedC = {
      bg: dark ? "#11100E" : "#FCFCF9",
      gridFaint: dark ? "rgba(237,233,226,.10)" : "rgba(39,37,30,.12)",
      grid: dark ? "#2A2721" : "#CFC9B8",
      snap: dark ? "#3ddc84" : "#2E7D46",
      line: dark ? "#ffb224" : "#B26A00",
      vertex: dark ? "#ffd76a" : "#9B6C22",
      unselected: dark ? "#ffe27a" : "#9B6C22",
      cursor: accentCss,
      pinch: dark ? "#3ddc84" : "#2E7D46",
      halo: `rgba(${ar},${ag},${ab},${dark ? ".4" : ".35"})`,
    };
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    // Cached viewport (see updateViewCache): canvas is fullscreen fixed.
    const w = this.viewW || window.innerWidth || 1;
    const h = this.viewH || window.innerHeight || 1;
    // When the Rust/WASM 3D engine is active, intersect the perspective camera
    // ray with the z=0 plane so picking/dragging aligns at any orbit angle.
    if (this.sw3d) {
      const hit = this.sw3d.unprojectZ0(clientX / w, clientY / h);
      if (hit) return hit;
    }
    const base = this.viewBase || Math.min(w / WORLD_W, h / WORLD_H);
    const px = clientX;
    const py = clientY;
    // Canvas origin is at viewport origin (fixed inset:0, same size).
    return {
      x: (px - w / 2) / base,
      y: -(py - h / 2) / base,
    };
  }

  private toScreen(x: number, y: number): { x: number; y: number } {
    const w = this.viewW || window.innerWidth || 1;
    const h = this.viewH || window.innerHeight || 1;
    const base = this.viewBase || Math.min(w / WORLD_W, h / WORLD_H);
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

  private static SNAP_R = 0.3;

  private findSnap(p: { x: number; y: number }): {
    x: number;
    y: number;
    chain: Chain2D | null;
    seg: number;
  } | null {
    if (!this.snapOn) return null;
    let best: { x: number; y: number; chain: Chain2D | null; seg: number } | null =
      null;
    let bd = HandLabFallbackEngine.SNAP_R;
    // pass 1: existing vertices (preferred — chains share the exact point)
    for (const L of this.chains) {
      for (const q of L.pts) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) {
          bd = d;
          best = { x: q.x, y: q.y, chain: L, seg: -1 };
        }
      }
    }
    // pass 2: shape centers
    if (!best) {
      for (const o of this.objs) {
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < bd) {
          bd = d;
          best = { x: o.x, y: o.y, chain: null, seg: -1 };
        }
      }
    }
    // pass 3: anywhere along another chain's segments, so tapping mid-line
    // connects to it (the caller drops a vertex there for a true junction)
    for (const L of this.chains) {
      if (L === this.activeLine || L.pts.length < 2) continue;
      const n = L.pts.length;
      const segs = L.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = L.pts[i];
        const b = L.pts[(i + 1) % n];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const len2 = abx * abx + aby * aby;
        if (len2 < 1e-9) continue;
        let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = a.x + abx * t;
        const cy = a.y + aby * t;
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < bd) {
          bd = d;
          best = { x: cx, y: cy, chain: L, seg: i };
        }
      }
    }
    return best;
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
    this.updateViewCache();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.pendingOrbit && this.sw3d && !this.orbiting) {
      if (Math.hypot(e.clientX - this.orbitStartX, e.clientY - this.orbitStartY) > 4) {
        this.orbiting = true;
        this.pinchHeld = false;
        document.body.style.cursor = "grabbing";
      }
    }
    if (this.orbiting && this.sw3d) {
      const dx = e.clientX - this.orbitLastX;
      const dy = e.clientY - this.orbitLastY;
      this.orbitLastX = e.clientX;
      this.orbitLastY = e.clientY;
      this.camYaw -= dx * 0.008;
      this.camPitch = Math.max(-1.25, Math.min(1.25, this.camPitch + dy * 0.008));
      this.sw3d.setCamera(this.camYaw, this.camPitch, this.camDist);
      return;
    }
    if (this.handActive) return; // hand drives the cursor when live
    const p = this.toWorld(e.clientX, e.clientY);
    this.cursor.x = p.x;
    this.cursor.y = p.y;
    if (this.dragging) {
      this.dragging.x = p.x;
      this.dragging.y = p.y;
    } else {
      this.hovered = this.nearestObj(p.x, p.y, 0.5);
      document.body.style.cursor = this.hovered ? "pointer" : this.sw3d ? "grab" : "default";
    }
  };

  private onCanvasPointerDown = (e: PointerEvent): void => {
    if (this.sw3d && (e.button === 2 || e.button === 1 || e.altKey)) {
      this.orbiting = true;
      this.orbitLastX = e.clientX;
      this.orbitLastY = e.clientY;
      document.body.style.cursor = "grabbing";
      return;
    }
    const p = this.toWorld(e.clientX, e.clientY);
    this.cursor.x = p.x;
    this.cursor.y = p.y;
    this.downPos = { ...p };
    this.pinchDownAt = performance.now();
    this.pinchHeld = true;
    if (this.lineMode && !e.shiftKey) {
      const hit = this.nearestObj(p.x, p.y, 0.5);
      if (hit) {
        // Press started on a solid — grab it so shapes stay movable
        // without leaving line mode. Empty space still drops line points;
        // Shift+click forces shape creation (see below).
        this.selected = hit;
        this.dragging = hit;
        return;
      }
      this.placeLinePoint(p);
      this.pinchHeld = false;
      return;
    }
    if (this.lineMode && e.shiftKey) {
      // Shift+click forces shape creation even in line mode.
      this.placeShapeAt(p);
      this.pinchHeld = false;
      return;
    }
    const hit = this.nearestObj(p.x, p.y, 0.5);
    if (hit) {
      this.selected = hit;
      this.dragging = hit;
    } else if (this.sw3d) {
      // In Rust/WASM 3D mode, left-dragging empty space orbits the camera
      // (matching Three.js OrbitControls), while a quick click places a shape.
      this.pendingOrbit = true;
      this.orbitStartX = e.clientX;
      this.orbitStartY = e.clientY;
      this.orbitLastX = e.clientX;
      this.orbitLastY = e.clientY;
    } else {
      this.placeShapeAt(p);
    }
  };

  private onPointerUp = (): void => {
    if (this.pendingOrbit && !this.orbiting) {
      this.placeShapeAt(this.downPos);
    }
    this.pendingOrbit = false;
    this.orbiting = false;
    this.pinchHeld = false;
    this.dragging = null;
    document.body.style.cursor = this.hovered ? "pointer" : this.sw3d ? "grab" : "default";
  };

  /** Shared shape spawn (mouse Shift+click, keyboard P, toolbar place). */
  private placeShapeAt(p: { x: number; y: number }): void {
    const o: Obj2D = {
      id: this.idSeq++,
      s: this.shape,
      c: this.color,
      x: p.x,
      y: p.y,
      rot: 0,
      k: 1,
    };
    this.objs.push(o);
    this.selected = o;
    this.setCount();
    this.toast("placed " + this.shape + " (2D)");
  }

  // Zoom disabled: view scale stays fixed — wheel does nothing.


  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    if (e.key === "l" || e.key === "L") this.setLineMode(!this.lineMode);
    else if (e.key === "r" || e.key === "R") this.recenter();
    else if (e.key === "p" || e.key === "P") this.placeCurrentShape();
    else if (e.key === "Escape") {
      this.activeLine = null;
      this.dragging = null;
    } else if ((e.key === "Delete" || e.key === "Backspace") && this.selected) {
      const idx = this.objs.indexOf(this.selected);
      if (idx !== -1) this.objs.splice(idx, 1);
      this.selected = null;
      this.setCount();
    }
  };

  private placeLinePoint(raw: { x: number; y: number }): void {
    const s = this.findSnap(raw);
    // Tapping mid-way along another chain connects to it: drop a real vertex
    // into that chain at the tap point so both share the point.
    let connected = false;
    if (s && s.chain && s.seg >= 0 && s.chain !== this.activeLine) {
      s.chain.pts.splice(s.seg + 1, 0, { x: s.x, y: s.y });
      connected = true;
    }
    const p = s ? { x: s.x, y: s.y } : raw;
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
    if (connected) this.toast("connected to line");
    this.emitMath();
  }

  /* ---------- hand tracking (simplified 2D drive) ---------- */

  private handLoop = (now: number): void => {
    if (this.disposed) return;
    this.handRaf = requestAnimationFrame(this.handLoop);
    if (document.hidden) return;
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
      video.currentTime === this.lastVideoT ||
      !shouldDetect(now, this.lastDetectAt)
    )
      return;
    this.lastVideoT = video.currentTime;
    this.lastDetectAt = now;
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
    this.drawSkel(hands, this.pinchState || this.pinchState2);
    if (!hands.length) {
      if (++this.lostFrames >= 4) {
        this.handActive = false;
        this.pinchState = false;
        this.pinchState2 = false;
        this.endTwoHandScale(true);
        this.pinchHeld = false;
        this.dragging = null;
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
    this.drive(hands);
  };

  private interPinchDist2D(
    a: NormalizedLandmark[],
    b: NormalizedLandmark[],
  ): number {
    return interHandDist(pinchMid(a[4], a[8]), pinchMid(b[4], b[8]));
  }

  private endTwoHandScale(silent = false): void {
    if (!this.twoHandScaling) return;
    const done = this.scaleTarget;
    const f = this.scaleFactor;
    this.twoHandScaling = false;
    this.scaleTarget = null;
    this.pinchDist0 = 0;
    this.pinchDistSmooth = 0;
    this.scaleFactor = 1;
    if (done && !silent) this.toast(`scaled x${f.toFixed(2)} (2D)`);
  }

  private updateTwoHandScale2D(
    main: NormalizedLandmark[],
    other: NormalizedLandmark[],
  ): boolean {
    const cur = this.interPinchDist2D(main, other);
    if (!Number.isFinite(cur)) return this.twoHandScaling;
    if (!this.twoHandScaling) {
      const target =
        this.dragging ?? this.selected ?? this.hovered ?? this.nearestObj(this.cursor.x, this.cursor.y, 0.5);
      if (!target) return false;
      if (cur < 0.02) return false;
      this.twoHandScaling = true;
      this.scaleTarget = target;
      this.scaleStartK = target.k ?? 1;
      this.pinchDist0 = cur;
      this.pinchDistSmooth = cur;
      this.scaleFactor = 1;
      this.toast("scaling — spread to enlarge, close to shrink (2D)");
      return true;
    }
    if (!this.scaleTarget || !this.objs.includes(this.scaleTarget)) {
      this.endTwoHandScale(true);
      return false;
    }
    this.pinchDistSmooth += (cur - this.pinchDistSmooth) * 0.5;
    const factor = scaleFactorForDist(this.pinchDistSmooth, this.pinchDist0);
    if (Math.abs(factor - this.scaleFactor) < 0.005) return true;
    this.scaleFactor = factor;
    this.scaleTarget.k = Math.min(
      SCALE_MAX,
      Math.max(SCALE_MIN, this.scaleStartK * factor),
    );
    return true;
  }

  private drive(hands: NormalizedLandmark[][]): void {
    const lm = hands[0];
    const other = hands[1] as NormalizedLandmark[] | undefined;
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
    // second-hand pinch (same absolute thresholds as the 2D main latch)
    if (other) {
      const od = Math.hypot(
        other[4].x - other[8].x,
        other[4].y - other[8].y,
      );
      if (!this.pinchState2 && od < 0.045) this.pinchState2 = true;
      else if (this.pinchState2 && od > 0.065) this.pinchState2 = false;
    } else {
      if (this.pinchState2 && this.twoHandScaling) this.endTwoHandScale();
      this.pinchState2 = false;
    }
    if (!this.pinchState && d < 0.045) {
      this.pinchState = true;
      this.setText("t-pinch", "pinch");
      // treat as click at cursor — suppressed while two-hand scaling owns it
      if (!this.pinchState2) {
        if (this.lineMode) {
          const hit = this.nearestObj(this.cursor.x, this.cursor.y, 0.5);
          if (hit) {
            // Pinched on a solid in line mode — select/drag it instead of
            // dropping a line point. Empty space still draws lines; the
            // toolbar place button (or P key) creates solids.
            this.selected = hit;
            this.dragging = hit;
          } else {
            this.placeLinePoint({ ...this.cursor });
          }
        } else {
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
              k: 1,
            };
            this.objs.push(o);
            this.selected = o;
            this.setCount();
          }
        }
      }
    } else if (this.pinchState && d > 0.065) {
      this.pinchState = false;
      this.dragging = null;
      if (this.twoHandScaling) this.endTwoHandScale();
      this.setText("t-pinch", "open");
      this.emitMath();
    }
    const bothPinched = !!(other && this.pinchState && this.pinchState2);
    if (bothPinched) {
      this.updateTwoHandScale2D(lm, other!);
      this.setText("t-pinch", `SCALE x${this.scaleFactor.toFixed(2)}`);
    } else if (this.twoHandScaling) {
      this.endTwoHandScale();
    }
    if (this.dragging && !this.twoHandScaling) {
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
    const canvas = this.opts.skel;
    const W = canvas.clientWidth || 248;
    const H = canvas.clientHeight || 140;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const needW = Math.max(1, Math.round(W * dpr));
    const needH = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const vw = this.opts.video.videoWidth || 0;
    const vh = this.opts.video.videoHeight || 0;
    let s = 1;
    let cropX = 0;
    let cropY = 0;
    if (vw > 0 && vh > 0) {
      s = Math.max(W / vw, H / vh);
      cropX = (vw * s - W) / 2;
      cropY = (vh * s - H) / 2;
    }
    const mapX = (nx: number): number =>
      vw > 0 && vh > 0 ? W - (nx * vw * s - cropX) : (1 - nx) * W;
    const mapY = (ny: number): number =>
      vw > 0 && vh > 0 ? ny * vh * s - cropY : ny * H;
    const accentNum = sceneThemeNow().cursor;
    const ar = (accentNum >> 16) & 255;
    const ag = (accentNum >> 8) & 255;
    const ab = accentNum & 255;
    const accentStroke = `rgba(${ar},${ag},${ab},.92)`;
    const accentJoint = `rgb(${Math.min(255, ar + 45)},${Math.min(255, ag + 45)},${Math.min(255, ab + 45)})`;
    (all || []).forEach((lm) => {
      g.strokeStyle = pinched
        ? "rgba(61,220,132,.95)"
        : accentStroke;
      g.lineWidth = 1.4;
      g.beginPath();
      EDGES.forEach(([a, b]) => {
        g.moveTo(mapX(lm[a].x), mapY(lm[a].y));
        g.lineTo(mapX(lm[b].x), mapY(lm[b].y));
      });
      g.stroke();
      g.fillStyle = pinched ? "#3ddc84" : accentJoint;
      lm.forEach((p, i) => {
        if (i === 0 || i === 4 || i === 8 || i === 12 || i === 16 || i === 20) {
          g.beginPath();
          g.arc(mapX(p.x), mapY(p.y), i === 8 || i === 4 ? 3.2 : 2.2, 0, 7);
          g.fill();
        }
      });
    });
  }

  /* ---------- render ---------- */

  private loop = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (this.spin && !this.reducedMotion) {
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
    if (this.sw3d) {
      this.drawSw3d(this.sw3d);
      return;
    }
    const cv = this.opts.canvas;
    const g = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.viewW || window.innerWidth;
    const h = this.viewH || window.innerHeight;
    const base = this.viewBase || Math.min(w / WORLD_W, h / WORLD_H);
    if (cv.style.width !== `${w}px` || cv.style.height !== `${h}px`) {
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
    }
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Cached palette (refreshed via onThemeChange, not per frame).
    if (!this.cachedC) this.refreshTheme();
    const C = this.cachedC!;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, w, h);

    if (this.grid) {
      const step = 40 * this.zoom;
      g.strokeStyle = C.gridFaint;
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
      g.strokeStyle = C.grid;
    g.lineWidth = 1.5;
    g.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // chains
    for (const L of this.chains) {
      if (!L.pts.length) continue;
      g.strokeStyle = L.closed ? C.snap : C.line;
      g.lineWidth = 2;
      g.beginPath();
      L.pts.forEach((p, i) => {
        const s = this.toScreen(p.x, p.y);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      });
      if (L.closed) g.closePath();
      g.stroke();
      g.fillStyle = C.vertex;
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
      const r = base * 0.32 * (o.k ?? 1);
      this.paintShape(g, o.s, s.x, s.y, r, o.c, o.rot);
      if (o === this.hovered || o === this.selected) {
        g.strokeStyle = o === this.selected ? "#ff5d7a" : C.unselected;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(s.x, s.y, r + 8, 0, 7);
        g.stroke();
      }
    }

    // cursor
    const c = this.toScreen(this.cursor.x, this.cursor.y);
    g.strokeStyle = this.pinchHeld ? C.pinch : C.cursor;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c.x, c.y, 10, 0, 7);
    g.stroke();
    g.fillStyle = this.pinchHeld ? C.pinch : C.cursor;
    g.beginPath();
    g.arc(c.x, c.y, 3.5, 0, 7);
    g.fill();
    g.strokeStyle = C.halo;
    g.beginPath();
    g.moveTo(c.x - 16, c.y);
    g.lineTo(c.x + 16, c.y);
    g.moveTo(c.x, c.y - 16);
    g.lineTo(c.x, c.y + 16);
    g.stroke();
    // snap ring: shows what a tap would snap/connect to in line mode
    if (this.lineMode && !this.pinchHeld) {
      const sn = this.findSnap(this.cursor);
      if (sn) {
        const sp = this.toScreen(sn.x, sn.y);
        g.strokeStyle = C.snap;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(sp.x, sp.y, 12, 0, 7);
        g.stroke();
      }
    }
  }

  /** Render the scene via the Rust/WASM 3D software rasterizer and blit to 2D canvas. */
  private drawSw3d(sw: Sw3dRenderer): void {
    const cv = this.opts.canvas;
    const g = this.ctx;
    const cssW = Math.max(1, this.viewW || window.innerWidth);
    const cssH = Math.max(1, this.viewH || window.innerHeight);
    if (cv.style.width !== `${cssW}px` || cv.style.height !== `${cssH}px`) {
      cv.style.width = `${cssW}px`;
      cv.style.height = `${cssH}px`;
    }
    // Render at full crisp native CSS resolution (and up to 1.25x on HiDPI
    // when idle), stepping to 0.72x only while actively orbiting so drags
    // stay fluid and snap immediately back to tack-sharp full res on release.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const resScale = this.orbiting ? 0.72 : dpr;
    const rw = Math.max(160, Math.min(1920, Math.round(cssW * resScale)));
    const rh = Math.max(120, Math.min(1080, Math.round(cssH * resScale)));
    if (cv.width !== rw || cv.height !== rh) {
      cv.width = rw;
      cv.height = rh;
      this.lastSw3dSig = "";
    }
    // Render-on-demand: skip full CPU rasterization + putImageData when the
    // scene, camera, cursor, theme, and studio flags are unchanged.
    const sigParts = [
      rw,
      rh,
      this.camYaw.toFixed(3),
      this.camPitch.toFixed(3),
      this.camDist.toFixed(2),
      this.grid ? 1 : 0,
      this.wireframe ? 1 : 0,
      this.matMode,
      this.detail,
      this.clipAxis ?? "",
      this.clipPos.toFixed(2),
      this.cursor.x.toFixed(3),
      this.cursor.y.toFixed(3),
      this.pinchHeld ? 1 : 0,
      currentTheme(),
      this.objs.length,
      this.chains.length,
    ];
    for (const o of this.objs) {
      sigParts.push(
        o.s,
        o.x.toFixed(3),
        o.y.toFixed(3),
        (o.k ?? 1).toFixed(3),
        o.rot.toFixed(3),
        o.c,
        o === this.hovered ? 1 : 0,
        o === this.selected ? 1 : 0,
      );
    }
    for (const L of this.chains) {
      sigParts.push(L.closed ? 1 : 0, L.pts.length);
      for (const p of L.pts) {
        sigParts.push(p.x.toFixed(3), p.y.toFixed(3));
      }
    }
    const sig = sigParts.join(",");
    if (sig === this.lastSw3dSig) return;
    this.lastSw3dSig = sig;

    sw.resize(rw, rh);
    this.syncSw3dFlags();
    sw.beginFrame();

    const C = this.cachedC;
    const lineRgb = parseHexColor(C?.line ?? "#f59e0b", 0xf59e0b);
    const snapRgb = parseHexColor(C?.snap ?? "#2e7d46", 0x2e7d46);
    const themeFallback = sceneThemeNow().cursor;
    const cursorRgb = parseHexColor(
      this.pinchHeld ? (C?.pinch ?? "#2e7d46") : (C?.cursor ?? ""),
      themeFallback,
    );

    for (const o of this.objs) {
      const k = o.k ?? 1;
      sw.pushObject({
        shape: o.s,
        x: o.x,
        y: o.y,
        z: 0,
        sx: k,
        sy: k,
        sz: k,
        rotY: o.rot,
        rotX: 0.2,
        rgb: parseHexColor(o.c, 0x0ea5e9),
        hovered: o === this.hovered,
        selected: o === this.selected,
      });
    }

    for (const L of this.chains) {
      if (L.pts.length < 2) continue;
      sw.pushLine(
        L.pts.map((p) => ({ x: p.x, y: p.y, z: 0 })),
        L.closed,
        L.closed ? snapRgb : lineRgb,
      );
    }

    sw.setCursor(true, this.cursor.x, this.cursor.y, 0, cursorRgb);
    sw.renderAndBlit(g);
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
      case "cylinder": {
        // proper cylinder silhouette: body + bottom bulge + visible top rim
        const eh = r * 0.32;
        g.beginPath();
        g.moveTo(-r, -eh);
        g.lineTo(-r, eh);
        g.ellipse(0, eh, r, eh, 0, Math.PI, 0, true);
        g.lineTo(r, -eh);
        g.ellipse(0, -eh, r, eh, 0, 0, Math.PI, true);
        g.closePath();
        g.fill();
        g.stroke();
        g.beginPath();
        g.ellipse(0, -eh, r, eh, 0, 0, Math.PI * 2);
        g.stroke();
        break;
      }
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
        if (typeof (g as CanvasRenderingContext2D & { roundRect?: unknown }).roundRect === "function")
          (g as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(-r * 0.6, -r, r * 1.2, r * 2, r * 0.6);
        else g.rect(-r * 0.6, -r, r * 1.2, r * 2);
        g.fill();
        g.stroke();
        break;
      case "prism":
        g.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
        g.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
        break;
      case "pyramid":
      case "triPrism":
        g.beginPath();
        g.moveTo(0, -r);
        g.lineTo(r * 0.9, r * 0.8);
        g.lineTo(-r * 0.9, r * 0.8);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      case "dome":
        g.beginPath();
        g.arc(0, r * 0.4, r, Math.PI, 0);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      case "hexPrism":
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
        g.stroke();
        break;
    }
    g.restore();
  }
}
