import type { CheckKind } from "./types";

export interface SceneSnap {
  objects: { s: string }[];
  chains: number[][][];
  quizAnswers: Record<string, number>;
}

export function evalCheck(c: CheckKind, snap: SceneSnap): boolean {
  switch (c.kind) {
    case "place-count":
      return snap.objects.filter((object) => object.s === c.shape).length >= c.count;
    case "chain-closed": {
      const chain = snap.chains[0];
      if (!chain || chain.length < c.minPoints) return false;

      const first = chain[0];
      const last = chain[chain.length - 1];
      if (!first || !last) return false;

      return (
        Math.hypot(...first.map((value, index) => value - last[index])) < 0.35
      );
    }
    case "quiz":
      return snap.quizAnswers[c.question] === c.answer;
    default:
      return false;
  }
}
