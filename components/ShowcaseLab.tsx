"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  HandLabEngine,
  SHAPES,
  initialUiState,
  type ClipAxis,
  type HudNodes,
  type LabEngine,
  type ShapeName,
  type StudioMaterial,
  type UiState,
} from "../lib/engine";
import SolidMath, { mathIdFor, type StudioState } from "./SolidMath";
import {
  SHAPE_DEFS,
  spawnScaleFor,
  type ShapeDims,
} from "../lib/geometry/math";
import ThemeToggle from "./bits/ThemeToggle";
import { AccentSection } from "./bits/AccentPicker";
import ColorWell from "./bits/ColorWell";
import SegmentedControl from "./bits/SegmentedControl";
import DomainSwitcher from "./DomainSwitcher";
import LessonPanel from "./LessonPanel";
import {
  CameraIcon,
  CloseXIcon,
  CrosshairIcon,
  DownloadIcon,
  FolderOpenIcon,
  GridIcon,
  HelpIcon,
  LessonsIcon,
  LineToolIcon,
  MathSigmaIcon,
  RotateCwIcon,
  SHAPE_LABELS,
  SaveIcon,
  SettingsIcon,
  ShapeGlyph,
  ShapesIcon,
  UploadIcon,
} from "./icons";
import { LESSONS } from "../lib/lessons/lessons.geometry";
import { loadProgress, saveStep } from "../lib/lessons/store";
import { addImportedLesson } from "../lib/lessons/validation";
import { PLAYLISTS } from "../lib/lessons/playlists";
import {
  ensureRolls,
  instantiateLesson,
  rerollLesson,
} from "../lib/lessons/vars";
import type {
  Lesson,
  NumericCheck,
  Progress,
  QuizCheck,
} from "../lib/lessons/types";
import type { SceneSnap } from "../lib/lessons/checks";
import {
  clearJoinState,
  loadJoinState,
  postProgress,
  type JoinState,
} from "../lib/classroom/client";
import ClassCard from "./ClassCard";
import { createSceneSync } from "../lib/sceneSync";

const FOUNDATIONS: ShapeName[] = ["cube", "prism", "sphere", "cylinder", "cone", "pyramid"];

type DrawerId = "shapes" | "line" | "settings" | "help" | "lessons";
type LabMode = "learn" | "studio";

const MODE_OPTIONS: readonly { id: LabMode; label: string }[] = [
  { id: "learn", label: "Simple · Learn" },
  { id: "studio", label: "Complex · Studio" },
];

const DEFAULT_STUDIO: StudioState = {
  wireframe: false,
  matMode: "standard",
  detail: 1,
  clipAxis: null,
  clipPos: 0,
};

function sliderTrackStyle(value: number, min: number, max: number): CSSProperties {
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return { "--pct": `${pct.toFixed(1)}%` } as CSSProperties;
}

function defaultsFor(shape: ShapeName): ShapeDims {
  const mid = mathIdFor(shape);
  if (mid === "knot") return { a: 1 };
  return { ...SHAPE_DEFS[mid].defaults };
}

function isNarrowViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 900;
}

