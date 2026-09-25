import type { Progress } from "./types";

const storageKey = "handlab.progress.v1";

function isProgress(value: unknown): value is Progress {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Progress>;
  return (
    typeof p.lessonId === "string" &&
    typeof p.stepIdx === "number" &&
    Number.isFinite(p.stepIdx) &&
    typeof p.done === "boolean" &&
    typeof p.score === "number" &&
    Number.isFinite(p.score) &&
    typeof p.updatedAt === "number" &&
    Number.isFinite(p.updatedAt)
  );
}

function isProgressRecord(value: unknown): value is Record<string, Progress> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(isProgress)
  );
}

export function loadProgress(): Record<string, Progress> {
  try {
    const data = localStorage.getItem(storageKey);
    if (!data) return {};
    const parsed: unknown = JSON.parse(data);
    return isProgressRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStep(p: Progress): void {
  try {
    const progress = loadProgress();
    progress[p.lessonId] = p;
    localStorage.setItem(storageKey, JSON.stringify(progress));
  } catch {}
}
