import type { Lesson, Progress, SubjectDomain } from "./types";

/** An ordered course: lessons unlock in sequence (a lesson becomes
 *  available when the previous one is done) and the playlist earns its
 *  badge when every lesson in it is done. */
export interface Playlist {
  id: string;
  title: string;
  domain?: SubjectDomain;
  lessonIds: string[];
}

export const PLAYLISTS: Playlist[] = [
  {
    id: "geometry-core",
    title: "Geometry Core",
    domain: "geometry",
    lessonIds: ["shapes-101", "measure-lines"],
  },
  {
    id: "geometry-advanced",
    title: "Geometry Advanced",
    domain: "geometry",
    lessonIds: ["volume-adv", "angles-adv", "estimate-1"],
  },
];

export const MAX_PLAYLIST_LESSONS = 60;

/**
 * Courses gate on the lessons actually present in `lessons`: a lesson id a
 * student hasn't imported is skipped for unlocking (treated as satisfied)
 * so an imported playlist referencing optional custom lessons never hard-
 * locks. Returns the index of the first locked lesson, or lessonIds.length
 * when everything is unlocked.
 */
export function firstLockedIndex(
  playlist: Playlist,
  lessons: readonly Lesson[],
  progress: Record<string, Progress>,
): number {
  const known = new Set(lessons.map(({ id }) => id));
  for (let i = 1; i < playlist.lessonIds.length; i++) {
    const prevId = playlist.lessonIds[i - 1]!;
    if (!known.has(prevId)) continue;
    if (!progress[prevId]?.done) return i;
  }
  return playlist.lessonIds.length;
}

export function isLessonUnlocked(
  playlist: Playlist,
  lessonId: string,
  lessons: readonly Lesson[],
  progress: Record<string, Progress>,
): boolean {
  const idx = playlist.lessonIds.indexOf(lessonId);
  if (idx <= 0) return true;
  return firstLockedIndex(playlist, lessons, progress) > idx;
}

export function isPlaylistComplete(
  playlist: Playlist,
  lessons: readonly Lesson[],
  progress: Record<string, Progress>,
): boolean {
  const known = new Set(lessons.map(({ id }) => id));
  return playlist.lessonIds.every((id) => !known.has(id) || progress[id]?.done === true);
}

/* ---------- import validation (mirrors lesson import rules) ---------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

export const MAX_PLAYLIST_TEXT = 200;

export function isPlaylist(value: unknown): value is Playlist {
  if (!isRecord(value)) return false;
  if (!isText(value.id, 100) || !isText(value.title, MAX_PLAYLIST_TEXT)) return false;
  if (
    value.domain !== undefined &&
    value.domain !== "physics" &&
    value.domain !== "chemistry" &&
    value.domain !== "geometry"
  )
    return false;
  if (!Array.isArray(value.lessonIds) || value.lessonIds.length === 0) return false;
  if (value.lessonIds.length > MAX_PLAYLIST_LESSONS) return false;
  return value.lessonIds.every((id) => isText(id, 100));
}

export function addImportedPlaylist(
  playlists: Playlist[],
  value: unknown,
): Playlist[] {
  if (!isPlaylist(value) || playlists.some(({ id }) => id === value.id)) {
    return playlists;
  }
  return [...playlists, value];
}
