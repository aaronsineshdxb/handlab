"use client";

import { memo, useEffect, useState } from "react";
import NumericCard from "./NumericCard";
import QuizCard from "./QuizCard";
import SegmentedControl from "./bits/SegmentedControl";
import AnimatedList from "./bits/AnimatedList";
import { CheckIcon } from "./icons";
import type {
  CheckKind,
  Lesson,
  NumericCheck,
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
    case "angle-at":
      return `Turn an angle between ${check.min}° and ${check.max}°`;
    case "length-range":
      return `Draw a chain between ${check.min} m and ${check.max} m long`;
    case "numeric":
      return check.tolerance > 0
        ? `Type the value of ${check.question} (± ${check.tolerance})`
        : `Type the value of ${check.question}`;
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
  /** Fires when the student submits a numeric answer (NaN-guarded upstream). */
  onNumericAnswer?: (check: NumericCheck, value: number) => void;
  /** Live scene snapshot. When provided, scene-based checks (place-count,
   *  chain-closed, area-gt) gate progression instead of being ignored. */
  snap?: SceneSnap;
  /** When true, renders inside an existing drawer without a nested <aside> or duplicate heading. */
  embedded?: boolean;
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
  onNumericAnswer,
  snap,
  embedded = false,
}: LessonPanelProps) {
  const lesson = lessons.find(({ id }) => id === active);
  const [levelMode, setLevelMode] = useState<LessonLevelMode>("both");
  const [completedQuizKey, setCompletedQuizKey] = useState<string | null>(null);
  const [completedNumericKey, setCompletedNumericKey] = useState<string | null>(null);
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
  const numericCheck = step?.checks.find(
    (check): check is NumericCheck => check.kind === "numeric",
  );
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
  const numericKey =
    numericCheck?.kind === "numeric"
      ? `${active ?? ""}:${step?.id ?? ""}:${numericCheck.question}`
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
    setCompletedNumericKey(null);
    setQuizIncorrect(false);
  }, [active, stepIdx, step?.id, quizCheck?.question, quizRun]);

  const handleQuizAnswer = (answerIndex: number) => {
    if (quizCheck?.kind !== "quiz") return;
    const correct = answerIndex === quizCheck.answer;
    setCompletedQuizKey(correct ? quizKey : null);
    setQuizIncorrect(!correct);
    onQuizAnswer?.(quizCheck, answerIndex);
  };

  const handleNumericAnswer = (value: number) => {
    if (numericCheck?.kind !== "numeric" || !Number.isFinite(value)) return;
    const correct = Math.abs(value - numericCheck.answer) <= numericCheck.tolerance;
    setCompletedNumericKey(correct ? numericKey : null);
    setQuizIncorrect(!correct);
    onNumericAnswer?.(numericCheck, value);
  };

  const isPreviouslyCompleted =
    !!progress &&
    (progress.stepIdx > stepIdx ||
      (progress.stepIdx === stepIdx && progress.done));
  const quizComplete =
    (quizCheck?.kind === "quiz" && completedQuizKey === quizKey) ||
    isPreviouslyCompleted;
  const quizIncomplete = quizCheck?.kind === "quiz" && !quizComplete;
  const numericComplete =
    (numericCheck?.kind === "numeric" && completedNumericKey === numericKey) ||
    isPreviouslyCompleted;
  const numericIncomplete = numericCheck?.kind === "numeric" && !numericComplete;

  // Scene checks are evaluated against the live scene. Without a snapshot
  // (e.g. the standalone physics/chemistry labs) they can't be verified, so
  // they're treated as satisfied rather than silently blocking the student.
  // quiz/numeric are excluded: they're answered in their own cards, not by
  // placing objects.
  const sceneChecks = (step?.checks ?? []).filter(
    (c) => c.kind !== "quiz" && c.kind !== "numeric",
  );
  const checkStatus = sceneChecks.map((check) => ({
    check,
    label: describeCheck(check),
    passed: snap ? evalCheck(check, snap) : true,
  }));
  const sceneIncomplete = checkStatus.some((c) => !c.passed);
  const stepBlocked = quizIncomplete || numericIncomplete || sceneIncomplete;

  const resetQuiz = () => {
    setCompletedQuizKey(null);
    setCompletedNumericKey(null);
    setQuizIncorrect(false);
    setQuizRun((run) => run + 1);
  };

  const Container = embedded ? "div" : "aside";
  const containerProps = embedded
    ? { className: "lesson-panel" }
    : { className: "hint lesson-panel", "aria-label": "Lessons" };

  return (
    <Container {...containerProps}>
      {!embedded && <h2>LESSONS</h2>}
      <div className="lesson-panel__seg">
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
        <div className="lesson-panel__progress">
          <span className="m-sub">Resume · Step {resumeStepIdx + 1}</span>
          <span
            role="progressbar"
            aria-label="Lesson score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={scorePercent}
            className="lesson-panel__ring"
            style={{
              background: `conic-gradient(var(--color-good) ${scorePercent}%, var(--color-rule) 0)`,
            }}
          >
            <span className="lesson-panel__ring-inner">
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

      {/* Persistent live region mounted before text updates */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {step ? `Step ${activeStepPosition + 1}: ${step.title}` : ""}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {quizIncorrect && step?.hint ? `Hint: ${step.hint}` : ""}
      </div>

      {!lesson && (
        <p className="m-sub lesson-panel__empty">
          Choose a lesson above to start a guided exercise.
        </p>
      )}

      {lesson && (
        <>
          <h3 className="solid-math__h lesson-panel__h">Objectives</h3>
          <ul className="m-sub lesson-panel__objectives">
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
              <div>
                <h3 className="solid-math__h lesson-panel__h">Step {activeStepPosition + 1}</h3>
                <p>{step.title}</p>
              </div>
              <p className="lesson-panel__prompt lesson-panel__text">
                {step.prompt}
              </p>
              {step.hint && (
                <p className="m-sub lesson-panel__text">
                  Hint: {step.hint}
                </p>
              )}
              {checkStatus.length > 0 && (
                <ul
                  className="m-sub lesson-checks"
                  aria-label="Step requirements"
                >
                  {checkStatus.map(({ check, label, passed }, index) => (
                    <li
                      key={`${check.kind}-${index}`}
                      className={"lesson-checks__item" + (passed ? " is-passed" : "")}
                    >
                      <span className="lesson-checks__icon" aria-hidden="true">
                        {passed ? <CheckIcon size={13} /> : "○"}
                      </span>
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
              {numericCheck?.kind === "numeric" && (
                <NumericCard
                  key={`${active}:${step.id}:${numericCheck.question}:${quizRun}`}
                  question={numericCheck.question}
                  answer={numericCheck.answer}
                  tolerance={numericCheck.tolerance}
                  onAnswer={handleNumericAnswer}
                />
              )}
            </>
          )}

          <div className="tool-row lesson-panel__nav">
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
          </div>
          {nextStepIdx !== undefined && stepBlocked && (
            <p id="next-blocked" className="m-sub lesson-panel__blocked" role="status">
              {sceneIncomplete
                ? "Finish the step requirements above to continue."
                : "Answer the question correctly to continue."}
            </p>
          )}
        </>
      )}
    </Container>
  );
}

export default memo(LessonPanel);
