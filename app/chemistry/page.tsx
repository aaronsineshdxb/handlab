import type { Metadata } from "next";
import ChemistryLab from "../../components/ChemistryLab";

export const metadata: Metadata = {
  title: "HANDLAB Chemistry — Molecules & Wet Lab",
  description:
    "Chemistry workspace: VSEPR molecular builder, glassware, titration and precipitation reactions with hand tracking.",
};

export default function ChemistryPage() {
  return <ChemistryLab />;
}
