export type Level = "intro" | "advanced";

export type CheckKind =
  | { kind: "place-count"; shape: string; count: number }
  | { kind: "chain-closed"; minPoints: number }
  | { kind: "area-gt"; min: number }
  | { kind: "quiz"; question: string; options: string[]; answer: number };

export type QuizCheck = Extract<CheckKind, { kind: "quiz" }>;

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
