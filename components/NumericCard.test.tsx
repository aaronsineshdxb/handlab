import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NumericCard from "./NumericCard";

describe("NumericCard", () => {
  it("renders the question, an input, and a submit control", () => {
    const html = renderToStaticMarkup(
      <NumericCard
        question="Volume in m³?"
        answer={12}
        tolerance={0.5}
        onAnswer={() => {}}
      />,
    );
    expect(html).toContain(
      '<p style="font-weight:700;margin-bottom:8px">Volume in m³?</p>',
    );
    expect(html).toContain("<input");
    expect(html).toContain("Submit");
  });

  it("keeps the input labelled for screen readers", () => {
    const html = renderToStaticMarkup(
      <NumericCard question="Q" answer={1} tolerance={0} onAnswer={() => {}} />,
    );
    expect(html).toContain("aria-label");
  });
});
