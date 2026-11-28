import { describe, expect, it } from "vitest";
import type { Lesson, Progress } from "./types";
import {
  addImportedPlaylist,
  firstLockedIndex,
  isLessonUnlocked,
  isPlaylist,
  isPlaylistComplete,
  PLAYLISTS,
  type Playlist,
} from "./playlists";

const lessons: Lesson[] = [
  { id: "a", title: "A", level: "intro", objectives: [], steps: [] },
  { id: "b", title: "B", level: "intro", objectives: [], steps: [] },
  { id: "c", title: "C", level: "intro", objectives: [], steps: [] },
];

const playlist: Playlist = {
  id: "p",
  title: "Course P",
  lessonIds: ["a", "b", "c"],
};

function progress(id: string, done: boolean): Progress {
  return { lessonId: id, stepIdx: 2, done, score: 1, updatedAt: 1 };
}

describe("playlist unlock gating", () => {
  it("keeps the first lesson unlocked and locks the rest until predecessors are done", () => {
    const empty = {};
    expect(firstLockedIndex(playlist, lessons, empty)).toBe(1);
    expect(isLessonUnlocked(playlist, "a", lessons, empty)).toBe(true);
    expect(isLessonUnlocked(playlist, "b", lessons, empty)).toBe(false);
  });

  it("unlocks lesson i when all previous known lessons are done", () => {
    const progressMap = { a: progress("a", true) };
    expect(firstLockedIndex(playlist, lessons, progressMap)).toBe(2);
    expect(isLessonUnlocked(playlist, "b", lessons, progressMap)).toBe(true);
    expect(isLessonUnlocked(playlist, "c", lessons, progressMap)).toBe(false);
  });

  it("treats unknown (unimported) lesson ids as satisfied for gating", () => {
    const withMissing: Playlist = { ...playlist, lessonIds: ["ghost", "a"] };
    const empty = {};
    expect(firstLockedIndex(withMissing, lessons, empty)).toBe(2);
    expect(isLessonUnlocked(withMissing, "a", lessons, empty)).toBe(true);
  });

  it("completes when every known lesson is done", () => {
    const all = { a: progress("a", true), b: progress("b", true), c: progress("c", true) };
    expect(isPlaylistComplete(playlist, lessons, all)).toBe(true);
    expect(isPlaylistComplete(playlist, lessons, { a: progress("a", true) })).toBe(false);
  });

  it("built-in playlists reference seeded lesson ids", () => {
    for (const p of PLAYLISTS) {
      expect(p.lessonIds.length).toBeGreaterThan(0);
    }
  });
});

describe("playlist import validation", () => {
  it("accepts well-formed playlists and rejects malformed ones", () => {
    expect(isPlaylist(playlist)).toBe(true);
    expect(isPlaylist({ ...playlist, lessonIds: [] })).toBe(false);
    expect(isPlaylist({ ...playlist, id: "" })).toBe(false);
    expect(isPlaylist({ ...playlist, domain: "history" })).toBe(false);
    expect(isPlaylist(null)).toBe(false);
  });

  it("deduplicates by id on import", () => {
    const next = addImportedPlaylist([playlist], { ...playlist, title: "Other" });
    expect(next).toHaveLength(1);
    const added = addImportedPlaylist([playlist], {
      id: "q",
      title: "Q",
      lessonIds: ["a"],
    });
    expect(added).toHaveLength(2);
    expect(addImportedPlaylist([playlist], "not a playlist")).toHaveLength(1);
  });
});
