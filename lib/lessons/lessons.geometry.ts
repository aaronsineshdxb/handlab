import type { Lesson } from "./types";

export const LESSONS: Lesson[] = [
  {
    id: "shapes-101",
    title: "Shapes 101",
    level: "intro",
    objectives: ["Identify cube/sphere/cone"],
    steps: [
      {
        id: "s1",
        title: "Place 3 cubes",
        prompt: "Press 1, pinch-tap 3x to place 3 cubes.",
        level: "intro",
        checks: [{ kind: "place-count", shape: "cube", count: 3 }],
      },
      {
        id: "s2",
        title: "Quiz: faces?",
        prompt: "How many faces does a cube have?",
        level: "intro",
        checks: [
          {
            kind: "quiz",
            question: "Faces of a cube?",
            options: ["4", "6", "8"],
            answer: 1,
          },
        ],
      },
    ],
  },
  {
    id: "measure-lines",
    title: "Measure & Close",
    level: "intro",
    objectives: ["Close a loop, read area"],
    steps: [
      {
        id: "m1",
        title: "Close a triangle",
        prompt: "Press L, tap 4 points to close triangle (snap green ring).",
        level: "intro",
        hint: "Endpoints snap when close.",
        checks: [{ kind: "chain-closed", minPoints: 3 }],
      },
    ],
  },
  {
    id: "volume-adv",
    title: "Volume Thinking",
    level: "advanced",
    objectives: ["Estimate volume"],
    steps: [
      {
        id: "v1",
        title: "Quiz: double edge?",
        prompt: "Double cube edge → volume ×?",
        level: "advanced",
        checks: [
          {
            kind: "quiz",
            question: "Volume scale?",
            options: ["2x", "4x", "8x"],
            answer: 2,
          },
        ],
      },
    ],
  },
];
