import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Physics workspace removed — route redirects to geometry home.

export const metadata: Metadata = {
  title: "HANDLAB Physics — Removed",
  description: "The physics workspace was removed; HANDLAB now focuses on the geometry lab.",
};

export default function PhysicsPage() {
  redirect("/");
}
