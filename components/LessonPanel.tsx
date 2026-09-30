"use client";

import { memo, useEffect, useState } from "react";
import QuizCard from "./QuizCard";
import SegmentedControl from "./bits/SegmentedControl";
import AnimatedList from "./bits/AnimatedList";
import type {
  CheckKind,
  Lesson,
  Progress,
  QuizCheck,
} from "../lib/lessons/types";
import { evalCheck, type SceneSnap } from "../lib/lessons/checks";

export type LessonLevelMode = "intro" | "advanced" | "both";

/** Plain-language description of a scene check, shown as a live checklist so
 *  a blocked step explains what the student still has to do. */
export function describeCheck(check: CheckKind): string {
  switch (check.kind) {
    case "place-count":
      return `Place ${check.count} × ${check.shape}`;
    case "chain-closed":
      return `Close a loop of ${check.minPoints}+ points`;
    case "area-gt":
      return `Enclose an area greater than ${check.min} m²`;
    default:
      return "Answer the question";
  }
}

export function getVisibleStepIndexes(lesson: Lesson, levelMode: LessonLevelMode): number[] {
  return lesson.steps.reduce<number[]>((indexes, step, index) => {
    if (levelMode === "both" || step.level === levelMode) indexes.push(index);
    return indexes;
  }, []);
}

export interface LessonPanelProps {
  lessons: Lesson[];
  active: string | null;
  stepIdx: number;
  onSelect: (lessonId: string) => void;
  onNext: (nextStepIdx: number) => void;
  onBack: (previousStepIdx: number) => void;
  progress?: Progress;
  onQuizAnswer?: (check: QuizCheck, answerIndex: number) => void;
  /** Live scene snapshot. When provided, scene-based checks (place-count,
   *  chain-closed, area-gt) gate progression instead of being ignored. */
  snap?: SceneSnap;
}

