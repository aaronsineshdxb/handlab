"use client";

import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="nf-wrap">
      <div className="nf-grid" aria-hidden="true" />
      <div className="nf-card" role="alert">
        <p className="nf-brand">
          HAND<span>LAB</span>
        </p>
        <div className="nf-ring" aria-hidden="true">
          <span className="nf-core" />
        </div>
        <h1 className="nf-code">500</h1>
        <p className="nf-title">Tracking interrupted</p>
        <p className="nf-sub">
          {error.message || "An unexpected error interrupted this workspace."}
        </p>
        <p className="nf-status" aria-hidden="true">
          ERR 500{error.digest ? ` · ${error.digest}` : ""} · state: paused
        </p>
        <div className="nf-actions">
          <button type="button" className="btn nf-btn" onClick={() => reset()}>
            Try again
          </button>
          <Link className="btn ghost nf-btn" href="/">
            Back to the lab
          </Link>
        </div>
      </div>
    </main>
  );
}
