"use client";

import { memo, useEffect, useRef, useState } from "react";
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
import {
  firstLockedIndex,
  isPlaylistComplete,
  type Playlist,
} from "../lib/lessons/playlists";

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
      // Templates resolve to numbers before display; Number() keeps template
      // strings from taking the "±" branch.
      return Number(check.tolerance) > 0
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
  /** Ordered courses for the Courses tab; empty/undefined hides the tab. */
  playlists?: Playlist[];
  /** Progress for every lesson — courses unlock-gating reads this. */
  progressAll?: Record<string, Progress>;
  /** True when the active lesson is a randomized template (shows "New numbers"). */
  showReroll?: boolean;
  /** Re-rolls the template variables for the active lesson. */
  onReroll?: () => void;
  /** Renders the step's solution scene as a ghost overlay (null clears).
   *  Returns false when the engine could not render it (e.g. the 2D
   *  fallback has no ghost overlay) so the ladder doesn't claim success. */
  onShowSolution?: (json: string | null) => boolean | void;
  /** Fires whenever the student reveals a hint or a solution ghost. */
  onHintUsed?: () => void;
}

type PanelView = "lessons" | "courses";

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
  playlists,
  progressAll,
  showReroll = false,
  onReroll,
  onShowSolution,
  onHintUsed,
}: LessonPanelProps) {
  const lesson = lessons.find(({ id }) => id === active);
  const [levelMode, setLevelMode] = useState<LessonLevelMode>("both");
  const [view, setView] = useState<PanelView>("lessons");
  const [completedQuizKey, setCompletedQuizKey] = useState<string | null>(null);
  const [completedNumericKey, setCompletedNumericKey] = useState<string | null>(null);
  const [quizIncorrect, setQuizIncorrect] = useState(false);
  const [quizRun, setQuizRun] = useState(0);
  // ---- hint ladder (#9): fails → hint → solution ghost ----
  const [fails, setFails] = useState(0);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [ghostOn, setGhostOn] = useState(false);
  const ghostRef = useRef(false);
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
    setFails(0);
    setHintRevealed(false);
    setGhostOn(false);
  }, [active, stepIdx, step?.id, quizCheck?.question, quizRun]);

  // Ghost overlay cleanup: leaving a step (or the lesson) that had the
  // solution ghost showing clears it in the engine.
  useEffect(() => {
    ghostRef.current = ghostOn;
    return () => {
      if (ghostRef.current) onShowSolution?.(null);
    };
  }, [active, stepIdx, step?.id, ghostOn, onShowSolution]);

  const handleQuizAnswer = (answerIndex: number) => {
    if (quizCheck?.kind !== "quiz") return;
    const correct = answerIndex === quizCheck.answer;
    setCompletedQuizKey(correct ? quizKey : null);
    setQuizIncorrect(!correct);
    if (!correct) setFails((f) => f + 1);
    onQuizAnswer?.(quizCheck, answerIndex);
  };

  const handleNumericAnswer = (value: number) => {
    if (numericCheck?.kind !== "numeric" || !Number.isFinite(value)) return;
    // Checks arrive instantiated (plain numbers); Number() only satisfies
    // the NumVal authoring type.
    const correct =
      Math.abs(value - Number(numericCheck.answer)) <= Number(numericCheck.tolerance);
    setCompletedNumericKey(correct ? numericKey : null);
    setQuizIncorrect(!correct);
    if (!correct) setFails((f) => f + 1);
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

  // Hint ladder: prompt always visible; hint text unlocks on demand or
  // automatically after the first failed attempt; the solution ghost unlocks
  // after a failed attempt (or after the hint was revealed).
  const hintShown = hintRevealed || fails >= 1;
  const ghostAvailable = fails >= 1 || hintRevealed;
  const hasVars =
    !!lesson?.vars && Object.keys(lesson.vars).length > 0;

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
      {playlists && playlists.length > 0 && (
        <div className="lesson-panel__seg">
          <SegmentedControl
            label="Browse mode"
            value={view}
            onChange={setView}
            options={[
              { id: "lessons", label: "Lessons" },
              { id: "courses", label: "Courses" },
            ]}
          />
        </div>
      )}
      {showReroll && hasVars && (
        <div className="lesson-panel__seg">
          <button type="button" className="btn ghost" onClick={onReroll}>
            New numbers
          </button>
        </div>
      )}
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
      {view === "lessons" ? (
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
      ) : (
        <div className="lesson-playlists">
          {(playlists ?? []).map((playlist) => {
            const unlockedUpTo = firstLockedIndex(
              playlist,
              lessons,
              progressAll ?? {},
            );
            const complete = isPlaylistComplete(
              playlist,
              lessons,
              progressAll ?? {},
            );
            return (
              <section key={playlist.id} className="lesson-playlist" aria-label={playlist.title}>
                <h4 className="solid-math__h lesson-playlist__title">
                  {playlist.title}
                  {complete && (
                    <span className="lesson-playlist__badge" aria-label="Course complete">
                      <CheckIcon size={13} />
                    </span>
                  )}
                </h4>
                <ol className="lesson-playlist__list">
                  {playlist.lessonIds.map((id, index) => {
                    const entry = lessons.find(({ id: lid }) => lid === id);
                    if (!entry) return null;
                    const locked = index >= unlockedUpTo;
                    const done = progressAll?.[id]?.done === true;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className={"mini" + (active === id ? " active" : "")}
                          disabled={locked}
                          title={locked ? "Finish the previous lesson to unlock" : undefined}
                          onClick={() => onSelect(id)}
                        >
                          {done ? "✓ " : ""}
                          {entry.title}
                          {locked ? " · locked" : ""}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}

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
              {step.hint && !hintShown && (
                <button
                  type="button"
                  className="btn ghost lesson-panel__ladder-btn"
                  onClick={() => {
                    setHintRevealed(true);
                    onHintUsed?.();
                  }}
                >
                  Show hint
                </button>
              )}
              {step.hint && hintShown && (
                <p className="m-sub lesson-panel__text">
                  Hint: {step.hint}
                </p>
              )}
              {step.solution && ghostAvailable && !ghostOn && (
                <button
                  type="button"
                  className="btn ghost lesson-panel__ladder-btn"
                  onClick={() => {
                    const accepted = onShowSolution?.(JSON.stringify(step.solution));
                    if (accepted === false) return;
                    setGhostOn(true);
                    onHintUsed?.();
                  }}
                >
                  Show me
                </button>
              )}
              {ghostOn && (
                <p className="m-sub lesson-panel__text" role="status">
                  Solution ghost showing — match it, then hide it by going back
                  or forward.
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
                  answer={Number(numericCheck.answer)}
                  tolerance={Number(numericCheck.tolerance)}
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