function LessonPanel({
  lessons,
  active,
  stepIdx,
  onSelect,
  onNext,
  onBack,
  progress,
  onQuizAnswer,
  snap,
}: LessonPanelProps) {
  const lesson = lessons.find(({ id }) => id === active);
  const [levelMode, setLevelMode] = useState<LessonLevelMode>("both");
  const [completedQuizKey, setCompletedQuizKey] = useState<string | null>(null);
  const [quizIncorrect, setQuizIncorrect] = useState(false);
  const [quizRun, setQuizRun] = useState(0);
  const visibleStepIndexes = lesson ? getVisibleStepIndexes(lesson, levelMode) : [];
  const activeStepPosition = visibleStepIndexes.indexOf(stepIdx);
  const step = activeStepPosition >= 0 ? lesson?.steps[stepIdx] : undefined;
  const nextStepIdx =
    activeStepPosition >= 0 ? visibleStepIndexes[activeStepPosition + 1] : undefined;
  const previousStepIdx =
    activeStepPosition >= 0 ? visibleStepIndexes[activeStepPosition - 1] : undefined;
  const quizCheck = step?.checks.find((check) => check.kind === "quiz");
  const maxResumeStepIdx = Math.max((lesson?.steps.length ?? 1) - 1, 0);
  const resumeStepIdx = Math.min(
    Math.max(Math.floor(progress?.stepIdx ?? 0), 0),
    maxResumeStepIdx,
  );
  const scorePercent = Math.round(Math.max(0, Math.min(1, progress?.score ?? 0)) * 100);
  const quizKey =
    quizCheck?.kind === "quiz"
      ? `${active ?? ""}:${step?.id ?? ""}:${quizCheck.question}`
      : null;
  const firstVisibleStepIdx = visibleStepIndexes[0];

  useEffect(() => {
    if (
      !lesson ||
      firstVisibleStepIdx === undefined ||
      activeStepPosition >= 0
    )
      return;

    if (firstVisibleStepIdx > stepIdx) onNext(firstVisibleStepIdx);
    else onBack(firstVisibleStepIdx);
  }, [activeStepPosition, firstVisibleStepIdx, lesson, onBack, onNext, stepIdx]);

  useEffect(() => {
    setCompletedQuizKey(null);
    setQuizIncorrect(false);
  }, [active, stepIdx, step?.id, quizCheck?.question, quizRun]);

  const handleQuizAnswer = (answerIndex: number) => {
    if (quizCheck?.kind !== "quiz") return;
    const correct = answerIndex === quizCheck.answer;
    setCompletedQuizKey(correct ? quizKey : null);
    setQuizIncorrect(!correct);
    onQuizAnswer?.(quizCheck, answerIndex);
  };

  const quizComplete =
    quizCheck?.kind === "quiz" && completedQuizKey === quizKey;
  const quizIncomplete = quizCheck?.kind === "quiz" && !quizComplete;

  // Scene checks are evaluated against the live scene. Without a snapshot
  // (e.g. the standalone physics/chemistry labs) they can't be verified, so
  // they're treated as satisfied rather than silently blocking the student.
  const sceneChecks = (step?.checks ?? []).filter((c) => c.kind !== "quiz");
  const checkStatus = sceneChecks.map((check) => ({
    check,
    label: describeCheck(check),
    passed: snap ? evalCheck(check, snap) : true,
  }));
  const sceneIncomplete = checkStatus.some((c) => !c.passed);
  const stepBlocked = quizIncomplete || sceneIncomplete;

  const resetQuiz = () => {
    setCompletedQuizKey(null);
    setQuizIncorrect(false);
    setQuizRun((run) => run + 1);
  };

  return (
    <aside className="hint lesson-panel" aria-label="Lessons">
      <h2>LESSONS</h2>
      <div style={{ marginBottom: 8 }}>
        <SegmentedControl
          label="Lesson level mode"
          value={levelMode}
          onChange={setLevelMode}
          options={[
            { id: "intro", label: "Easy" },
            { id: "advanced", label: "Advanced" },
            { id: "both", label: "Both" },
          ]}
        />
      </div>
      {lesson && progress && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span className="m-sub">Resume · Step {resumeStepIdx + 1}</span>
          <span
            role="progressbar"
            aria-label="Lesson score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={scorePercent}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: `conic-gradient(var(--good) ${scorePercent}%, var(--border) 0)`,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <span
              className="m-sub"
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "var(--surface)",
                display: "grid",
                placeItems: "center",
                color: "var(--fg)",
                fontSize: 8,
              }}
            >
              {scorePercent}%
            </span>
          </span>
        </div>
      )}
      <nav aria-label="Lesson list">
        <AnimatedList>
          {lessons.map(({ id, title, level }) => (
            <button
              key={id}
              type="button"
              className={"mini" + (active === id ? " active" : "")}
              aria-pressed={active === id}
              onClick={() => onSelect(id)}
            >
              {title} · {level}
            </button>
          ))}
        </AnimatedList>
      </nav>

      {lesson && (
        <>
          <h3 className="m-sub">OBJECTIVES</h3>
          <ul className="m-sub" style={{ paddingLeft: 18, listStyle: "disc" }}>
            {lesson.objectives.map((objective, index) => (
              <li key={`${objective}-${index}`}>{objective}</li>
            ))}
          </ul>

          {visibleStepIndexes.length === 0 && (
            <p className="m-sub" role="status">
              No steps are available for this lesson at the selected level.
            </p>
          )}

          {step && (
            <>
              {/* Announce step navigation only. A polite live region wrapping
                  the checklist re-announced it on every scene sync, which is
                  every 100ms while a student drags a shape. */}
              <div aria-live="polite" aria-atomic="true">
                <h3 className="m-sub">STEP {activeStepPosition + 1}</h3>
                <p>{step.title}</p>
              </div>
              <p className="m-sub" style={{ marginTop: 8 }}>
                {step.prompt}
              </p>
              {step.hint && (
                <p
                  className="m-sub"
                  style={{ marginTop: 8 }}
                  aria-live={quizIncorrect ? "assertive" : undefined}
                >
                  Hint: {step.hint}
                </p>
              )}
              {checkStatus.length > 0 && (
                <ul
                  className="m-sub lesson-checks"
                  aria-label="Step requirements"
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "8px 0 0",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  {checkStatus.map(({ check, label, passed }, index) => (
                    <li
                      key={`${check.kind}-${index}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: passed ? "var(--good)" : "var(--muted)",
                      }}
                    >
                      <span aria-hidden="true">{passed ? "✓" : "○"}</span>
                      <span>
                        <span className="sr-only">
                          {passed ? "Done: " : "Not done: "}
                        </span>
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {quizCheck?.kind === "quiz" && (
                <QuizCard
                  key={`${active}:${step.id}:${quizCheck.question}:${quizRun}`}
                  question={quizCheck.question}
                  options={quizCheck.options}
                  answerIndex={quizCheck.answer}
                  hint={step.hint ?? step.prompt ?? step.title}
                  onAnswer={handleQuizAnswer}
                />
              )}
            </>
          )}
        </>
      )}

      <div className="tool-row" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn ghost"
          disabled={previousStepIdx === undefined}
          onClick={() => {
            if (previousStepIdx === undefined) return;
            resetQuiz();
            onBack(previousStepIdx);
          }}
        >
          Back
        </button>
        <button
          type="button"
          className="btn"
          disabled={nextStepIdx === undefined || stepBlocked}
          aria-describedby={nextStepIdx !== undefined && stepBlocked ? "next-blocked" : undefined}
          onClick={() => {
            if (nextStepIdx === undefined) return;
            resetQuiz();
            onNext(nextStepIdx);
          }}
        >
          Next
        </button>
        {nextStepIdx !== undefined && stepBlocked && (
          <p id="next-blocked" className="m-sub" role="status" style={{ marginTop: 6 }}>
            {sceneIncomplete
              ? "Finish the step requirements above to continue."
              : "Answer the question correctly to continue."}
          </p>
        )}
      </div>
    </aside>
  );
}

export default memo(LessonPanel);
