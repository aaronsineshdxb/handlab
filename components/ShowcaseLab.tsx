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
import type { StudioEngine } from "./SolidMath";
import {
  SHAPE_DEFS,
  spawnScaleFor,
  type ShapeDims,
} from "../lib/geometry/math";
import { lockLightTheme } from "../lib/geometry/showcase-state";
import ColorWell from "./bits/ColorWell";
import DomainSwitcher from "./DomainSwitcher";

const GLYPHS: Record<ShapeName, { g: string; label: string }> = {
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

const FOUNDATIONS: ShapeName[] = ["cube", "prism", "sphere", "cylinder", "cone", "pyramid"];

function defaultsFor(shape: ShapeName): ShapeDims {
  const mid = mathIdFor(shape);
  if (mid === "knot") return { a: 1 };
  return { ...SHAPE_DEFS[mid].defaults };
}

type FullEngine = StudioEngine & {
  setSpawnScale?: (x: number, y: number, z: number) => void;
  setShape?: (s: ShapeName) => void;
  setColor?: (c: string) => void;
  setLineMode?: (on: boolean) => void;
  toggleSnap?: () => void;
  clearLines?: () => void;
  undo?: () => void;
  clearAll?: () => void;
  recenter?: () => void;
  toggleSpin?: () => void;
  toggleGrid?: () => void;
  saveToStorage?: () => void;
  loadFromStorage?: () => void;
  exportPNG?: () => string | null;
  exportScene?: () => { objects: unknown[] };
  importSceneJson?: (text: string) => boolean;
  enableWebcam?: () => void;
  cancelWebcamLoad?: () => void;
  setDepthEnabled?: (on: boolean) => void;
  setCameraDistance?: (d: number) => void;
  placeCenter?: () => void;
  dispose?: () => void;
};

function UnifiedLab() {
  const [ui, setUi] = useState<UiState>(initialUiState);
  const [dims, setDims] = useState<ShapeDims>({ ...SHAPE_DEFS.cylinder.defaults });
  const [studio, setStudio] = useState(false);
  const [drawer, setDrawer] = useState<"shapes" | "line" | "help" | null>(null);
  const [mathOpen, setMathOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [is2D, setIs2D] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [engineRev, setEngineRev] = useState(0);
  const engineRef = useRef<FullEngine | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skelRef = useRef<HTMLCanvasElement>(null);
  const cursor2dRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const dHandRef = useRef<HTMLSpanElement>(null);
  const tHandRef = useRef<HTMLSpanElement>(null);
  const tPinchRef = useRef<HTMLElement>(null);
  const tXyzRef = useRef<HTMLSpanElement>(null);
  const tCountRef = useRef<HTMLElement>(null);
  const tModelRef = useRef<HTMLSpanElement>(null);
  const tFpsRef = useRef<HTMLSpanElement>(null);
  const tPrRef = useRef<HTMLSpanElement>(null);
  const tZRef = useRef<HTMLSpanElement>(null);
  const depthiRef = useRef<HTMLElement>(null);

  // ---- engine lifecycle (sandbox scene, hand tracking, lines, depth) ----
  useEffect(() => {
    if (
      !canvasRef.current || !videoRef.current || !skelRef.current ||
      !cursor2dRef.current || !toastRef.current || !dHandRef.current ||
      !tHandRef.current || !tPinchRef.current || !tXyzRef.current ||
      !tCountRef.current || !tModelRef.current || !tFpsRef.current ||
      !tPrRef.current || !tZRef.current || !depthiRef.current
    )
      return;
    const hud: HudNodes = {
      "d-hand": dHandRef.current, "t-hand": tHandRef.current,
      "t-pinch": tPinchRef.current, "t-xyz": tXyzRef.current,
      "t-count": tCountRef.current, "t-model": tModelRef.current,
      "t-fps": tFpsRef.current, "t-pr": tPrRef.current,
      "t-z": tZRef.current, depthi: depthiRef.current,
    };
    let engine: FullEngine | null = null;
    let disposed = false;
    const opts = {
      canvas: canvasRef.current, video: videoRef.current, skel: skelRef.current,
      cursor2d: cursor2dRef.current, toast: toastRef.current, hud,
      emit: setUi,
      onCamLive: () => setPreviewOpen(true),
      onFatal: (msg: string) => setFatal(msg),
    };
    void (async () => {
      try {
        engine = new HandLabEngine(opts) as unknown as FullEngine;
      } catch (webglErr) {
        if (disposed) return;
        try {
          const { HandLabFallbackEngine: Fallback } = await import("../lib/fallback2d");
          if (disposed) return;
          engine = new Fallback(opts) as unknown as FullEngine;
          setIs2D(true);
        } catch (err2) {
          if (disposed) return;
          console.error(webglErr);
          setFatal(err2 instanceof Error ? err2.message : String(err2));
          return;
        }
      }
      if (disposed) {
        engine?.dispose?.();
        engine = null;
        return;
      }
      engineRef.current = engine;
      setEngineRev((r) => r + 1);
      // Showcase first paint: closer camera + hero solid at the centre.
      engine.setCameraDistance?.(5.8);
      engine.setShape?.("cylinder");
      if ((engine.exportScene?.().objects.length ?? 0) === 0) engine.placeCenter?.();
    })();
    return () => {
      disposed = true;
      engine?.dispose?.();
      engineRef.current = null;
    };
  }, []);

  const getEngine = useCallback((): StudioEngine | null => engineRef.current, []);

  // Judging panel: polished light theme, restored on unmount.
  useEffect(() => lockLightTheme(), []);

  const setDim = useCallback((key: keyof ShapeDims, value: number) => {
    setDims((d) => ({ ...d, [key]: value }));
  }, []);

  const resetDims = useCallback(() => {
    setDims(defaultsFor(ui.shape));
  }, [ui.shape]);

  // Live spawn size (ratios vs defaults keep legacy mesh sizes at defaults).
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng?.setSpawnScale) return;
    const mid = mathIdFor(ui.shape);
    if (mid === "knot") {
      const k = dims.a ?? 1;
      eng.setSpawnScale(k, k, k);
      return;
    }
    const [x, y, z] = spawnScaleFor(mid, dims);
    eng.setSpawnScale(x, y, z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.shape, dims, engineRev]);

  // Switching solids resets the math panel to that solid's reference dims.
  const shapeRef = useRef<ShapeName>(initialUiState.shape);
  useEffect(() => {
    if (shapeRef.current === ui.shape) return;
    shapeRef.current = ui.shape;
    setDims(defaultsFor(ui.shape));
  }, [ui.shape]);

  const selectShape = useCallback((s: ShapeName) => {
    engineRef.current?.setShape?.(s);
    setDrawer(null);
  }, []);

  const setMode = useCallback((next: boolean) => {
    setStudio(next);
    setDrawer(null);
    if (!next) {
      const cur = engineRef.current;
      // leaving studio clears advanced inspection state
      cur?.setWireframe?.(false);
      cur?.setClip?.(null, 0);
    }
  }, []);

  const download = (name: string, url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  };

  const onPhoto = useCallback(() => {
    const url = engineRef.current?.exportPNG?.();
    if (url) download(`geometry-${Date.now()}.png`, url);
  }, []);

  const onExportFile = useCallback(() => {
    const data = (engineRef.current as unknown as { exportScene?: () => object })?.exportScene?.();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    download(`handlab-scene-${Date.now()}.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  const onImportFile = useCallback(async (f: File) => {
    engineRef.current?.importSceneJson?.(await f.text());
  }, []);

  const shapes = useMemo(
    () => (studio ? [...SHAPES] : FOUNDATIONS),
    [studio],
  );
  const mid = mathIdFor(ui.shape);
  const shapeLabel = mid === "knot" ? "knot" : SHAPE_DEFS[mid].label.toLowerCase();
  const params = mid === "knot" ? [] : SHAPE_DEFS[mid].params;
  const paramDefault = (key: keyof ShapeDims): number =>
    mid === "knot" ? 1 : Number(SHAPE_DEFS[mid].defaults[key] ?? 0);

  if (fatal) {
    return (
      <div className="vr-fatal">
        <div>
          <h1>hand<span>lab</span></h1>
          <p>{fatal}</p>
          <p><button className="btn" onClick={() => window.location.reload()}>Retry</button></p>
        </div>
      </div>
    );
  }

  return (
    <div className="sc-root">
      <div className="sc-stage">
        <canvas ref={canvasRef} id="scene" className="sc-canvas" role="img" aria-label="Interactive 3D hand-lab workspace" />
        <div className="sc-grid-overlay" aria-hidden="true" />
      </div>
      <div id="cursor2d" ref={cursor2dRef}></div>
      {is2D && (
        <div className="sc-fallback-note">2D fallback mode — WebGL unavailable. Shapes, lines, webcam + save/load still work.</div>
      )}

      <header className="sc-header">
        <div className="sc-brand">
          <b>handlab <span>· geometry</span></b>
          <i>pinch to place · drag sliders for live math</i>
          <div className="sc-domains"><DomainSwitcher active="geometry" /></div>
        </div>
        <div className="sc-mode" role="tablist" aria-label="Learning mode">
          <button role="tab" aria-selected={!studio} className={!studio ? "on" : ""} onClick={() => setMode(false)}>Simple · Learn</button>
          <button role="tab" aria-selected={studio} className={studio ? "on" : ""} onClick={() => setMode(true)}>Complex · Studio</button>
        </div>
        <div className="sc-header__actions">
          <button
            className="sc-btn ghost"
            onClick={() => (ui.cam === "loading" ? engineRef.current?.cancelWebcamLoad?.() : engineRef.current?.enableWebcam?.())}
          >
            {ui.cam === "live" ? "Restart hand" : ui.cam === "loading" ? "Cancel" : "✋ Enable hand"}
          </button>
          <button className="sc-btn" onClick={onPhoto}>Export PNG</button>
        </div>
      </header>

      <nav className="sc-rail" aria-label="Showcase controls">
        <button className={"sc-fab" + (drawer === "shapes" ? " active" : "")} aria-pressed={drawer === "shapes"} aria-label="Shapes" title="Shape library" onClick={() => setDrawer((d) => (d === "shapes" ? null : "shapes"))}><span aria-hidden="true">▦</span></button>
        <button className={"sc-fab" + (drawer === "line" ? " active" : "")} aria-pressed={drawer === "line"} aria-label="Line tools" title="Line + measure tools" onClick={() => setDrawer((d) => (d === "line" ? null : "line"))}><span aria-hidden="true">╱</span></button>
        <button className={"sc-fab" + (previewOpen ? " active" : "")} aria-pressed={previewOpen} aria-label="Camera preview" title="Webcam preview" onClick={() => setPreviewOpen((v) => !v)}><span aria-hidden="true">✋</span></button>
        <button className={"sc-fab" + (drawer === "help" ? " active" : "")} aria-pressed={drawer === "help"} aria-label="Gestures" title="Gesture map" onClick={() => setDrawer((d) => (d === "help" ? null : "help"))}><span aria-hidden="true">?</span></button>
        <button className={"sc-fab" + (mathOpen ? " active" : "")} aria-pressed={mathOpen} aria-label="Math panel" title="Live mathematics" onClick={() => setMathOpen((v) => !v)}><span aria-hidden="true">∑</span></button>
      </nav>

      {drawer === "shapes" && (
        <aside className="sc-drawer" aria-label="Shape library">
          <div className="sc-drawer__head"><b>{studio ? "Full library" : "Foundations"}</b><button aria-label="Close" onClick={() => setDrawer(null)}>×</button></div>
          <div className="sc-shape-grid">
            {shapes.map((id) => (
              <button key={id} className={"sc-shape" + (ui.shape === id ? " on" : "")} aria-pressed={ui.shape === id} onClick={() => selectShape(id)}>
                <b>{GLYPHS[id].g} {GLYPHS[id].label}</b>
              </button>
            ))}
          </div>
          <h4 className="solid-math__h">Color</h4>
          <ColorWell color={ui.color} onChange={(c) => engineRef.current?.setColor?.(c)} />
          <h4 className="solid-math__h">View</h4>
          <div className="sc-chips">
            <button className={"sc-chip" + (ui.spin ? " on" : "")} aria-pressed={ui.spin} onClick={() => engineRef.current?.toggleSpin?.()}>spin</button>
            <button className={"sc-chip" + (ui.grid ? " on" : "")} aria-pressed={ui.grid} onClick={() => engineRef.current?.toggleGrid?.()}>grid</button>
            <button className="sc-chip" onClick={() => engineRef.current?.recenter?.()}>recenter</button>
          </div>
          <h4 className="solid-math__h">Depth AI</h4>
          <div className="sc-chips">
            <button className={"sc-chip" + (ui.depthOn ? " on" : "")} aria-pressed={ui.depthOn} onClick={() => void engineRef.current?.setDepthEnabled?.(!ui.depthOn)}>depth v2</button>
          </div>
          <p className="sc-note">{ui.depth}</p>
          <h4 className="solid-math__h">Scene</h4>
          <div className="sc-chips">
            <button className="sc-chip" onClick={() => engineRef.current?.saveToStorage?.()}>save</button>
            <button className="sc-chip" onClick={() => engineRef.current?.loadFromStorage?.()}>load</button>
            <button className="sc-chip" onClick={onPhoto}>photo</button>
            <button className="sc-chip" onClick={onExportFile}>file ↓</button>
            <button className="sc-chip" onClick={() => fileRef.current?.click()}>file ↑</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); e.target.value = ""; }} />
        </aside>
      )}

      {drawer === "line" && (
        <aside className="sc-drawer" aria-label="Line tools">
          <div className="sc-drawer__head"><b>Measure · lines [L]</b><button aria-label="Close" onClick={() => setDrawer(null)}>×</button></div>
          <div className="sc-chips">
            <button className={"sc-chip" + (ui.lineMode ? " on" : "")} aria-pressed={ui.lineMode} onClick={() => engineRef.current?.setLineMode?.(!ui.lineMode)}>line: {ui.lineMode ? "on" : "off"}</button>
            <button className={"sc-chip" + (ui.snapOn ? " on" : "")} aria-pressed={ui.snapOn} onClick={() => engineRef.current?.toggleSnap?.()}>snap</button>
          </div>
          <div className="sc-chips">
            <button className="sc-chip" onClick={() => engineRef.current?.undo?.()}>undo</button>
            <button className="sc-chip" onClick={() => engineRef.current?.clearLines?.()}>clear lines</button>
            <button className="sc-chip" onClick={() => engineRef.current?.clearAll?.()}>clear solids</button>
          </div>
          <p className="sc-note">Tap points to measure — lengths, angles, area update live. Tap near dots to snap.</p>
        </aside>
      )}

      {drawer === "help" && (
        <aside className="sc-drawer" aria-label="Gesture map">
          <div className="sc-drawer__head"><b>Gesture map</b><button aria-label="Close" onClick={() => setDrawer(null)}>×</button></div>
          <p className="sc-note"><kbd>move index</kbd> cursor follows your view</p>
          <p className="sc-note"><kbd>push in-out</kbd> depth along view axis</p>
          <p className="sc-note"><kbd>pinch tap</kbd> place / select · <kbd>hold</kbd> grab + drag</p>
          <p className="sc-note"><kbd>fist 0.6s</kbd> delete hovered · <kbd>L</kbd> line mode · <kbd>R</kbd> recenter</p>
          <p className="sc-note">No webcam? Mouse moves on your view plane, click = place, drag = move.</p>
        </aside>
      )}

      <div className="sc-params" aria-label="Dimensions">
        <b className="sc-params__shape">{shapeLabel}</b>
        {params.map((p) => {
          const v = Number(dims[p.key] ?? paramDefault(p.key));
          return (
            <label className="sc-slider" key={p.key}>
              <span className="sc-slider__head"><span>{p.label}</span><b>{v.toFixed(2)} cm</b></span>
              <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => setDim(p.key, Number(e.target.value))} aria-label={p.label} />
            </label>
          );
        })}
      </div>

      <div className="sc-status" aria-label="Hand status">
        <span id="d-hand" className="dot off" ref={dHandRef}></span>
        <span id="t-hand" ref={tHandRef}>none</span>
        <span aria-hidden="true">·</span>
        <span id="t-pinch" ref={tPinchRef}>open</span>
        <span aria-hidden="true">·</span>
        <span><b id="t-count" ref={tCountRef}>0</b> solids</span>
      </div>

      {mathOpen && (
        <SolidMath shape={ui.shape} dims={dims} onDims={setDim} onReset={resetDims} getEngine={getEngine} readyRev={engineRev} studio={studio} onStudio={setMode} />
      )}

      <div id="video-dock" className={"video-dock sc-viddock" + (previewOpen ? "" : " is-collapsed")} aria-hidden={!previewOpen}>
        <div className="bar">
          <span id="t-model" ref={tModelRef}>hand model: loading…</span>
          <span id="t-fps" ref={tFpsRef}>— fps</span>
          <span id="t-pr" ref={tPrRef}>render —</span>
        </div>
        <div style={{ position: "relative" }}>
          <video id="cam" ref={videoRef} playsInline muted aria-label="Webcam preview"></video>
          <canvas id="skel" ref={skelRef} width={248} height={140} aria-hidden="true"></canvas>
        </div>
      </div>

      <div id="depthbar">
        DEPTH (Z) <span id="t-z" ref={tZRef}>0.0</span>
        <div id="depthfill"><i id="depthi" ref={depthiRef}></i></div>
      </div>

      <span id="t-xyz" ref={tXyzRef} className="sr-only">0, 0, 0</span>
      <div id="toast" ref={toastRef} role="status" aria-live="polite" aria-atomic="true"></div>
    </div>
  );
}

// The unified lab owns Three.js — LabEntry loads this chunk lazily (ssr: false)
// so the static shell paints first.
export default UnifiedLab;
