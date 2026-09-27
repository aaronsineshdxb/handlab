import type { Lesson } from "./types";

/**
 * Starter physics catalog for the /physics route.
 *
 * NOTE: Steps currently use the geometry-era CheckKinds (place-count / quiz)
 * so the existing live evaluator keeps working. Sprint 5 (see
 * handlab_physics_chemistry_detailed_plan.md §5) will extend these with
 * physics-target-hit, pendulum-period, ramp-static-friction-measured, etc.
 * and wire them to the Rapier simulation snapshot.
 */
export const PHYSICS_LESSONS: Lesson[] = [
  {
    id: "phy-01-newton-second-law",
    title: "Newton's Second Law (F = ma)",
    level: "intro",
    domain: "physics",
    topic: "mechanics",
    objectives: ["Relate force, mass, and acceleration"],
    steps: [
      {
        id: "phy01-s1",
        title: "Quiz: F = ma",
        prompt: "A 2 kg cart feels a 4 N push. What is its acceleration?",
        level: "intro",
        hint: "a = F / m",
        checks: [
          {
            kind: "quiz",
            question: "a for 4 N on 2 kg?",
            options: ["1 m/s²", "2 m/s²", "8 m/s²"],
            answer: 1,
          },
        ],
      },
      {
        id: "phy01-s2",
        title: "Double the mass",
        prompt:
          "Same 4 N push, mass doubled to 4 kg. Quit the sandbox preview: full glider-cart sim lands in Sprint 1.",
        level: "intro",
        hint: "Doubling mass halves acceleration at constant force.",
        checks: [
          {
            kind: "quiz",
            question: "a for 4 N on 4 kg?",
            options: ["0.5 m/s²", "1 m/s²", "2 m/s²"],
            answer: 1,
          },
        ],
      },
    ],
  },
  {
    id: "phy-02-projectile-preview",
    title: "Projectile Target Practice (preview)",
    level: "intro",
    domain: "physics",
    topic: "projectile-motion",
    objectives: ["Predict range from angle and speed"],
    steps: [
      {
        id: "phy02-s1",
        title: "Best angle, no air",
        prompt:
          "Ignoring air resistance, which launch angle gives maximum range?",
        level: "intro",
        checks: [
          {
            kind: "quiz",
            question: "Max-range angle?",
            options: ["30°", "45°", "60°"],
            answer: 1,
          },
        ],
      },
    ],
  },
];
