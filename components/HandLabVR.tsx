"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  VR_SHAPES,
  VRHandLabEngine,
  type VrShapeName,
  type VrUiState,
} from "../lib/vr-engine";
import { isVRSupported, supportHint, xrApiPresent } from "../lib/xr/session";

const GLYPHS: Record<VrShapeName, { g: string; label: string }> = {
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

const initial: VrUiState = {
  shape: "cube",
  color: "#4da3ff",
  lineMode: false,
  grid: true,
  xr: "ready",
  count: 0,
  hint: "",
};

export default function HandLabVR() {
  const [ui, setUi] = useState<VrUiState>(initial);
  const [fatal, setFatal] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [entering, setEntering] = useState(false);
  const engineRef = useRef<VRHandLabEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !toastRef.current) return;
    let engine: VRHandLabEngine | null = null;
    try {
      engine = new VRHandLabEngine({
        canvas: canvasRef.current,
        toast: toastRef.current,
        emit: setUi,
        onFatal: (msg) => setFatal(msg),
      });
    } catch (err) {
      setFatal(err instanceof Error ? err.message : String(err));
      return;
    }
    engineRef.current = engine;
    let dead = false;
    if (!xrApiPresent()) {
      setSupported(false);
    } else {
      void isVRSupported().then((ok) => {
        if (!dead) setSupported(ok);
      });
    }
    return () => {
      dead = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const eng = () => engineRef.current;

  const onEnterVR = async () => {
    const e = eng();
    if (!e) return;
    setEntering(true);
    await e.enterVR();
    setEntering(false);
  };

  const onImportFile = async (f: File) => {
    eng()?.importSceneJson(await f.text());
  };

  const onExportFile = () => {
    const data = eng()?.exportScene();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handlab-vr-scene-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (fatal)
    return (
      <div className="vr-fatal">
        <h1>
          HAND<span>LAB</span> VR
        </h1>
        <p>{fatal}</p>
        <p>
          <Link href="/">Back to desktop lab</Link>
        </p>
      </div>
    );

  return (
    <>
      <canvas id="scene" ref={canvasRef}></canvas>

      <header className="hud-top">
        <div className="brand">
          <h1>
            HAND<span>LAB</span> VR
          </h1>
          <p>
            <Link href="/" style={{ color: "inherit" }}>
              &larr; desktop lab
            </Link>{" "}
            &middot; isolated /vr route &middot; scenes shared via save/load
          </p>
        </div>
        <div className="status-cards">
          <div className="stat">
            <label>XR</label>
            <b>{ui.xr === "presenting" ? "presenting" : supported === false ? "unsupported" : supported ? "ready" : "checking…"}</b>
          </div>
          <div className="stat">
            <label>Objects</label>
            <b>{ui.count}</b>
          </div>
          <div className="stat">
            <label>Mode</label>
            <b>{ui.lineMode ? "line" : ui.shape}</b>
          </div>
        </div>
      </header>

      <nav className="toolbar" aria-label="VR palette">
        <h2>ENTER VR</h2>
        <button
          className="shape-btn"
          style={{ gridColumn: "1/-1", borderColor: "var(--good)" }}
          disabled={supported === false || entering}
          title={supported === false ? supportHint() : "Request immersive-vr session"}
          onClick={() => void onEnterVR()}
        >
          <span className="g">🥽</span>
          {ui.xr === "presenting"
            ? "in headset"
            : entering
              ? "entering…"
              : supported === false
                ? "not supported"
                : "enter VR"}
        </button>
        {supported === false && (
          <div className="m-sub">{supportHint()} — desktop orbit preview still works.</div>
        )}
        {ui.xr === "presenting" && (
          <button className="mini" style={{ width: "100%" }} onClick={() => void eng()?.exitVR()}>
            exit VR
          </button>
        )}
        <h2>SPAWN SHAPE</h2>
        <div className="shape-grid">
          {VR_SHAPES.map((s) => (
            <button
              key={s}
              className={"shape-btn" + (ui.shape === s ? " active" : "")}
              aria-pressed={ui.shape === s}
              onClick={() => eng()?.setShape(s)}
            >
              <span className="g">{GLYPHS[s].g}</span>
              {GLYPHS[s].label}
            </button>
          ))}
        </div>
        <h2>COLOR</h2>
        <div className="swatches">
          {SWATCHES.map((s) => (
            <div
              key={s.c}
              className={"sw" + (ui.color === s.c ? " active" : "")}
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
        <h2>LINE</h2>
        <button
          className={"shape-btn" + (ui.lineMode ? " active" : "")}
          style={{ gridColumn: "1/-1" }}
          aria-pressed={ui.lineMode}
          onClick={() => eng()?.setLineMode(!ui.lineMode)}
        >
          <span className="g">📏</span>line mode
        </button>
        <div className="tool-row">
          <button className="mini" onClick={() => eng()?.finishLine()}>
            finish
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
        <h2>SCENE (shared with /)</h2>
        <div className="tool-row">
          <button className="mini" onClick={() => eng()?.saveToStorage()}>
            save
          </button>
          <button className="mini" onClick={() => eng()?.loadFromStorage()}>
            load
          </button>
        </div>
        <div className="tool-row">
          <button className="mini" onClick={onExportFile}>
            file ↓
          </button>
          <button className="mini" onClick={() => fileRef.current?.click()}>
            file ↑
          </button>
        </div>
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
        <div className="tool-row">
          <button className="mini" style={{ width: "100%" }} onClick={() => eng()?.toggleGrid()}>
            grid: {ui.grid ? "on" : "off"}
          </button>
        </div>
      </nav>

      <aside className="hint" aria-label="VR gesture map">
        <h2>VR CONTROLS</h2>
        <div><kbd>trigger</kbd> tap = place / line point</div>
        <div><kbd>grip</kbd> hold = grab + drag</div>
        <div><kbd>right stick ↕</kbd> ray depth</div>
        <div><kbd>left stick ↕</kbd> rig height</div>
        <div><kbd>pinch</kbd> (hands) = same as trigger</div>
        <div><kbd>click</kbd> desktop preview = place</div>
        <div><kbd>Del</kbd> delete hovered (preview)</div>
        {ui.hint && <div className="m-sub" style={{ marginTop: 8 }}>{ui.hint}</div>}
      </aside>

      <div id="toast" ref={toastRef}></div>
    </>
  );
}
