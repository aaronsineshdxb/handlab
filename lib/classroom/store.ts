import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { CODE_ALPHABET, CODE_LENGTH } from "./constants";
import type { Lesson } from "../lessons/types";
import {
  MAX_CLASS_NAME_LENGTH,
  MAX_STUDENTS,
  type ClassProgressEntry,
  type ClassSession,
  type ClassState,
  type ClassStudent,
} from "./types";

/**
 * File-backed classroom session store.
 *
 * One JSON file per class code under a runtime data directory, written
 * synchronously. Works under `next dev` / `next start` on a persistent
 * machine (the teacher's classroom laptop); on ephemeral serverless hosts
 * writes fail and hosting reports that plainly instead of pretending.
 */

/** Sessions expire 12 h after creation; prune runs opportunistically on host. */
export const CLASS_TTL_MS = 12 * 60 * 60 * 1000;

// No 0/O/1/I/L/5/S — codes stay unambiguous read aloud on a projector.
export function classDir(): string {
  return (
    process.env.HANDLAB_CLASSROOM_DIR ?? join(process.cwd(), ".handlab-classroom")
  );
}

function sessionPath(code: string): string {
  return join(classDir(), `${code}.json`);
}

/** Uniformly random unambiguous class code; collisions retried by the
 *  caller. The alphabet (no 0/O/1/I/L/5/S) keeps codes readable aloud. */
export function newCode(rng: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

/** First names only, control characters stripped, 1..40 chars. */
export function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const stripped = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim()
    .slice(0, MAX_CLASS_NAME_LENGTH);
  return stripped.length > 0 ? stripped : null;
}

function isStudentId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

export function isValidCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === CODE_LENGTH &&
    [...value].every((ch) => CODE_ALPHABET.includes(ch))
  );
}

