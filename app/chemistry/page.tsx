import type { Metadata } from "next";
import { redirect } from "next/navigation";
// TEMPORARY: chemistry disabled — original import below to re-enable.
// import ChemistryLab from "../../components/ChemistryLab";

export const metadata: Metadata = {
  title: "HANDLAB Chemistry — Temporarily Disabled",
  description: "Chemistry workspace is temporarily disabled.",
};

export default function ChemistryPage() {
  // TEMPORARY: redirect to geometry home. Revert to `return <ChemistryLab />` to re-enable.
  redirect("/");
  // return <ChemistryLab />;
}
