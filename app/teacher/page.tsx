"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./teacher.css";
import { LESSONS } from "../../lib/lessons/lessons.geometry";
import { isLesson } from "../../lib/lessons/validation";
import type { Lesson } from "../../lib/lessons/types";
import {
  closeClass,
  fetchClassState,
  hostClass,
} from "../../lib/classroom/client";
import type { ClassState } from "../../lib/classroom/types";

/**
 * Teacher desk: host a class (picking the lesson students receive on join),
 * watch the roster update live, and export results. Runs entirely on the
 * teacher's machine against this app's own server — no accounts, no external
 * services; the class code is the join capability.
 */

type Hosting = { code: string; token: string };

function relativeTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function rosterCsv(state: ClassState): string {
  const esc = (v: string | number | boolean): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lessonId = state.lesson?.id ?? "";
  const header = "name,lesson,step,done,score,hints,updated";
  const rows = state.students.map((st) => {
    const p = st.progress[lessonId];
    return [
      st.name,
      lessonId,
      p ? p.stepIdx + 1 : 0,
      p ? p.done : false,
      p ? p.score : 0,
      p?.hintsUsed ?? 0,
      new Date(p?.updatedAt ?? st.updatedAt).toISOString(),
    ].map(esc).join(",");
  });
  return [header, ...rows].join("\n");
}

export default function TeacherPage() {
  const [hosting, setHosting] = useState<Hosting | null>(() => readHosting());
  const [state, setState] = useState<ClassState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lessonChoice, setLessonChoice] = useState<string>(LESSONS[0]?.id ?? "");
  const [importedLesson, setImportedLesson] = useState<Lesson | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [ended, setEnded] = useState(false);

  const code = hosting?.code ?? "";

  // The desk can bind from localStorage after a reload (mid-class refresh),
  // so the join URL is derived here rather than only when Host is pressed.
  useEffect(() => {
    if (hosting && !joinUrl) setJoinUrl(window.location.origin);
  }, [hosting, joinUrl]);

  // Roster poll while a class is live.
  useEffect(() => {
    if (!hosting || ended) return;
    let cancelled = false;
    const poll = (): void => {
      fetchClassState(hosting.code, hosting.token)
        .then((s) => {
          if (cancelled) return;
          setState(s);
          if (s.closed) setEnded(true);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "roster refresh failed");
        });
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hosting, ended]);

  const host = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const lesson =
        importedLesson ??
        LESSONS.find(({ id }) => id === lessonChoice) ??
        null;
      const res = await hostClass(lesson);
      try {
        localStorage.setItem(HOSTING_KEY, JSON.stringify(res));
      } catch {
        /* private mode — hosting just won't survive a reload */
      }
      setHosting(res);
      setJoinUrl(window.location.origin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not host");
    } finally {
      setBusy(false);
    }
  }, [importedLesson, lessonChoice]);

  const close = useCallback(async (): Promise<void> => {
    if (!hosting) return;
    setBusy(true);
    try {
      await closeClass(hosting.code, hosting.token);
      setEnded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not close class");
    } finally {
      setBusy(false);
    }
  }, [hosting]);

  const onImportLesson = async (f: File): Promise<void> => {
    try {
      const parsed: unknown = JSON.parse(await f.text());
      if (!isLesson(parsed)) {
        setError("lesson JSON failed validation");
        return;
      }
      setImportedLesson(parsed);
      setError(null);
    } catch {
      setError("not valid JSON");
    }
  };

  const copyJoinLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the URL is on screen anyway */
    }
  };

  const downloadCsv = (): void => {
    if (!state) return;
    const blob = new Blob([rosterCsv(state)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handlab-class-${state.code}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const assignedTitle =
    importedLesson?.title ??
    LESSONS.find(({ id }) => id === lessonChoice)?.title ??
    "—";

  return (
    <main className="teacher-root">
      <header className="teacher-head">
        <h1>
          hand<span>lab</span> · teacher
        </h1>
        <p className="teacher-sub">
          Host a class, share the code, watch progress live. Runs on this
          app&apos;s own server — keep the app running during class.
        </p>
        <Link className="teacher-back" href="/">
          ← back to the lab
        </Link>
      </header>

      {!hosting && (
        <section className="teacher-card" aria-label="Host a class">
          <h2 className="teacher-card__label">1 · Assign a lesson</h2>
          <div className="teacher-row">
            <select
              className="teacher-select"
              value={lessonChoice}
              onChange={(e) => setLessonChoice(e.target.value)}
              aria-label="Lesson to assign"
              disabled={!!importedLesson}
            >
              {LESSONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} · {l.level}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn ghost"
              onClick={() => fileRef.current?.click()}
            >
              Import lesson JSON
            </button>
            {importedLesson && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => setImportedLesson(null)}
              >
                Use built-in
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportLesson(f);
                e.target.value = "";
              }}
            />
          </div>
          <p className="teacher-note">
            Assigned: <b>{assignedTitle}</b>
            {importedLesson && " (imported)"}
          </p>

          <h2 className="teacher-card__label">2 · Host</h2>
          <button
            type="button"
            className="btn teacher-host-btn"
            disabled={busy}
            onClick={() => void host()}
          >
            Host a class
          </button>
          {error && (
            <p className="teacher-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {hosting && (
        <section className="teacher-card" aria-label="Live class">
          <div className="teacher-join">
            <div className="teacher-join__codebox">
              <span className="teacher-card__label">Class code</span>
              <b className="teacher-code">{code}</b>
            </div>
            <div className="teacher-join__linkbox">
              <span className="teacher-card__label">Students join here</span>
              <code className="teacher-url">{joinUrl}</code>
              <button type="button" className="btn ghost" onClick={() => void copyJoinLink()}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
          <p className="teacher-note">
            Students open this address, open the Lessons drawer, and enter the
            code. Assigned lesson: <b>{state?.lesson?.title ?? assignedTitle}</b>.
            {ended && <b> Class ended — students can no longer join.</b>}
          </p>

          <div className="teacher-table-wrap">
            <table className="teacher-table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Step</th>
                  <th scope="col">Score</th>
                  <th scope="col">Hints</th>
                  <th scope="col">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {(state?.students ?? []).map((st) => {
                  const p = state?.lesson
                    ? st.progress[state.lesson.id]
                    : undefined;
                  return (
                    <tr key={st.id}>
                      <td>{st.name}</td>
                      <td>{p ? p.stepIdx + 1 : "—"}</td>
                      <td>{p ? `${Math.round(p.score * 100)}%` : "—"}</td>
                      <td>{p?.hintsUsed ?? 0}</td>
                      <td>{relativeTime(st.updatedAt)}</td>
                    </tr>
                  );
                })}
                {state && state.students.length === 0 && (
                  <tr>
                    <td colSpan={5}>No students yet — share the code.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="teacher-actions">
            <button type="button" className="btn ghost" onClick={downloadCsv} disabled={!state}>
              Export CSV
            </button>
            {!ended && (
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void close()}>
                Close class
              </button>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                localStorage.removeItem(HOSTING_KEY);
                setHosting(null);
                setState(null);
                setEnded(false);
              }}
            >
              {ended ? "Start another" : "Unbind this desk"}
            </button>
          </div>
          {error && (
            <p className="teacher-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

const HOSTING_KEY = "handlab.teacher.v1";

function readHosting(): Hosting | null {
  try {
    const raw = localStorage.getItem(HOSTING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Hosting).code === "string" &&
      typeof (parsed as Hosting).token === "string"
    ) {
      return parsed as Hosting;
    }
    return null;
  } catch {
    return null;
  }
}
