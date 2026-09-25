import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizSuccessToast } from "./QuizCard";

describe("QuizSuccessToast", () => {
  it("renders a small success toast with confetti accents", () => {
    const markup = renderToStaticMarkup(createElement(QuizSuccessToast));

    expect(markup).toContain('class="quiz-success-toast"');
    expect(markup).toContain("Nice!");
    expect(markup.match(/class="quiz-confetti/g)).toHaveLength(6);
  });
});
