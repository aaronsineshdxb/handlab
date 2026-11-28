"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  VR_SHAPES,
  VRHandLabEngine,
  type VrUiState,
} from "../lib/vr-engine";
import { isVRSupported, supportHint, xrApiPresent } from "../lib/xr/session";
import Magnet from "./bits/Magnet";
import ColorWell from "./bits/ColorWell";
import ThemeToggle from "./bits/ThemeToggle";
import { AccentSection } from "./bits/AccentPicker";
import {
  ArrowLeftIcon,
  DownloadIcon,
  HeadsetIcon,
  LineToolIcon,
  SHAPE_LABELS,
  ShapeGlyph,
  UploadIcon,
} from "./icons";

const initial: VrUiState = {
  shape: "cube",
  color: "#2563eb",
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
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileHintOpen, setMobileHintOpen] = useState(false);
  const engineRef = useRef<VRHandLabEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = "1";
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      el.style.opacity = "0";
    }, 2600);
  };

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
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const eng = () => engineRef.current;

  const onEnterVR = async () => {
    const e = eng();
    if (!e) return;
    setEntering(true);
    try {
      await e.enterVR();
    } catch (err) {
      console.error("Failed to enter VR", err);
      showToast("Could not start VR session");
    } finally {
      setEntering(false);
    }
  };

  const onImportFile = async (f: File) => {
    try {
      const text = await f.text();
      const ok = eng()?.importSceneJson(text);
      if (ok === false) {
        showToast("Invalid scene JSON file");
      }
    } catch {
      showToast("Unable to read selected scene file");
    }
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (fatal)
    return (
      <main className="vr-fatal">
        <div>
          <h1>
            hand<span>lab</span> vr
          </h1>
          <p>{fatal}</p>
          <p>
            <Link className="btn" href="/">
              Back to desktop lab
            </Link>
          </p>
        </div>
      </main>
    );

  const shapeLabel = SHAPE_LABELS[ui.shape];

  return (
    <>
      <main>
        <canvas
          id="scene"
          ref={canvasRef}
          role="img"
          aria-label="Interactive 3D hand-lab VR workspace"
          aria-describedby="scene-description"
        >
          Interactive 3D hand-lab VR scene. Use the VR palette and HUD controls to create and edit
          objects.
        </canvas>
        <p id="scene-description" className="sr-only">
          Interactive 3D VR workspace. The object count and current mode are available in the HUD.
        </p>
      </main>

      <header className="hud-top">
        <div className="brand">
          <div className="brand__row">
            <h1>
              hand<span>lab</span> vr
            </h1>
            <Link href="/" className="vr-back-link">
              <ArrowLeftIcon size={13} />
              <span>Desktop lab</span>
            </Link>
          </div>
          <p>WebXR workspace · scenes sync with desktop lab</p>
        </div>
        <div className="status-cards">
          <div className="stat">
            <span className="stat__label">XR</span>
            <b>{ui.xr === "presenting" ? "Presenting" : supported === false ? "Unsupported" : supported ? "Ready" : "Checking…"}</b>
          </div>
          <div className="stat">
            <span className="stat__label">Objects</span>
            <b aria-live="polite" aria-atomic="true">
              {ui.count}
            </b>
          </div>
          <div className="stat">
            <span className="stat__label">Mode</span>
            <b>{ui.lineMode ? "Line" : shapeLabel}</b>
          </div>
        </div>
      </header>

      <button
        type="button"
        className="btn ghost vr-tools-toggle"
        aria-expanded={mobileToolsOpen}
        aria-controls="vr-toolbar"
        onClick={() => {
          setMobileToolsOpen((v) => {
            const next = !v;
            if (next) setMobileHintOpen(false);
            return next;
          });
        }}
      >
        {mobileToolsOpen ? "Hide tools" : "Tools"}
      </button>

      <nav
        id="vr-toolbar"
        className={"toolbar" + (mobileToolsOpen ? "" : " is-mobile-hidden")}
        aria-label="VR palette"
      >
        <h2>ENTER VR</h2>
        <button
          type="button"
          className="shape-btn shape-btn--full shape-btn--vr"
          disabled={supported !== true || entering}
          title={supported === false ? supportHint() : "Request immersive-vr session"}
          onClick={() => void onEnterVR()}
        >
          <span className="g"><HeadsetIcon size={18} /></span>
          {ui.xr === "presenting"
            ? "In headset"
            : entering
              ? "Entering…"
              : supported === false
                ? "Not supported"
                : "Enter VR"}
        </button>
        {supported === false && (
          <div className="m-sub">{supportHint()} — desktop orbit preview still works.</div>
        )}
        {ui.xr === "presenting" && (
          <button
            type="button"
            className="mini mini--full"
            onClick={() => void eng()?.exitVR()}
          >
            Exit VR
          </button>
        )}
        <h2>SPAWN SHAPE</h2>
        <div className="shape-grid">
          {VR_SHAPES.map((s) => (
            <Magnet key={s} strength={0.25}>
              <button
                type="button"
                className={"shape-btn" + (ui.shape === s ? " active" : "")}
                aria-pressed={ui.shape === s}
                onClick={() => eng()?.setShape(s)}
              >
                <span className="g"><ShapeGlyph shape={s} size={18} /></span>
                <span>{SHAPE_LABELS[s]}</span>
              </button>
            </Magnet>
          ))}
        </div>
        <h2>COLOR</h2>
        <ColorWell color={ui.color} onChange={(c) => eng()?.setColor(c)} />
        <h2>LINE</h2>
        <Magnet style={{ display: "block" }} strength={0.2}>
          <button
            type="button"
            className={"shape-btn shape-btn--full" + (ui.lineMode ? " active" : "")}
            aria-pressed={ui.lineMode}
            aria-live="polite"
            aria-atomic="true"
            onClick={() => eng()?.setLineMode(!ui.lineMode)}
          >
            <span className="g"><LineToolIcon size={18} /></span>
            <span>Line mode: {ui.lineMode ? "On" : "Off"}</span>
          </button>
        </Magnet>
        <div className="tool-row">
          <button type="button" className="mini" onClick={() => eng()?.finishLine()}>
            Finish
          </button>
          <button type="button" className="mini" onClick={() => eng()?.clearLines()}>
            Clear lines
          </button>
        </div>
        <div className="tool-row">
          <button
            type="button"
            className="mini mini--full"
            title="Place the current shape without leaving line mode"
            onClick={() => eng()?.placeCurrentShape()}
          >
            Place {shapeLabel}
          </button>
        </div>
        <div className="m-sub">
          {ui.lineMode
            ? "Line mode: trigger places a point, tap a solid to select, Place adds a solid."
            : "Place button works in any mode."}
        </div>
        <div className="tool-row">
          <button type="button" className="mini" onClick={() => eng()?.undo()}>
            Undo
          </button>
          <button type="button" className="mini" onClick={() => eng()?.clearAll()}>
            Clear
          </button>
        </div>
        <h2>SCENE</h2>
        <div className="tool-row">
          <button type="button" className="mini" onClick={() => eng()?.saveToStorage()}>
            Save
          </button>
          <button type="button" className="mini" onClick={() => eng()?.loadFromStorage()}>
            Load
          </button>
        </div>
        <div className="tool-row">
          <button type="button" className="mini" onClick={onExportFile}>
            <DownloadIcon size={13} />
            <span>Export</span>
          </button>
          <button type="button" className="mini" onClick={() => fileRef.current?.click()}>
            <UploadIcon size={13} />
            <span>Import</span>
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
          <button
            type="button"
            className="mini mini--full"
            onClick={() => eng()?.toggleGrid()}
          >
            Grid: {ui.grid ? "On" : "Off"}
          </button>
        </div>
        <h2>DISPLAY</h2>
        <div className="tool-row">
          <ThemeToggle />
        </div>
        <AccentSection />
      </nav>

      <button
        type="button"
        className="btn ghost vr-hint-toggle"
        aria-expanded={mobileHintOpen}
        aria-controls="vr-controls-hint"
        onClick={() => {
          setMobileHintOpen((v) => {
            const next = !v;
            if (next) setMobileToolsOpen(false);
            return next;
          });
        }}
      >
        {mobileHintOpen ? "Hide controls" : "VR controls"}
      </button>

      <aside
        id="vr-controls-hint"
        className={"hint vr-hint" + (mobileHintOpen ? "" : " is-mobile-hidden")}
        aria-label="VR gesture map"
      >
        <h2>VR CONTROLS</h2>
        <div><kbd>trigger</kbd> tap = place / line point</div>
        <div><kbd>grip</kbd> hold = grab + drag</div>
        <div><kbd>right stick ↕</kbd> ray depth</div>
        <div><kbd>left stick ↕</kbd> rig height</div>
        <div><kbd>pinch</kbd> (hands) = same as trigger</div>
        <div><kbd>click</kbd> desktop preview = place</div>
        <div><kbd>Del</kbd> delete hovered (preview)</div>
        {ui.hint && <div className="m-sub lesson-panel__text">{ui.hint}</div>}
      </aside>

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
