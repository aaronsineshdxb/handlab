import type { Lesson } from "./types";
import { PHYSICS_EXPERIMENTS } from "../experiments/physics";
import { experimentToLesson } from "../experiments/toLessons";

/** Guided lessons generated from the physics practical manuals. */
export const PHYSICS_LESSONS: Lesson[] = PHYSICS_EXPERIMENTS.map(experimentToLesson);
