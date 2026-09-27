import type { Level, SubjectDomain } from "../lessons/types";

/** Single multiple-choice check attached to an experiment. */
export interface QuizItem {
  question: string;
  options: string[];
  /** index into options */
  answer: number;
  /** shown as the step hint */
  explanation?: string;
}

export interface ObservationTable {
  caption?: string;
  columns: string[];
  /** blank cells are fill-in boxes for the student */
  rows: string[][];
}

/**
 * Structured school-lab experiment, transcribed from the class practical
 * manuals (physics experiments + activities, chemistry qualitative salt
 * analysis + volumetric titrations). Rendered by ExperimentViewer and
 * converted to guided lessons by experimentToLesson.
 */
export interface Experiment {
  /** doubles as the guided-lesson id, e.g. "phy-ohms-law" */
  id: string;
  domain: SubjectDomain;
  kind: "experiment" | "activity";
  title: string;
  topic: string;
  level: Level;
  objectives: string[];
  aim: string;
  apparatus: string[];
  theory: string;
  formulas: { label: string; expression: string }[];
  procedure: string[];
  observationTables: ObservationTable[];
  result: string;
  precautions: string[];
  sourcesOfError: string[];
  quiz: QuizItem[];
}
