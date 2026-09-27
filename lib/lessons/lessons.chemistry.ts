import type { Lesson } from "./types";

/**
 * Starter chemistry catalog for the /chemistry route.
 *
 * NOTE: Steps currently use the geometry-era CheckKinds (place-count / quiz)
 * so the existing live evaluator keeps working. Sprint 5 (see
 * handlab_physics_chemistry_detailed_plan.md §5) will extend these with
 * molecule-assembled, titration-endpoint, precipitate-formed, etc.
 * and wire them to the molecular-graph / reaction-engine snapshot.
 */
export const CHEMISTRY_LESSONS: Lesson[] = [
  {
    id: "chm-01-vsepr-preview",
    title: "VSEPR Molecular Shapes (preview)",
    level: "intro",
    domain: "chemistry",
    topic: "molecular-geometry",
    objectives: ["Predict methane and water geometries"],
    steps: [
      {
        id: "chm01-s1",
        title: "Methane geometry",
        prompt:
          "Carbon with 4 hydrogens (CH₄) — what is the H–C–H angle? Full 3D builder lands in Sprint 2.",
        level: "intro",
        hint: "Tetrahedral",
        checks: [
          {
            kind: "quiz",
            question: "H–C–H angle in CH₄?",
            options: ["104.5°", "109.5°", "120°"],
            answer: 1,
          },
        ],
      },
      {
        id: "chm01-s2",
        title: "Water geometry",
        prompt: "Water (H₂O) is bent. What causes the 104.5° angle?",
        level: "intro",
        hint: "Lone pairs repel.",
        checks: [
          {
            kind: "quiz",
            question: "Why is H₂O bent?",
            options: [
              "Lone-pair repulsion",
              "Double bonds",
              "Ionic lattice",
            ],
            answer: 0,
          },
        ],
      },
    ],
  },
  {
    id: "chm-03-titration-preview",
    title: "Acid–Base Titration (preview)",
    level: "intro",
    domain: "chemistry",
    topic: "titration",
    objectives: ["Recognize the phenolphthalein endpoint"],
    steps: [
      {
        id: "chm03-s1",
        title: "Endpoint pH",
        prompt:
          "Phenolphthalein turns pale pink at the endpoint. What pH range is that?",
        level: "intro",
        checks: [
          {
            kind: "quiz",
            question: "Phenolphthalein endpoint?",
            options: ["pH 3–4", "pH 7.0", "pH 8.2–8.4"],
            answer: 2,
          },
        ],
      },
    ],
  },
];
