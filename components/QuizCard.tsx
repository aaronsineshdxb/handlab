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
    <section className="quiz-card" aria-label="Quiz">
      <div className="quiz-card__head">
        <p className="quiz-card__q">{question}</p>
        {correct && <QuizSuccessToast />}
      </div>
      <div
        role="group"
        aria-label={`Answers for ${question}`}
        className="quiz-card__options"
      >
        {options.map((option, index) => {
          const isSelected = selected === index;
          const isAnswer = index === answerIndex;
          const stateClass =
            correct && isAnswer
              ? " is-correct"
              : isSelected
                ? " is-wrong"
                : "";
          return (
            <button
              key={`${option}-${index}`}
              type="button"
              className={"btn ghost quiz-card__option" + stateClass}
              disabled={correct}
              aria-pressed={isSelected}
              onClick={() => chooseAnswer(index)}
            >
              {option}
            </button>
          );
        })}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        {correct && (
          <div className="quiz-card__feedback--good">
            Correct! Great job.
          </div>
        )}
      </div>
      {!correct && selected !== null && (
        <div role="alert" className="quiz-card__feedback--bad">
          Not quite. Try again.
          {hint && <div className="quiz-card__hint">Hint: {hint}</div>}
        </div>
      )}
    </section>
  );
}
