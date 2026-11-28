import type { Lesson } from "../lessons/types";
import type {
  ClassProgressEntry,
  ClassState,
  HostResponse,
  JoinResponse,
} from "./types";

/**
 * Browser-side classroom API. All endpoints are same-origin (/api/class/*),
 * which the CSP's connect-src 'self' already allows. Student identity is a
 * UUID persisted in localStorage — no accounts, no server-side auth.
 */

const CLASS_KEY = "handlab.class.v1";
const STUDENT_KEY = "handlab.student.v1";

/** The joined-class state the lab persists across reloads. */
export interface JoinState {
  code: string;
  studentId: string;
  name: string;
  lessonId: string;
}

function randomStudentId(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  // Store API expects [a-zA-Z0-9_-]{8,64}
  return uuid.replace(/-/g, "");
}

export function getStudentId(): string {
  try {
    const existing = localStorage.getItem(STUDENT_KEY);
    if (existing) return existing;
    const id = randomStudentId();
    localStorage.setItem(STUDENT_KEY, id);
    return id;
  } catch {
    return randomStudentId();
  }
}

export function loadJoinState(): JoinState | null {
  try {
    const raw = localStorage.getItem(CLASS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const s = parsed as Partial<JoinState>;
    if (
      typeof s.code !== "string" ||
      typeof s.studentId !== "string" ||
      typeof s.name !== "string" ||
      typeof s.lessonId !== "string"
    )
      return null;
    return s as JoinState;
  } catch {
    return null;
  }
}

export function saveJoinState(state: JoinState): void {
  try {
    localStorage.setItem(CLASS_KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

export function clearJoinState(): void {
  try {
    localStorage.removeItem(CLASS_KEY);
  } catch {
    /* ignore */
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function hostClass(lesson: Lesson | null): Promise<HostResponse> {
  return postJson<HostResponse>("/api/class/host", { lesson });
}

export async function joinClass(
  code: string,
  name: string,
): Promise<JoinResponse> {
  const studentId = getStudentId();
  const data = await postJson<JoinResponse>("/api/class/join", {
    code,
    studentId,
    name,
  });
  return { ...data, studentId };
}

/** Fire-and-forget progress upload; failures stay silent (offline tolerance). */
export function postProgress(
  code: string,
  studentId: string,
  entry: ClassProgressEntry,
): void {
  void postJson("/api/class/progress", { code, studentId, entry }).catch(() => {});
}

export async function fetchClassState(
  code: string,
  token: string,
): Promise<ClassState> {
  const res = await fetch(
    `/api/class/state?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`,
  );
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `request failed (${res.status})`;
    throw new Error(message);
  }
  return data as ClassState;
}

export async function closeClass(code: string, token: string): Promise<void> {
  await postJson("/api/class/close", { code, token });
}
