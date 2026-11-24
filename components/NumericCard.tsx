"use client";

import { useEffect, useId, useState } from "react";
import { CheckIcon } from "./icons";

export interface NumericCardProps {
  question: string;
  answer: number;
  tolerance: number;
  /** Fires on every submit with the parsed value (NaN-guarded upstream). */
  onAnswer: (value: number) => void;
}

/** Free numeric quiz card. Grey = placeholder entry, green = inside
 *  tolerance, red = outside. Same surface family as QuizCard. */
export default function NumericCard({
  question,
  answer,
  tolerance,
  onAnswer,
}: NumericCardProps) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "correct" | "wrong">("idle");
  const inputId = useId();

  useEffect(() => {
    setValue("");
    setState("idle");
  }, [question, answer, tolerance]);

  const submit = () => {
    if (state === "correct") return;
    // Blank/whitespace must grade invalid, not parse as the answer
    // (Number("") === 0 would otherwise read a 0-answer check as correct).
    const parsed = value.trim() === "" ? Number.NaN : Number(value);
    if (!Number.isFinite(parsed)) {
      setState("wrong");
      onAnswer(Number.NaN);
      return;
    }
    const correct = Math.abs(parsed - answer) <= tolerance;
    setState(correct ? "correct" : "wrong");
    onAnswer(parsed);
  };

  const stateClass =
    state === "correct" ? " is-correct" : state === "wrong" ? " is-wrong" : "";

  return (
    <section className="numeric-card" aria-label="Numeric challenge">
      <p className="numeric-card__q">{question}</p>
      <div className="numeric-card__row">
        <input
          id={inputId}
          type="number"
          step="any"
          inputMode="decimal"
          aria-label={`Your answer for ${question}`}
          value={value}
          disabled={state === "correct"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className={"numeric-card__input" + stateClass}
        />
        <button
          type="button"
          className="btn ghost"
          disabled={state === "correct"}
          onClick={submit}
        >
          Submit
        </button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        {state === "correct" && (
          <p className="m-sub numeric-card__ok">
            <span>Inside tolerance</span>
            <CheckIcon size={13} />
          </p>
        )}
      </div>
      {state === "wrong" && (
        <div role="alert" className="quiz-card__feedback--bad">
          Not quite — try again.
        </div>
      )}
    </section>
  );
}
