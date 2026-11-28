import type { CheckKind, Lesson, NumVal, VarRolls, VarSpec } from "./types";

/** Matches a whole-field variable reference: `{{height}}`. Only exact
 *  references are accepted in numeric check fields — partial substitutions
 *  ("~{{h}}") would make checks unparseable. */
const TEMPLATE_EXACT = /^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/;
/** Matches one or more references embedded in prose: "between {{a}} and {{b}}". */
const TEMPLATE_GLOBAL = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export function isTemplateRef(value: string): boolean {
  return TEMPLATE_EXACT.test(value);
}

export function templateName(value: string): string | null {
  const m = TEMPLATE_EXACT.exec(value);
  return m ? m[1]! : null;
}

/** Collects every variable name referenced anywhere in a lesson (prose
 *  fields and numeric check fields), so validation can reject references
 *  to variables the lesson never defines. */
export function usedVarNames(lesson: Lesson): Set<string> {
  const names = new Set<string>();
  const scanString = (s: string): void => {
    for (const m of s.matchAll(TEMPLATE_GLOBAL)) names.add(m[1]!);
  };
  const scanNum = (v: NumVal): void => {
    if (typeof v === "string") scanString(v);
  };
  scanString(lesson.title);
  for (const objective of lesson.objectives) scanString(objective);
  for (const step of lesson.steps) {
    scanString(step.title);
    scanString(step.prompt);
    if (step.hint) scanString(step.hint);
    for (const check of step.checks) {
      switch (check.kind) {
        case "place-count":
          scanNum(check.count);
          break;
        case "chain-closed":
          scanNum(check.minPoints);
          break;
        case "area-gt":
          scanNum(check.min);
          break;
        case "angle-at":
          scanNum(check.min);
          scanNum(check.max);
          break;
        case "length-range":
          scanNum(check.min);
          scanNum(check.max);
          break;
        case "numeric":
          scanString(check.question);
          scanNum(check.answer);
          scanNum(check.tolerance);
          break;
        case "quiz":
          scanString(check.question);
          for (const option of check.options) scanString(option);
          break;
      }
    }
  }
  return names;
}

/** One roll per variable: uniform in [min,max], quantized to `step` when
 *  given (clamped back inside the range), rounded to `decimals` (default 2). */
export function rollVars(
  vars: Record<string, VarSpec>,
  rng: () => number = Math.random,
): VarRolls {
  const rolls: VarRolls = {};
  for (const [name, spec] of Object.entries(vars)) {
    let value = spec.min + rng() * (spec.max - spec.min);
    if (spec.step !== undefined && spec.step > 0) {
      value = spec.min + Math.round((value - spec.min) / spec.step) * spec.step;
      value = Math.min(spec.max, Math.max(spec.min, value));
    }
    const decimals = spec.decimals ?? 2;
    value = Number(value.toFixed(decimals));
    rolls[name] = value;
  }
  return rolls;
}

/** Resolve a numeric check field: plain numbers pass through, template
 *  references read the roll. Unresolvable references become NaN so a
 *  broken check visibly fails rather than silently passing. */
export function resolveNum(value: NumVal, rolls: VarRolls): number {
  if (typeof value === "number") return value;
  const name = templateName(value);
  if (!name) return NaN;
  const rolled = rolls[name];
  return rolled !== undefined && Number.isFinite(rolled) ? rolled : NaN;
}

/** toFixed plus trailing-zero trim: 4 → "4", 4.2 → "4.2", 4.25 → "4.25". */
function formatNum(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

function substitute(text: string, rolls: VarRolls, specs: Record<string, VarSpec>): string {
  return text.replace(TEMPLATE_GLOBAL, (whole, name: string) => {
    const rolled = rolls[name];
    if (rolled === undefined) return whole;
    return formatNum(rolled, specs[name]?.decimals ?? 2);
  });
}

function instantiateCheck(check: CheckKind, rolls: VarRolls, specs: Record<string, VarSpec>): CheckKind {
  const num = (v: NumVal): number => resolveNum(v, rolls);
  switch (check.kind) {
    case "place-count":
      // Counts must stay integral regardless of the referenced var's decimals.
      return { ...check, count: Math.round(num(check.count)) };
    case "chain-closed":
      return { ...check, minPoints: Math.round(num(check.minPoints)) };
    case "area-gt":
      return { ...check, min: num(check.min) };
    case "angle-at":
      return { ...check, min: num(check.min), max: num(check.max) };
    case "length-range":
      return { ...check, min: num(check.min), max: num(check.max) };
    case "numeric":
      return {
        ...check,
        question: substitute(check.question, rolls, specs),
        answer: num(check.answer),
        tolerance: num(check.tolerance),
      };
    case "quiz":
      return {
        ...check,
        question: substitute(check.question, rolls, specs),
        options: check.options.map((o) => substitute(o, rolls, specs)),
      };
  }
}

/** Deep-clones the lesson template with every {{var}} replaced by its rolled
 *  value — prose fields substituted as text, numeric check fields resolved
 *  as numbers. The input lesson is never mutated. */
export function instantiateLesson(lesson: Lesson, rolls: VarRolls): Lesson {
  const specs = lesson.vars ?? {};
  const out: Lesson = structuredClone(lesson);
  out.title = substitute(out.title, rolls, specs);
  out.objectives = out.objectives.map((o) => substitute(o, rolls, specs));
  out.steps = out.steps.map((step) => ({
    ...step,
    title: substitute(step.title, rolls, specs),
    prompt: substitute(step.prompt, rolls, specs),
    hint: step.hint ? substitute(step.hint, rolls, specs) : undefined,
    checks: step.checks.map((check) => instantiateCheck(check, rolls, specs)),
  }));
  return out;
}

/* ---------- roll persistence (per browser, keyed by lesson id) ---------- */

const ROLLS_KEY = "handlab.rolls.v1";

type RollStore = Record<string, { rolls: VarRolls; rolledAt: number }>;

function readRollStore(): RollStore {
  try {
    const raw = localStorage.getItem(ROLLS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as RollStore;
  } catch {
    return {};
  }
}

function writeRollStore(store: RollStore): void {
  try {
    localStorage.setItem(ROLLS_KEY, JSON.stringify(store));
  } catch {
    /* private mode — rolls just won't persist across reloads */
  }
}

/** Rolls for a lesson, creating (or re-rolling) them when missing. */
export function ensureRolls(lesson: Lesson): VarRolls {
  if (!lesson.vars || Object.keys(lesson.vars).length === 0) return {};
  const store = readRollStore();
  const existing = store[lesson.id];
  if (existing?.rolls) return existing.rolls;
  const rolls = rollVars(lesson.vars);
  store[lesson.id] = { rolls, rolledAt: Date.now() };
  writeRollStore(store);
  return rolls;
}

/** Explicit re-roll ("New numbers"): replaces the stored rolls for one lesson. */
export function rerollLesson(lesson: Lesson): VarRolls {
  if (!lesson.vars || Object.keys(lesson.vars).length === 0) return {};
  const rolls = rollVars(lesson.vars);
  const store = readRollStore();
  store[lesson.id] = { rolls, rolledAt: Date.now() };
  writeRollStore(store);
  return rolls;
}
