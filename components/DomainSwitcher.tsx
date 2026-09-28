"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SubjectDomain } from "../lib/lessons/types";

const DOMAINS: { id: SubjectDomain; href: string; code: string; label: string }[] = [
  { id: "geometry", href: "/", code: "GEO", label: "Geometry" },
  { id: "physics", href: "/physics", code: "PHY", label: "Physics" },
  { id: "chemistry", href: "/chemistry", code: "CHE", label: "Chemistry" },
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
      {DOMAINS.map(({ id, href, code, label }) => (
        <Link
          key={id}
          href={href}
          className={"domain-btn" + (resolved === id ? " active" : "")}
          aria-current={resolved === id ? "page" : undefined}
        >
          <span aria-hidden="true">{code}</span> {label}
        </Link>
      ))}
      <Link href="/vr" className="domain-btn ghost">
        <span aria-hidden="true">VR</span> Immersive
      </Link>
    </nav>
  );
}
