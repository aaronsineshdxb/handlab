/**
 * Coalesces high-frequency scene mutations into one React update per interval.
 *
 * The engine emits scene changes from place/delete/drag (a drag emits every
 * 6th frame via emitMath). Coalescing to a fixed 100ms keeps the lesson
 * checklist and object counter live without reconciling the HUD once per
 * animation frame — the single largest source of main-thread jank during a
 * drag, because every reconcile also re-ran exportScene().
 *
 * Uses a plain interval rather than requestAnimationFrame so the rate is
 * independent of the render loop and testable with fake timers.
 */
export const SCENE_SYNC_MS = 100;

export interface SceneSync {
  /** Request a sync. At most one notification fires per SCENE_SYNC_MS. */
  (): void;
  /** Notify immediately if a sync is pending (used on unmount/teardown). */
  flush(): void;
  /** Cancel any pending notification. Safe to call twice. */
  dispose(): void;
}

export function createSceneSync(onChange: () => void): SceneSync {
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const notify = (): void => {
    stop();
    onChange();
  };

  const sync = ((): void => {
    if (timer !== null) return;
    timer = setInterval(notify, SCENE_SYNC_MS);
  }) as SceneSync;

  sync.flush = notify;
  sync.dispose = stop;
  return sync;
}
