import type { Metadata } from "next";
import PhysicsLab from "../../components/PhysicsLab";

export const metadata: Metadata = {
  title: "HANDLAB Physics — Mechanics, Electrostatics & Optics",
  description:
    "Physics workspace: ramps, projectiles, springs, charges and lasers. Rapier rigid-body sim with hand tracking.",
};

export default function PhysicsPage() {
  return <PhysicsLab />;
}
