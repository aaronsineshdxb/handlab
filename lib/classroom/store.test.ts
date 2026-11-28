import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeSession,
  hostSession,
  isValidCode,
  joinSession,
  newCode,
  pruneExpired,
  recordProgress,
  sanitizeName,
  teacherState,
} from "./store";
import { CODE_LENGTH } from "./constants";
import type { ClassSession } from "./types";

const minimalLesson = {
  id: "class-lesson",
  title: "Class Lesson",
  level: "intro" as const,
  objectives: ["Do the thing"],
  steps: [
    {
      id: "s1",
      title: "Step",
      prompt: "Do it.",
      level: "intro" as const,
      checks: [],
    },
  ],
};

let dir: string;
const originalEnv = process.env.HANDLAB_CLASSROOM_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "handlab-class-"));
  process.env.HANDLAB_CLASSROOM_DIR = dir;
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.HANDLAB_CLASSROOM_DIR;
  else process.env.HANDLAB_CLASSROOM_DIR = originalEnv;
});

describe("codes and names", () => {
  it("generates unambiguous fixed-length codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = newCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(isValidCode(code)).toBe(true);
    }
  });

  it("accepts the code alphabet only", () => {
    expect(isValidCode("ABC12")).toBe(false); // 0/1 excluded from alphabet
    expect(isValidCode("AB2")).toBe(false);
    expect(isValidCode(12345)).toBe(false);
  });

  it("sanitizes student names", () => {
    expect(sanitizeName("  Ada  ")).toBe("Ada");
    expect(sanitizeName("Ada\u0000Lovelace")).toBe("AdaLovelace");
    expect(sanitizeName("x".repeat(80))).toHaveLength(40);
    expect(sanitizeName("   ")).toBeNull();
    expect(sanitizeName(42)).toBeNull();
  });
});

describe("host → join → progress → close roundtrip", () => {
  it("runs the full classroom flow", () => {
    const hosted = hostSession(minimalLesson);
    expect("error" in hosted).toBe(false);
    if ("error" in hosted) return unreachable();
    expect(isValidCode(hosted.code)).toBe(true);

    // Join rejects unknown codes and bad ids before any file IO.
    expect(joinSession("ZZZZZ", "abcd1234abcd", "Ada").ok).toBe(false);

    const joined = joinSession(hosted.code, "abcd1234abcd", "Ada");
    expect(joined.ok).toBe(true);
    if (!joined.ok) return unreachable();
    expect(joined.student.name).toBe("Ada");
    expect(joined.session.lesson?.id).toBe("class-lesson");

    // Re-joining the same id keeps one roster entry.
    joinSession(hosted.code, "abcd1234abcd", "Ada L");
    const state1 = teacherState(hosted.code, hosted.token);
    expect(state1.ok).toBe(true);
    if (!state1.ok) return unreachable();
    expect(state1.state.students).toHaveLength(1);
    expect(state1.state.students[0]!.name).toBe("Ada L");

    // Teacher-only: wrong token → not found.
    expect(teacherState(hosted.code, "wrong").ok).toBe(false);

    // Progress upsert lands in the teacher snapshot.
    const posted = recordProgress(hosted.code, "abcd1234abcd", {
      lessonId: "class-lesson",
      stepIdx: 1,
      done: true,
      score: 1,
      updatedAt: Date.now(),
      hintsUsed: 2,
    });
    expect(posted.ok).toBe(true);
    const state2 = teacherState(hosted.code, hosted.token);
    if (!state2.ok) return unreachable();
    expect(state2.state.students[0]!.progress["class-lesson"]?.stepIdx).toBe(1);
    expect(state2.state.students[0]!.progress["class-lesson"]?.hintsUsed).toBe(2);

    // Progress from a student who never joined is rejected.
    expect(recordProgress(hosted.code, "ffff0000ffff", {
      lessonId: "class-lesson",
      stepIdx: 0,
      done: true,
      score: 1,
      updatedAt: Date.now(),
    }).ok).toBe(false);

    // Close blocks joins and further progress.
    expect(closeSession(hosted.code, hosted.token).ok).toBe(true);
    expect(joinSession(hosted.code, "eeee1111eeee", "Bo").ok).toBe(false);
    expect(teacherState(hosted.code, hosted.token).ok).toBe(true); // teacher still reads
    const closed = teacherState(hosted.code, hosted.token);
    if (!closed.ok) return unreachable();
    expect(closed.state.closed).toBe(true);
  });

  it("caps the roster", () => {
    const hosted = hostSession(null);
    if ("error" in hosted) return unreachable();
    for (let i = 0; i < 60; i++) {
      expect(joinSession(hosted.code, `student${String(i).padStart(4, "0")}x`, `S${i}`).ok).toBe(true);
    }
    const full = joinSession(hosted.code, "overflow00000xx", "Extra");
    expect(full.ok).toBe(false);
  });

  it("merges progress monotonically — a hint event never regresses a completion", () => {
    const hosted = hostSession(null);
    if ("error" in hosted) return unreachable();
    expect(joinSession(hosted.code, "abcd1234abcd", "Ada").ok).toBe(true);
    // Complete the lesson (step 3 = stepIdx 2).
    expect(recordProgress(hosted.code, "abcd1234abcd", {
      lessonId: "dogfood-vol",
      stepIdx: 2,
      done: true,
      score: 1,
      updatedAt: 1000,
      hintsUsed: 1,
    }).ok).toBe(true);
    // A later hint/ghost event at step 0 must not regress the record.
    expect(recordProgress(hosted.code, "abcd1234abcd", {
      lessonId: "dogfood-vol",
      stepIdx: 0,
      done: false,
      score: 0,
      updatedAt: 2000,
      hintsUsed: 3,
    }).ok).toBe(true);
    const state = teacherState(hosted.code, hosted.token);
    if (!state.ok) return unreachable();
    const entry = state.state.students[0]!.progress["dogfood-vol"]!;
    expect(entry).toEqual({
      lessonId: "dogfood-vol",
      stepIdx: 2,
      done: true,
      score: 1,
      updatedAt: 2000,
      hintsUsed: 3,
    });
  });
});

describe("storage failure and TTL", () => {
  it("reports plainly when the filesystem is not writable", () => {
    const blocker = join(dir, "blocker.file");
    writeFileSync(blocker, "not a dir");
    process.env.HANDLAB_CLASSROOM_DIR = blocker; // mkdir under a file fails
    const result = hostSession(null);
    expect("error" in result).toBe(true);
  });

  it("prunes expired sessions", () => {
    const hosted = hostSession(null);
    if ("error" in hosted) return unreachable();
    const path = join(dir, `${hosted.code}.json`);
    const session: ClassSession = JSON.parse(
      JSON.stringify({
        code: hosted.code,
        token: hosted.token,
        createdAt: Date.now() - 13 * 60 * 60 * 1000,
        closed: false,
        lesson: null,
        students: {},
      }),
    );
    writeFileSync(path, JSON.stringify(session));
    pruneExpired();
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(dir).filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });
});

function unreachable(): never {
  throw new Error("expected success path");
}
