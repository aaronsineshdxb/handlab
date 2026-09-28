import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Lesson, Progress } from "../lib/lessons/types";
import LessonPanel, { getVisibleStepIndexes } from "./LessonPanel";

const lesson: Lesson = {
  id: "lesson-1",
  title: "Lesson 1",
  level: "intro",
  objectives: ["Learn the basics"],
  steps: [
    {
      id: "step-1",
      title: "First step",
      prompt: "Complete the first step.",
      level: "intro",
      checks: [],
    },
    {
      id: "step-2",
      title: "Second step",
      prompt: "Complete the second step.",
      level: "intro",
      checks: [],
    },
    {
      id: "step-3",
      title: "Advanced step",
      prompt: "Complete the advanced step.",
      level: "advanced",
      checks: [],
    },
  ],
};

const noStepsLesson: Lesson = {
  ...lesson,
  steps: [],
};

function renderPanel(progress?: Progress): string {
  return renderToStaticMarkup(
    <LessonPanel
      lessons={[lesson]}
      active={lesson.id}
      stepIdx={0}
      progress={progress}
      onSelect={() => {}}
      onNext={() => {}}
      onBack={() => {}}
    />,
  );
}

describe("LessonPanel rendering", () => {
  it("renders safely for a lesson with no steps", () => {
    const markup = renderToStaticMarkup(
      <LessonPanel
        lessons={[noStepsLesson]}
        active={noStepsLesson.id}
        stepIdx={0}
        onSelect={() => {}}
        onNext={() => {}}
        onBack={() => {}}
      />,
    );

    expect(markup).toContain("OBJECTIVES");
    expect(markup).toContain("No steps are available for this lesson at the selected level.");
    expect(markup).not.toContain("STEP ");
    expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });
});

describe("LessonPanel level modes", () => {
  it("filters step indexes by level", () => {
    expect(getVisibleStepIndexes(lesson, "intro")).toEqual([0, 1]);
    expect(getVisibleStepIndexes(lesson, "advanced")).toEqual([2]);
    expect(getVisibleStepIndexes(lesson, "both")).toEqual([0, 1, 2]);
  });

  it("returns an empty visible index list for a nonempty lesson with no matching steps", () => {
    const introOnlyLesson = {
      ...lesson,
      steps: lesson.steps.filter(({ level }) => level === "intro"),
    };

    expect(introOnlyLesson.steps).not.toHaveLength(0);
    expect(getVisibleStepIndexes(introOnlyLesson, "advanced")).toEqual([]);
  });

  it("shows an accessible pressed state for each level mode", () => {
    const markup = renderPanel();
    const levelModeGroup = markup.match(
      /<div[^>]*role="group" aria-label="Lesson level mode"[^>]*>([\s\S]*?)<\/div>/,
    )?.[1];

    expect(levelModeGroup).toBeDefined();
    expect(levelModeGroup?.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(levelModeGroup?.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(levelModeGroup).toMatch(/aria-pressed="false"[\s\S]*?Easy/);
    expect(levelModeGroup).toMatch(/aria-pressed="false"[\s\S]*?Advanced/);
    expect(levelModeGroup).toMatch(/aria-pressed="true"[\s\S]*?Both/);
  });
});

describe("LessonPanel progress", () => {
  it("does not show progress metadata without stored progress", () => {
    const markup = renderPanel();

    expect(markup).not.toContain("Resume · Step");
    expect(markup).not.toContain('role="progressbar"');
  });

  it("shows the resume step and score", () => {
    const markup = renderPanel({
      lessonId: lesson.id,
      stepIdx: 1,
      done: true,
      score: 0.75,
      updatedAt: 1,
    });

    expect(markup).toContain("Resume · Step 2");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="75"');
    expect(markup).toContain("75%");
  });
});
