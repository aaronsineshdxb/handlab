import type { Metadata } from "next";
import Link from "next/link";

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
        <h1 className="nf-code">404</h1>
        <p className="nf-title">Out of tracking range</p>
        <p className="nf-sub">
          No hand detected here — the cursor never landed on this page.
          It may have been moved, deleted, or never placed at all.
        </p>
        <p className="nf-status" aria-hidden="true">
          ERR 404 · cursor xyz: —, —, — · pinch: open
        </p>
        <div className="nf-actions">
          <Link className="btn nf-btn" href="/">
            Back to the lab
          </Link>
        </div>
        <p className="nf-hint">
          tip: press <kbd>R</kbd> in the lab to recenter your hand control
        </p>
      </div>
    </div>
  );
}
