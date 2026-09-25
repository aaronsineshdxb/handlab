"use client";

import { useEffect, useState } from "react";

export interface QuizCardProps {
  question: string;
  options: string[];
  answerIndex: number;
  hint?: string;
  onAnswer: (answerIndex: number) => void;
}

export function QuizSuccessToast() {
  return (
    <div className="quiz-success-toast" aria-label="Quiz success toast">
      {Array.from({ length: 6 }, (_, index) => (
        <span
          key={index}
          className="quiz-confetti"
          aria-hidden="true"
        />
      ))}
      <span>Nice!</span>
    </div>
  );
}

export default function QuizCard({
  question,
  options,
  answerIndex,
  hint,
  onAnswer,
}: QuizCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(false);

  useEffect(() => {
    setSelected(null);
    setCorrect(false);
  }, [question, answerIndex]);

  const chooseAnswer = (index: number) => {
    if (correct) return;
    setSelected(index);
    const isCorrect = index === answerIndex;
    setCorrect(isCorrect);
    onAnswer(index);
  };

  return (
    <section
      aria-label="Quiz"
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
      <div role="group" aria-label={`Answers for ${question}`} style={{ display: "grid", gap: 6 }}>
        {options.map((option, index) => {
          const isSelected = selected === index;
          const isAnswer = index === answerIndex;
          return (
            <button
              key={`${option}-${index}`}
              type="button"
              className="btn ghost"
              disabled={correct}
              aria-pressed={isSelected}
              onClick={() => chooseAnswer(index)}
              style={{
                width: "100%",
                textAlign: "left",
                borderColor: correct && isAnswer
                  ? "var(--good)"
                  : isSelected
                    ? "var(--bad)"
                    : "var(--border)",
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
      {correct && <QuizSuccessToast />}
      {correct && (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: "7px 9px",
            borderRadius: 8,
            background: "rgba(61,220,132,.14)",
            color: "var(--good)",
          }}
        >
          Correct! Great job.
        </div>
      )}
      {!correct && selected !== null && (
        <div
          role="alert"
          style={{ marginTop: 10, color: "var(--bad)" }}
        >
          Not quite. Try again.
          {hint && <div style={{ marginTop: 6 }}>Hint: {hint}</div>}
        </div>
      )}
    </section>
  );
}
