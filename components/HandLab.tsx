"use client";

import { useEffect, useRef, useState } from "react";
import {
  HandLabEngine,
  SHAPES,
  initialUiState,
  type HudNodes,
  type Measurement,
  type ShapeName,
  type UiState,
} from "../lib/engine";

const SHAPE_GLYPHS: Record<ShapeName, { g: string; label: string }> = {
  cube: { g: "◼", label: "cube" },
  sphere: { g: "●", label: "sphere" },
  cone: { g: "▲", label: "cone" },
  torus: { g: "◎", label: "torus" },
  cylinder: { g: "⬢", label: "cyl" },
  icosa: { g: "⬣", label: "gem" },
  knot: { g: "🌀", label: "knot" },
  tetra: { g: "🔻", label: "tetra" },
  octa: { g: "🔷", label: "octa" },
  capsule: { g: "💊", label: "capsule" },
};

const SWATCHES = [
  { c: "#4da3ff", name: "blue" },
  { c: "#7c5cff", name: "violet" },
  { c: "#3ddc84", name: "green" },
  { c: "#ffb224", name: "amber" },
  { c: "#ff5d7a", name: "pink" },
];

export default function HandLab() {
  const [ui, setUi] = useState<UiState>(initialUiState);
  const [fatal, setFatal] = useState<string | null>(null);
  const [math, setMath] = useState<Measurement[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const engineRef = useRef<HandLabEngine | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skelRef = useRef<HTMLCanvasElement>(null);
  const cursor2dRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const dHandRef = useRef<HTMLSpanElement>(null);
  const tHandRef = useRef<HTMLSpanElement>(null);
  const tPinchRef = useRef<HTMLElement>(null);
  const tXyzRef = useRef<HTMLElement>(null);
  const tCountRef = useRef<HTMLElement>(null);
  const tModelRef = useRef<HTMLSpanElement>(null);
  const tFpsRef = useRef<HTMLSpanElement>(null);
  const tZRef = useRef<HTMLSpanElement>(null);
  const depthiRef = useRef<HTMLElement>(null);

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
      "t-z": tZRef.current,
      depthi: depthiRef.current,
    };
    let engine: HandLabEngine | null = null;
    try {
      engine = new HandLabEngine({
        canvas: canvasRef.current,
        video: videoRef.current,
        skel: skelRef.current,
        cursor2d: cursor2dRef.current,
        toast: toastRef.current,
        hud,
        emit: setUi,
        onMath: setMath,
        onCamLive: () => setPreviewOpen(true),
        onFatal: (msg) => setFatal(msg),
      });
    } catch (err) {
      // ponytail: environmental failure (no WebGL, no GPU) shows a message, never the red error overlay
      setFatal(err instanceof Error ? err.message : String(err));
      return;
    }
    engineRef.current = engine;
    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const eng = () => engineRef.current;

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
      <canvas id="scene" ref={canvasRef}></canvas>
      <div id="cursor2d" ref={cursor2dRef}></div>

      <header className="hud-top">
        <div className="brand">
          <h1>
            HAND<span>LAB</span>
          </h1>
          <p>webcam hand tracking &rarr; floating 3D cursor (x / y / z)</p>
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
            <b id="t-count" ref={tCountRef}>
              5
            </b>
          </div>
        </div>
      </header>

      <nav className="toolbar" aria-label="Shape palette">
        <h2>SPAWN SHAPE [1–0]</h2>
        <div className="shape-grid">
          {SHAPES.map((s) => (
            <button
              key={s}
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
          ))}
        </div>
        <h2>COLOR</h2>
        <div className="swatches">
          {SWATCHES.map((s) => (
            <div
              key={s.c}
              className={"sw" + (ui.color === s.c ? " active" : "")}
              data-c={s.c}
              style={{ background: s.c }}
              tabIndex={0}
              role="button"
              aria-label={s.name}
              onClick={() => eng()?.setColor(s.c)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  eng()?.setColor(s.c);
                }
              }}
            ></div>
          ))}
        </div>
        <h2>LINE / MEASURE [L]</h2>
        <div className="shape-grid">
          <button
            className={"shape-btn" + (ui.lineMode ? " active" : "")}
            id="btn-line"
            aria-pressed={ui.lineMode}
            style={{ gridColumn: "1/-1" }}
            onClick={() => eng()?.setLineMode(!ui.lineMode)}
          >
            <span className="g">📏</span>line mode
          </button>
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
      </nav>

      <section className="measure" aria-label="Measurements">
        <h2>MEASURE {math.length ? `(${math.length})` : ""}</h2>
        {math.length === 0 ? (
          <p className="m-empty">
            Press L, tap points. Tap near P0 to close a loop for area.
          </p>
        ) : (
          <ul className="m-list">
            {math.map((m) => (
              <li key={m.id} className={m.closed ? "m-row closed" : "m-row"}>
                <b>
                  #{m.id + 1} {m.closed ? "loop" : `chain · ${m.segs} seg`}
                </b>
                <span>
                  L {m.total.toFixed(2)}m
                  {m.closed
                    ? ` · P ${m.perimeter.toFixed(2)}m · A ${m.area.toFixed(2)}m²`
                    : ""}
                </span>
                {m.angles.length > 0 && (
                  <span>
                    ∠ {m.minAngle!.toFixed(0)}–{m.maxAngle!.toFixed(0)}° (
                    {m.angles.length})
                  </span>
                )}
                <span className="m-sub">
                  C ({m.centroid.map((v) => v.toFixed(1)).join(", ")})
                  {m.closed &&
                    ` · n (${m.normal.map((v) => v.toFixed(2)).join(", ")})`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {math.length > 0 && (
          <button
            className="mini"
            onClick={() =>
              navigator.clipboard?.writeText(JSON.stringify(math, null, 2))
            }
          >
            copy JSON
          </button>
        )}
      </section>

      <aside
        id="hint-panel"
        className={"hint" + (helpOpen ? "" : " is-collapsed")}
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
          <kbd>drag dots</kbd> move vertices, lengths + angles update
        </div>
        <div>
          <kbd>snap</kbd> endpoints auto-snap when close (green ring)
        </div>
        <div>
          <kbd>2-hand spread</kbd> camera zoom
        </div>
        <div style={{ marginTop: 8, color: "var(--muted)" }}>
          No webcam? Mouse moves on your view plane, wheel = in/out, click =
          place, drag = move. R recenters hand control.
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
        </div>
        <div style={{ position: "relative" }}>
          <video id="cam" ref={videoRef} playsInline muted></video>
          <canvas id="skel" ref={skelRef} width={248} height={140}></canvas>
        </div>
      </div>

      <div className="controls">
        <button
          className="btn"
          onClick={() =>
            ui.cam === "loading"
              ? eng()?.cancelWebcamLoad()
              : eng()?.enableWebcam()
          }
        >
          {ui.cam === "live"
            ? "Restart webcam"
            : ui.cam === "loading"
              ? "Cancel load"
              : "Enable webcam"}
        </button>
        <button
          className="btn ghost"
          title="Re-anchor hand control to the current cursor spot (R)"
          onClick={() => eng()?.recenter()}
        >
          recenter
        </button>
        <button className="btn ghost" onClick={() => eng()?.toggleSpin()}>
          auto-rotate: {ui.spin ? "on" : "off"}
        </button>
        <button className="btn ghost" onClick={() => eng()?.toggleGrid()}>
          grid: {ui.grid ? "on" : "off"}
        </button>
        <button
          className="btn ghost"
          aria-expanded={helpOpen}
          aria-controls="hint-panel"
          onClick={() => setHelpOpen(!helpOpen)}
        >
          gestures: {helpOpen ? "shown" : "hidden"}
        </button>
        <button
          className="btn ghost"
          aria-expanded={previewOpen}
          aria-controls="video-dock"
          onClick={() => setPreviewOpen(!previewOpen)}
        >
          camera: {previewOpen ? "shown" : "hidden"}
        </button>
      </div>

      <div id="depthbar">
        DEPTH (Z){" "}
        <span id="t-z" ref={tZRef}>
          0.0
        </span>
        <div id="depthfill">
          <i id="depthi" ref={depthiRef}></i>
        </div>
      </div>
      <div id="toast" ref={toastRef}></div>
    </>
  );
}
