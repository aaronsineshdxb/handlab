import type { Lesson } from "./types";

export const LESSONS: Lesson[] = [
  {
    id: "shapes-101",
    title: "Shapes 101",
    level: "intro",
    domain: "geometry",
    topic: "shapes",
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
    domain: "geometry",
    topic: "measurement",
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
    domain: "geometry",
    topic: "volume",
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
  {
    id: "angles-adv",
    title: "Angle Hunt",
    level: "advanced",
    domain: "geometry",
    topic: "angles",
    objectives: [
      "Read live interior angles",
      "Recognise right angles",
      "Discover the angle sum of polygons",
    ],
    steps: [
      {
        id: "right",
        title: "Make a right angle",
        prompt:
          "Press L, tap 3 points forming an L-shape. The middle angle label shows live — get it between 88° and 92°.",
        level: "advanced",
        hint: "Snap (green ring) keeps segments honest; the angle updates as you drag points.",
        checks: [{ kind: "angle-at", min: 88, max: 92 }],
      },
      {
        id: "triangle-sum",
        title: "Quiz: triangle angle sum",
        prompt: "Close a 3-point loop. What have the three interior angles added up to every time?",
        level: "advanced",
        checks: [
          {
            kind: "quiz",
            question: "Sum of a triangle's interior angles?",
            options: ["90°", "180°", "360°"],
            answer: 1,
          },
        ],
      },
      {
        id: "quad-sum",
        title: "Quiz: quad angle sum",
        prompt: "Now close a 4-point loop (square-ish). The sum changed by…?",
        level: "advanced",
        checks: [
          {
            kind: "quiz",
            question: "Each extra vertex adds how many degrees?",
            options: ["90°", "180°", "270°"],
            answer: 1,
          },
        ],
      },
    ],
  },
  {
    id: "estimate-1",
    title: "Estimate Then Verify",
    level: "advanced",
    domain: "geometry",
    topic: "estimation",
    objectives: ["Estimate before measuring", "Judge your own error"],
    steps: [
      {
        id: "guess",
        title: "Guess the length",
        prompt:
          "Look at the room grid: each large grid square is 1 m. Draw a line-chain you think is exactly 2.00 m long WITHOUT reading the live label carefully. Confidence-check: type your target length next.",
        level: "advanced",
        hint: "Commit to a number first — measurement after estimation trains the eye.",
        checks: [
          {
            kind: "numeric",
            question: "My planned chain length (m)",
            answer: 2,
            tolerance: 0.2,
          },
        ],
      },
      {
        id: "draw",
        title: "Draw it",
        prompt:
          "Now draw the chain. Check the live length — how close were you? ±10% is excellent.",
        level: "advanced",
        checks: [{ kind: "length-range", min: 1.8, max: 2.2 }],
      },
    ],
  },
];
