import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ExperimentViewer from "./ExperimentViewer";
import { PHYSICS_EXPERIMENTS } from "../lib/experiments/physics";
import { CHEMISTRY_EXPERIMENTS } from "../lib/experiments/chemistry";

describe("ExperimentViewer", () => {
  it("renders aim, procedure, formulas and observation tables", () => {
    const exp = PHYSICS_EXPERIMENTS.find((e) => e.id === "phy-metre-bridge")!;
    const markup = renderToStaticMarkup(createElement(ExperimentViewer, { experiment: exp }));

    expect(markup).toContain("Experiment 2: Metre Bridge");
    expect(markup).toContain("X = R(100 − l)/l");
    expect(markup).toContain("<table>");
    expect(markup).toContain("Null point l (cm)");
    expect(markup).toContain("Slide the jockey from left to right");
  });

  it("renders salt-analysis tables with inferences", () => {
    const exp = CHEMISTRY_EXPERIMENTS.find((e) => e.id === "chm-qual-prelim")!;
    const markup = renderToStaticMarkup(createElement(ExperimentViewer, { experiment: exp }));

    expect(markup).toContain("Salt Analysis: Preliminary Tests");
    expect(markup).toContain("Maybe Cu²⁺ present");
    expect(markup).toContain("Apple green");
  });
});
