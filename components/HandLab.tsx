"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HandLabEngine,
  SHAPES,
  initialUiState,
  type HudNodes,
  type ShapeName,
  type UiState,
} from "../lib/engine";
import SolidMath, { mathIdFor } from "./SolidMath";
import { SHAPE_DEFS, spawnScaleFor, type ShapeDims } from "../lib/geometry/math";
import DomainSwitcher from "./DomainSwitcher";
import Dock from "./bits/Dock";
import Magnet from "./bits/Magnet";
import ColorWell from "./bits/ColorWell";
import ThemeToggle from "./bits/ThemeToggle";
import { AccentSection } from "./bits/AccentPicker";
import type { HandLabFallbackEngine } from "../lib/fallback2d";

const SHAPE_GLYPHS: Record<ShapeName, { g: string; label: string }> = {
  cube: { g: "◼", label: "cube" },
  sphere: { g: "●", label: "sphere" },
  cone: { g: "▲", label: "cone" },
  torus: { g: "◎", label: "torus" },
  cylinder: { g: "⬢", label: "cyl" },
  icosa: { g: "⬣", label: "gem" },
  knot: { g: "∿", label: "knot" },
  tetra: { g: "△", label: "tetra" },
  octa: { g: "◇", label: "octa" },
  capsule: { g: "⬯", label: "capsule" },
  prism: { g: "▭", label: "prism" },
  pyramid: { g: "◭", label: "pyramid" },
  dome: { g: "◠", label: "dome" },
  hexPrism: { g: "⬡", label: "hex" },
  triPrism: { g: "▽", label: "wedge" },
};