export function loadSession(code: string): ClassSession | null {
  try {
    const raw = readFileSync(sessionPath(code), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is ClassSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<ClassSession>;
  return (
    typeof s.code === "string" &&
    typeof s.token === "string" &&
    typeof s.createdAt === "number" &&
    typeof s.closed === "boolean" &&
    typeof s.students === "object" &&
    s.students !== null
  );
}

function saveSession(session: ClassSession): boolean {
  try {
    const dir = classDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(sessionPath(session.code), JSON.stringify(session), "utf8");
    return true;
  } catch {
    // Read-only filesystem (e.g. serverless) — hosting is unavailable here.
    return false;
  }
}

export function deleteSession(code: string): void {
  try {
    unlinkSync(sessionPath(code));
  } catch {
    /* already gone */
  }
}

/** Opportunistic TTL sweep; called before hosting a new class. */
export function pruneExpired(now: number = Date.now()): void {
  let dir: string;
  try {
    dir = classDir();
  } catch {
    return;
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = readFileSync(join(dir, entry), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (isSession(parsed) && now - parsed.createdAt > CLASS_TTL_MS) {
        unlinkSync(join(dir, entry));
      }
    } catch {
      /* unreadable file — leave it */
    }
  }
}

export function hostSession(
  lesson: Lesson | null,
  rng: () => number = Math.random,
): { code: string; token: string } | { error: string } {
  pruneExpired();
  const dir = classDir();
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Probe writability before committing to a code.
    writeFileSync(join(dir, ".probe"), "ok");
  } catch {
    return {
      error: "hosting needs a persistent server — run `npm start` (or `npm run dev`) on the teacher machine, then students join over the classroom network",
    };
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = newCode(rng);
    if (existsSync(sessionPath(code))) continue;
    const token = randomUUID();
    const session: ClassSession = {
      code,
      token,
      createdAt: Date.now(),
      closed: false,
      lesson,
      students: {},
    };
    if (!saveSession(session)) {
      return { error: "classroom storage unavailable on this host" };
    }
    return { code, token };
  }
  return { error: "could not allocate a free class code" };
}

export type JoinResult =
  | { ok: true; session: ClassSession; student: ClassStudent }
  | { ok: false; status: number; error: string };

export function joinSession(
  code: unknown,
  studentId: unknown,
  name: unknown,
): JoinResult {
  if (!isValidCode(code)) {
    return { ok: false, status: 400, error: "enter the 5-character class code" };
  }
  const cleanName = sanitizeName(name);
  if (!cleanName) {
    return { ok: false, status: 400, error: "enter your name" };
  }
  if (!isStudentId(studentId)) {
    return { ok: false, status: 400, error: "invalid student id" };
  }
  const session = loadSession(code);
  if (!session) {
    return { ok: false, status: 404, error: "no class with that code is live" };
  }
  if (session.closed) {
    return { ok: false, status: 410, error: "this class has ended" };
  }
  const now = Date.now();
  const existing = session.students[studentId];
  if (!existing && Object.keys(session.students).length >= MAX_STUDENTS) {
    return { ok: false, status: 409, error: "this class is full" };
  }
  // Re-joining refreshes the name + presence and keeps accumulated progress.
  const student: ClassStudent = existing
    ? { ...existing, name: cleanName, updatedAt: now }
    : { id: studentId, name: cleanName, joinedAt: now, updatedAt: now, progress: {} };
  session.students[studentId] = student;
  if (!saveSession(session)) {
    return { ok: false, status: 500, error: "classroom storage unavailable" };
  }
  return { ok: true, session, student };
}

export type ProgressResult =
  | { ok: true; session: ClassSession }
  | { ok: false; status: number; error: string };

const isEntry = (value: unknown): value is ClassProgressEntry => {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<ClassProgressEntry>;
  return (
    typeof e.lessonId === "string" &&
    e.lessonId.length <= 100 &&
    typeof e.stepIdx === "number" &&
    Number.isFinite(e.stepIdx) &&
    typeof e.done === "boolean" &&
    typeof e.score === "number" &&
    Number.isFinite(e.score) &&
    typeof e.updatedAt === "number" &&
    Number.isFinite(e.updatedAt) &&
    (e.hintsUsed === undefined ||
      (typeof e.hintsUsed === "number" && Number.isFinite(e.hintsUsed)))
  );
};

export function recordProgress(
  code: unknown,
  studentId: unknown,
  entry: unknown,
): ProgressResult {
  if (!isValidCode(code)) {
    return { ok: false, status: 400, error: "invalid class code" };
  }
  if (!isStudentId(studentId)) {
    return { ok: false, status: 400, error: "invalid student id" };
  }
  if (!isEntry(entry)) {
    return { ok: false, status: 400, error: "invalid progress payload" };
  }
  const session = loadSession(code);
  if (!session) {
    return { ok: false, status: 404, error: "no class with that code is live" };
  }
  if (session.closed) {
    return { ok: false, status: 410, error: "this class has ended" };
  }
  const student = session.students[studentId];
  if (!student) {
    return { ok: false, status: 404, error: "join the class first" };
  }
  const cleanEntry: ClassProgressEntry = { ...entry, stepIdx: Math.max(0, Math.floor(entry.stepIdx)) };
  const prev = student.progress[cleanEntry.lessonId];
  // Merge, don't replace: hint/ghost events ride the same endpoint as
  // completions, and a step-0 hint must never regress a completed record.
  // Completion is monotonic (best attempt so far); only hints + timestamp
  // take the incoming value unconditionally.
  student.progress[cleanEntry.lessonId] = prev
    ? {
        lessonId: cleanEntry.lessonId,
        stepIdx: Math.max(prev.stepIdx, cleanEntry.stepIdx),
        done: prev.done || cleanEntry.done,
        score: Math.max(prev.score, cleanEntry.score),
        updatedAt: cleanEntry.updatedAt,
        hintsUsed: Math.max(prev.hintsUsed ?? 0, cleanEntry.hintsUsed ?? 0),
      }
    : cleanEntry;
  student.updatedAt = Date.now();
  if (!saveSession(session)) {
    return { ok: false, status: 500, error: "classroom storage unavailable" };
  }
  return { ok: true, session };
}

export function teacherState(
  code: unknown,
  token: unknown,
): { ok: true; state: ClassState } | { ok: false; status: number; error: string } {
  if (!isValidCode(code) || typeof token !== "string" || token.length === 0) {
    return { ok: false, status: 400, error: "invalid code or token" };
  }
  const session = loadSession(code);
  if (!session || session.token !== token) {
    return { ok: false, status: 404, error: "class not found" };
  }
  return {
    ok: true,
    state: {
      code: session.code,
      closed: session.closed,
      createdAt: session.createdAt,
      lesson: session.lesson
        ? { id: session.lesson.id, title: session.lesson.title }
        : null,
      students: Object.values(session.students).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    },
  };
}

export type CloseResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function closeSession(code: unknown, token: unknown): CloseResult {
  if (!isValidCode(code) || typeof token !== "string" || token.length === 0) {
    return { ok: false, status: 400, error: "invalid code or token" };
  }
  const session = loadSession(code);
  if (!session || session.token !== token) {
    return { ok: false, status: 404, error: "class not found" };
  }
  session.closed = true;
  if (!saveSession(session)) {
    return { ok: false, status: 500, error: "classroom storage unavailable" };
  }
  return { ok: true };
}