function UnifiedLab() {
  const reduceMotion = useReducedMotion();
  const [narrow, setNarrow] = useState(() => isNarrowViewport());
  const [ui, setUi] = useState<UiState>(initialUiState);
  const [dims, setDims] = useState<ShapeDims>({ ...SHAPE_DEFS.cylinder.defaults });
  const [studio, setStudio] = useState(false);
  const [studioState, setStudioState] = useState<StudioState>(DEFAULT_STUDIO);
  const [drawer, setDrawer] = useState<DrawerId | null>(null);
  // line-drawer chip states for the chain math label variants
  const [angleSumChip, setAngleSumChip] = useState(false);
  const [pythagChip, setPythagChip] = useState(false);
  // two-hand ruler chip + the student's real hand span used to calibrate it
  const [rulerChip, setRulerChip] = useState(false);
  const [spanCm, setSpanCm] = useState(18);
  const [mathOpen, setMathOpen] = useState(() => !isNarrowViewport());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [is2D, setIs2D] = useState(false);
  // dismissable 2D-fallback notice
  const [fallbackDismissed, setFallbackDismissed] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [engineRev, setEngineRev] = useState(0);
  // ---- lessons: seed data, active lesson/step, persisted progress ----
  const [lessons, setLessons] = useState<Lesson[]>(LESSONS);
  const lessonsRef = useRef<Lesson[]>(LESSONS);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lessonStep, setLessonStep] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const lessonFileRef = useRef<HTMLInputElement>(null);
  const quizRef = useRef<Record<string, number>>({});
  // Randomized template vars (#5): one roll per templated lesson, persisted
  // per browser; rollsVersion re-renders instantiated lessons after re-roll.
  const [rollsVersion, setRollsVersion] = useState(0);
  // Classroom (#13): joined class + per-lesson hint-ladder usage that rides
  // along with classroom progress uploads.
  const [classState, setClassState] = useState<JoinState | null>(() => loadJoinState());
  const hintsRef = useRef<Record<string, number>>({});
  const ghostFileRef = useRef<HTMLInputElement>(null);
  const [sceneTick, setSceneTick] = useState(0);
  const engineRef = useRef<LabEngine | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skelRef = useRef<HTMLCanvasElement>(null);
  const cursor2dRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerTriggerRefs = useRef<Record<DrawerId, HTMLButtonElement | null>>({
    shapes: null,
    line: null,
    settings: null,
    help: null,
    lessons: null,
  });
  const lastDrawerRef = useRef<DrawerId | null>(null);
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const showToast = useCallback((msg: string) => {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = "1";
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      el.style.opacity = "0";
    }, 2600);
  }, []);

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
    let engine: LabEngine | null = null;
    let disposed = false;
    const sceneSync = createSceneSync(() => setSceneTick((t) => t + 1));
    const opts = {
      canvas: canvasRef.current, video: videoRef.current, skel: skelRef.current,
      cursor2d: cursor2dRef.current, toast: toastRef.current, hud,
      emit: setUi,
      onCamLive: () => {
        if (isNarrowViewport()) { setDrawer(null); setMathOpen(false); } setPreviewOpen(true);
      },
      onFatal: (msg: string) => setFatal(msg),
      onScene: (): void => { sceneSync(); },
    };
    void (async () => {
      try {
        const fb = await import("../lib/fallback2d");
        if (disposed) return;
        if (fb.isSoftwareWebGL()) {
          engine = new fb.HandLabFallbackEngine(opts);
          setIs2D(true);
        } else {
          engine = new HandLabEngine(opts);
        }
      } catch (webglErr) {
        if (disposed) return;
        try {
          const { HandLabFallbackEngine: Fallback } = await import("../lib/fallback2d");
          if (disposed) return;
          engine = new Fallback(opts);
          setIs2D(true);
        } catch (err2) {
          if (disposed) return;
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
      // Showcase first paint: closer camera + hero solid at the centre.
      engine.setCameraDistance?.(5.8);
      engine.setShape("cylinder");
      if (engine.exportScene().objects.length === 0) engine.placeCenter();
    })();
    return () => {
      disposed = true;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      sceneSync.dispose();
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync lifted Studio inspection state to both WebGL and Rust/WASM 3D engines.
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setWireframe?.(studioState.wireframe);
    eng.setMaterialMode?.(studioState.matMode);
    eng.setDetail?.(studioState.detail);
    eng.setClip?.(studioState.clipAxis, studioState.clipPos);
  }, [studioState, engineRev]);

  // Lessons progress (handlab.progress.v1) — persisted in this browser only.
  useEffect(() => setProgressMap(loadProgress()), []);

  const setDim = useCallback((key: keyof ShapeDims, value: number) => {
    setDims((d) => ({ ...d, [key]: value }));
  }, []);

  const resetDims = useCallback(() => {
    setDims(defaultsFor(ui.shape));
  }, [ui.shape]);

  const setWireframe = useCallback((wireframe: boolean) => {
    setStudioState((s) => ({ ...s, wireframe }));
  }, []);
  const setMatMode = useCallback((matMode: StudioMaterial) => {
    setStudioState((s) => ({ ...s, matMode }));
  }, []);
  const setDetail = useCallback((detail: number) => {
    setStudioState((s) => ({ ...s, detail }));
  }, []);
  const setClipAxis = useCallback((clipAxis: ClipAxis) => {
    setStudioState((s) => ({ ...s, clipAxis }));
  }, []);
  const setClipPos = useCallback((clipPos: number) => {
    setStudioState((s) => ({ ...s, clipPos }));
  }, []);

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
  }, [ui.shape, dims, engineRev]);

  // Switching solids resets the math panel to that solid's reference dims.
  const shapeRef = useRef<ShapeName>(initialUiState.shape);
  useEffect(() => {
    if (shapeRef.current === ui.shape) return;
    shapeRef.current = ui.shape;
    setDims(defaultsFor(ui.shape));
  }, [ui.shape]);

  const closeDrawer = useCallback((restoreFocus = false) => {
    const prev = lastDrawerRef.current;
    setDrawer(null);
    if (restoreFocus && prev) {
      queueMicrotask(() => drawerTriggerRefs.current[prev]?.focus());
    }
  }, []);

  const toggleDrawer = useCallback((id: DrawerId) => {
    setDrawer((cur) => {
      const next = cur === id ? null : id;
      if (next) {
        lastDrawerRef.current = next;
        if (isNarrowViewport()) {
          setMathOpen(false);
          setPreviewOpen(false);
        }
      }
      return next;
    });
  }, []);

  const toggleMath = useCallback(() => {
    setMathOpen((cur) => {
      const next = !cur;
      if (next && isNarrowViewport()) {
        setDrawer(null);
        setPreviewOpen(false);
      }
      return next;
    });
  }, []);

  const togglePreview = useCallback(() => {
    setPreviewOpen((cur) => {
      const next = !cur;
      if (next && isNarrowViewport()) {
        setDrawer(null);
        setMathOpen(false);
      }
      return next;
    });
  }, []);

  const selectShape = useCallback((s: ShapeName) => {
    engineRef.current?.setShape(s);
    setDrawer(null);
  }, []);

  const setMode = useCallback((next: LabMode) => {
    const isStudio = next === "studio";
    setStudio(isStudio);
    setDrawer(null);
    if (!isStudio) {
      setStudioState(DEFAULT_STUDIO);
    }
  }, []);

  const download = (name: string, url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const onPhoto = useCallback(() => {
    const url = engineRef.current?.exportPNG();
    if (url) download(`geometry-${Date.now()}.png`, url);
  }, []);

  const onExportFile = useCallback(() => {
    const data = engineRef.current?.exportScene();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    download(`handlab-scene-${Date.now()}.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  const onImportFile = useCallback(async (f: File) => {
    try {
      const text = await f.text();
      const ok = engineRef.current?.importSceneJson(text);
      if (ok === false) {
        showToast("Invalid scene JSON file");
      }
    } catch {
      showToast("Could not read selected scene file");
    }
  }, [showToast]);

  // ---- ghost overlay (#8): translucent target-scene diff in the viewport ----
  const onGhostImport = useCallback(
    async (f: File) => {
      try {
        const text = await f.text();
        const eng = engineRef.current;
        if (!eng || typeof eng.setGhostScene !== "function") {
          showToast("Ghost overlay needs the 3D engine");
          return;
        }
        eng.setGhostScene(text);
      } catch {
        showToast("Could not read ghost scene file");
      }
    },
    [showToast],
  );

  const onGhostClear = useCallback(() => {
    engineRef.current?.clearGhost?.();
  }, []);

  // ---- lessons: live scene snapshot + step flow handlers ----
  const engineSnap = useMemo<SceneSnap | undefined>(() => {
    const eng = engineRef.current;
    if (!eng) return undefined;
    return eng.exportCheckSnap({ ...quizRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneTick, engineRev]);

  // Lessons the panel sees: templated lessons are instantiated with the
  // browser's persisted roll; plain lessons pass through unchanged.
  const rolledLessons = useMemo<Lesson[]>(() => {
    void rollsVersion;
    return lessons.map((l) => {
      if (!l.vars || Object.keys(l.vars).length === 0) return l;
      return instantiateLesson(l, ensureRolls(l));
    });
  }, [lessons, rollsVersion]);

  const handleReroll = useCallback(() => {
    if (!lessonId) return;
    const template = lessonsRef.current.find(({ id }) => id === lessonId);
    if (!template?.vars) return;
    rerollLesson(template);
    quizRef.current = {};
    setRollsVersion((v) => v + 1);
  }, [lessonId]);

  const handleShowSolution = useCallback(
    (json: string | null): boolean | void => {
      const eng = engineRef.current;
      if (!eng) return false;
      if (json === null) {
        eng.clearGhost?.();
        return;
      }
      if (typeof eng.setGhostScene !== "function") {
        showToast("Ghost overlay needs the 3D engine");
        return false;
      }
      return eng.setGhostScene(json);
    },
    [showToast],
  );

  const handleHintUsed = useCallback(() => {
    if (!lessonId) return;
    const hints = (hintsRef.current[lessonId] ?? 0) + 1;
    hintsRef.current[lessonId] = hints;
    const cls = classState;
    if (cls && cls.lessonId === lessonId) {
      postProgress(cls.code, cls.studentId, {
        lessonId,
        stepIdx: lessonStep,
        done: false,
        score: 0,
        updatedAt: Date.now(),
        hintsUsed: hints,
      });
    }
  }, [lessonId, lessonStep, classState]);

  const handleClassJoined = useCallback(
    (state: JoinState, lesson: Lesson | null) => {
      setClassState(state);
      if (lesson) {
        const next = addImportedLesson(lessonsRef.current, lesson);
        if (next !== lessonsRef.current) {
          lessonsRef.current = next;
          setLessons(next);
        }
        // Class assignments always start the student at step 0.
        quizRef.current = {};
        setLessonId(lesson.id);
        setLessonStep(0);
      }
    },
    [],
  );

  const handleClassLeft = useCallback(() => {
    setClassState(null);
    clearJoinState();
  }, []);

  const selectLesson = useCallback(
    (nextId: string) => {
      quizRef.current = {};
      if (lessonId === nextId) {
        setLessonId(null);
        setLessonStep(0);
        return;
      }
      setLessonId(nextId);
      const lesson = lessons.find(({ id }) => id === nextId);
      const last = Math.max((lesson?.steps.length ?? 1) - 1, 0);
      const stored = progressMap[nextId]?.stepIdx ?? 0;
      setLessonStep(Math.min(Math.max(Math.floor(stored), 0), last));
    },
    [lessonId, lessons, progressMap],
  );

  const bumpProgress = useCallback(
    (stepIdx: number) => {
      if (!lessonId) return;
      const next: Progress = {
        lessonId,
        stepIdx,
        done: true,
        score: 1,
        updatedAt: Date.now(),
        hintsUsed: hintsRef.current[lessonId] ?? 0,
      };
      saveStep(next);
      setProgressMap((cur) => ({ ...cur, [lessonId]: next }));
      // Fire-and-forget classroom upload when this lesson was assigned.
      const cls = classState;
      if (cls && cls.lessonId === lessonId) {
        postProgress(cls.code, cls.studentId, {
          lessonId,
          stepIdx,
          done: true,
          score: 1,
          updatedAt: next.updatedAt,
          hintsUsed: next.hintsUsed,
        });
      }
    },
    [lessonId, classState],
  );

  const handleQuizAnswer = useCallback(
    (check: QuizCheck, answerIndex: number) => {
      if (answerIndex !== check.answer || !lessonId) return;
      quizRef.current[check.question] = answerIndex;
      setSceneTick((t) => t + 1);
      bumpProgress(lessonStep);
    },
    [lessonId, lessonStep, bumpProgress],
  );

  const handleNumericAnswer = useCallback(
    (check: NumericCheck, value: number) => {
      quizRef.current[check.question] = value;
      setSceneTick((t) => t + 1);
      if (
        Number.isFinite(value) &&
        Math.abs(value - Number(check.answer)) <= Number(check.tolerance)
      )
        bumpProgress(lessonStep);
    },
    [lessonStep, bumpProgress],
  );

  const onLessonExport = useCallback(() => {
    const lesson = lessons.find(({ id }) => id === lessonId);
    if (!lesson) return;
    const blob = new Blob([JSON.stringify(lesson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    download(`handlab-lesson-${lesson.id}.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [lessonId, lessons]);

  const onLessonImport = useCallback(async (f: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text()) as unknown;
    } catch {
      showToast("Invalid lesson JSON file");
      return;
    }
    const cur = lessonsRef.current;
    const next = addImportedLesson(cur, parsed);
    if (next === cur) {
      showToast("Lesson file was invalid or already imported");
      return;
    }
    lessonsRef.current = next;
    setLessons(next);
    showToast("Lesson imported");
  }, [showToast]);

  const shapes = useMemo(
    () => (studio ? [...SHAPES] : FOUNDATIONS),
    [studio],
  );

  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeDrawer(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [drawer, closeDrawer]);

  const mid = mathIdFor(ui.shape);
  const shapeLabel = SHAPE_LABELS[ui.shape];
  const params = mid === "knot" ? [] : SHAPE_DEFS[mid].params;
  const paramDefault = (key: keyof ShapeDims): number =>
    mid === "knot" ? 1 : Number(SHAPE_DEFS[mid].defaults[key] ?? 0);

  const drawerMotion = narrow
    ? {
        initial: reduceMotion ? false : { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
        transition: { duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] as const },
      }
    : {
        initial: reduceMotion ? false : { opacity: 0, x: -12, scale: 0.985 },
        animate: { opacity: 1, x: 0, scale: 1 },
        exit: reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12, scale: 0.985 },
        transition: { duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] as const },
      };

  const drawerClass = "sc-drawer" + (previewOpen ? " sc-drawer--compact" : "");

  if (fatal) {
    return (
      <main className="vr-fatal">
        <div>
          <h1>hand<span>lab</span></h1>
          <p>{fatal}</p>
          <p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Retry
            </button>
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="sc-root">
      <main className="sc-stage">
        <canvas
          ref={canvasRef}
          id="scene"
          className="sc-canvas"
          role="img"
          aria-label="Interactive 3D hand-lab workspace"
        />
        <div className="sc-grid-overlay" aria-hidden="true" />
      </main>
      <div id="cursor2d" ref={cursor2dRef}></div>

      <div className="sc-top-stack">
        <header className="sc-header">
          <div className="sc-brand">
            <h1>handlab <span>· geometry</span></h1>
            <i>interactive 3D geometry workbench</i>
            <div className="sc-domains"><DomainSwitcher active="geometry" /></div>
          </div>
          <div className="sc-mode-slot">
            <SegmentedControl
              className="sc-mode seg"
              label="Learning mode"
              value={studio ? "studio" : "learn"}
              onChange={setMode}
              options={MODE_OPTIONS}
            />
          </div>
          <div className="sc-header__actions">
            <button
              type="button"
              className="sc-btn"
              onClick={() => {
                if (ui.cam === "loading") {
                  engineRef.current?.cancelWebcamLoad();
                } else {
                  engineRef.current?.enableWebcam();
                }
              }}
            >
              {ui.cam === "live" ? "Restart camera" : ui.cam === "loading" ? "Cancel" : "Enable hand tracking"}
            </button>
            <button type="button" className="sc-btn ghost" onClick={onPhoto}>Export PNG</button>
          </div>
        </header>

        <div className="sc-status" aria-label="Hand status">
          <span id="d-hand" className="dot off" ref={dHandRef}></span>
          <span id="t-hand" ref={tHandRef}>none</span>
          <span aria-hidden="true">·</span>
          <span id="t-pinch" ref={tPinchRef}>open</span>
          <span aria-hidden="true">·</span>
          <span><b id="t-count" ref={tCountRef}>0</b> placed</span>
        </div>

        <div className="sc-top-banners" aria-live="polite">
          <AnimatePresence>
            {is2D && !fallbackDismissed && (
              <motion.div
                key="fallback-note"
                className="sc-fallback-note"
                role="status"
                initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <span>Rust/WASM 3D mode — WebGL unavailable. Full 3D shapes, studio tools, webcam + save/load active.</span>
                <button type="button" aria-label="Dismiss notice" onClick={() => setFallbackDismissed(true)}>
                  <CloseXIcon size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <nav className="sc-rail" aria-label="Showcase controls">
        <button
          ref={(el) => { drawerTriggerRefs.current.shapes = el; }}
          type="button"
          className={"sc-fab" + (drawer === "shapes" ? " active" : "")}
          aria-expanded={drawer === "shapes"}
          aria-controls="sc-drawer-shapes"
          aria-label="Shapes"
          title="Shape library"
          onClick={() => toggleDrawer("shapes")}
        >
          <span><ShapesIcon size={18} /></span><i>shapes</i>
        </button>
        <button
          ref={(el) => { drawerTriggerRefs.current.line = el; }}
          type="button"
          className={"sc-fab" + (drawer === "line" ? " active" : "")}
          aria-expanded={drawer === "line"}
          aria-controls="sc-drawer-line"
          aria-label="Line tools"
          title="Line + measure tools"
          onClick={() => toggleDrawer("line")}
        >
          <span><LineToolIcon size={18} /></span><i>lines</i>
        </button>
        <button
          type="button"
          className={"sc-fab" + (previewOpen ? " active" : "")}
          aria-pressed={previewOpen}
          aria-label="Camera preview"
          title="Webcam preview"
          onClick={togglePreview}
        >
          <span><CameraIcon size={18} /></span><i>camera</i>
        </button>
        <button
          type="button"
          className={"sc-fab" + (mathOpen ? " active" : "")}
          aria-expanded={mathOpen}
          aria-controls="solid-math-panel"
          aria-label="Math panel"
          title="Live mathematics"
          onClick={toggleMath}
        >
          <span><MathSigmaIcon size={18} /></span><i>math</i>
        </button>
        <button
          ref={(el) => { drawerTriggerRefs.current.lessons = el; }}
          type="button"
          className={"sc-fab" + (drawer === "lessons" ? " active" : "")}
          aria-expanded={drawer === "lessons"}
          aria-controls="sc-drawer-lessons"
          aria-label="Lessons"
          title="Guided lessons"
          onClick={() => toggleDrawer("lessons")}
        >
          <span><LessonsIcon size={18} /></span><i>learn</i>
        </button>
        <button
          ref={(el) => { drawerTriggerRefs.current.settings = el; }}
          type="button"
          className={"sc-fab" + (drawer === "settings" ? " active" : "")}
          aria-expanded={drawer === "settings"}
          aria-controls="sc-drawer-settings"
          aria-label="Settings and scene"
          title="Settings & scene"
          onClick={() => toggleDrawer("settings")}
        >
          <span><SettingsIcon size={18} /></span><i>scene</i>
        </button>
        <button
          ref={(el) => { drawerTriggerRefs.current.help = el; }}
          type="button"
          className={"sc-fab" + (drawer === "help" ? " active" : "")}
          aria-expanded={drawer === "help"}
          aria-controls="sc-drawer-help"
          aria-label="Gestures"
          title="Gesture map"
          onClick={() => toggleDrawer("help")}
        >
          <span><HelpIcon size={18} /></span><i>help</i>
        </button>
      </nav>

      <AnimatePresence mode="wait">
        {drawer === "shapes" && (
          <motion.aside
            key="drawer-shapes"
            id="sc-drawer-shapes"
            className={drawerClass}
            aria-label="Shape library"
            {...drawerMotion}
          >
            <div className="sc-drawer__head">
              <h2>{studio ? "Full library" : "Foundations"}</h2>
              <button type="button" aria-label="Close" onClick={() => closeDrawer(true)}>
                <CloseXIcon size={14} />
              </button>
            </div>
            <div className="sc-shape-grid">
              {shapes.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={"sc-shape" + (ui.shape === id ? " on" : "")}
                  aria-pressed={ui.shape === id}
                  onClick={() => selectShape(id)}
                >
                  <b className="sc-shape__title">
                    <ShapeGlyph shape={id} size={16} />
                    <span>{SHAPE_LABELS[id]}</span>
                  </b>
                </button>
              ))}
            </div>
            <h3 className="solid-math__h">Color</h3>
            <ColorWell color={ui.color} onChange={(c) => engineRef.current?.setColor(c)} />
            <h3 className="solid-math__h">View</h3>
            <div className="sc-chips">
              <button type="button" className={"sc-chip" + (ui.spin ? " on" : "")} aria-pressed={ui.spin} onClick={() => engineRef.current?.toggleSpin()}>
                <RotateCwIcon size={13} />
                <span>Spin</span>
              </button>
              <button type="button" className={"sc-chip" + (ui.grid ? " on" : "")} aria-pressed={ui.grid} onClick={() => engineRef.current?.toggleGrid()}>
                <GridIcon size={13} />
                <span>Grid</span>
              </button>
              <button type="button" className="sc-chip" onClick={() => engineRef.current?.recenter()}>
                <CrosshairIcon size={13} />
                <span>Recenter</span>
              </button>
            </div>
          </motion.aside>
        )}

        {drawer === "settings" && (
          <motion.aside
            key="drawer-settings"
            id="sc-drawer-settings"
            className={drawerClass}
            aria-label="Settings and scene"
            {...drawerMotion}
          >
            <div className="sc-drawer__head">
              <h2>Settings &amp; scene</h2>
              <button type="button" aria-label="Close" onClick={() => closeDrawer(true)}>
                <CloseXIcon size={14} />
              </button>
            </div>
            <h3 className="solid-math__h">Display</h3>
            <ThemeToggle />
            <AccentSection headingLevel={3} />
            <h3 className="solid-math__h">Depth AI</h3>
            <div className="sc-chips">
              <button type="button" className={"sc-chip" + (ui.depthOn ? " on" : "")} aria-pressed={ui.depthOn} onClick={() => void engineRef.current?.setDepthEnabled?.(!ui.depthOn)}>
                Depth v2
              </button>
            </div>
            <p className="sc-note">{ui.depth}</p>
            <h3 className="solid-math__h">Scene</h3>
            <div className="sc-chips">
              <button type="button" className="sc-chip" onClick={() => engineRef.current?.saveToStorage()}>
                <SaveIcon size={13} />
                <span>Save</span>
              </button>
              <button type="button" className="sc-chip" onClick={() => engineRef.current?.loadFromStorage()}>
                <FolderOpenIcon size={13} />
                <span>Load</span>
              </button>
              <button type="button" className="sc-chip" onClick={onExportFile}>
                <DownloadIcon size={13} />
                <span>Export JSON</span>
              </button>
              <button type="button" className="sc-chip" onClick={() => fileRef.current?.click()}>
                <UploadIcon size={13} />
                <span>Import JSON</span>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); e.target.value = ""; }} />
            <h3 className="solid-math__h">Ghost overlay</h3>
            <div className="sc-chips">
              <button type="button" className="sc-chip" onClick={() => ghostFileRef.current?.click()}>
                Import ghost
              </button>
              <button type="button" className="sc-chip" onClick={onGhostClear}>
                Clear ghost
              </button>
            </div>
            <p className="sc-note">Load a target scene as a translucent ghost to match — ghosts ignore checks, picking, and exports.</p>
            <input ref={ghostFileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onGhostImport(f); e.target.value = ""; }} />
          </motion.aside>
        )}

        {drawer === "line" && (
          <motion.aside
            key="drawer-line"
            id="sc-drawer-line"
            className={drawerClass}
            aria-label="Line tools"
            {...drawerMotion}
          >
            <div className="sc-drawer__head">
              <h2>Measure · lines <kbd>L</kbd></h2>
              <button type="button" aria-label="Close" onClick={() => closeDrawer(true)}>
                <CloseXIcon size={14} />
              </button>
            </div>
            <div className="sc-chips">
              <button type="button" className={"sc-chip" + (ui.lineMode ? " on" : "")} aria-pressed={ui.lineMode} onClick={() => engineRef.current?.setLineMode(!ui.lineMode)}>
                Line: {ui.lineMode ? "On" : "Off"}
              </button>
              <button type="button" className={"sc-chip" + (ui.snapOn ? " on" : "")} aria-pressed={ui.snapOn} onClick={() => engineRef.current?.toggleSnap()}>Snap</button>
            </div>
            <div className="sc-chips">
              <button type="button" className="sc-chip" onClick={() => engineRef.current?.undo()}>Undo</button>
              <button type="button" className="sc-chip" onClick={() => engineRef.current?.clearLines()}>Clear lines</button>
              <button type="button" className="sc-chip" onClick={() => engineRef.current?.clearAll()}>Clear solids</button>
            </div>
            <div className="sc-chips">
              <button
                type="button"
                className={"sc-chip" + (angleSumChip ? " on" : "")}
                aria-pressed={angleSumChip}
                onClick={() => { const on = !angleSumChip; setAngleSumChip(on); engineRef.current?.setChainMathMode?.("angleSum", on); }}
              >Σ angles</button>
              <button
                type="button"
                className={"sc-chip" + (pythagChip ? " on" : "")}
                aria-pressed={pythagChip}
                onClick={() => { const on = !pythagChip; setPythagChip(on); engineRef.current?.setChainMathMode?.("pythag", on); }}
              >a²+b²=c²</button>
            </div>
            <div className="sc-chips">
              <button
                type="button"
                className={"sc-chip" + (rulerChip ? " on" : "")}
                aria-pressed={rulerChip}
                onClick={() => {
                  const on = !!engineRef.current?.toggleRuler();
                  setRulerChip(on);
                  if (on) engineRef.current?.setRulerSpanCm(spanCm);
                }}
              >Ruler</button>
            </div>
            <label className="sc-slider">
              <span className="sc-slider__head"><span>Hand span</span><b>{spanCm.toFixed(0)} cm</b></span>
              <input
                type="range"
                min={10}
                max={30}
                step={1}
                value={spanCm}
                style={sliderTrackStyle(spanCm, 10, 30)}
                onChange={(e) => {
                  const cm = Number(e.target.value);
                  setSpanCm(cm);
                  if (rulerChip) engineRef.current?.setRulerSpanCm(cm);
                }}
                aria-label="My hand span in centimeters"
              />
            </label>
            <p className="sc-note">Ruler: pinch both hands to measure the distance between pinch points. Set your real span above, then pinch that span to calibrate readouts in ≈ cm.</p>
            <div className="sc-chips">
              <button
                type="button"
                className="sc-chip"
                title="Place the current shape without leaving line mode (P / Shift+click)"
                onClick={() => engineRef.current?.placeCurrentShape()}
              >
                <span>Place {shapeLabel}</span>
                <kbd>P</kbd>
              </button>
            </div>
            <p className="sc-note">Tap points to measure — lengths, angles, and area update live. Tap near dots to snap. Solids stay creatable in line mode via Place / <kbd>P</kbd> / Shift+click.</p>
          </motion.aside>
        )}

        {drawer === "help" && (
          <motion.aside
            key="drawer-help"
            id="sc-drawer-help"
            className={drawerClass}
            aria-label="Gesture map"
            {...drawerMotion}
          >
            <div className="sc-drawer__head">
              <h2>Gesture map</h2>
              <button type="button" aria-label="Close" onClick={() => closeDrawer(true)}>
                <CloseXIcon size={14} />
              </button>
            </div>
            <p className="sc-note"><kbd>move index</kbd> cursor follows your view</p>
            <p className="sc-note"><kbd>push in-out</kbd> depth along view axis</p>
            <p className="sc-note"><kbd>pinch tap</kbd> place / select · <kbd>hold</kbd> grab + drag</p>
            <p className="sc-note"><kbd>fist 0.6s</kbd> delete hovered · <kbd>L</kbd> line mode · <kbd>R</kbd> recenter</p>
            <p className="sc-note">No webcam? Mouse moves on your view plane, click places, drag moves.</p>
          </motion.aside>
        )}

        {drawer === "lessons" && (
          <motion.aside
            key="drawer-lessons"
            id="sc-drawer-lessons"
            className={`${drawerClass} sc-lessons`}
            aria-label="Guided lessons"
            {...drawerMotion}
          >
            <div className="sc-drawer__head">
              <h2>Lessons</h2>
              <button type="button" aria-label="Close" onClick={() => closeDrawer(true)}>
                <CloseXIcon size={14} />
              </button>
            </div>
            <LessonPanel
              embedded
              lessons={rolledLessons}
              active={lessonId}
              stepIdx={lessonStep}
              onSelect={selectLesson}
              onNext={(n) => setLessonStep(n)}
              onBack={(n) => setLessonStep(n)}
              progress={lessonId ? progressMap[lessonId] : undefined}
              onQuizAnswer={handleQuizAnswer}
              onNumericAnswer={handleNumericAnswer}
              snap={engineSnap}
              playlists={PLAYLISTS}
              progressAll={progressMap}
              showReroll={!!lessonId}
              onReroll={handleReroll}
              onShowSolution={handleShowSolution}
              onHintUsed={handleHintUsed}
            />
            <ClassCard
              classState={classState}
              onJoined={handleClassJoined}
              onLeft={handleClassLeft}
            />
            <div className="sc-chips sc-chips--lessons">
              <button type="button" className="sc-chip" disabled={!lessonId} onClick={onLessonExport}>
                <DownloadIcon size={13} />
                <span>Export lesson</span>
              </button>
              <button type="button" className="sc-chip" onClick={() => lessonFileRef.current?.click()}>
                <UploadIcon size={13} />
                <span>Import lesson</span>
              </button>
              <a className="sc-chip" href="/teacher">
                Teacher desk
              </a>
            </div>
            <input ref={lessonFileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onLessonImport(f); e.target.value = ""; }} />
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="sc-params" aria-label="Dimensions">
        <b className="sc-params__shape">{shapeLabel}</b>
        {mid === "knot" ? (
          <label className="sc-slider">
            <span className="sc-slider__head"><span>Size</span><b>{(dims.a ?? 1).toFixed(2)}×</b></span>
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.05}
              value={dims.a ?? 1}
              style={sliderTrackStyle(dims.a ?? 1, 0.4, 2.5)}
              onChange={(e) => setDim("a", Number(e.target.value))}
              aria-label="knot size"
            />
          </label>
        ) : (
          params.map((p) => {
            const v = Number(dims[p.key] ?? paramDefault(p.key));
            return (
              <label className="sc-slider" key={p.key}>
                <span className="sc-slider__head"><span>{p.label}</span><b>{v.toFixed(2)}&nbsp;cm</b></span>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={v}
                  style={sliderTrackStyle(v, p.min, p.max)}
                  onChange={(e) => setDim(p.key, Number(e.target.value))}
                  aria-label={p.label}
                />
              </label>
            );
          })
        )}
        <div className="sc-params__depth" aria-label="Hand depth">
          <span className="sc-slider__head"><span>depth&nbsp;(z)</span><b id="t-z" ref={tZRef}>0.0</b></span>
          <div id="depthfill"><i id="depthi" ref={depthiRef}></i></div>
        </div>
      </div>

      <AnimatePresence>
        {mathOpen && (
          <SolidMath
            key="solid-math-panel"
            shape={ui.shape}
            dims={dims}
            onReset={resetDims}
            studio={studio}
            is2D={is2D}
            studioState={studioState}
            onWireframe={setWireframe}
            onMatMode={setMatMode}
            onDetail={setDetail}
            onClipAxis={setClipAxis}
            onClipPos={setClipPos}
          />
        )}
      </AnimatePresence>

      <div id="video-dock" className={"video-dock sc-viddock" + (previewOpen ? "" : " is-collapsed")} aria-hidden={!previewOpen}>
        <div className="bar">
          <span id="t-model" ref={tModelRef}>hand model: loading…</span>
          <span id="t-fps" ref={tFpsRef}>— fps</span>
          <span id="t-pr" ref={tPrRef}>render —</span>
        </div>
        <div className="video-dock__media">
          <video id="cam" ref={videoRef} playsInline muted autoPlay disablePictureInPicture aria-label="Webcam preview"></video>
          <canvas id="skel" ref={skelRef} width={248} height={140} aria-hidden="true"></canvas>
        </div>
      </div>

      <span id="t-xyz" ref={tXyzRef} className="sr-only">0, 0, 0</span>
      <div id="toast" ref={toastRef} role="status" aria-live="polite" aria-atomic="true"></div>
    </div>
  );
}

// The unified lab owns Three.js — LabEntry loads this chunk lazily (ssr: false)
// so the static shell paints first.
export default UnifiedLab;
