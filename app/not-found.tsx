import type { Metadata } from "next";
import Link from "next/link";
import { FuzzyCode } from "../components/bits/Fx404";
import BlurText from "../components/bits/BlurText";

export const metadata: Metadata = {
  title: "404 — Out of tracking range | HANDLAB",
  description: "This page slipped out of tracking range. Head back to the lab.",
};

export default function NotFound() {
  return (
    <div className="nf-wrap">
      <div className="nf-grid" aria-hidden="true" />
      <div className="nf-card">
        <p className="nf-brand">
          HAND<span>LAB</span>
        </p>
        <div className="nf-ring" aria-hidden="true">
          <span className="nf-core" />
        </div>
        <FuzzyCode code="404" />
        <BlurText as="p" text="Out of tracking range" className="nf-title blur-text" />
        <p className="nf-sub">
          No hand detected here — the cursor never landed on this page.
          It may have been moved, deleted, or never placed at all.
        </p>
        <p className="nf-status" aria-hidden="true">
          ERR 404 · cursor xyz: —, —, — · pinch: open
        </p>
        <div className="nf-actions">
          <Link className="star-border" href="/">
            <span className="star-border__inner">Back to the lab</span>
          </Link>
        </div>
        <p className="nf-hint">
          tip: press <kbd>R</kbd> in the lab to recenter your hand control
        </p>
      </div>
    </div>
  );
}
