import type { Lesson } from "../lessons/types";

/** One joined student. `id` is generated client-side (UUID) and persisted
 *  in localStorage so a page reload rejoins as the same student. */
export interface ClassStudent {
  id: string;
  name: string;
  joinedAt: number;
  updatedAt: number;
  /** Per-lesson progress, keyed by lesson id (same Progress shape the lab
   *  stores locally, plus hint usage). */
  progress: Record<string, ClassProgressEntry>;
}

export interface ClassProgressEntry {
  lessonId: string;
  stepIdx: number;
  done: boolean;
  score: number;
  updatedAt: number;
  hintsUsed?: number;
}

/** A hosted class. Lives as one JSON file on the server hosting the app;
 *  `code` is the join capability, `token` gates teacher-only operations. */
export interface ClassSession {
  code: string;
  token: string;
  createdAt: number;
  closed: boolean;
  /** The lesson the teacher assigned. Students receive this JSON on join,
   *  so custom imported lessons work without students importing anything. */
  lesson: Lesson | null;
  students: Record<string, ClassStudent>;
}

/* ---------- API payloads ---------- */

export interface HostResponse {
  code: string;
  token: string;
}

export interface JoinResponse {
  studentId: string;
  name: string;
  lesson: Lesson | null;
}

/** Teacher-side roster snapshot: what GET /api/class/state returns. */
export interface ClassState {
  code: string;
  closed: boolean;
  createdAt: number;
  lesson: { id: string; title: string } | null;
  students: ClassStudent[];
}

export const MAX_CLASS_NAME_LENGTH = 40;
export const MAX_STUDENTS = 60;
/** Session files on disk at once (live + closed records awaiting TTL sweep);
 *  caps disk use since POST /api/class/host needs no auth. */
export const MAX_SESSIONS = 100;
