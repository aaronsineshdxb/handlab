import type { CheckKind, Lesson, NumVal, VarSpec } from "./types";
import { isTemplateRef, templateName, usedVarNames } from "./vars";

export const MAX_ID_LENGTH = 100;
export const MAX_TITLE_LENGTH = 200;
export const MAX_TEXT_LENGTH = 2_000;
export const MAX_OBJECTIVES = 20;
export const MAX_STEPS = 50;
export const MAX_CHECKS = 20;
export const MAX_QUIZ_OPTIONS = 10;
export const MAX_VARS = 12;

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

/** A numeric lesson field: a plain number, or a "{{var}}" reference to a
 *  variable the lesson defines. Template ordering constraints (e.g. angle
 *  min ≤ max) can't be checked until instantiation, so only the reference
 *  itself is verified here. */
const isNumField =
  (value: unknown, varNames: ReadonlySet<string>): value is NumVal =>
    isFiniteNumber(value) ||
    (typeof value === "string" &&
      isTemplateRef(value) &&
      varNames.has(templateName(value) ?? ""));

/** A lesson step's optional solution ghost: the same SceneData JSON the
 *  scene export writes. Shape names are only structurally checked here;
 *  the engine rejects unknown shapes when the ghost actually renders. */
const SCENE_COORD_LIMIT = 100;

const isNum3 = (a: unknown): a is [number, number, number] =>
  Array.isArray(a) &&
  a.length === 3 &&
  a.every(
    (v) =>
      typeof v === "number" &&
      Number.isFinite(v) &&
      Math.abs(v) <= SCENE_COORD_LIMIT,
  );

export const isSceneData = (value: unknown): boolean => {
  if (!isRecord(value) || value.version !== 1) return false;
  if (
    !Array.isArray(value.objects) ||
    !Array.isArray(value.chains) ||
    value.objects.length > 500 ||
    value.chains.length > 100
  )
    return false;
  for (const o of value.objects) {
    if (
      !isRecord(o) ||
      !isText(o.s, MAX_ID_LENGTH) ||
      !isText(o.c, 7) ||
      !/^#[0-9a-fA-F]{6}$/.test(o.c) ||
      !isNum3(o.p) ||
      !isNum3(o.r)
    )
      return false;
  }
  for (const ch of value.chains) {
    if (!Array.isArray(ch) || ch.length > 200 || !ch.every(isNum3)) return false;
  }
  return true;
};

const isVarSpec = (value: unknown): value is VarSpec =>
  isRecord(value) &&
  isFiniteNumber(value.min) &&
  isFiniteNumber(value.max) &&
  value.min <= value.max &&
  (value.step === undefined || (isFiniteNumber(value.step) && value.step > 0)) &&
  (value.decimals === undefined ||
    (isFiniteNumber(value.decimals) &&
      Number.isInteger(value.decimals) &&
      value.decimals >= 0 &&
      value.decimals <= 3));

const isVars = (value: unknown): value is Record<string, VarSpec> => {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_VARS) return false;
  return entries.every(([name, spec]) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && isVarSpec(spec));
};

export const isLessonCheck = (
  value: unknown,
  varNames: ReadonlySet<string> = new Set(),
): value is CheckKind => {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "place-count":
      return (
        isText(value.shape, MAX_ID_LENGTH) &&
        (isNonNegativeInteger(value.count) ||
          (typeof value.count === "string" && isNumField(value.count, varNames)))
      );
    case "chain-closed":
      return (
        isNonNegativeInteger(value.minPoints) ||
        (typeof value.minPoints === "string" && isNumField(value.minPoints, varNames))
      );
    case "area-gt":
      return isNumField(value.min, varNames);
    case "angle-at":
      // Plain numbers keep the original range/ordering constraints; template
      // refs can only be checked for resolvability.
      if (typeof value.min === "number" && typeof value.max === "number") {
        return (
          value.min >= 0 &&
          value.min <= 180 &&
          value.max >= 0 &&
          value.max <= 180 &&
          value.min <= value.max
        );
      }
      return isNumField(value.min, varNames) && isNumField(value.max, varNames);
    case "length-range":
      if (typeof value.min === "number" && typeof value.max === "number") {
        return value.min >= 0 && value.min <= value.max;
      }
      return isNumField(value.min, varNames) && isNumField(value.max, varNames);
    case "numeric": {
      const toleranceOk =
        typeof value.tolerance === "number"
          ? value.tolerance >= 0
          : isNumField(value.tolerance, varNames);
      return (
        isText(value.question, MAX_TEXT_LENGTH) &&
        isNumField(value.answer, varNames) &&
        toleranceOk
      );
    }
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

const isLessonStep = (
  value: unknown,
  varNames: ReadonlySet<string> = new Set(),
): value is Lesson["steps"][number] => {
  if (!isRecord(value)) return false;
  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.title, MAX_TITLE_LENGTH) &&
    isText(value.prompt, MAX_TEXT_LENGTH) &&
    (value.level === "intro" || value.level === "advanced") &&
    Array.isArray(value.checks) &&
    value.checks.length <= MAX_CHECKS &&
    value.checks.every((check) => isLessonCheck(check, varNames)) &&
    isOptionalText(value.hint, MAX_TEXT_LENGTH) &&
    (value.solution === undefined || isSceneData(value.solution))
  );
};

export const isLesson = (value: unknown): value is Lesson => {
  if (!isRecord(value)) return false;
  // Computed up front: step checks reference it while the big guard below
  // is still running (a later const would be in its temporal dead zone).
  const varNames = new Set(
    value.vars && isVars(value.vars) ? Object.keys(value.vars) : [],
  );
  if (
    !isText(value.id, MAX_ID_LENGTH) ||
    !isText(value.title, MAX_TITLE_LENGTH) ||
    (value.level !== "intro" && value.level !== "advanced") ||
    (
      value.domain !== undefined &&
      value.domain !== "physics" &&
      value.domain !== "chemistry" &&
      value.domain !== "geometry"
    ) ||
    (value.topic !== undefined && !isText(value.topic as string, MAX_ID_LENGTH)) ||
    (value.vars !== undefined && !isVars(value.vars)) ||
    !Array.isArray(value.objectives) ||
    value.objectives.length > MAX_OBJECTIVES ||
    !value.objectives.every((objective) => isText(objective, MAX_TEXT_LENGTH)) ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    value.steps.length > MAX_STEPS ||
    !value.steps.every((step) => isLessonStep(step, varNames))
  ) {
    return false;
  }

  // Every {{reference}} in prose or check fields must name a variable the
  // lesson actually defines — otherwise checks would resolve to NaN.
  for (const used of usedVarNames(value as unknown as Lesson)) {
    if (!varNames.has(used)) return false;
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
