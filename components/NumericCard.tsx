"use client";

import { useEffect, useId, useState } from "react";

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
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setState("wrong");
      onAnswer(Number.NaN);
      return;
    }
    const correct = Math.abs(parsed - answer) <= tolerance;
    setState(correct ? "correct" : "wrong");
    onAnswer(parsed);
  };

  const borderColor =
    state === "correct"
      ? "var(--good)"
      : state === "wrong"
        ? "var(--bad)"
        : "var(--border)";

  return (
    <section
      aria-label="Numeric challenge"
      style={{
        position: "relative",
        marginTop: 14,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--surface2)",
      }}
    >
      <p style={{ fontWeight: 700, marginBottom: 8 }}>{question}</p>
      <div style={{ display: "flex", gap: 6 }}>
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
          style={{
            flex: 1,
            minWidth: 0,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${borderColor}`,
            background: "var(--surface)",
            color: "inherit",
            fontVariantNumeric: "tabular-nums",
          }}
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
      {state === "correct" && (
        <p className="m-sub" style={{ marginTop: 6, color: "var(--good)" }}>
          Inside tolerance ✓
        </p>
      )}
    </section>
  );
}