export default function HandLab() {
  const [ui, setUi] = useState<UiState>(initialUiState);
  const [fatal, setFatal] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [is2D, setIs2D] = useState(false);
  const [dims, setDims] = useState<ShapeDims>({ ...SHAPE_DEFS.cube.defaults });
  const [studio, setStudio] = useState(false);
  /** Bumped when the async engine is assigned, so settings effects re-run
   *  and re-apply anything the user changed before init completed. */
  const [engineRev, setEngineRev] = useState(0);
  const engineRef = useRef<HandLabEngine | HandLabFallbackEngine | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skelRef = useRef<HTMLCanvasElement>(null);
  const cursor2dRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dHandRef = useRef<HTMLSpanElement>(null);
  const tHandRef = useRef<HTMLSpanElement>(null);
  const tPinchRef = useRef<HTMLElement>(null);
  const tXyzRef = useRef<HTMLElement>(null);
  const tCountRef = useRef<HTMLElement>(null);
  const tModelRef = useRef<HTMLSpanElement>(null);
  const tFpsRef = useRef<HTMLSpanElement>(null);
  const tPrRef = useRef<HTMLSpanElement>(null);
  const tZRef = useRef<HTMLSpanElement>(null);
  const depthiRef = useRef<HTMLElement>(null);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  // Live solid math: sliders drive the cards and the spawn size of newly
  // placed meshes (as ratios against each shape's defaults, so defaults
  // keep the exact legacy mesh sizes). Knot scales uniformly by its size.
  const setDim = useCallback((key: keyof ShapeDims, value: number) => {
    setDims((d) => ({ ...d, [key]: value }));
  }, []);

  const resetDims = useCallback(() => {
    const mid = mathIdFor(ui.shape);
    if (mid === "knot") {
      setDims({ a: 1 });
      return;
    }
    setDims({ ...SHAPE_DEFS[mid].defaults });
  }, [ui.shape]);

  useEffect(() => {
    const eng = engineRef.current as unknown as {
      setSpawnScale?: (x: number, y: number, z: number) => void;
    } | null;
    if (!eng?.setSpawnScale) return;
    const mid = mathIdFor(ui.shape);
    if (mid === "knot") {
      const k = dims.a ?? 1;
      eng.setSpawnScale(k, k, k);
      return;
    }
    const [x, y, z] = spawnScaleFor(mid, dims);
    eng.setSpawnScale(x, y, z);
  }, [ui.shape, dims, engineRev]);

  // Switching solids resets the math panel to that solid's reference dims,
  // mirroring the showcase behaviour.
  const shapeRef = useRef(ui.shape);
  useEffect(() => {
    if (shapeRef.current === ui.shape) return;
    shapeRef.current = ui.shape;
    const mid = mathIdFor(ui.shape);
    if (mid === "knot") setDims({ a: 1 });
    else setDims({ ...SHAPE_DEFS[mid].defaults });
  }, [ui.shape]);

  useEffect(() => {
    if (
      !canvasRef.current ||
      !videoRef.current ||
      !skelRef.current ||
      !cursor2dRef.current ||
      !toastRef.current ||
      !dHandRef.current ||
      !tHandRef.current ||
      !tPinchRef.current ||
      !tXyzRef.current ||
      !tCountRef.current ||
      !tModelRef.current ||
      !tFpsRef.current ||
      !tPrRef.current ||
      !tZRef.current ||
      !depthiRef.current
    )
      return;
    const hud: HudNodes = {
      "d-hand": dHandRef.current,
      "t-hand": tHandRef.current,
      "t-pinch": tPinchRef.current,
      "t-xyz": tXyzRef.current,
      "t-count": tCountRef.current,
      "t-model": tModelRef.current,
      "t-fps": tFpsRef.current,
      "t-pr": tPrRef.current,
      "t-z": tZRef.current,
      depthi: depthiRef.current,
    };
    let engine: HandLabEngine | HandLabFallbackEngine | null = null;
    let disposed = false;
    const opts = {
      canvas: canvasRef.current,
      video: videoRef.current,
      skel: skelRef.current,
      cursor2d: cursor2dRef.current,
      toast: toastRef.current,
      hud,
      emit: setUi,
      onCamLive: () => setPreviewOpen(true),
      onFatal: (msg: string) => setFatal(msg),
    };
    // Async so the 2D fallback can be imported on demand. An effect may not
    // return a promise, so the setup is detached and `disposed` guards every
    // post-await continuation.
    void (async () => {
      try {
        engine = new HandLabEngine(opts);
      } catch (webglErr) {
        // WebGL unavailable (blocklisted GPU, headless, remote desktop):
        // fall back to the 2D canvas engine instead of a fatal screen. This
        // module is ~1.2k lines, so it is fetched only when actually needed.
        if (disposed) return;
        try {
          const { HandLabFallbackEngine: Fallback } = await import(
            "../lib/fallback2d"
          );
          if (disposed) return;
          engine = new Fallback(opts);
          setIs2D(true);
        } catch (err2) {
          if (disposed) return;
          // ponytail: environmental failure (no WebGL AND no 2D) shows a
          // message, never the red error overlay
          console.error(webglErr);
          setFatal(err2 instanceof Error ? err2.message : String(err2));
          return;
        }
      }
      if (disposed) {
        engine?.dispose();
        engine = null;
        return;
      }
      engineRef.current = engine;
      setEngineRev((r) => r + 1);
    })();

    return () => {
      disposed = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const eng = useCallback(() => engineRef.current, []);

  const getStudioEngine = useCallback(
    () =>
      engineRef.current as unknown as {
        setWireframe?: (on: boolean) => void;
        setMaterialMode?: (mode: "standard" | "clay" | "flat") => void;
        setDetail?: (level: number) => void;
        setClip?: (axis: "x" | "y" | "z" | null, pos: number) => void;
        setSpawnScale?: (x: number, y: number, z: number) => void;
      } | null,
    [],
  );

  const download = (name: string, url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  };

  const onPhoto = () => {
    const url = eng()?.exportPNG();
    if (url) download(`handlab-${Date.now()}.png`, url);
  };

  const onExportFile = () => {
    const data = eng()?.exportScene();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    download(`handlab-scene-${Date.now()}.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const onImportFile = async (f: File) => {
    eng()?.importSceneJson(await f.text());
  };

  // Dock items are memoised so React.memo(Dock) actually skips renders.
  // Depending on the volatile UI flags is correct and cheap — they only
  // change on user action, never on a scene sync.
  const dockItems = useMemo(
    () => [
      {
        id: "webcam",
        label:
          ui.cam === "live"
            ? "Restart webcam"
            : ui.cam === "loading"
              ? "Cancel load"
              : "Enable webcam",
        primary: true,
        onClick: () =>
          ui.cam === "loading"
            ? eng()?.cancelWebcamLoad()
            : eng()?.enableWebcam(),
      },
      {
        id: "recenter",
        label: "recenter",
        title: "Re-anchor hand control to the current cursor spot (R)",
        onClick: () => eng()?.recenter(),
      },
      {
        id: "spin",
        label: `auto-rotate: ${ui.spin ? "on" : "off"}`,
        active: ui.spin,
        onClick: () => eng()?.toggleSpin(),
      },
      {
        id: "grid",
        label: `grid: ${ui.grid ? "on" : "off"}`,
        active: ui.grid,
        onClick: () => eng()?.toggleGrid(),
      },
      {
        id: "gestures",
        label: `gestures: ${helpOpen ? "shown" : "hidden"}`,
        active: helpOpen,
        expanded: helpOpen,
        controls: "hint-panel",
        onClick: () => setHelpOpen(!helpOpen),
      },
      {
        id: "camera",
        label: `camera: ${previewOpen ? "shown" : "hidden"}`,
        active: previewOpen,
        expanded: previewOpen,
        controls: "video-dock",
        onClick: () => setPreviewOpen(!previewOpen),
      },
    ],
    [ui.cam, ui.spin, ui.grid, helpOpen, previewOpen, eng],
  );

  if (fatal)
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ letterSpacing: ".14em" }}>
            HAND<span style={{ color: "var(--accent)" }}>LAB</span>
          </h1>
          <p style={{ marginTop: 12, color: "var(--muted)" }}>{fatal}</p>
          <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>
            Try a browser with hardware acceleration enabled (Chrome / Edge /
            Safari), or enable software WebGL in your browser flags.
          </p>
          <p style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              className="btn"
              style={{ cursor: "pointer" }}
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            <button
              className="btn ghost"
              style={{ cursor: "pointer" }}
              onClick={() =>
                navigator.clipboard?.writeText(
                  `HANDLAB WebGL failure\nUA: ${navigator.userAgent}\nwebgl2: ${!!document.createElement("canvas").getContext("webgl2")}\nerror: ${fatal}`,
                )
              }
            >
              Copy diagnostics
            </button>
          </p>
        </div>
      </div>
    );

  return (
    <>
      <canvas
        id="scene"
        ref={canvasRef}
        role="img"
        aria-label="Interactive 3D hand-lab workspace"
        aria-describedby="scene-description"
      >
        Interactive 3D hand-lab scene. Use the toolbar and HUD controls to create and edit objects.
      </canvas>
      <p id="scene-description" className="sr-only">
        Interactive 3D workspace. The object count and current mode are available in the HUD, and
        the gesture map can be opened or closed without moving keyboard focus.
      </p>
      <div id="cursor2d" ref={cursor2dRef}></div>
      {is2D && (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: "color-mix(in oklch, var(--color-warn) 14%, transparent)",
            border: "1px solid color-mix(in oklch, var(--color-warn) 50%, transparent)",
            color: "var(--color-warn)",
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 8,
          }}
        >
          2D fallback mode — WebGL unavailable, full 3D disabled. Shapes,
          lines, webcam + save/load still work.
        </div>
      )}

      <header className="hud-top">
        <div className="brand">
          <h1>
            HAND<span>LAB</span>
          </h1>
          <p>webcam hand tracking &rarr; floating 3D cursor (x / y / z)</p>
          <DomainSwitcher active="geometry" />
        </div>
        <div className="status-cards">
          <div className="stat">
            <label>Hand</label>
            <b>
              <span id="d-hand" className="dot off" ref={dHandRef}></span>
              <span id="t-hand" ref={tHandRef}>
                none
              </span>
            </b>
          </div>
          <div className="stat">
            <label>Pinch</label>
            <b id="t-pinch" ref={tPinchRef}>
              open
            </b>
          </div>
          <div className="stat">
            <label>Cursor XYZ</label>
            <b id="t-xyz" ref={tXyzRef}>
              0, 0, 0
            </b>
          </div>
          <div className="stat">
            <label>Objects</label>
            <b
              id="t-count"
              ref={tCountRef}
              aria-live="polite"
              aria-atomic="true"
            >
              0
            </b>
          </div>
        </div>
      </header>

      <nav className="toolbar" aria-label="Shape palette">
        <h2>SPAWN SHAPE [1–0 / ⇧1–5]</h2>
        <div className="shape-grid">
          {SHAPES.map((s) => (
            <Magnet key={s} strength={0.25}>
              <button
                className={
                  "shape-btn" + (ui.shape === s ? " active" : "")
                }
                data-shape={s}
                aria-pressed={ui.shape === s}
                onClick={() => eng()?.setShape(s)}
              >
                <span className="g">{SHAPE_GLYPHS[s].g}</span>
                {SHAPE_GLYPHS[s].label}
              </button>
            </Magnet>
          ))}
        </div>
        <h2>COLOR</h2>
        <ColorWell color={ui.color} onChange={(c) => eng()?.setColor(c)} />
        <h2>LINE [L]</h2>
        <div className="shape-grid">
          <Magnet style={{ gridColumn: "1/-1" }} strength={0.2}>
            <button
              className={"shape-btn" + (ui.lineMode ? " active" : "")}
              id="btn-line"
              aria-pressed={ui.lineMode}
              aria-live="polite"
              aria-atomic="true"
              style={{ gridColumn: "1/-1", width: "100%" }}
              onClick={() => eng()?.setLineMode(!ui.lineMode)}
            >
              <span className="g">╱</span>line mode: {ui.lineMode ? "on" : "off"}
            </button>
          </Magnet>
        </div>
        <div className="tool-row">
          <button
            className="mini"
            style={{ width: "100%" }}
            title="Place the current shape at the cursor without leaving line mode (P / Shift+click)"
            onClick={() => eng()?.placeCurrentShape()}
          >
            place {ui.shape} [P]
          </button>
        </div>
        <div className="m-sub" style={{ marginBottom: 4 }}>
          {ui.lineMode
            ? "line mode: tap = point, shape tap = select, Shift+click / P = place solid"
            : "P / Shift+click places the current solid in any mode"}
        </div>
        <div className="tool-row">
          <button className="mini" onClick={() => eng()?.toggleSnap()}>
            snap: {ui.snapOn ? "on" : "off"}
          </button>
          <button className="mini" onClick={() => eng()?.clearLines()}>
            clear lines
          </button>
        </div>
        <div className="tool-row">
          <button className="mini" onClick={() => eng()?.undo()}>
            undo
          </button>
          <button className="mini" onClick={() => eng()?.clearAll()}>
            clear
          </button>
        </div>
        <h2>DEPTH AI (V2)</h2>
        <div className="tool-row">
          <button
            className="mini"
            style={{ width: "100%" }}
            title="Monocular depth from Depth Anything V2, fused with the palm-size baseline"
            onClick={() => void eng()?.setDepthEnabled(!ui.depthOn)}
          >
            depth v2: {ui.depthOn ? "on" : "off"}
          </button>
        </div>
        <div className="m-sub" style={{ marginBottom: 4 }}>
          {ui.depth}
        </div>
        <h2>SCENE</h2>
        <div className="tool-row">
          <button className="mini" onClick={() => eng()?.saveToStorage()}>
            save
          </button>
          <button className="mini" onClick={() => eng()?.loadFromStorage()}>
            load
          </button>
        </div>
        <div className="tool-row">
          <button className="mini" onClick={onPhoto}>
            photo
          </button>
          <button className="mini" onClick={onExportFile}>
            file ↓
          </button>
        </div>
        <div className="tool-row">
          <button
            className="mini"
            style={{ width: "100%" }}
            onClick={() => fileRef.current?.click()}
          >
            file ↑
          </button>
        </div>
        <h2>DISPLAY</h2>
        <div className="tool-row">
          <ThemeToggle />
        </div>
        <AccentSection />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = "";
          }}
        />
      </nav>

      <SolidMath shape={ui.shape} dims={dims} onDims={setDim} onReset={resetDims} getEngine={getStudioEngine} readyRev={engineRev} studio={studio} onStudio={setStudio} />

      <aside
        id="hint-panel"
        className={"gesture-help hint" + (helpOpen ? "" : " is-collapsed")}
        aria-hidden={!helpOpen}
      >
        <button
          className="hint-close"
          aria-label="Hide gesture help"
          onClick={() => setHelpOpen(false)}
        >
          ×
        </button>
        <h2>GESTURE MAP</h2>
        <div>
          <kbd>move index</kbd> cursor follows your view: right / up on screen
        </div>
        <div>
          <kbd>push hand in-out</kbd> in / out of the screen (camera depth)
        </div>
        <div>
          <kbd>left hand ↕</kbd> depth slider along view axis
        </div>
        <div>
          <kbd>pinch tap</kbd> click / place object
        </div>
        <div>
          <kbd>pinch hold</kbd> grab + drag in 3D
        </div>
        <div>
          <kbd>fist 0.6s</kbd> delete hovered
        </div>
        <div>
          <kbd>L</kbd> line mode — tap points, tap last dot to finish
        </div>
        <div>
          <kbd>P</kbd> place current solid (works in line mode) ·{" "}
          <kbd>Shift+click</kbd> same for mouse
        </div>
        <div>
          <kbd>drag dots</kbd> move vertices, lengths + angles update
        </div>
        <div>
          <kbd>snap</kbd> tap near a point or line to snap + connect (green ring)
        </div>
        <div>
          <kbd>2-hand pinch + spread</kbd> pinch both hands, then spread to
          enlarge / close to shrink
        </div>
        <div style={{ marginTop: 8, color: "var(--muted)" }}>
          No webcam? Mouse moves on your view plane (wheel zoom disabled),
          click = place, drag = move. R recenters hand control.
        </div>
      </aside>

      <div
        id="video-dock"
        className={"video-dock" + (previewOpen ? "" : " is-collapsed")}
        aria-hidden={!previewOpen}
      >
        <div className="bar">
          <span id="t-model" ref={tModelRef}>
            hand model: loading…
          </span>
          <span id="t-fps" ref={tFpsRef}>
            — fps
          </span>
          <span id="t-pr" ref={tPrRef}>
            render —
          </span>
        </div>
        <div style={{ position: "relative" }}>
          <video id="cam" ref={videoRef} playsInline muted autoPlay disablePictureInPicture aria-label="Webcam preview"></video>
          <canvas id="skel" ref={skelRef} width={248} height={140} aria-hidden="true"></canvas>
        </div>
      </div>

      <Dock label="Lab controls" items={dockItems} />

      <div id="depthbar">
        DEPTH (Z){" "}
        <span id="t-z" ref={tZRef}>
          0.0
        </span>
        <div id="depthfill">
          <i id="depthi" ref={depthiRef}></i>
        </div>
      </div>
      <div
        id="toast"
        ref={toastRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      ></div>
    </>
  );
}
