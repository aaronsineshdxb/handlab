import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Chemistry workspace removed — route redirects to geometry home.

export const metadata: Metadata = {
  title: "HANDLAB Chemistry — Removed",
  description: "The chemistry workspace was removed; HANDLAB now focuses on the geometry lab.",
};

export default function ChemistryPage() {
  redirect("/");
}
