export default function Boot() {
  return (
    <div className="boot-screen" role="status" aria-live="polite">
      <div className="boot-screen__inner">
        <div className="boot-ring" aria-hidden="true">
          <span className="boot-ring__core" />
        </div>
        <div className="boot-wordmark">handlab</div>
        <div className="boot-status">initializing workspace…</div>
      </div>
    </div>
  );
}
