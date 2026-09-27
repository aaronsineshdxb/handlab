"use client";

import { useState } from "react";
import DomainSwitcher from "./DomainSwitcher";
import PhysicsToolbar, { type PhysicsToolId } from "./PhysicsToolbar";
import SimulationBar, { type SimState } from "./SimulationBar";
import LessonPanel from "./LessonPanel";
import { PHYSICS_LESSONS } from "../lib/lessons/lessons.physics";
import { loadProgress, saveStep } from "../lib/lessons/store";
import { useEffect, useRef } from "react";
import type { Lesson, Progress, QuizCheck } from "../lib/lessons/types";
import { addImportedLesson } from "../lib/lessons/validation";

export default function PhysicsLab() {
  const [tool, setTool] = useState<PhysicsToolId | null>(null);
  const [sim, setSim] = useState<SimState>({
    playing: false,
    speed: 1,
    stepCount: 0,
  });
  const [lessons, setLessons] = useState<Lesson[]>(PHYSICS_LESSONS);
  const lessonsRef = useRef<Lesson[]>(PHYSICS_LESSONS);
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

  return (
    <>
      <header className="hud-top">
        <div className="brand">
          <h1>
            HAND<span>LAB</span> ⚛ PHYSICS
          </h1>
          <p>ramp · projectile · springs · charges · optics — Rapier sim</p>
        </div>
        <DomainSwitcher active="physics" />
      </header>

      <PhysicsToolbar active={tool} onSelect={setTool} />

      <div className="domain-stage" role="img" aria-label="Physics 3D viewport (placeholder)">
        <div className="domain-stage-card">
          <p className="domain-kicker">PHYSICS WORKSPACE · PREVIEW</p>
          <h2>{tool ? `Tool staged: ${tool}` : "Pick a tool on the left"}</h2>
          <p className="m-sub">
            3D rigid-body viewport mounts here in Sprint 1
            (lib/physics/rapier.ts + lib/clock.ts). Simulation clock state:{" "}
            {sim.playing ? `running @ ${sim.speed}x` : "paused"}
            {sim.stepCount > 0 ? ` · stepped ${sim.stepCount}` : ""}.
          </p>
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
          import physics lesson ↑
        </button>
      </div>
    </>
  );
}
