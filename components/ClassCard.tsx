"use client";

import { useEffect, useState } from "react";
import type { Lesson } from "../lib/lessons/types";
import {
  clearJoinState,
  getStudentId,
  joinClass,
  loadJoinState,
  saveJoinState,
  type JoinState,
} from "../lib/classroom/client";
import { CODE_LENGTH } from "../lib/classroom/constants";

export interface ClassCardProps {
  /** Currently persisted join state (null when not in a class). */
  classState: JoinState | null;
  /** Joined (or re-joined) with the assigned lesson, if one is set. */
  onJoined: (state: JoinState, lesson: Lesson | null) => void;
  /** Left the class. */
  onLeft: () => void;
}

/**
 * Student join card in the Lessons drawer: enter the teacher's code, get the
 * assigned lesson injected into the lab, and keep the join state across
 * reloads (re-joining on mount refreshes presence + any reassignment).
 */
export default function ClassCard({ classState, onJoined, onLeft }: ClassCardProps) {
  const [name, setName] = useState(classState?.name ?? "");
  const [code, setCode] = useState(classState?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doJoin = async (joinCode: string, joinName: string): Promise<Lesson | null> => {
    const res = await joinClass(joinCode, joinName);
    const state: JoinState = {
      code: joinCode,
      studentId: res.studentId || getStudentId(),
      name: res.name,
      lessonId: res.lesson?.id ?? "",
    };
    saveJoinState(state);
    onJoined(state, res.lesson);
    return res.lesson;
  };

  // Silent re-join on mount: refreshes presence and re-fetches the assigned
  // lesson (which may have been re-assigned, and isn't persisted locally).
  useEffect(() => {
    const existing = loadJoinState();
    if (!existing) return;
    let cancelled = false;
    void joinClass(existing.code, existing.name)
      .then((res) => {
        if (cancelled) return;
        const state: JoinState = {
          ...existing,
          studentId: res.studentId || existing.studentId,
          lessonId: res.lesson?.id ?? existing.lessonId,
        };
        saveJoinState(state);
        onJoined(state, res.lesson);
      })
      .catch(() => {
        if (cancelled) return;
        setError("class ended — ask your teacher for a new code");
      });
    return () => {
      cancelled = true;
    };
    // Run once on mount; onJoined identity is stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await doJoin(code.trim().toUpperCase(), name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not join");
    } finally {
      setBusy(false);
    }
  };

  const leave = (): void => {
    clearJoinState();
    onLeft();
  };

  if (classState) {
    return (
      <section className="class-card class-card--joined" aria-label="Class">
        <span className="class-card__label">class</span>
        <b className="class-card__code">{classState.code}</b>
        <span className="class-card__name">{classState.name}</span>
        <button type="button" className="btn ghost" onClick={leave}>
          Leave
        </button>
      </section>
    );
  }

  return (
    <section className="class-card" aria-label="Join a class">
      <span className="class-card__label">Join your teacher&apos;s class</span>
      <div className="class-card__row">
        <input
          className="class-card__input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH))}
          placeholder="CODE"
          aria-label="Class code"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <input
          className="class-card__input class-card__input--name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="Your name"
          aria-label="Your name"
        />
        <button
          type="button"
          className="btn"
          disabled={busy || code.trim().length < CODE_LENGTH || name.trim().length === 0}
          onClick={() => void handleJoin()}
        >
          Join
        </button>
      </div>
      {error && (
        <p className="class-card__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
