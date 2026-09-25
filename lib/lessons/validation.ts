import type { CheckKind, Lesson } from "./types";

export const MAX_ID_LENGTH = 100;
export const MAX_TITLE_LENGTH = 200;
export const MAX_TEXT_LENGTH = 2_000;
export const MAX_OBJECTIVES = 20;
export const MAX_STEPS = 50;
export const MAX_CHECKS = 20;
export const MAX_QUIZ_OPTIONS = 10;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

const isOptionalText = (value: unknown, maxLength: number): value is string | undefined =>
  value === undefined || isText(value, maxLength);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 0;

const isLessonCheck = (value: unknown): value is CheckKind => {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "place-count":
      return isText(value.shape, MAX_ID_LENGTH) && isNonNegativeInteger(value.count);
    case "chain-closed":
      return isNonNegativeInteger(value.minPoints);
    case "area-gt":
      return isFiniteNumber(value.min);
    case "quiz":
      return (
        isText(value.question, MAX_TEXT_LENGTH) &&
        Array.isArray(value.options) &&
        value.options.length >= 2 &&
        value.options.length <= MAX_QUIZ_OPTIONS &&
        value.options.every((option) => isText(option, MAX_TITLE_LENGTH)) &&
        isNonNegativeInteger(value.answer) &&
        value.answer < value.options.length
      );
    default:
      return false;
  }
};

const isLessonStep = (value: unknown): value is Lesson["steps"][number] => {
  if (!isRecord(value)) return false;
  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.title, MAX_TITLE_LENGTH) &&
    isText(value.prompt, MAX_TEXT_LENGTH) &&
    (value.level === "intro" || value.level === "advanced") &&
    Array.isArray(value.checks) &&
    value.checks.length <= MAX_CHECKS &&
    value.checks.every(isLessonCheck) &&
    isOptionalText(value.hint, MAX_TEXT_LENGTH)
  );
};

export const isLesson = (value: unknown): value is Lesson => {
  if (!isRecord(value)) return false;
  if (
    !isText(value.id, MAX_ID_LENGTH) ||
    !isText(value.title, MAX_TITLE_LENGTH) ||
    (value.level !== "intro" && value.level !== "advanced") ||
    !Array.isArray(value.objectives) ||
    value.objectives.length > MAX_OBJECTIVES ||
    !value.objectives.every((objective) => isText(objective, MAX_TEXT_LENGTH)) ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    value.steps.length > MAX_STEPS ||
    !value.steps.every(isLessonStep)
  ) {
    return false;
  }

  const stepIds = new Set<string>();
  for (const step of value.steps) {
    if (stepIds.has(step.id)) return false;
    stepIds.add(step.id);
  }
  return true;
};

export function addImportedLesson(lessons: Lesson[], value: unknown): Lesson[] {
  if (!isLesson(value) || lessons.some(({ id }) => id === value.id)) return lessons;
  return [...lessons, value];
}
