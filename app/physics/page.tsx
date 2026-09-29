import type { Metadata } from "next";
import { redirect } from "next/navigation";
// TEMPORARY: physics disabled — original import below to re-enable.
// import PhysicsLab from "../../components/PhysicsLab";

export const metadata: Metadata = {
  title: "HANDLAB Physics — Temporarily Disabled",
  description: "Physics workspace is temporarily disabled.",
};

export default function PhysicsPage() {
  // TEMPORARY: redirect to geometry home. Revert to `return <PhysicsLab />` to re-enable.
  redirect("/");
  // return <PhysicsLab />;
}
