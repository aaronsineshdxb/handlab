"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SubjectDomain } from "../lib/lessons/types";

const DOMAINS: { id: SubjectDomain; href: string; icon: string; label: string }[] = [
  { id: "geometry", href: "/", icon: "📐", label: "Geometry" },
  { id: "physics", href: "/physics", icon: "⚛", label: "Physics" },
  { id: "chemistry", href: "/chemistry", icon: "⚗", label: "Chemistry" },
];

export default function DomainSwitcher({
  active,
}: {
  active?: SubjectDomain;
}) {
  const pathname = usePathname();
  const resolved: SubjectDomain =
    active ??
    (pathname === "/physics"
      ? "physics"
      : pathname === "/chemistry"
        ? "chemistry"
        : "geometry");

  return (
    <nav className="domain-switch" aria-label="Subject domain">
      {DOMAINS.map(({ id, href, icon, label }) => (
        <Link
          key={id}
          href={href}
          className={"domain-btn" + (resolved === id ? " active" : "")}
          aria-current={resolved === id ? "page" : undefined}
        >
          <span aria-hidden="true">{icon}</span> {label}
        </Link>
      ))}
      <Link href="/vr" className="domain-btn ghost">
        <span aria-hidden="true">🥽</span> VR
      </Link>
    </nav>
  );
}
