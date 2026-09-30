"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HandLabEngine,
  SHAPES,
  initialUiState,
  toCheckSnap,
  type HudNodes,
  type ShapeName,
  type UiState,
} from "../lib/engine";
import { HandLabFallbackEngine } from "../lib/fallback2d";
import LessonPanel from "./LessonPanel";
import DomainSwitcher from "./DomainSwitcher";
import Dock from "./bits/Dock";
import Magnet from "./bits/Magnet";
import ColorWell from "./bits/ColorWell";
import ThemeToggle from "./bits/ThemeToggle";
import { LESSONS } from "../lib/lessons/lessons.geometry";
import { loadProgress, saveStep } from "../lib/lessons/store";
import { evalChecks, type SceneSnap } from "../lib/lessons/checks";
import type { Lesson, Progress, QuizCheck } from "../lib/lessons/types";
import { addImportedLesson } from "../lib/lessons/validation";
import { createSceneSync } from "../lib/sceneSync";

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
};

export default function HandLab() {
  const [ui, setUi] = useState<UiState>(initialUiState);
  const [fatal, setFatal] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [is2D, setIs2D] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>(LESSONS);
  const lessonsRef = useRef<Lesson[]>(LESSONS);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lessonStepIdx, setLessonStepIdx] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [sceneRev, setSceneRev] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const engineRef = useRef<HandLabEngine | HandLabFallbackEngine | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lessonFileRef = useRef<HTMLInputElement>(null);
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
  const tZRef = useRef<HTMLSpanElement>(null);
  const depthiRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setProgressMap(loadProgress());
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

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
    let engine: HandLabEngine | HandLabFallbackEngine | null = null;
    // Lesson checks re-evaluate off this. Scene mutations arrive in bursts
    // (place, then a drag emitting math every 6th frame), so coalesce to one
    // React update per 100ms. See lib/sceneSync.ts — reconciling the HUD
    // once per animation frame was the largest source of drag jank.
    const sceneSync = createSceneSync(() => setSceneRev((rev) => rev + 1));
    const onScene = () => sceneSync();
    try {
      engine = new HandLabEngine({
        canvas: canvasRef.current,
        video: videoRef.current,
        skel: skelRef.current,
        cursor2d: cursor2dRef.current,
        toast: toastRef.current,
        hud,
        emit: setUi,
        onScene,
        onCamLive: () => setPreviewOpen(true),
        onFatal: (msg) => setFatal(msg),
      });
    } catch (webglErr) {
      // WebGL unavailable (blocklisted GPU, headless, remote desktop):
      // fall back to the 2D canvas engine instead of a fatal screen.
      try {
        engine = new HandLabFallbackEngine({
          canvas: canvasRef.current,
          video: videoRef.current,
          skel: skelRef.current,
          cursor2d: cursor2dRef.current,
          toast: toastRef.current,
          hud,
          emit: setUi,
          onScene,
          onCamLive: () => setPreviewOpen(true),
          onFatal: (msg) => setFatal(msg),
        });
        setIs2D(true);
      } catch (err2) {
        // ponytail: environmental failure (no WebGL AND no 2D) shows a
        // message, never the red error overlay
        console.error(webglErr);
        setFatal(err2 instanceof Error ? err2.message : String(err2));
        return;
      }
    }
    engineRef.current = engine;
    return () => {
      sceneSync.dispose();
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const eng = () => engineRef.current;

  const showToast = (message: string) => {
    const toast = toastRef.current;
    if (!toast) return;
    toast.textContent = message;
    toast.style.opacity = "1";
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toast.style.opacity = "0";
    }, 1400);
  };

  // Recomputed only when the engine reports a scene change (throttled to
  // 10Hz by sceneSync), so this stays off the render hot path. toCheckSnap
  // drops the color/rotation fields the checks never read.
  const snap = useMemo<SceneSnap>(() => {
    const scene = eng()?.exportScene();
    return toCheckSnap(
      scene ?? { version: 1, objects: [], chains: [] },
      quizAnswers,
    );
  }, [sceneRev, quizAnswers]);

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

  const onExportLesson = () => {
    const lesson = lessons.find(({ id }) => id === lessonId);
    if (!lesson) {
      showToast("no active lesson to export");
      return;
    }
    const blob = new Blob([JSON.stringify(lesson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    download(`handlab-lesson-${lesson.id}.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const onImportLessonFile = async (f: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text()) as unknown;
    } catch {
      showToast("lesson file is not valid JSON");
      return;
    }
    const currentLessons = lessonsRef.current;
    const nextLessons = addImportedLesson(currentLessons, parsed);
    if (nextLessons === currentLessons) {
      showToast("lesson data invalid — nothing loaded");
      return;
    }
    lessonsRef.current = nextLessons;
    setLessons(nextLessons);
    showToast("lesson imported");
  };

  const selectLesson = (nextLessonId: string) => {
    if (lessonId === nextLessonId) {
      eng()?.setLineMode(false);
      setLessonId(null);
      setLessonStepIdx(0);
      return;
    }

    const engine = eng();
    engine?.clearAll();
    engine?.clearLines();
    engine?.setLineMode(false);
    setHelpOpen(false);
    setLessonId(nextLessonId);
    const lastStepIdx = Math.max(
      (lessons.find(({ id }) => id === nextLessonId)?.steps.length ?? 1) - 1,
      0,
    );
    const storedStepIdx = progressMap[nextLessonId]?.stepIdx ?? 0;
    setLessonStepIdx(Math.min(Math.max(Math.floor(storedStepIdx), 0), lastStepIdx));
  };

  const nextLessonStep = (nextStepIdx: number) => {
    const lesson = lessons.find(({ id }) => id === lessonId);
    if (
      !lesson ||
      !Number.isInteger(nextStepIdx) ||
      nextStepIdx <= lessonStepIdx ||
      nextStepIdx >= lesson.steps.length
    )
      return;
    setLessonStepIdx(nextStepIdx);
  };

  const previousLessonStep = (previousStepIdx: number) => {
    if (
      !lessonId ||
      !Number.isInteger(previousStepIdx) ||
      previousStepIdx >= lessonStepIdx ||
      previousStepIdx < 0
    )
      return;
    setLessonStepIdx(previousStepIdx);
  };

  const handleQuizAnswer = (check: QuizCheck, answerIndex: number) => {
    setQuizAnswers((current) => {
      if (current[check.question] === answerIndex) return current;
      return { ...current, [check.question]: answerIndex };
    });
    if (answerIndex !== check.answer || !lessonId) return;
    const nextProgress: Progress = {
      lessonId,
      stepIdx: lessonStepIdx,
      done: true,
      score: 1,
      updatedAt: Date.now(),
    };
    saveStep(nextProgress);
    setProgressMap((current) => ({
      ...current,
      [lessonId]: nextProgress,
    }));
  };

  // A step counts as done once every one of its checks passes against the live
  // scene — that's what the Next button is gated on, so record it here.
  useEffect(() => {
    if (!lessonId) return;
    const lesson = lessons.find(({ id }) => id === lessonId);
    const step = lesson?.steps[lessonStepIdx];
    if (!step || !evalChecks(step.checks, snap)) return;

    const done = progressMap[lessonId];
    if (done?.done && done.stepIdx === lessonStepIdx) return;

    const nextProgress: Progress = {
      lessonId,
      stepIdx: lessonStepIdx,
      done: true,
      score: 1,
      updatedAt: Date.now(),
    };
    saveStep(nextProgress);
    setProgressMap((current) => ({ ...current, [lessonId]: nextProgress }));
  }, [lessonId, lessonStepIdx, lessons, progressMap, snap]);

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
        <h2>SPAWN SHAPE [1–0]</h2>
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
        <div className="tool-row">
          <button className="mini" onClick={onExportLesson}>
            lesson ↓
          </button>
          <button className="mini" onClick={() => lessonFileRef.current?.click()}>
            lesson ↑
          </button>
        </div>
        <h2>DISPLAY</h2>
        <div className="tool-row">
          <ThemeToggle />
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
        <input
          ref={lessonFileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportLessonFile(f);
            e.target.value = "";
          }}
        />
      </nav>

      <LessonPanel
        lessons={lessons}
        active={lessonId}
        stepIdx={lessonStepIdx}
        onSelect={selectLesson}
        onNext={nextLessonStep}
        onBack={previousLessonStep}
        progress={lessonId ? progressMap[lessonId] : undefined}
        onQuizAnswer={handleQuizAnswer}
        snap={snap}
      />

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
          <kbd>drag dots</kbd> move vertices, lengths + angles update
        </div>
        <div>
          <kbd>snap</kbd> tap near a point or line to snap + connect (green ring)
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
        className={"video-dock" + (previewOpen ? "" : " is-collapsed") + (lessonId ? " lesson-mode-hidden" : "")}
        aria-hidden={!previewOpen || !!lessonId}
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
          <video id="cam" ref={videoRef} playsInline muted aria-label="Webcam preview"></video>
          <canvas id="skel" ref={skelRef} width={248} height={140} aria-hidden="true"></canvas>
        </div>
      </div>

      <Dock
        label="Lab controls"
        items={[
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
            label: `camera: ${previewOpen && !lessonId ? "shown" : "hidden"}`,
            active: previewOpen && !lessonId,
            disabled: !!lessonId,
            expanded: previewOpen && !lessonId,
            controls: "video-dock",
            onClick: () => setPreviewOpen(!previewOpen),
          },
        ]}
      />

      <div id="depthbar" className={lessonId ? "lesson-mode-hidden" : ""}>
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
