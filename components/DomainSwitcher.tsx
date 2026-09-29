"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { SubjectDomain } from "../lib/lessons/types";

const DOMAINS: { id: SubjectDomain; href: string; code: string; label: string }[] = [
  { id: "geometry", href: "/", code: "GEO", label: "Geometry" },
  // TEMPORARY: physics + chemistry disabled — uncomment to re-enable.
  // { id: "physics", href: "/physics", code: "PHY", label: "Physics" },
  // { id: "chemistry", href: "/chemistry", code: "CHE", label: "Chemistry" },
];

export default function DomainSwitcher({
  active,
}: {
  active?: SubjectDomain;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const pillId = useId();
  const resolved: SubjectDomain =
    active ??
    (pathname === "/physics"
      ? "physics"
      : pathname === "/chemistry"
        ? "chemistry"
        : "geometry");

  return (
    <nav className="domain-switch" aria-label="Subject domain">
      {DOMAINS.map(({ id, href, code, label }) => {
        const current = resolved === id;
        return (
          <Link
            key={id}
            href={href}
            className={"domain-btn" + (current ? " active" : "")}
            aria-current={current ? "page" : undefined}
          >
            {current && (
              <motion.span
                className="seg__thumb"
                layoutId={pillId}
                transition={{ type: "spring", stiffness: 400, damping: 40 }}
                style={{ left: 0, right: 0, top: 0, bottom: 0, borderRadius: "inherit" }}
                aria-hidden="true"
              />
            )}
            {current && reduce && (
              <span
                className="seg__thumb"
                style={{ left: 0, right: 0, top: 0, bottom: 0, borderRadius: "inherit" }}
                aria-hidden="true"
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>
              <span aria-hidden="true">{code}</span> {label}
            </span>
          </Link>
        );
      })}
      <Link href="/vr" className="domain-btn ghost">
        <span aria-hidden="true">VR</span> Immersive
      </Link>
    </nav>
  );
}
