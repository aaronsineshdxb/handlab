// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import NumericCard, { type NumericCardProps } from "./NumericCard";

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
      '<p class="numeric-card__q">Volume in m³?</p>',
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

/* Interactive suite: a real DOM so blank/whitespace submits and the
 * wrong-state feedback can be exercised end to end. */
let container: HTMLElement | null = null;
let rendered: ReturnType<typeof createRoot> | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mountNumericCard(answer: number) {
  const onAnswer = vi.fn<(value: number) => void>();
  container = document.createElement("div");
  document.body.append(container);
  rendered = createRoot(container);
  const cardProps: Omit<NumericCardProps, "onAnswer"> = {
    question: "Test numeric?",
    answer,
    tolerance: 0,
  };
  act(() => {
    rendered?.render(<NumericCard {...cardProps} onAnswer={onAnswer} />);
  });
  return {
    onAnswer,
    input: container.querySelector("input") as HTMLInputElement,
    submit: container.querySelector("button") as HTMLButtonElement,
  };
}

/* React suppresses onChange when the DOM value matches its value tracker's
 * lastValue, so route the edit through the native value setter with the
 * tracker reset — the standard way to simulate typing into a controlled
 * React input. */
function fireInput(input: HTMLInputElement, value: string) {
  const setNativeValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  const tracker = (
    input as unknown as { _valueTracker?: { setValue(value: string): void } }
  )._valueTracker;
  act(() => {
    setNativeValue.call(input, value);
    tracker?.setValue("");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fireClick(button: HTMLButtonElement) {
  act(() => {
    button.click();
  });
}

afterEach(() => {
  act(() => {
    rendered?.unmount();
  });
  rendered = null;
  container?.remove();
  container = null;
});

describe("NumericCard grading", () => {
  it("grades a blank submit as wrong — empty string must not parse as the answer 0", () => {
    const { onAnswer, input, submit } = mountNumericCard(0);
    expect(input.value).toBe("");

    fireClick(submit);

    expect(onAnswer).toHaveBeenCalledWith(Number.NaN);
    const alert = container?.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Not quite — try again.");
    expect(container?.textContent).not.toContain("Inside tolerance");
    // Wrong state must not lock the card up like the correct state does;
    // upstream, onAnswer(NaN) leaves the step incomplete so Next stays blocked.
    expect(input.disabled).toBe(false);
    expect(submit.disabled).toBe(false);
  });

  it("grades a whitespace-only submit as wrong", () => {
    const { onAnswer, input, submit } = mountNumericCard(0);

    fireInput(input, " ");
    fireInput(input, "   ");
    fireClick(submit);

    expect(onAnswer).toHaveBeenCalledWith(Number.NaN);
    const alert = container?.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Not quite — try again.");
    expect(container?.textContent).not.toContain("Inside tolerance");
    expect(input.disabled).toBe(false);
    expect(submit.disabled).toBe(false);
  });

  it("announces a wrong (but numeric) answer with an alert element", () => {
    const { onAnswer, input, submit } = mountNumericCard(0);

    fireInput(input, "7");
    fireClick(submit);

    expect(onAnswer).toHaveBeenCalledWith(7);
    const alert = container?.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe("Not quite — try again.");
    expect(container?.textContent).not.toContain("Inside tolerance");
  });
});
