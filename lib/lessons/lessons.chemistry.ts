import type { Lesson } from "./types";
import { CHEMISTRY_EXPERIMENTS } from "../experiments/chemistry";
import { experimentToLesson } from "../experiments/toLessons";

/** Guided lessons generated from the chemistry practical manuals. */
export const CHEMISTRY_LESSONS: Lesson[] = CHEMISTRY_EXPERIMENTS.map(experimentToLesson);
