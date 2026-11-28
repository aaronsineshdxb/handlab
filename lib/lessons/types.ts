import type { SceneData } from "../engine";

export type Level = "intro" | "advanced";

export type SubjectDomain = "physics" | "chemistry" | "geometry";

/** A lesson-JSON number field may reference a rolled variable ("{{h}}").
 *  Validation resolves templates at import time and instantiateLesson()
 *  replaces them with rolled numbers, so evalCheck always sees plain
 *  numbers at runtime. */
export type NumVal = number | string;

/** A rolled-variable definition in a lesson template. rollVars() picks a
 *  value in [min,max], optionally quantized to `step`, and string
 *  substitution renders it with `decimals` places (default 2). */
export interface VarSpec {
  min: number;
  max: number;
  step?: number;
  decimals?: number;
}

export type VarRolls = Record<string, number>;

export type CheckKind =
  | { kind: "place-count"; shape: string; count: NumVal }
  | { kind: "chain-closed"; minPoints: NumVal }
  | { kind: "area-gt"; min: NumVal }
  | { kind: "angle-at"; min: NumVal; max: NumVal }
  | { kind: "length-range"; min: NumVal; max: NumVal }
  | { kind: "numeric"; question: string; answer: NumVal; tolerance: NumVal }
  | { kind: "quiz"; question: string; options: string[]; answer: number };

export type QuizCheck = Extract<CheckKind, { kind: "quiz" }>;
/** Free numeric answer check. Stored by the question text in the same
 *  quizAnswers record the engine snapshot carries. */
export type NumericCheck = Extract<CheckKind, { kind: "numeric" }>;

export interface LessonStep {
  id: string;
  title: string;
  prompt: string;
  level: Level;
  hint?: string;
  /** Optional target scene for the hint ladder's "Show me" ghost: a plain
   *  SceneData JSON (same format as scene export) rendered as a translucent
   *  overlay the student can match. Never counts toward checks. */
  solution?: SceneData;
  checks: CheckKind[];
}

export interface Lesson {
  id: string;
  title: string;
  level: Level;
  domain?: SubjectDomain;
  topic?: string;
  /** Template variables. When present, prompt/check text may reference
   *  {{name}} and rollVars() re-rolls concrete numbers per attempt. */
  vars?: Record<string, VarSpec>;
  objectives: string[];
  steps: LessonStep[];
}

export interface Progress {
  lessonId: string;
  stepIdx: number;
  done: boolean;
  score: number;
  updatedAt: number;
  /** Hint-ladder usage for the current lesson attempt (hints + ghosts
   *  revealed). Reported to the classroom server; optional so older
   *  localStorage records stay valid. */
  hintsUsed?: number;
}
