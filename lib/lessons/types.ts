export type Level = "intro" | "advanced";

export type SubjectDomain = "physics" | "chemistry" | "geometry";

export type CheckKind =
  | { kind: "place-count"; shape: string; count: number }
  | { kind: "chain-closed"; minPoints: number }
  | { kind: "area-gt"; min: number }
  | { kind: "angle-at"; min: number; max: number }
  | { kind: "length-range"; min: number; max: number }
  | { kind: "numeric"; question: string; answer: number; tolerance: number }
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
  checks: CheckKind[];
}

export interface Lesson {
  id: string;
  title: string;
  level: Level;
  domain?: SubjectDomain;
  topic?: string;
  objectives: string[];
  steps: LessonStep[];
}

export interface Progress {
  lessonId: string;
  stepIdx: number;
  done: boolean;
  score: number;
  updatedAt: number;
}
