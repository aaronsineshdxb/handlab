"use client";

import { useEffect, useRef, useState } from "react";
import DomainSwitcher from "./DomainSwitcher";
import ChemistryToolbar, {
  type AtomId,
  type GlasswareId,
} from "./ChemistryToolbar";
import SimulationBar, { type SimState } from "./SimulationBar";
import LessonPanel from "./LessonPanel";
import ExperimentViewer from "./ExperimentViewer";
import { CHEMISTRY_EXPERIMENTS } from "../lib/experiments/chemistry";
import { CHEMISTRY_LESSONS } from "../lib/lessons/lessons.chemistry";
import { loadProgress, saveStep } from "../lib/lessons/store";
import type { Lesson, Progress, QuizCheck } from "../lib/lessons/types";
import { addImportedLesson } from "../lib/lessons/validation";

export default function ChemistryLab() {
  const [atom, setAtom] = useState<AtomId | null>(null);
  const [glass, setGlass] = useState<GlasswareId | null>(null);
  const [expId, setExpId] = useState(CHEMISTRY_EXPERIMENTS[0].id);
  const experiment = CHEMISTRY_EXPERIMENTS.find((e) => e.id === expId) ?? CHEMISTRY_EXPERIMENTS[0];
  const [sim, setSim] = useState<SimState>({
    playing: false,
    speed: 1,
    stepCount: 0,
  });
  const [lessons, setLessons] = useState<Lesson[]>(CHEMISTRY_LESSONS);
  const lessonsRef = useRef<Lesson[]>(CHEMISTRY_LESSONS);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const lessonFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProgressMap(loadProgress());
  }, []);

  const selectLesson = (nextId: string) => {
    if (lessonId === nextId) {
      setLessonId(null);
      setStepIdx(0);
      return;
    }
    setLessonId(nextId);
    const lesson = lessons.find(({ id }) => id === nextId);
    const last = Math.max((lesson?.steps.length ?? 1) - 1, 0);
    const stored = progressMap[nextId]?.stepIdx ?? 0;
    setStepIdx(Math.min(Math.max(Math.floor(stored), 0), last));
  };

  const handleQuizAnswer = (check: QuizCheck, answerIndex: number) => {
    if (answerIndex !== check.answer || !lessonId) return;
    const next: Progress = {
      lessonId,
      stepIdx,
      done: true,
      score: 1,
      updatedAt: Date.now(),
    };
    saveStep(next);
    setProgressMap((cur) => ({ ...cur, [lessonId]: next }));
  };

  const onImportLessonFile = async (f: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text()) as unknown;
    } catch {
      return;
    }
    const cur = lessonsRef.current;
    const next = addImportedLesson(cur, parsed);
    if (next === cur) return;
    lessonsRef.current = next;
    setLessons(next);
  };

  const staged = atom ?? glass;

  return (
    <>
      <header className="hud-top">
        <div className="brand">
          <h1>
            HAND<span>LAB</span> ⚗ CHEMISTRY
          </h1>
          <p>molecules · glassware · titration · precipitation</p>
        </div>
        <DomainSwitcher active="chemistry" />
      </header>

      <ChemistryToolbar
        atom={atom}
        glass={glass}
        onAtom={(a) => {
          setAtom(a);
          setGlass(null);
        }}
        onGlass={(g) => {
          setGlass(g);
          setAtom(null);
        }}
      />

      <div className="domain-stage" role="img" aria-label="Chemistry lab manual">
        <div className="domain-stage-card exp-card">
          <label className="exp-picker-label" htmlFor="chm-exp-select">
            LAB MANUAL · {staged ? `STAGED: ${staged} · ` : ""}SALT ANALYSIS + TITRATIONS
          </label>
          <select
            id="chm-exp-select"
            className="exp-picker"
            value={expId}
            onChange={(e) => setExpId(e.target.value)}
          >
            {CHEMISTRY_EXPERIMENTS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <div className="exp-scroll">
            <ExperimentViewer experiment={experiment} />
          </div>
          <div className="sim-bar">
            <button type="button" className="mini" onClick={() => selectLesson(experiment.id)}>
              ▶ Start guided steps
            </button>
          </div>
          <SimulationBar
            sim={sim}
            onChange={setSim}
            onReset={() => setSim({ playing: false, speed: 1, stepCount: 0 })}
          />
        </div>
      </div>

      <LessonPanel
        lessons={lessons}
        active={lessonId}
        stepIdx={stepIdx}
        onSelect={selectLesson}
        onNext={(n) => setStepIdx(n)}
        onBack={(n) => setStepIdx(n)}
        progress={lessonId ? progressMap[lessonId] : undefined}
        onQuizAnswer={handleQuizAnswer}
      />

      <div className="controls">
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
        <button className="btn ghost" onClick={() => lessonFileRef.current?.click()}>
          import chemistry lesson ↑
        </button>
      </div>
    </>
  );
}
