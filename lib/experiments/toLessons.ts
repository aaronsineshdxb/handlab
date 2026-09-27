import type { Lesson, LessonStep } from "../lessons/types";
import type { Experiment } from "./types";

/** Lesson validation caps prompts at 2000 chars; stay comfortably under. */
const MAX_PROMPT = 1800;

function numbered(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

/** Split procedure into prompt-sized chunks on item boundaries. */
export function chunkProcedure(items: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const item of items) {
    const extra = `${current.length + 1}. ${item}\n`.length;
    if (current.length > 0 && length + extra > MAX_PROMPT) {
      chunks.push(numbered(current));
      current = [];
      length = 0;
    }
    current.push(item);
    length += `${current.length}. ${item}\n`.length;
  }
  if (current.length > 0) chunks.push(numbered(current));
  return chunks.length > 0 ? chunks : [""];
}

function formulasBlock(exp: Experiment): string {
  if (exp.formulas.length === 0) return "";
  return (
    "\n\nKey relations:\n" +
    exp.formulas.map(({ label, expression }) => `• ${label}: ${expression}`).join("\n")
  );
}

/**
 * Convert a structured experiment into a guided lesson. The lesson id
 * equals the experiment id so the lab page can jump between the write-up
 * and the guided steps. Steps: aim → theory (+first quiz) → procedure
 * chunks → remaining quizzes → result & precautions.
 */
export function experimentToLesson(exp: Experiment): Lesson {
  const steps: LessonStep[] = [];
  const [firstQuiz, ...restQuiz] = exp.quiz;

  steps.push({
    id: `${exp.id}-aim`,
    title: "Aim & apparatus",
    prompt:
      exp.aim +
      (exp.apparatus.length > 0
        ? `\n\nApparatus: ${exp.apparatus.join(", ")}.`
        : ""),
    level: exp.level,
    checks: [],
  });

  steps.push({
    id: `${exp.id}-theory`,
    title: "Theory",
    prompt: exp.theory + formulasBlock(exp),
    level: exp.level,
    hint: firstQuiz?.explanation,
    checks: firstQuiz
      ? [
          {
            kind: "quiz",
            question: firstQuiz.question,
            options: firstQuiz.options,
            answer: firstQuiz.answer,
          },
        ]
      : [],
  });

  const chunks = chunkProcedure(exp.procedure);
  chunks.forEach((chunk, i) => {
    steps.push({
      id: `${exp.id}-proc${chunks.length > 1 ? `-${i + 1}` : ""}`,
      title: chunks.length > 1 ? `Procedure (${i + 1}/${chunks.length})` : "Procedure",
      prompt: chunk,
      level: exp.level,
      checks: [],
    });
  });

  restQuiz.forEach((quiz, i) => {
    steps.push({
      id: `${exp.id}-check-${i + 1}`,
      title: `Check ${i + 1}: ${exp.kind === "activity" ? "activity" : "experiment"} review`,
      prompt: "Answer to continue.",
      level: exp.level,
      hint: quiz.explanation,
      checks: [
        {
          kind: "quiz",
          question: quiz.question,
          options: quiz.options,
          answer: quiz.answer,
        },
      ],
    });
  });

  const tail: string[] = [exp.result];
  if (exp.precautions.length > 0)
    tail.push(`Precautions: ${exp.precautions.join(" ")}`);
  if (exp.sourcesOfError.length > 0)
    tail.push(`Sources of error: ${exp.sourcesOfError.join(" ")}`);
  steps.push({
    id: `${exp.id}-result`,
    title: "Result",
    prompt: tail.join("\n\n"),
    level: exp.level,
    checks: [],
  });

  return {
    id: exp.id,
    title: exp.title,
    level: exp.level,
    domain: exp.domain,
    topic: exp.topic,
    objectives: exp.objectives,
    steps,
  };
}
